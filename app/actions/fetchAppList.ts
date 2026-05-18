'use server'

import { Event as NostrEvent } from 'nostr-tools';
import { fetchAllFromRelaysFast } from '@/lib/nostr/core';
import {
    AppDetails,
    APP_CATEGORIES,
    AppCategory,
    AppDefaultDisplay,
    AppHosting,
    deriveHosting,
} from '@/lib/types/apps';
import { APPS_ROOT_NOTE_ID } from '@/lib/constants';

interface AppDetailsJSON {
    appURL?: string;
    appName: string;
    htmlContent?: string;
    hosting: AppHosting;
    defaultDisplay?: AppDefaultDisplay;
    isGeneratedApp?: boolean;
    contentEventId?: string;
    blossomUrl?: string;
    sha256?: string;
    categories: AppCategory[];
    mode: "Full-page";
    description: string;
}

function parseAppDetailsFromJSON(text: string): AppDetailsJSON | null {
    try {
        const json = JSON.parse(text);
        if (!json || typeof json !== 'object') return null;

        const hasUrl = typeof json.appURL === 'string' && json.appURL !== '';
        const hasHtml = typeof json.htmlContent === 'string' && json.htmlContent !== '';
        const hasContentRef = typeof json.contentEventId === 'string' && json.contentEventId !== '';
        const hasBlossom = typeof json.blossomUrl === 'string' && json.blossomUrl !== '';
        const legacyGenerated = json.isGeneratedApp === true;
        if (!(hasUrl || hasHtml || hasContentRef || hasBlossom || legacyGenerated)) return null;

        const hosting = deriveHosting({
            hosting: json.hosting,
            isGeneratedApp: json.isGeneratedApp,
            appURL: json.appURL,
            blossomUrl: json.blossomUrl,
        });
        const defaultDisplay =
            json.defaultDisplay === 'fullscreen' || json.defaultDisplay === 'tab'
                ? json.defaultDisplay
                : undefined;
        return {
            appURL: json.appURL,
            appName: json.appName,
            htmlContent: json.htmlContent,
            hosting,
            defaultDisplay,
            isGeneratedApp: hosting === 'nostr' || hosting === 'blossom',
            contentEventId: json.contentEventId,
            blossomUrl: json.blossomUrl,
            sha256: typeof json.sha256 === 'string' ? json.sha256 : undefined,
            categories: Array.isArray(json.categories)
                ? json.categories.filter((cat: string) => APP_CATEGORIES.includes(cat as AppCategory))
                : ["Miscellaneous"],
            mode: "Full-page",
            description: json.description || `A ${json.categories?.[0] || "Miscellaneous"} app`,
        };
    } catch {
        return null;
    }
}

/**
 * Hash + verify a Blossom blob fetched over HTTP. Returns null on mismatch
 * so a tampered blob never ends up rendered in a sandboxed iframe.
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

function calculateAverageRating(reactions: NostrEvent[]): string {
    let totalRating = 0;
    let count = 0;
    for (const reaction of reactions) {
        try {
            const data = JSON.parse(reaction.content);
            if (data && typeof data.rating === 'number') {
                totalRating += data.rating;
                count++;
                continue;
            }
        } catch { /* fall through to text content */ }
        if (reaction.content === '+') { totalRating += 5; count++; }
        else if (reaction.content === '-') { totalRating += 1; count++; }
    }
    return count > 0 ? (totalRating / count).toFixed(1) : '0.0';
}

/**
 * Fetch the published-apps registry from relays.
 *
 * Performance model — every relay query is a 5-relay `pool.querySync` with a
 * `maxWait`-bound timeout. The previous version stacked ~3N+M queries
 * sequentially (per-app reactions, per-app update replies, per-author
 * metadata, plus per-app content-event lookups), which made /explore take
 * 40-60 s once we stripped caching.
 *
 * This version collapses everything into **five batched queries that run in
 * parallel** after the first relay round-trip:
 *
 *   round 1: primary replies to APPS_ROOT_NOTE_ID            (1 query)
 *   round 2 (all in parallel):
 *     - all referenced content events           ids: [...]
 *     - all update replies                      kinds:[1] #e:[...]
 *     - all reactions/reposts                   kinds:[6,7] #e:[...]
 *     - all author kind-0 metadata              kinds:[0] authors:[...]
 *     - all Blossom blobs                       (HTTP, fully parallel)
 *   round 3 (only if updates reference more content events):
 *     - extra content events for update entries
 *
 * Wall time becomes ~3 sequential relay rounds (≤ 5 s each in practice) plus
 * the parallel HTTP fan-out for Blossom blobs.
 */
export async function fetchAppListAction(_revalidate = false): Promise<AppDetails[]> {
    const t0 = Date.now();

    // ── round 1 ──────────────────────────────────────────────────────────
    // All replies to the registry root, in one query.
    const replyEvents = await fetchAllFromRelaysFast({
        kinds: [1],
        '#e': [APPS_ROOT_NOTE_ID],
    });

    // Parse and dedupe to "primary" submission events.
    type Primary = NostrEvent & { _details: AppDetailsJSON };
    const primaries: Primary[] = [];
    for (const ev of replyEvents.sort((a, b) => b.created_at - a.created_at)) {
        const details = parseAppDetailsFromJSON(ev.content);
        if (!details) continue;
        primaries.push(Object.assign(ev, { _details: details }));
    }
    const primaryIds = primaries.map((p) => p.id);

    // Collect ids/urls/pubkeys we'll need in round 2.
    const contentEventIds = primaries
        .filter((p) => p._details.hosting === 'nostr' && !p._details.htmlContent && p._details.contentEventId)
        .map((p) => p._details.contentEventId!) as string[];
    const blossomTargets = primaries
        .filter((p) => p._details.hosting === 'blossom' && !p._details.htmlContent && p._details.blossomUrl)
        .map((p) => ({ id: p.id, url: p._details.blossomUrl!, sha256: p._details.sha256 }));
    const allPubkeys = Array.from(new Set(primaries.map((p) => p.pubkey)));

    // ── round 2 ──────────────────────────────────────────────────────────
    // Fan out everything that depends only on primary ids/pubkeys.
    const [
        contentEvents,
        updateEvents,
        reactionEvents,
        authorMetadataEvents,
        primaryBlossom,
    ] = await Promise.all([
        contentEventIds.length > 0
            ? fetchAllFromRelaysFast({ ids: contentEventIds })
            : Promise.resolve<NostrEvent[]>([]),
        primaryIds.length > 0
            ? fetchAllFromRelaysFast({ kinds: [1], '#e': primaryIds })
            : Promise.resolve<NostrEvent[]>([]),
        primaryIds.length > 0
            ? fetchAllFromRelaysFast({ kinds: [6, 7], '#e': primaryIds })
            : Promise.resolve<NostrEvent[]>([]),
        allPubkeys.length > 0
            ? fetchAllFromRelaysFast({ kinds: [0], authors: allPubkeys })
            : Promise.resolve<NostrEvent[]>([]),
        Promise.all(blossomTargets.map(async (t) => ({
            id: t.id,
            html: await loadContentFromBlossom(t.url, t.sha256),
        }))),
    ]);

    // Index lookups by id.
    const contentById = new Map<string, string>();
    for (const ev of contentEvents) contentById.set(ev.id, ev.content);
    const blossomById = new Map<string, string>();
    for (const r of primaryBlossom) if (r.html) blossomById.set(r.id, r.html);

    // Hydrate primaries' htmlContent now that round-2 results are in.
    for (const p of primaries) {
        if (p._details.hosting === 'nostr' && !p._details.htmlContent && p._details.contentEventId) {
            const html = contentById.get(p._details.contentEventId);
            if (html) p._details.htmlContent = html;
        }
        if (p._details.hosting === 'blossom' && !p._details.htmlContent) {
            const html = blossomById.get(p.id);
            if (html) p._details.htmlContent = html;
        }
    }

    // Keep only primaries whose source actually resolved.
    const validPrimaries = primaries.filter((p) => {
        const d = p._details;
        if (d.hosting === 'url') return typeof d.appURL === 'string' && d.appURL !== '' && typeof d.appName === 'string';
        if (d.hosting === 'nostr' || d.hosting === 'blossom') return typeof d.htmlContent === 'string' && d.htmlContent !== '' && typeof d.appName === 'string';
        return false;
    });
    const validById = new Map<string, Primary>();
    for (const p of validPrimaries) validById.set(p.id, p);

    // Bucket update replies by which primary they target. Same-author only.
    type Update = { reply: NostrEvent; details: AppDetailsJSON };
    const updatesByPrimary = new Map<string, Update[]>();
    for (const reply of updateEvents) {
        const details = parseAppDetailsFromJSON(reply.content);
        if (!details) continue;
        // Pick which primary this reply targets — the last `e` tag that points at one of our primaries.
        const eTags = reply.tags.filter((t) => t[0] === 'e');
        let targetId: string | undefined;
        for (let i = eTags.length - 1; i >= 0; i--) {
            if (validById.has(eTags[i][1])) { targetId = eTags[i][1]; break; }
        }
        if (!targetId) continue;
        const primary = validById.get(targetId)!;
        if (reply.pubkey !== primary.pubkey) continue;
        const bucket = updatesByPrimary.get(targetId) ?? [];
        bucket.push({ reply, details });
        updatesByPrimary.set(targetId, bucket);
    }

    // ── round 3 ──────────────────────────────────────────────────────────
    // For each primary, pick the latest update (by created_at) that has a
    // resolvable source. We need to resolve update content events / Blossom
    // blobs first — but only the ones referenced by the latest update per
    // primary (avoids over-fetching).
    const latestUpdates = new Map<string, Update>();
    updatesByPrimary.forEach((ups: Update[], pid: string) => {
        ups.sort((a, b) => b.reply.created_at - a.reply.created_at);
        latestUpdates.set(pid, ups[0]);
    });

    const updateContentIds = Array.from(latestUpdates.values())
        .filter((u) => u.details.hosting === 'nostr' && !u.details.htmlContent && u.details.contentEventId)
        .map((u) => u.details.contentEventId!) as string[];
    const updateBlossomTargets = Array.from(latestUpdates.entries())
        .filter(([, u]) => u.details.hosting === 'blossom' && !u.details.htmlContent && u.details.blossomUrl)
        .map(([pid, u]) => ({ pid, url: u.details.blossomUrl!, sha256: u.details.sha256 }));

    const [updateContent, updateBlossom] = await Promise.all([
        updateContentIds.length > 0
            ? fetchAllFromRelaysFast({ ids: updateContentIds })
            : Promise.resolve<NostrEvent[]>([]),
        Promise.all(updateBlossomTargets.map(async (t) => ({
            pid: t.pid,
            html: await loadContentFromBlossom(t.url, t.sha256),
        }))),
    ]);
    const updateContentById = new Map<string, string>();
    for (const ev of updateContent) updateContentById.set(ev.id, ev.content);
    const updateBlossomByPid = new Map<string, string>();
    for (const r of updateBlossom) if (r.html) updateBlossomByPid.set(r.pid, r.html);

    // Apply updates to primaries (if the update's source resolved).
    latestUpdates.forEach((u, pid) => {
        if (u.details.hosting === 'nostr' && !u.details.htmlContent && u.details.contentEventId) {
            u.details.htmlContent = updateContentById.get(u.details.contentEventId);
        }
        if (u.details.hosting === 'blossom' && !u.details.htmlContent) {
            u.details.htmlContent = updateBlossomByPid.get(pid);
        }
        const usable =
            u.details.hosting === 'url'
                ? typeof u.details.appURL === 'string' && u.details.appURL !== ''
                : typeof u.details.htmlContent === 'string' && u.details.htmlContent !== '';
        if (!usable) return;
        const primary = validById.get(pid)!;
        // Merge the update over the primary's _details; keep the primary's id/pubkey so reactions still track.
        primary._details = { ...primary._details, ...u.details };
    });

    // Group reactions by primary id (from the `e` tag).
    const reactionsByPrimary = new Map<string, NostrEvent[]>();
    for (const r of reactionEvents) {
        const e = r.tags.find((t) => t[0] === 'e');
        if (!e) continue;
        const pid = e[1];
        if (!validById.has(pid)) continue;
        const bucket = reactionsByPrimary.get(pid) ?? [];
        bucket.push(r);
        reactionsByPrimary.set(pid, bucket);
    }

    // Latest kind-0 per pubkey wins.
    const metadataByPubkey = new Map<string, Record<string, unknown>>();
    const latestMetaByPubkey = new Map<string, NostrEvent>();
    for (const m of authorMetadataEvents) {
        const existing = latestMetaByPubkey.get(m.pubkey);
        if (!existing || m.created_at > existing.created_at) latestMetaByPubkey.set(m.pubkey, m);
    }
    latestMetaByPubkey.forEach((ev, pk) => {
        try { metadataByPubkey.set(pk, JSON.parse(ev.content || '{}')); }
        catch { metadataByPubkey.set(pk, {}); }
    });

    // Build the final list.
    const appList: AppDetails[] = [];
    for (const p of validPrimaries) {
        const reactions = reactionsByPrimary.get(p.id) ?? [];
        const avgRating = calculateAverageRating(reactions);
        const d = p._details;
        appList.push({
            appURL: d.appURL,
            appName: d.appName,
            htmlContent: d.htmlContent,
            hosting: d.hosting,
            defaultDisplay: d.defaultDisplay,
            isGeneratedApp: d.hosting === 'nostr' || d.hosting === 'blossom',
            contentEventId: d.contentEventId,
            blossomUrl: d.blossomUrl,
            sha256: d.sha256,
            id: p.id,
            pubkey: p.pubkey,
            reactions,
            avgRating,
            categories: d.categories,
            mode: d.mode,
            description: d.description,
            authorMetadata: metadataByPubkey.get(p.pubkey) ?? {},
        } as AppDetails);
    }

    appList.sort((a, b) => parseFloat(b.avgRating) - parseFloat(a.avgRating));

    const elapsed = Date.now() - t0;
    console.log(
        `[fetchAppListAction] ${appList.length} apps in ${elapsed}ms ` +
        `(primaries=${primaries.length}, updates=${latestUpdates.size}, ` +
        `reactions=${reactionEvents.length}, authors=${allPubkeys.length})`
    );
    return appList;
}
