/**
 * Host-side `nostr.*` capability handlers.
 *
 * This is the redesign replacement for the old flat host method handler map.
 * It exposes the `nostr` slice of the host's `CapabilityHandlers` registry the
 * `ApnaHost` advertises and dispatches against.
 *
 * Two design decisions are baked in here:
 *
 *  1. **One unified signer** — `getActiveSigner()` reads the active profile and
 *     dispatches on its `signerType` to one of the three identity sources
 *     (host-local nsec finalize / NIP-46 bunker / NIP-07 extension), returning a
 *     single uniform `UniformSigner` shape so every sign handler is
 *     source-agnostic. The old repeated
 *     `getKeyPairFromLocalStorage()` + `isRemoteSigner` branch disappears.
 *
 *  2. **Bridge-only reads** — `query` / `queryOne` read relays via the host
 *     page's existing client-side `SimplePool` path in `lib/nostr/core.ts`
 *     (`fetchEventsFromRelays`). They do NOT call any `/api/nostr/*` HTTP route
 *     (the caching/HTTP seam is deferred — see REDESIGN.md). `subscribe` is a
 *     stub that throws until bridge-streaming lands (APNA-RD-SDK-013).
 */

import * as nip19 from 'nostr-tools/nip19'
import { getPublicKey } from 'nostr-tools'
import type { VerifiedEvent } from 'nostr-tools'
import { setNostrWasm, verifyEvent } from 'nostr-tools/wasm'
import { initNostrWasm } from 'nostr-wasm'
import type {
  CapabilityHandlers,
  EventTemplate,
  NostrEvent,
  NostrFilter,
} from '@apna/sdk'

import { getKeyPairFromLocalStorage, normalizeProfile } from '@/lib/utils'
import type { SignerType } from '@/lib/utils'
import {
  DEFAULT_RELAYS,
  fetchEventsFromRelays,
  pool,
  subscribeToEvents,
} from '@/lib/nostr/core'
import { signOnly } from '@/lib/nostr/events'
import { getNip07Signer, type UniformSigner } from '@/lib/nostr/nip07'

// nostr-wasm must be initialised before `finalizeEvent` / `verifyEvent` run.
// Mirrors the bootstrap in `lib/nostr/events.ts`.
const wasmReady = initNostrWasm().then(setNostrWasm)

/**
 * Resolve the currently active profile to a uniform signer, dispatching on its
 * `signerType`:
 *
 *  - `local`  → finalize templates locally with the stored nsec
 *               (`nostr-tools/wasm` `finalizeEvent`).
 *  - `nip46`  → delegate to the NIP-46 bunker connection
 *               (`lib/nostr/nip46.ts`).
 *  - `nip07`  → delegate to the installed browser extension
 *               (`lib/nostr/nip07.ts`).
 *
 * Returns a `{ getPublicKey, signEvent, nip04, nip44 }` shape identical across
 * all three sources, so capability handlers never branch on the source.
 *
 * @throws if there is no active profile, or the active profile's source cannot
 *         currently sign (e.g. a `local` profile missing its nsec).
 */
export function getActiveSigner(): UniformSigner {
  const stored = getKeyPairFromLocalStorage()
  if (!stored) {
    throw new Error('No active user profile found')
  }
  const profile = normalizeProfile(stored)
  const signerType: SignerType = profile.signerType ?? 'local'

  switch (signerType) {
    case 'nip07':
      // Extension wrapper already returns a `UniformSigner`. It detects
      // `window.nostr` availability and throws a clear error if missing.
      return getNip07Signer()

    case 'nip46': {
      // Remote-signer bunker. `signOnly` delegates to the existing NIP-46 path
      // and (re)connects to the active bunker connection as needed.
      const pubkey = getRawPubkey(profile.npub)
      const notSupported = (scheme: 'nip04' | 'nip44') => ({
        encrypt: async (): Promise<string> => {
          throw new Error(
            `${scheme} encryption is not supported for NIP-46 remote-signer profiles in this host yet.`
          )
        },
        decrypt: async (): Promise<string> => {
          throw new Error(
            `${scheme} decryption is not supported for NIP-46 remote-signer profiles in this host yet.`
          )
        },
      })
      return {
        getPublicKey: async () => pubkey,
        signEvent: async (template: EventTemplate): Promise<VerifiedEvent> => {
          return signOnly(profile.npub, {
            ...template,
            created_at: template.created_at ?? Math.floor(Date.now() / 1000),
            pubkey,
          } as any)
        },
        // NIP-46 nip04/nip44 are not wired through the bunker path today.
        // Throw clearly on use rather than silently returning the wrong thing.
        nip04: notSupported('nip04'),
        nip44: notSupported('nip44'),
      }
    }

    case 'local':
    default: {
      // Host-local nsec — finalize templates locally via `events.ts`.
      if (!profile.nsec) {
        throw new Error('Active local profile has no nsec key')
      }
      const decoded = nip19.decode(profile.nsec)
      if (decoded.type !== 'nsec') {
        throw new Error('Active local profile nsec is invalid')
      }
      const sk = decoded.data as Uint8Array
      const pubkey = getPublicKey(sk)
      const localNotSupported = (scheme: 'nip04' | 'nip44') => ({
        encrypt: async (): Promise<string> => {
          throw new Error(
            `${scheme} encryption is not implemented for local-key profiles in this host yet.`
          )
        },
        decrypt: async (): Promise<string> => {
          throw new Error(
            `${scheme} decryption is not implemented for local-key profiles in this host yet.`
          )
        },
      })
      return {
        getPublicKey: async () => pubkey,
        signEvent: async (template: EventTemplate): Promise<VerifiedEvent> => {
          return signOnly(profile.nsec, {
            kind: template.kind,
            content: template.content,
            tags: template.tags,
            created_at: template.created_at ?? Math.floor(Date.now() / 1000),
          } as any)
        },
        // NIP-04/NIP-44 with a raw local key are not part of the existing host
        // surface; expose a clear error until a real implementation lands.
        nip04: localNotSupported('nip04'),
        nip44: localNotSupported('nip44'),
      }
    }
  }
}

/** Decode an npub (or pass through a raw hex pubkey) to a raw hex pubkey. */
function getRawPubkey(npubOrHex: string): string {
  if (npubOrHex.startsWith('npub')) {
    const decoded = nip19.decode(npubOrHex)
    if (decoded.type !== 'npub') {
      throw new Error('Invalid npub on active profile')
    }
    return decoded.data as string
  }
  return npubOrHex
}

/** Normalise a single-or-array filter argument to an array. */
function toFilterArray(filters: NostrFilter | NostrFilter[]): NostrFilter[] {
  return Array.isArray(filters) ? filters : [filters]
}

/**
 * Fill `created_at` on an SDK `EventTemplate` so it satisfies the stricter
 * `nostr-tools` template shape the `UniformSigner.signEvent` accepts.
 */
function fillTemplate(template: EventTemplate): EventTemplate & { created_at: number } {
  return {
    ...template,
    created_at: template.created_at ?? Math.floor(Date.now() / 1000),
  }
}

/**
 * The `nostr` slice of the host's `CapabilityHandlers` registry.
 *
 * Keys are fully-qualified capability strings (`'nostr.query'`,
 * `'nostr.signEvent'`, …). Reads are `gating: 'open'` (public, no consent);
 * signs are `gating: 'gated'` (pass the permission gate before running).
 */
export const nostrCapabilities: CapabilityHandlers = {
  // ---- Reads (bridge-only; host-page client-side SimplePool) ---------------
  'nostr.query': {
    gating: 'open',
    handler: async (
      filters: NostrFilter | NostrFilter[],
      opts?: { relays?: string[] }
    ): Promise<NostrEvent[]> => {
      const relays = opts?.relays ?? DEFAULT_RELAYS
      const filterArray = toFilterArray(filters)
      const results = await Promise.all(
        filterArray.map((filter) =>
          fetchEventsFromRelays(relays, filter as any, false)
        )
      )
      // Flatten + de-dupe by event id across the filter set.
      const seen = new Map<string, NostrEvent>()
      for (const events of results) {
        for (const event of events as NostrEvent[]) {
          seen.set(event.id, event)
        }
      }
      return Array.from(seen.values())
    },
  },

  'nostr.queryOne': {
    gating: 'open',
    handler: async (
      filter: NostrFilter,
      opts?: { relays?: string[] }
    ): Promise<NostrEvent | null> => {
      const relays = opts?.relays ?? DEFAULT_RELAYS
      const event = await fetchEventsFromRelays(relays, filter as any, true)
      return (event as NostrEvent | null) ?? null
    },
  },

  'nostr.subscribe': {
    gating: 'open',
    handler: async (
      filters: NostrFilter | NostrFilter[],
      opts?: { relays?: string[] },
      onEvent?: (event: NostrEvent) => void
    ): Promise<() => void> => {
      if (!onEvent) {
        throw new Error('subscribe requires a stream event callback')
      }
      const relays = opts?.relays ?? DEFAULT_RELAYS
      const unsubs = await Promise.all(
        toFilterArray(filters).map((filter) =>
          subscribeToEvents(filter as any, onEvent as any, relays)
        )
      )
      return () => unsubs.forEach((unsubscribe) => unsubscribe())
    },
  },

  // ---- Signs (via the unified active signer; gated) -----------------------
  'nostr.getPublicKey': {
    gating: 'gated',
    handler: async (): Promise<string> => {
      return getActiveSigner().getPublicKey()
    },
  },

  'nostr.signEvent': {
    gating: 'gated',
    handler: async (template: EventTemplate): Promise<NostrEvent> => {
      return getActiveSigner().signEvent(fillTemplate(template)) as Promise<NostrEvent>
    },
  },

  'nostr.publish': {
    gating: 'gated',
    handler: async (template: EventTemplate): Promise<NostrEvent> => {
      const signer = getActiveSigner()
      const signedEvent = await signer.signEvent(fillTemplate(template))
      await wasmReady
      if (!verifyEvent(signedEvent)) {
        throw new Error('event verification failed')
      }
      await Promise.any(pool.publish(DEFAULT_RELAYS, signedEvent))
      return signedEvent as NostrEvent
    },
  },

  'nostr.nip04': {
    gating: 'gated',
    handler: async (
      op: 'encrypt' | 'decrypt',
      pubkey: string,
      payload: string
    ): Promise<string> => {
      const { nip04 } = getActiveSigner()
      return op === 'encrypt'
        ? nip04.encrypt(pubkey, payload)
        : nip04.decrypt(pubkey, payload)
    },
  },

  'nostr.nip04.encrypt': {
    gating: 'gated',
    handler: async (pubkey: string, payload: string): Promise<string> => {
      return getActiveSigner().nip04.encrypt(pubkey, payload)
    },
  },

  'nostr.nip04.decrypt': {
    gating: 'gated',
    handler: async (pubkey: string, payload: string): Promise<string> => {
      return getActiveSigner().nip04.decrypt(pubkey, payload)
    },
  },

  'nostr.nip44': {
    gating: 'gated',
    handler: async (
      op: 'encrypt' | 'decrypt',
      pubkey: string,
      payload: string
    ): Promise<string> => {
      const { nip44 } = getActiveSigner()
      return op === 'encrypt'
        ? nip44.encrypt(pubkey, payload)
        : nip44.decrypt(pubkey, payload)
    },
  },

  'nostr.nip44.encrypt': {
    gating: 'gated',
    handler: async (pubkey: string, payload: string): Promise<string> => {
      return getActiveSigner().nip44.encrypt(pubkey, payload)
    },
  },

  'nostr.nip44.decrypt': {
    gating: 'gated',
    handler: async (pubkey: string, payload: string): Promise<string> => {
      return getActiveSigner().nip44.decrypt(pubkey, payload)
    },
  },
}
