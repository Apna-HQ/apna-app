import * as nip19 from 'nostr-tools/nip19';
import type {
  CapabilityHandlers,
  FeedOptions,
  FeedType,
  Note,
  NoteAndReplies,
  NostrEvent,
} from '@apna/sdk';

import {
  GetFeed,
  GetNote,
  GetNoteReactions,
  GetNoteReplies,
  GetNoteReposts,
  GetNpubProfileMetadata,
} from '@/lib/nostr/api';
import { DEFAULT_RELAYS, fetchEventsFromRelays, filterTagValues, pool } from '@/lib/nostr/core';
import { normalizeNoteId, normalizePublicKey } from '@/lib/nostr/utils';
import { getActiveSigner } from '@/lib/apna-host/capabilities/nostr';
import { identityV1 } from '@/lib/apna-host/capabilities/identity/v1';

async function publishTemplate(
  kind: number,
  content: string,
  tags: string[][] = []
): Promise<NostrEvent> {
  const signer = getActiveSigner();
  const signedEvent = await signer.signEvent({
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  });
  await Promise.any(pool.publish(DEFAULT_RELAYS, signedEvent));
  return signedEvent as NostrEvent;
}

async function activeNpub(): Promise<string> {
  const pubkey = await getActiveSigner().getPublicKey();
  return nip19.npubEncode(pubkey);
}

async function activePubkey(): Promise<string> {
  return getActiveSigner().getPublicKey();
}

async function publishNote(content: string): Promise<Note> {
  if (!content || content.trim() === '') {
    throw new Error('Note content cannot be empty');
  }
  return publishTemplate(1, content) as Promise<Note>;
}

async function reply(noteId: string, content: string): Promise<Note> {
  if (!content || content.trim() === '') {
    throw new Error('Reply content cannot be empty');
  }

  const note = await GetNote(noteId);
  if (!note) {
    throw new Error(`Note with ID ${noteId} not found`);
  }

  const eTags = note.tags.filter((tag: string[]) => tag[0] === 'e');
  return publishTemplate(1, content, [
    ...eTags,
    ['e', note.id, '', eTags.length > 0 ? 'reply' : 'root'],
    ['p', note.pubkey],
  ]) as Promise<Note>;
}

async function like(noteId: string): Promise<NostrEvent> {
  const note = await GetNote(noteId);
  if (!note) {
    throw new Error(`Note with ID ${noteId} not found`);
  }

  return publishTemplate(7, '+', [
    ['e', note.id],
    ['p', note.pubkey],
  ]);
}

async function repost(
  noteId: string,
  quoteContent?: string
): Promise<NostrEvent> {
  const note = await GetNote(noteId);
  if (!note) {
    throw new Error(`Note with ID ${noteId} not found`);
  }

  if (quoteContent && quoteContent.trim() !== '') {
    return publishTemplate(
      1,
      `${quoteContent}\nnostr:${nip19.noteEncode(note.id)}`,
      [
        ['e', note.id, '', 'mention'],
        ['p', note.pubkey, '', 'mention'],
        ['q', note.id],
      ]
    );
  }

  return publishTemplate(6, JSON.stringify(note), [
    ['e', note.id],
    ['p', note.pubkey],
  ]);
}

async function note(noteId: string, withReactions = false): Promise<Note> {
  const found = (await GetNote(noteId)) as Note;
  if (!found) {
    throw new Error(`Note with ID ${noteId} not found`);
  }

  if (!withReactions) return found;

  const [likes, reposts] = await Promise.all([
    GetNoteReactions(noteId, true),
    GetNoteReposts(noteId, true),
  ]);
  return {
    ...found,
    reactions: {
      likes,
      reposts,
    },
  };
}

async function noteAndReplies(
  noteId: string,
  withReactions = false
): Promise<NoteAndReplies> {
  const [root, replyNotes] = await Promise.all([
    note(noteId, withReactions),
    GetNoteReplies(noteId),
  ]);
  return {
    note: root,
    replyNotes: replyNotes as Note[],
  };
}

async function feed(
  feedType: FeedType,
  opts: FeedOptions = {}
): Promise<NostrEvent[]> {
  return GetFeed(
    await activeNpub(),
    feedType,
    opts.since,
    opts.until,
    opts.limit
  ) as Promise<NostrEvent[]>;
}

async function userFeed(
  pubkeyOrNpub: string,
  feedType: FeedType,
  opts: FeedOptions = {}
): Promise<NostrEvent[]> {
  return GetFeed(
    pubkeyOrNpub,
    feedType,
    opts.since,
    opts.until,
    opts.limit
  ) as Promise<NostrEvent[]>;
}

async function follow(pubkeyOrNpub: string): Promise<void> {
  const author = await activePubkey();
  const targetPubkey = normalizePublicKey(pubkeyOrNpub);
  const existingContacts = await fetchEventsFromRelays(
    DEFAULT_RELAYS,
    {
      kinds: [3],
      authors: [author],
    },
    true
  );

  const tags = existingContacts ? [...existingContacts.tags] : [];
  tags.push(['p', targetPubkey]);
  const deduped = Array.from(new Set(tags.map((tag) => JSON.stringify(tag)))).map(
    (tag) => JSON.parse(tag)
  );

  await publishTemplate(3, '', deduped);
}

async function unfollow(pubkeyOrNpub: string): Promise<void> {
  const author = await activePubkey();
  const targetPubkey = normalizePublicKey(pubkeyOrNpub);
  const existingContacts = await fetchEventsFromRelays(
    DEFAULT_RELAYS,
    {
      kinds: [3],
      authors: [author],
    },
    true
  );

  if (!existingContacts) return;
  await publishTemplate(
    3,
    '',
    existingContacts.tags.filter(
      (tag: string[]) => !(tag[0] === 'p' && tag[1] === targetPubkey)
    )
  );
}

export const socialV1Capabilities: CapabilityHandlers = {
  'social.v1.publishNote': {
    gating: 'gated',
    handler: publishNote,
  },
  'social.v1.reply': {
    gating: 'gated',
    handler: reply,
  },
  'social.v1.like': {
    gating: 'gated',
    handler: like,
  },
  'social.v1.repost': {
    gating: 'gated',
    handler: repost,
  },
  'social.v1.note': {
    gating: 'open',
    handler: note,
  },
  'social.v1.noteAndReplies': {
    gating: 'open',
    handler: noteAndReplies,
  },
  'social.v1.noteLikes': {
    gating: 'open',
    handler: (noteId: string, since?: number) =>
      GetNoteReactions(noteId, true, since),
  },
  'social.v1.noteReposts': {
    gating: 'open',
    handler: (noteId: string, since?: number) =>
      GetNoteReposts(noteId, true, since),
  },
  'social.v1.feed': {
    gating: 'open',
    handler: feed,
  },
  'social.v1.userFeed': {
    gating: 'open',
    handler: userFeed,
  },
  'social.v1.follow': {
    gating: 'gated',
    handler: follow,
  },
  'social.v1.unfollow': {
    gating: 'gated',
    handler: unfollow,
  },
  'social.v1.userProfile': {
    gating: 'open',
    handler: identityV1.toUserProfile,
  },
  'social.v1.userMetadata': {
    gating: 'open',
    handler: GetNpubProfileMetadata,
  },
};

export const socialV1 = {
  publishNote,
  reply,
  like,
  repost,
  note,
  noteAndReplies,
  feed,
  userFeed,
  follow,
  unfollow,
};
