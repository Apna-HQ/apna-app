import type { CapabilityHandlers } from '@apna/sdk';

import {
  decode,
  encode,
  fetchEvent,
  fetchEvents,
  signAndPublishEvent,
  subscribeToEvents,
} from '@/lib/nostr/api-extensions';
import { getKeyPairFromLocalStorage } from '@/lib/utils';
import { nostrCapabilities } from './nostr';
import { identityV1, identityV1Capabilities } from './identity/v1';
import { socialV1, socialV1Capabilities } from './social/v1';

const legacyCompatCapabilities: CapabilityHandlers = {
  'nostr.encode': {
    gating: 'open',
    handler: async (type, data) => encode(type as any, data as any),
  },
  'nostr.decode': {
    gating: 'open',
    handler: async (nip19String: string) => decode(nip19String),
  },
  'nostr.fetchEvent': {
    gating: 'open',
    handler: fetchEvent,
  },
  'nostr.fetchEvents': {
    gating: 'open',
    handler: fetchEvents,
  },
  'nostr.subscribeToEvents': {
    gating: 'open',
    handler: subscribeToEvents,
  },
  'nostr.signAndPublishEvent': {
    gating: 'gated',
    handler: signAndPublishEvent,
  },
  'nostr.getActiveUserProfile': {
    gating: 'gated',
    handler: async () => {
      const profile = getKeyPairFromLocalStorage();
      if (!profile) throw new Error('No active user profile found');
      return identityV1.toUserProfile(profile.npub);
    },
  },
  'nostr.fetchUserMetadata': {
    gating: 'open',
    handler: socialV1Capabilities['social.v1.userMetadata'].handler,
  },
  'nostr.updateProfileMetadata': {
    gating: 'gated',
    handler: identityV1.publishProfile,
  },
  'nostr.fetchUserProfile': {
    gating: 'open',
    handler: identityV1.toUserProfile,
  },
  'nostr.followUser': {
    gating: 'gated',
    handler: socialV1.follow,
  },
  'nostr.unfollowUser': {
    gating: 'gated',
    handler: socialV1.unfollow,
  },
  'nostr.fetchNote': {
    gating: 'open',
    handler: socialV1.note,
  },
  'nostr.fetchNoteAndReplies': {
    gating: 'open',
    handler: socialV1.noteAndReplies,
  },
  'nostr.publishNote': {
    gating: 'gated',
    handler: socialV1.publishNote,
  },
  'nostr.repostNote': {
    gating: 'gated',
    handler: socialV1.repost,
  },
  'nostr.likeNote': {
    gating: 'gated',
    handler: socialV1.like,
  },
  'nostr.replyToNote': {
    gating: 'gated',
    handler: socialV1.reply,
  },
  'nostr.subscribeToFeed': {
    gating: 'open',
    handler: async () => {
      throw new Error('subscribeToFeed: bridge-streaming not yet wired');
    },
  },
  'nostr.subscribeToUserFeed': {
    gating: 'open',
    handler: async () => {
      throw new Error('subscribeToUserFeed: bridge-streaming not yet wired');
    },
  },
  'nostr.fetchFeed': {
    gating: 'open',
    handler: (feedType, since, until, limit) =>
      socialV1.feed(feedType as any, { since, until, limit } as any),
  },
  'nostr.fetchUserFeed': {
    gating: 'open',
    handler: (npub, feedType, since, until, limit) =>
      socialV1.userFeed(npub as string, feedType as any, {
        since,
        until,
        limit,
      } as any),
  },
  'nostr.fetchNoteLikes': {
    gating: 'open',
    handler: socialV1Capabilities['social.v1.noteLikes'].handler,
  },
  'nostr.fetchNoteReposts': {
    gating: 'open',
    handler: socialV1Capabilities['social.v1.noteReposts'].handler,
  },
};

export const apnaHostCapabilities: CapabilityHandlers = {
  ...nostrCapabilities,
  ...identityV1Capabilities,
  ...socialV1Capabilities,
  ...legacyCompatCapabilities,
};

export const advertisedCapabilities = Object.keys(apnaHostCapabilities);
