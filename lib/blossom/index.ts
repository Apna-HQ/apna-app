/**
 * Minimal Blossom (BUD-01) client for uploading single-file mini-apps.
 *
 *   - Authorisation: signed Kind-24242 event in `Authorization: Nostr <base64-event>`.
 *   - Hash: SHA-256 of the raw bytes; server should respond 200 with a descriptor
 *     `{ url, sha256, size, type, uploaded }`.
 *
 * Scope: we only need PUT /upload for the build-editor publish flow. List /
 * delete / mirror are out of scope.
 */

import { finalizeEvent } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';

export const DEFAULT_BLOSSOM_SERVERS = [
  'https://blossom.primal.net',
  'https://blossom.band',
  'https://cdn.satellite.earth',
];

export interface BlossomDescriptor {
  url: string;
  sha256: string;
  size: number;
  type?: string;
  uploaded?: number;
}

export interface UploadOptions {
  /** Preferred server origin without trailing slash. When set we'll try this
   *  first and then fall through to DEFAULT_BLOSSOM_SERVERS — some servers
   *  apply policy filters (size, quota, MIME) that a different server may not. */
  server?: string;
  /** Bech32 nsec used to sign the Kind-24242 auth event. */
  nsec: string;
  /** The bytes to upload (typically a UTF-8 encoded HTML/JS string). */
  data: Uint8Array | string;
  /** Optional MIME hint forwarded in the PUT Content-Type header. */
  contentType?: string;
  /** Free-text description, embedded in the auth event's content. */
  description?: string;
  /** Auth event TTL in seconds (default 5 minutes). */
  expirySeconds?: number;
}

const toBytes = (input: Uint8Array | string): Uint8Array =>
  typeof input === 'string' ? new TextEncoder().encode(input) : input;

const bytesToHex = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let hex = '';
  for (let i = 0; i < view.length; i++) {
    hex += view[i].toString(16).padStart(2, '0');
  }
  return hex;
};

/** SHA-256 hex digest using the Web Crypto API. */
export async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toBytes(input));
  return bytesToHex(digest);
}

/**
 * UTF-8 safe base64. `btoa(JSON.stringify(event))` throws InvalidCharacterError
 * for any codepoint above 0xFF (em-dashes, emoji, non-Latin1 app names…). We
 * encode the JSON to bytes first, then base64 those bytes — works for any
 * Unicode content.
 */
const base64Encode = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  if (typeof btoa === 'function') {
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(
        null,
        Array.from(bytes.subarray(i, i + CHUNK))
      );
    }
    return btoa(binary);
  }
  // Node fallback (only used by tests)
  return Buffer.from(bytes).toString('base64');
};

/**
 * Some Blossom servers (blossom.band specifically) reject auth events whose
 * description is empty or shorter than 8 characters. Force a non-empty value
 * that comfortably satisfies the schema check.
 */
const sanitiseDescription = (raw: string | undefined): string => {
  const trimmed = (raw ?? '').trim().slice(0, 1000);
  return trimmed.length >= 8 ? trimmed : 'apna mini-app source upload';
};

function decodeNsec(nsec: string): Uint8Array {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') {
    throw new Error('Blossom upload requires an `nsec` secret key.');
  }
  return decoded.data as Uint8Array;
}

/**
 * Build & sign the Kind-24242 "upload" authorisation event.
 * The Blossom server checks the `x` tag matches the body's SHA-256.
 */
async function buildUploadAuth(opts: {
  sha256: string;
  nsec: string;
  description: string;
  expirySeconds: number;
  server: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiration = now + opts.expirySeconds;
  const sk = decodeNsec(opts.nsec);
  const event = finalizeEvent(
    {
      kind: 24242,
      created_at: now,
      tags: [
        ['t', 'upload'],
        ['x', opts.sha256],
        ['expiration', String(expiration)],
        ['server', opts.server],
      ],
      content: opts.description,
    },
    sk
  );
  return base64Encode(JSON.stringify(event));
}

/**
 * Upload bytes to a Blossom server.
 *
 *   const { url, sha256 } = await blossomUpload({ nsec, data: html });
 *
 * If a preferred `server` is given we try it first, then fall back to every
 * server in DEFAULT_BLOSSOM_SERVERS that we haven't tried yet. The publish
 * flow uses this so a single picky server (size limit, schema quirk, quota)
 * can't block the user when another server would happily accept the same blob.
 */
export async function blossomUpload(opts: UploadOptions): Promise<BlossomDescriptor> {
  const bytes = toBytes(opts.data);
  const sha256 = await sha256Hex(bytes);
  const description = sanitiseDescription(opts.description);
  const contentType = opts.contentType ?? 'text/html';
  const expirySeconds = opts.expirySeconds ?? 300;

  // Build the fall-through list: preferred first, then the defaults that
  // aren't already in front, de-duplicating on origin.
  const preferred = opts.server ? [opts.server] : [];
  const seen = new Set<string>();
  const servers = [...preferred, ...DEFAULT_BLOSSOM_SERVERS].filter((s) => {
    const key = s.replace(/\/$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const errors: string[] = [];
  for (const server of servers) {
    const trimmed = server.replace(/\/$/, '');
    try {
      const auth = await buildUploadAuth({
        sha256,
        nsec: opts.nsec,
        description,
        expirySeconds,
        server: trimmed,
      });

      const res = await fetch(`${trimmed}/upload`, {
        method: 'PUT',
        headers: {
          'Authorization': `Nostr ${auth}`,
          'Content-Type': contentType,
        },
        // Blossom servers consume the raw body — no multipart envelope.
        body: bytes,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        errors.push(`${trimmed}: ${res.status} ${res.statusText}${text ? ' — ' + text.slice(0, 200) : ''}`);
        continue;
      }

      const descriptor = (await res.json()) as Partial<BlossomDescriptor>;
      const url = descriptor.url ?? `${trimmed}/${sha256}`;
      const returnedSha = descriptor.sha256 ?? sha256;
      // Defence-in-depth: refuse a mismatch so we never store a pointer to the
      // wrong blob.
      if (returnedSha !== sha256) {
        errors.push(`${trimmed}: server returned sha256 ${returnedSha} for upload of ${sha256}`);
        continue;
      }
      return {
        url,
        sha256,
        size: descriptor.size ?? bytes.length,
        type: descriptor.type ?? contentType,
        uploaded: descriptor.uploaded,
      };
    } catch (err) {
      errors.push(`${trimmed}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`All Blossom servers rejected the upload — ${errors.join(' | ')}`);
}

/**
 * Fetch a blob from a Blossom URL and verify its sha256 matches.
 * Returns the response text on success or throws on hash mismatch / HTTP error.
 */
export async function blossomFetchVerified(url: string, sha256: string): Promise<string> {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Blossom GET ${url} failed: ${res.status} ${res.statusText}`);
  }
  const buf = await res.arrayBuffer();
  const actual = await sha256Hex(new Uint8Array(buf));
  if (actual !== sha256) {
    throw new Error(`Blossom blob ${url} hash mismatch — expected ${sha256}, got ${actual}`);
  }
  return new TextDecoder().decode(buf);
}
