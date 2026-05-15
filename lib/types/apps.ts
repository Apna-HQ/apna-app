import { Event as NostrEvent } from 'nostr-tools';

export const APP_CATEGORIES = [
    "Productivity",
    "Social",
    "Entertainment",
    "Education",
    "Finance",
    "Health & Fitness",
    "Games",
    "Utilities",
    "Miscellaneous"
] as const;

export type AppCategory = typeof APP_CATEGORIES[number];

/**
 * How the app is hosted.
 *
 * - 'nostr'   — the whole single-file source is stored in a Nostr content event.
 *               `htmlContent` carries it directly when it fits in the metadata note;
 *               otherwise the metadata note carries `contentEventId` pointing at a
 *               separate Kind-1 content event whose `.content` field is the raw source.
 * - 'blossom' — the source is stored as a content-addressed blob on a Blossom
 *               server (BUD-01). The metadata note carries `blossomUrl` + `sha256`;
 *               the loader fetches the URL and (optionally) verifies the hash.
 * - 'url'     — the app is served from an external URL (`appURL` field).
 *
 * Back-compat: `isGeneratedApp` is a derived alias — true when hosting === 'nostr'.
 * Existing serialised events that carry `isGeneratedApp: true` (without `hosting`)
 * are treated as `hosting: 'nostr'` by the loaders.
 */
export type AppHosting = 'nostr' | 'blossom' | 'url';

export interface AppDetails {
    appURL?: string;
    appName: string;
    htmlContent?: string;
    /** How the app is loaded. Derived from legacy `isGeneratedApp` when absent. */
    hosting: AppHosting;
    /** @deprecated Back-compat alias — use `hosting === 'nostr'` instead. */
    isGeneratedApp?: boolean;
    /**
     * Nostr event ID of a separate Kind-1 content event that carries the full
     * HTML source when it is too large to inline in the metadata note.
     * Only relevant when `hosting === 'nostr'`.
     */
    contentEventId?: string;
    /** Blossom URL of the source blob (when `hosting === 'blossom'`). */
    blossomUrl?: string;
    /** SHA-256 hex digest of the source blob — used to verify Blossom fetches. */
    sha256?: string;
    id: string;
    pubkey: string;
    reactions: NostrEvent[];
    avgRating: string;
    categories: AppCategory[];
    mode: "Full-page";
    description: string;
    authorMetadata: {
        name?: string;
    };
}

export interface ProcessedAppEvent extends NostrEvent {
    appURL?: string;
    appName: string;
    htmlContent?: string;
    hosting: AppHosting;
    /** @deprecated Back-compat alias */
    isGeneratedApp?: boolean;
    contentEventId?: string;
    blossomUrl?: string;
    sha256?: string;
    categories: AppCategory[];
    mode: "Full-page";
    description: string;
}

/** Derive the canonical `hosting` value from either the new or legacy field. */
export function deriveHosting(raw: {
    hosting?: AppHosting;
    isGeneratedApp?: boolean;
    appURL?: string;
    blossomUrl?: string;
}): AppHosting {
    if (raw.hosting) return raw.hosting;
    if (raw.blossomUrl) return 'blossom';
    if (raw.isGeneratedApp) return 'nostr';
    if (raw.appURL) return 'url';
    // Fallback — shouldn't reach here for valid events
    return 'url';
}