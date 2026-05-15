'use server'

import { GetNoteReactions, GetNoteReplies, GetNpubProfileMetadata, GetNote } from '@/lib/nostr';
import { Event as NostrEvent } from 'nostr-tools';
import { AppDetails, APP_CATEGORIES, ProcessedAppEvent, AppCategory, AppHosting, deriveHosting } from '@/lib/types/apps';
import { APPS_ROOT_NOTE_ID } from '@/lib/constants';

interface AppDetailsJSON {
    appURL?: string;
    appName: string;
    htmlContent?: string;
    hosting: AppHosting;
    isGeneratedApp?: boolean;
    /**
     * When the HTML source is too large to inline in the metadata note the
     * publisher stores it in a separate Kind-1 Nostr event and records its id
     * here.  The loader will fetch that event and use its `.content` as the
     * HTML source.
     *
     * Convention: the metadata note also carries an `e` tag pointing at the
     * content event (NIP-10 style) so relay indexing works, but the loader uses
     * this explicit field for clarity.
     */
    contentEventId?: string;
    /**
     * Blossom URL of the source blob (BUD-01). Content-addressed by `sha256`,
     * which we verify before treating the response as authoritative.
     */
    blossomUrl?: string;
    sha256?: string;
    categories: AppCategory[];
    mode: "Full-page";
    description: string;
}

async function parseAppDetailsFromJSON(text: string): Promise<AppDetailsJSON | null> {
    try {
        const json = JSON.parse(text);
        if (json && typeof json === 'object') {
            // Accept events that carry a URL, inline HTML, a content-event reference,
            // a Blossom URL, or the legacy isGeneratedApp flag.
            const hasUrl = 'appURL' in json && typeof json.appURL === 'string' && json.appURL !== '';
            const hasHtml = 'htmlContent' in json && typeof json.htmlContent === 'string' && json.htmlContent !== '';
            const hasContentRef = 'contentEventId' in json && typeof json.contentEventId === 'string' && json.contentEventId !== '';
            const hasBlossom = 'blossomUrl' in json && typeof json.blossomUrl === 'string' && json.blossomUrl !== '';
            const legacyGenerated = json.isGeneratedApp === true;

            if (hasUrl || hasHtml || hasContentRef || hasBlossom || legacyGenerated) {
                const hosting = deriveHosting({
                    hosting: json.hosting,
                    isGeneratedApp: json.isGeneratedApp,
                    appURL: json.appURL,
                    blossomUrl: json.blossomUrl,
                });
                return {
                    appURL: json.appURL,
                    appName: json.appName,
                    htmlContent: json.htmlContent,
                    hosting,
                    // back-compat alias: a nostr-hosted *or* blossom-hosted app both
                    // count as "generated" for legacy loaders that only know that flag.
                    isGeneratedApp: hosting === 'nostr' || hosting === 'blossom',
                    contentEventId: json.contentEventId,
                    blossomUrl: json.blossomUrl,
                    sha256: typeof json.sha256 === 'string' ? json.sha256 : undefined,
                    categories: Array.isArray(json.categories)
                        ? json.categories.filter((cat: string) => APP_CATEGORIES.includes(cat as AppCategory))
                        : ["Miscellaneous"],
                    mode: "Full-page",
                    description: json.description || `A ${json.categories?.[0] || "Miscellaneous"} app`
                };
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * When a Nostr-hosted app's source is too large to inline in the metadata note
 * the publisher stores the raw HTML in a separate Kind-1 event and records its
 * id in `contentEventId`.  This helper fetches that event and returns its content.
 */
async function loadContentFromEvent(contentEventId: string): Promise<string | null> {
    try {
        const event = await GetNote(contentEventId);
        if (event && event.content) {
            return event.content;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Fetch a Blossom-hosted source blob and verify its sha256.  Content-addressed
 * storage means a hash mismatch is a tampered (or wrong) blob — treat as null
 * so the entry is filtered out of the app list rather than rendering attacker
 * HTML in a sandboxed iframe.
 */
async function loadContentFromBlossom(url: string, expectedSha256?: string): Promise<string | null> {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        if (expectedSha256) {
            const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(buf));
            const hex = Array.from(new Uint8Array(digest))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            if (hex !== expectedSha256) return null;
        }
        return new TextDecoder().decode(buf);
    } catch {
        return null;
    }
}

async function calculateAverageRating(reactions: NostrEvent[]): Promise<string> {
    let totalRating = 0;
    let count = 0;
    
    reactions.forEach((reaction) => {
        try {
            const data = JSON.parse(reaction.content);
            if (data && typeof data.rating === 'number') {
                totalRating += data.rating;
                count++;
            }
        } catch (e) {
            if (reaction.content === '+') {
                totalRating += 5;
                count++;
            } else if (reaction.content === '-') {
                totalRating += 1;
                count++;
            }
        }
    });
    
    return count > 0 ? (totalRating / count).toFixed(1) : '0.0';
}

/**
 * Fetch the published-apps registry from relays.
 *
 * No caching: we hit the relays on every call so newly-published apps
 * appear in /explore immediately. The cost is a relay round-trip per
 * page load, which the in-flight dedupe + per-relay subscription model
 * keeps cheap enough.
 */
export async function fetchAppListAction(_revalidate = false): Promise<AppDetails[]> {
    const appList: AppDetails[] = [];
    const replyEvents = await GetNoteReplies(APPS_ROOT_NOTE_ID, true) as NostrEvent[];
    const authorMetadataCache: Record<string, any> = {};

    // Process all app submission events.
    const processedEvents = await Promise.all(
        replyEvents
            .sort((a, b) => b.created_at - a.created_at)
            .map(async (replyEvent): Promise<ProcessedAppEvent | null> => {
                const appDetails = await parseAppDetailsFromJSON(replyEvent.content);
                if (!appDetails) return null;

                // If the app source is stored in a referenced content event, load it now.
                if (
                    appDetails.hosting === 'nostr' &&
                    !appDetails.htmlContent &&
                    appDetails.contentEventId
                ) {
                    const source = await loadContentFromEvent(appDetails.contentEventId);
                    if (source) appDetails.htmlContent = source;
                }

                // Blossom-hosted: fetch the URL and verify the sha256 if present.
                if (
                    appDetails.hosting === 'blossom' &&
                    !appDetails.htmlContent &&
                    appDetails.blossomUrl
                ) {
                    const source = await loadContentFromBlossom(
                        appDetails.blossomUrl,
                        appDetails.sha256,
                    );
                    if (source) appDetails.htmlContent = source;
                }

                return { ...replyEvent, ...appDetails };
            })
    );

    const validEvents = processedEvents.filter((event): event is ProcessedAppEvent =>
        event !== null &&
        typeof event.appName === 'string' &&
        (
            (event.hosting === 'url' && typeof event.appURL === 'string' && event.appURL !== '') ||
            (event.hosting === 'nostr' && typeof event.htmlContent === 'string' && event.htmlContent !== '') ||
            (event.hosting === 'blossom' && typeof event.htmlContent === 'string' && event.htmlContent !== '')
        )
    );

    // For each valid event, check for update replies from the same author.
    const updatedValidEvents = await Promise.all(
        validEvents.map(async (event) => {
            const updateReplies = await GetNoteReplies(event.id, true);

            const parsedReplies = await Promise.all(
                updateReplies.map(async (reply: NostrEvent) => {
                    const updateDetails = await parseAppDetailsFromJSON(reply.content);
                    if (!updateDetails) return null;

                    if (
                        updateDetails.hosting === 'nostr' &&
                        !updateDetails.htmlContent &&
                        updateDetails.contentEventId
                    ) {
                        const source = await loadContentFromEvent(updateDetails.contentEventId);
                        if (source) updateDetails.htmlContent = source;
                    }

                    if (
                        updateDetails.hosting === 'blossom' &&
                        !updateDetails.htmlContent &&
                        updateDetails.blossomUrl
                    ) {
                        const source = await loadContentFromBlossom(
                            updateDetails.blossomUrl,
                            updateDetails.sha256,
                        );
                        if (source) updateDetails.htmlContent = source;
                    }

                    if (
                        !updateDetails.appName ||
                        (
                            (updateDetails.hosting === 'url' && (!updateDetails.appURL || updateDetails.appURL === '')) ||
                            (updateDetails.hosting === 'nostr' && (!updateDetails.htmlContent || updateDetails.htmlContent === '')) ||
                            (updateDetails.hosting === 'blossom' && (!updateDetails.htmlContent || updateDetails.htmlContent === ''))
                        )
                    ) return null;

                    return { reply, details: updateDetails };
                })
            );

            const validAuthorUpdates = parsedReplies
                .filter((item): item is { reply: NostrEvent; details: AppDetailsJSON } =>
                    item !== null && item.reply.pubkey === event.pubkey
                )
                .sort((a, b) => b.reply.created_at - a.reply.created_at);

            const latestUpdate = validAuthorUpdates.length > 0
                ? { ...validAuthorUpdates[0].reply, ...validAuthorUpdates[0].details } as ProcessedAppEvent
                : null;
            return latestUpdate || event;
        })
    );

    const allPubkeys = new Set(updatedValidEvents.map(event => event.pubkey));
    await Promise.all(
        Array.from(allPubkeys).map(async (pubkey) => {
            authorMetadataCache[pubkey] = await GetNpubProfileMetadata(pubkey);
        })
    );

    for (const event of updatedValidEvents) {
        const originalEvent = validEvents.find(ve => ve.pubkey === event.pubkey && false);
        const reactions = await GetNoteReactions(originalEvent?.id || event.id, false, undefined);
        const avgRating = await calculateAverageRating(reactions);

        appList.push({
            appURL: event.appURL,
            appName: event.appName,
            htmlContent: event.htmlContent,
            hosting: event.hosting,
            isGeneratedApp: event.hosting === 'nostr' || event.hosting === 'blossom',
            contentEventId: event.contentEventId,
            blossomUrl: event.blossomUrl,
            sha256: event.sha256,
            id: originalEvent?.id || event.id,
            pubkey: event.pubkey,
            reactions,
            avgRating,
            categories: event.categories,
            mode: event.mode,
            description: event.description,
            authorMetadata: authorMetadataCache[event.pubkey] || {}
        });
    }

    appList.sort((a, b) => parseFloat(b.avgRating) - parseFloat(a.avgRating));
    return appList;
}