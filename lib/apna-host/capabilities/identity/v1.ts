import * as nip19 from 'nostr-tools/nip19';
import type {
  CapabilityHandlers,
  UserMetadata,
  UserProfile,
} from '@apna/sdk';

import { GetNpubProfile } from '@/lib/nostr/api';
import { normalizePublicKey } from '@/lib/nostr/utils';
import { getActiveSigner } from '@/lib/apna-host/capabilities/nostr';

async function toUserProfile(pubkeyOrNpub: string): Promise<UserProfile> {
  const pubkey = normalizePublicKey(pubkeyOrNpub);
  const npub = nip19.npubEncode(pubkey);
  const profile = await GetNpubProfile(npub);

  return {
    pubkey,
    npub,
    metadata: profile.metadata ?? {},
    following: profile.following ?? [],
    followers: profile.followers ?? [],
  };
}

async function publishProfile(metadata: UserMetadata): Promise<UserProfile> {
  if (!metadata || Object.keys(metadata).length === 0) {
    throw new Error('Profile metadata cannot be empty');
  }

  const signer = getActiveSigner();
  const pubkey = await signer.getPublicKey();
  const signedEvent = await signer.signEvent({
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(metadata),
  });

  const { pool, DEFAULT_RELAYS } = await import('@/lib/nostr/core');
  await Promise.any(pool.publish(DEFAULT_RELAYS, signedEvent));
  return toUserProfile(pubkey);
}

export const identityV1Capabilities: CapabilityHandlers = {
  'identity.v1.me': {
    gating: 'gated',
    handler: async (): Promise<UserProfile> => {
      const pubkey = await getActiveSigner().getPublicKey();
      return toUserProfile(pubkey);
    },
  },

  'identity.v1.profile': {
    gating: 'open',
    handler: async (pubkeyOrNpub: string): Promise<UserProfile> => {
      return toUserProfile(pubkeyOrNpub);
    },
  },

  'identity.v1.updateProfile': {
    gating: 'gated',
    handler: publishProfile,
  },
};

export const identityV1 = {
  toUserProfile,
  publishProfile,
};
