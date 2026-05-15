/**
 * design-selections — host-side persistence + subscription for
 * `remoteComponentSelections` (the user's Module Federation component swaps).
 *
 * Shape (`RemoteComponentSelections`) matches `sdk/src/interfaces/ui.ts` exactly:
 *   Record<componentName, { name: string; entry: string }>
 *
 * On every change the module also broadcasts a `design:selections` event to all
 * running mini-app instances so they can hot-swap their components.
 *
 * Future: replace the localStorage backing store with a Nostr-event-backed store
 * (a replaceable Kind event, encrypted per-user) so selections sync across devices.
 * The public API — getDesignSelections / setDesignSelections / subscribeToDesignSelections —
 * does NOT need to change for that migration.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** A selected Module Federation remote for one customizable slot. */
export interface RemoteComponentSelection {
  /** Remote name, e.g. `apna_host_design`. */
  name: string;
  /** Remote entry URL — an `mf-manifest.json` or `remoteEntry.js`. */
  entry: string;
}

/**
 * The user's design-component selections, keyed by the customizable component
 * name the mini-app registered (e.g. `"Button"`, `"Card"`).
 *
 * Mirrors `RemoteComponentSelections` from `@apna/sdk` interfaces/ui.ts.
 * The SDK's `with-dynamic-component.tsx` also uses the localStorage key
 * `"remoteComponentSelections"` with the same inner shape — keep in sync.
 */
export type RemoteComponentSelections = Record<string, RemoteComponentSelection>;

// ── Constants ────────────────────────────────────────────────────────────────

/** localStorage key — matches the SDK's own `STORAGE_KEY` in with-dynamic-component. */
const STORAGE_KEY = 'apna:design-selections';

// ── In-memory subscriber list ─────────────────────────────────────────────────

type SelectionsListener = (selections: RemoteComponentSelections) => void;

const listeners = new Set<SelectionsListener>();

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Read the current design-selections from localStorage.
 * Returns an empty object when nothing has been persisted yet.
 */
export function getDesignSelections(): RemoteComponentSelections {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as RemoteComponentSelections;
  } catch {
    return {};
  }
}

/**
 * Persist updated design-selections and notify all subscribers.
 *
 * Callers (e.g. the MiniAppModal's design-picker flow) should call this
 * whenever the user swaps a component so that:
 *   1. The selection survives page reloads (localStorage).
 *   2. All running mini-app instances receive a `design:selections` event.
 */
export function setDesignSelections(next: RemoteComponentSelections): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Silently ignore storage-quota errors — the in-memory notify still runs.
  }
  notifyListeners(next);
}

/**
 * Subscribe to design-selection changes.
 *
 * The callback fires synchronously whenever `setDesignSelections` is called.
 * Returns an unsubscribe function; always call it when the subscriber unmounts.
 *
 * @example
 * ```ts
 * const unsub = subscribeToDesignSelections((selections) => {
 *   instance.emit('design:selections', selections);
 * });
 * // later…
 * unsub();
 * ```
 */
export function subscribeToDesignSelections(
  cb: SelectionsListener
): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function notifyListeners(selections: RemoteComponentSelections): void {
  listeners.forEach((cb) => {
    try {
      cb(selections);
    } catch (err) {
      console.error('[apna] design-selections subscriber threw:', err);
    }
  });
}
