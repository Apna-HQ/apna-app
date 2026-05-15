/**
 * NIP-07 browser-extension wrapper.
 *
 * A thin, SSR-safe adapter over the `window.nostr` provider injected by
 * browser extensions (Alby, nos2x, etc.). It exposes the same uniform signer
 * shape used by the host's other identity sources (local nsec, NIP-46 bunker)
 * so callers don't have to special-case the extension path.
 *
 * Note: this is distinct from the "host-extension" *topology* — here `apna-app`
 * is still the iframe host, it just delegates signing to whatever NIP-07
 * extension the user has installed.
 */

import type { EventTemplate, VerifiedEvent } from 'nostr-tools'

// Shape of the NIP-07 provider object extensions inject as `window.nostr`.
// `nip04` / `nip44` are optional — not every extension implements them.
export interface Nip07Provider {
  getPublicKey(): Promise<string>
  signEvent(event: EventTemplate): Promise<VerifiedEvent>
  getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>
  nip04?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>
    decrypt(pubkey: string, ciphertext: string): Promise<string>
  }
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>
    decrypt(pubkey: string, ciphertext: string): Promise<string>
  }
}

declare global {
  interface Window {
    nostr?: Nip07Provider
  }
}

/**
 * Whether a NIP-07 provider is available in the current page.
 * SSR-safe — never touches `window` at module load time.
 */
export function isNip07Available(): boolean {
  return typeof window !== 'undefined' && !!window.nostr
}

/** Uniform signer interface shared across all three identity sources. */
export interface UniformSigner {
  getPublicKey(): Promise<string>
  signEvent(event: EventTemplate): Promise<VerifiedEvent>
  nip04: {
    encrypt(pubkey: string, plaintext: string): Promise<string>
    decrypt(pubkey: string, ciphertext: string): Promise<string>
  }
  nip44: {
    encrypt(pubkey: string, plaintext: string): Promise<string>
    decrypt(pubkey: string, ciphertext: string): Promise<string>
  }
}

/**
 * Returns a uniform signer backed by the installed NIP-07 extension.
 *
 * `getPublicKey` / `signEvent` delegate straight to `window.nostr`. The
 * `nip04` / `nip44` accessors are guarded: if the extension doesn't implement
 * a scheme, calling its encrypt/decrypt throws a clear error rather than a
 * cryptic `undefined is not a function`.
 *
 * @throws if no NIP-07 provider is available.
 */
export function getNip07Signer(): UniformSigner {
  if (!isNip07Available()) {
    throw new Error(
      'No NIP-07 browser extension found. Install a Nostr extension (e.g. Alby or nos2x) and reload.'
    )
  }

  // Safe: `isNip07Available()` guaranteed `window.nostr` is set.
  const provider = window.nostr as Nip07Provider

  const requireScheme = <T>(scheme: 'nip04' | 'nip44', impl: T | undefined): T => {
    if (!impl) {
      throw new Error(
        `The installed NIP-07 extension does not support ${scheme}. Use a different extension or identity source for this operation.`
      )
    }
    return impl
  }

  return {
    getPublicKey: () => provider.getPublicKey(),
    signEvent: (event: EventTemplate) => provider.signEvent(event),
    nip04: {
      encrypt: (pubkey, plaintext) =>
        requireScheme('nip04', provider.nip04).encrypt(pubkey, plaintext),
      decrypt: (pubkey, ciphertext) =>
        requireScheme('nip04', provider.nip04).decrypt(pubkey, ciphertext),
    },
    nip44: {
      encrypt: (pubkey, plaintext) =>
        requireScheme('nip44', provider.nip44).encrypt(pubkey, plaintext),
      decrypt: (pubkey, ciphertext) =>
        requireScheme('nip44', provider.nip44).decrypt(pubkey, ciphertext),
    },
  }
}
