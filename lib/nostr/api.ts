import { Event as NostrEvent, Filter, getPublicKey } from 'nostr-tools'
import * as nip19 from 'nostr-tools/nip19'
import { filterTagValues, DEFAULT_RELAYS, fetchEventsFromRelays } from './core'
import { normalizeNoteId, normalizePublicKey } from './utils'
import { publishKind0, publishKind1, publishKind3, publishKind7, GenerateKeyPair } from './events'
import { getCachedUserMetadata, getCachedUserProfile } from './profileCache'
import * as crypto from 'crypto'

const PROFILE_RELATION_LIMIT = 250

export const InitialiseProfile = async (nsec: string) => {
    let nprofile = nip19.nprofileEncode({
        pubkey: getPublicKey(nip19.decode(nsec).data as Uint8Array),
        relays: DEFAULT_RELAYS
    })
    let metadata = {
        name: crypto.randomBytes(10).toString('hex').slice(0, 10),
        about: "Bitcoin Enthusiast"
    }
    await publishKind0(nsec, metadata)

    // Add individual tags for each relay
    const relayTags = DEFAULT_RELAYS.map(relay => ['r', relay, 'read', 'write'])
    await publishKind3(nsec, relayTags)

    let profile = {
        nprofile,
        metadata
    }
    return profile
}

export const ReactToNote = async (noteId: string, nsecOrNpub: string, content: string = "+") => {
    // Validate content
    if (!content || content.trim() === '') {
        content = "+"; // Default to "+" if empty
    }

    const noteIdRaw = normalizeNoteId(noteId)
    const note = await fetchEventsFromRelays(DEFAULT_RELAYS, {
        ids: [noteIdRaw]
    }, true)

    if (!note) {
        throw new Error(`Note with ID ${noteId} not found`);
    }

    const tags = [
        ['e', note.id],
        ['p', note.pubkey],
    ]
    return publishKind7(nsecOrNpub, tags, content)
}

export const ReplyToNote = async (noteId: string, content: string, nsecOrNpub: string) => {
    // Validate content to ensure it's not empty
    if (!content || content.trim() === '') {
        throw new Error('Reply content cannot be empty')
    }

    const noteIdRaw = normalizeNoteId(noteId)
    const note = await fetchEventsFromRelays(DEFAULT_RELAYS, {
        ids: [noteIdRaw]
    }, true)

    if (!note) {
        throw new Error(`Note with ID ${noteId} not found`);
    }

    const eTags: string[][] = note.tags.filter((t: string[]) => t[0] === "e");
    const tags = [
        ...eTags,
        ['e', note.id, "", eTags.length > 0 ? "reply" : "root"],
        ['p', note.pubkey],
    ]
    return publishKind1(nsecOrNpub, content, tags)
}

/**
 * Reply to a *known* root note without a relay lookup first.
 *
 * `ReplyToNote` fetches the parent so it can inherit upstream `e`/`p` tags
 * (NIP-10). That's important for replies inside a thread, but for a root
 * note we already know it has no upstream context — the fetch is pure dead
 * weight and a source of intermittent failures: with five relays in the
 * pool, `pool.get` can return null inside its 10s window even when the
 * note clearly exists on at least one of them. When this fired during the
 * app-registry publish (`APPS_ROOT_NOTE_ID`), the uploaded Blossom blob
 * was orphaned — never registered, never shown in Explore.
 *
 * This helper builds the minimum-viable reply (`['e', rootId, '', 'root']`)
 * and publishes it directly. `fetchAppList.ts` only filters by the `e`
 * tag, so the optional `p` tag isn't required for discovery.
 */
export const ReplyToRootNote = async (
    rootNoteId: string,
    content: string,
    nsecOrNpub: string,
) => {
    if (!content || content.trim() === '') {
        throw new Error('Reply content cannot be empty')
    }
    const rootIdRaw = normalizeNoteId(rootNoteId)
    return publishKind1(nsecOrNpub, content, [
        ['e', rootIdRaw, '', 'root'],
    ])
}

export const GetNoteReplies = async (noteId: string, direct: boolean = false) => {
    const noteIdRaw = normalizeNoteId(noteId)
    const replies = await fetchEventsFromRelays(DEFAULT_RELAYS, {
        kinds: [1],
        "#e": [noteIdRaw]
    });

    if (direct) {
        // Filter for direct replies only - where the last "e" tag marked "reply" matches the note ID
        return replies.filter((reply: NostrEvent) => {
            const eTags = reply.tags.filter(tag => tag[0] === "e");
            const lastReplyTag = eTags.findLast(tag => tag[3] === "reply");
            return lastReplyTag && lastReplyTag[1] === noteIdRaw || eTags.length === 1;
        });
    }
    return replies;
}

const getNprofile = async (npub: string) => {
    const pubkey = normalizePublicKey(npub)
    const config = await fetchEventsFromRelays(DEFAULT_RELAYS, {
        kinds: [3],
        authors: [pubkey]
    }, true)

    let relays = DEFAULT_RELAYS
    if (config) {
        const configRelays = filterTagValues(config.tags, "r")
        relays = configRelays.length > 0 ? configRelays : DEFAULT_RELAYS
    }
    return nip19.nprofileEncode({ pubkey, relays })
}

const fetchNpubProfileMetadata = async (npub: string) => {
    const pubkey = normalizePublicKey(npub)
    const metadataContent = await fetchEventsFromRelays(DEFAULT_RELAYS, {
        kinds: [0],
        authors: [pubkey]
    }, true)
    return JSON.parse(metadataContent?.content || "{}")
}

export const GetNpubProfileMetadata = async (npub: string) => {
    return getCachedUserMetadata(npub, () => fetchNpubProfileMetadata(npub))
}

export const GetNote = async (noteId: string) => {
    const noteIdRaw = normalizeNoteId(noteId)
    return (await fetchEventsFromRelays(DEFAULT_RELAYS, {
        ids: [noteIdRaw]
    }, true)) as NostrEvent & {kind: 1}
}

const getFollowing = async (npub: string): Promise<string[]> => {
    const pubkey = normalizePublicKey(npub)
    const following = await fetchEventsFromRelays(DEFAULT_RELAYS, {
        kinds: [3],
        authors: [pubkey]
    }, true)
    return following ? filterTagValues(following.tags, "p").slice(0, PROFILE_RELATION_LIMIT) : []
}

const getFollowers = async (npub: string): Promise<string[]> => {
    const pubkey = normalizePublicKey(npub)
    const filter: Filter = {
        kinds: [3],
        "#p": [pubkey],
        limit: PROFILE_RELATION_LIMIT
    }
    const followers = await fetchEventsFromRelays(DEFAULT_RELAYS, filter)
    return Array.from(new Set(followers.map((e: any) => e.pubkey)))
}

const fetchNpubProfile = async (npub: string) => {
    const [ nprofile, metadata, following, followers ] = await Promise.all([
        getNprofile(npub),
        GetNpubProfileMetadata(npub),
        getFollowing(npub),
        getFollowers(npub)
    ]);

    return {
        nprofile,
        metadata,
        followers,
        following
    }
}

export const GetNpubProfile = async (npub: string) => {
    return getCachedUserProfile(npub, () => fetchNpubProfile(npub))
}

export const GetNoteReactions = async (noteId: string, revalidate: boolean=false, since?: number) => {
    const noteIdRaw = normalizeNoteId(noteId)
    const filter: Filter = {
        kinds: [7],
        "#e": [noteIdRaw],
    }
    if (since) filter.since = since;
    return fetchEventsFromRelays(DEFAULT_RELAYS, filter)
}

export const GetNoteReposts = async (noteId: string, revalidate: boolean=false, since?: number) => {
    const noteIdRaw = normalizeNoteId(noteId)
    const filter: Filter = {
        kinds: [6],
        "#e": [noteIdRaw],
    }
    if (since) filter.since = since;
    return fetchEventsFromRelays(DEFAULT_RELAYS, filter)
}

/** Most relays reject or silently drop filters with hundreds of authors. Split
 *  the followed-author list into batches so each filter stays well under that
 *  threshold and we can fan out queries in parallel. */
const AUTHOR_BATCH_SIZE = 100;

function chunk<T>(arr: T[], size: number): T[][] {
    if (arr.length <= size) return [arr];
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

export const GetFeed = async (npub: string, feedType: string, since?: number, until?: number, limit?: number) => {
    const authorRaw = normalizePublicKey(npub)
    const wantLimit = limit || 20
    const baseFilter: Filter = {
        kinds: [1],
        limit: wantLimit,
    }
    if (since) baseFilter.since = since;
    if (until) baseFilter.until = until;

    switch (feedType) {
        case "FOLLOWING_FEED": {
            const existingContacts = await fetchEventsFromRelays(DEFAULT_RELAYS, {
                kinds: [3],
                authors: [authorRaw]
            }, true)
            if (!existingContacts) {
                // Kind-3 lookup timed out / no relay had it. Surface to the
                // caller so the UI can distinguish "couldn't load contacts"
                // from "you follow nobody" from "nothing recent".
                throw new Error('Could not load your follow list from any relay. Check your connection and try again.')
            }
            const followingAuthors = filterTagValues(existingContacts.tags, "p")
            if (followingAuthors.length === 0) return []

            // Fan out across batched author filters so a single mega-filter
            // doesn't get throttled or dropped, and fetch a generous slice
            // per batch (the merge step caps to `wantLimit`).
            const perBatchLimit = Math.max(wantLimit, 50)
            const batches = chunk(followingAuthors, AUTHOR_BATCH_SIZE)
            const results = await Promise.all(
                batches.map((authors) =>
                    fetchEventsFromRelays(DEFAULT_RELAYS, {
                        ...baseFilter,
                        limit: perBatchLimit,
                        authors,
                    })
                )
            )

            // Merge, dedupe by id, sort newest-first, cap to the caller's limit.
            const seen = new Set<string>()
            const merged: NostrEvent[] = []
            for (const batch of results) {
                for (const ev of batch) {
                    if (seen.has(ev.id)) continue
                    seen.add(ev.id)
                    merged.push(ev)
                }
            }
            merged.sort((a, b) => b.created_at - a.created_at)
            return merged.slice(0, wantLimit)
        }

        case "NOTES_FEED":
            return fetchEventsFromRelays(DEFAULT_RELAYS, {
                ...baseFilter,
                authors: [authorRaw]
            });

        default:
            return [];
    }
}

// Re-export everything from events
export { GenerateKeyPair } from './events'
