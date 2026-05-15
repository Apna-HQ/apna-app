'use server'

import { unstable_cache } from 'next/cache';
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
    categories: AppCategory[];
    mode: "Full-page";
    description: string;
}

async function parseAppDetailsFromJSON(text: string): Promise<AppDetailsJSON | null> {
    try {
        const json = JSON.parse(text);
        if (json && typeof json === 'object') {
            // Accept events that carry a URL, inline HTML, a content-event reference,
            // or the legacy isGeneratedApp flag.
            const hasUrl = 'appURL' in json && typeof json.appURL === 'string' && json.appURL !== '';
            const hasHtml = 'htmlContent' in json && typeof json.htmlContent === 'string' && json.htmlContent !== '';
            const hasContentRef = 'contentEventId' in json && typeof json.contentEventId === 'string' && json.contentEventId !== '';
            const legacyGenerated = json.isGeneratedApp === true;

            if (hasUrl || hasHtml || hasContentRef || legacyGenerated) {
                const hosting = deriveHosting({
                    hosting: json.hosting,
                    isGeneratedApp: json.isGeneratedApp,
                    appURL: json.appURL,
                });
                return {
                    appURL: json.appURL,
                    appName: json.appName,
                    htmlContent: json.htmlContent,
                    hosting,
                    isGeneratedApp: hosting === 'nostr', // keep back-compat alias in sync
                    contentEventId: json.contentEventId,
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

export async function fetchAppListAction(revalidate = false): Promise<AppDetails[]> {
    return unstable_cache(
        async () => {
            const appList: AppDetails[] = [];
            const replyEvents = await GetNoteReplies(APPS_ROOT_NOTE_ID, true) as NostrEvent[];
            const authorMetadataCache: Record<string, any> = {};

            // First, process all app submission events
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
                            if (source) {
                                appDetails.htmlContent = source;
                            }
                        }

                        return {
                            ...replyEvent,
                            ...appDetails
                        };
                    })
            );

            // Filter valid events
            const validEvents = processedEvents.filter((event): event is ProcessedAppEvent =>
                event !== null &&
                typeof event.appName === 'string' &&
                (
                    // URL-hosted app validation
                    (event.hosting === 'url' && typeof event.appURL === 'string' && event.appURL !== '') ||
                    // Nostr-hosted app validation (legacy isGeneratedApp falls here too)
                    (event.hosting === 'nostr' && typeof event.htmlContent === 'string' && event.htmlContent !== '')
                )
            );

            // For each valid event, check for update replies from the same author
            const updatedValidEvents = await Promise.all(
                validEvents.map(async (event) => {
                    // Get all replies to this app submission
                    const updateReplies = await GetNoteReplies(event.id, true); // Get only direct replies
                    
                    // Parse and validate all replies
                    const parsedReplies = await Promise.all(
                        updateReplies.map(async (reply: NostrEvent) => {
                            const updateDetails = await parseAppDetailsFromJSON(reply.content);
                            if (!updateDetails) return null;

                            // Load content from referenced event if needed (same as primary events)
                            if (
                                updateDetails.hosting === 'nostr' &&
                                !updateDetails.htmlContent &&
                                updateDetails.contentEventId
                            ) {
                                const source = await loadContentFromEvent(updateDetails.contentEventId);
                                if (source) updateDetails.htmlContent = source;
                            }

                            // Validate required fields based on hosting type
                            if (
                                !updateDetails.appName ||
                                (
                                    // URL-hosted app validation
                                    (updateDetails.hosting === 'url' && (!updateDetails.appURL || updateDetails.appURL === '')) ||
                                    // Nostr-hosted app validation
                                    (updateDetails.hosting === 'nostr' && (!updateDetails.htmlContent || updateDetails.htmlContent === ''))
                                )
                            ) return null;

                            return {
                                reply,
                                details: updateDetails
                            };
                        })
                    );

                    // Filter valid replies by the same author and sort by timestamp
                    const validAuthorUpdates = parsedReplies
                        .filter((item): item is { reply: NostrEvent; details: AppDetailsJSON } =>
                            item !== null &&
                            item.reply.pubkey === event.pubkey // Same author only
                        )
                        .sort((a, b) => b.reply.created_at - a.reply.created_at); // Latest first

                    // Get the latest valid update or use the original event
                    const latestUpdate = validAuthorUpdates.length > 0
                        ? {
                            ...validAuthorUpdates[0].reply,
                            ...validAuthorUpdates[0].details
                        } as ProcessedAppEvent
                        : null;
                    return latestUpdate || event;
                })
            );

            // First, gather all pubkeys from the updated events
            const allPubkeys = new Set(updatedValidEvents.map(event => event.pubkey));

            // Fetch author metadata
            await Promise.all(
                Array.from(allPubkeys).map(async (pubkey) => {
                    authorMetadataCache[pubkey] = await GetNpubProfileMetadata(pubkey);
                })
            );

            // Process apps and their reactions
            for (const event of updatedValidEvents) {
                // Get reactions for the original app submission
                const originalEvent = validEvents.find(ve => {
                    if (ve.pubkey !== event.pubkey) return false;
                    
                    // // For external apps, match by appURL
                    // if (!event.isGeneratedApp && !ve.isGeneratedApp) {
                    //     return ve.appURL === event.appURL;
                    // }
                    
                    // // For generated apps, match by appName (assuming appName is unique per user)
                    // if (event.isGeneratedApp && ve.isGeneratedApp) {
                    //     return ve.appName === event.appName;
                    // }
                    
                    return false;
                });
                
                const reactions = await GetNoteReactions(originalEvent?.id || event.id, revalidate, undefined);
                const avgRating = await calculateAverageRating(reactions);
                
                appList.push({
                    appURL: event.appURL,
                    appName: event.appName,
                    htmlContent: event.htmlContent,
                    hosting: event.hosting,
                    isGeneratedApp: event.hosting === 'nostr', // back-compat alias
                    contentEventId: event.contentEventId,
                    id: originalEvent?.id || event.id, // Keep original note ID for reactions
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
        },
        ['app-list'],
        {
            tags: ['ApnaMiniAppDetails'],
            revalidate: 300 // Cache for an hour
        }
    )();
}