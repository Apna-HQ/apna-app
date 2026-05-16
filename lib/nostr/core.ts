import { Event as NostrEvent, Filter } from 'nostr-tools'
import { SimplePool } from 'nostr-tools/pool'

import { DEFAULT_RELAYS } from '@/lib/constants'

export { DEFAULT_RELAYS } from '@/lib/constants'

export const pool = new SimplePool()

const QUERY_MAX_WAIT_MS = 10000
const IN_FLIGHT_DEDUPE_MS = 10000

const inFlightQueries = new Map<string, Promise<NostrEvent | NostrEvent[] | null>>()

// Helper function to safely filter tag values to string[]
export const filterTagValues = (tags: any[], tagName: string): string[] => {
  if (!tags) return []
  return tags
    .filter(tag => Array.isArray(tag) && tag[0] === tagName && typeof tag[1] === 'string')
    .map(tag => tag[1])
}

const queryKey = (relays: string[], filter: Filter, singleEvent: boolean): string =>
  JSON.stringify({
    relays: [...relays].sort(),
    filter,
    singleEvent,
  })

const dedupeInFlight = <T extends NostrEvent | NostrEvent[] | null>(
  key: string,
  fn: () => Promise<T>
): Promise<T> => {
  const existing = inFlightQueries.get(key) as Promise<T> | undefined
  if (existing) return existing

  const promise = fn()
  const timeout = setTimeout(() => {
    inFlightQueries.delete(key)
  }, IN_FLIGHT_DEDUPE_MS)

  inFlightQueries.set(key, promise)
  void promise.finally(() => {
    clearTimeout(timeout)
    inFlightQueries.delete(key)
  }).catch(() => undefined)

  return promise
}

export const fetchFromRelay = async (filter: Filter): Promise<NostrEvent | null> => {
  return fetchEventsFromRelays(DEFAULT_RELAYS, filter, true)
}

export const fetchAllFromRelay = async (filter: Filter): Promise<NostrEvent[]> => {
  return fetchEventsFromRelays(DEFAULT_RELAYS, filter)
}

export const subscribeToEvents = async (
  filter: Filter,
  callback: (e: NostrEvent) => void,
  relays: string[] = DEFAULT_RELAYS
): Promise<() => void> => {
  const sub = pool.subscribeMany(
    relays,
    [filter],
    {
      onevent: callback,
      maxWait: QUERY_MAX_WAIT_MS,
    }
  )

  return () => sub.close()
}

/**
 * Fetch events from a list of relays with short-lived in-flight dedupe.
 * @param relays List of relay URLs
 * @param filter Nostr filter
 * @param singleEvent If true, fetch a single event (default: false)
 * @returns Promise resolving to a single event or array of events
 */
export function fetchEventsFromRelays(
  relays: string[],
  filter: Filter,
  singleEvent: true
): Promise<NostrEvent | null>

export function fetchEventsFromRelays(
  relays: string[],
  filter: Filter,
  singleEvent?: false
): Promise<NostrEvent[]>

export async function fetchEventsFromRelays(
  relays: string[],
  filter: Filter,
  singleEvent: boolean = false
): Promise<NostrEvent | NostrEvent[] | null> {
  const relayList = relays.length > 0 ? relays : DEFAULT_RELAYS
  const filterForQuery = singleEvent ? { ...filter, limit: 1 } : { ...filter }
  const key = queryKey(relayList, filterForQuery, singleEvent)

  return dedupeInFlight(key, async () => {
    try {
      if (singleEvent) {
        return await pool.get(relayList, filterForQuery, { maxWait: QUERY_MAX_WAIT_MS })
      }

      return await pool.querySync(relayList, filterForQuery, { maxWait: QUERY_MAX_WAIT_MS })
    } catch (error) {
      console.error('Error fetching events from relays:', error)
      return singleEvent ? null : []
    }
  })
}

/**
 * Like `fetchAllFromRelay`, but with quorum-based early termination so a
 * single slow / unreachable relay doesn't push wall time to the maxWait
 * floor (~10s). Used by latency-sensitive read paths (e.g. `/explore`).
 *
 * Resolves when ANY of:
 *   - all relays have sent EOSE
 *   - `eoseQuorum` relays have sent EOSE AND `minWaitMs` has elapsed
 *   - `maxWaitMs` elapses (hard cap)
 */
export async function fetchAllFromRelaysFast(
  filter: Filter,
  opts: { maxWaitMs?: number; minWaitMs?: number; eoseQuorum?: number; relays?: string[] } = {},
): Promise<NostrEvent[]> {
  const relayList = opts.relays && opts.relays.length > 0 ? opts.relays : DEFAULT_RELAYS
  const maxWaitMs = opts.maxWaitMs ?? 1800
  const minWaitMs = opts.minWaitMs ?? 250
  // Default to single-relay EOSE quorum: in practice every relay query gets
  // at least one healthy answer fast (damus + primal are reliable), and
  // requiring more pays the latency of every slower member of the pool.
  // Anything that arrives between quorum-EOSE and the quiet timer firing is
  // still captured.
  const eoseQuorum = Math.max(1, Math.min(opts.eoseQuorum ?? 1, relayList.length))
  const key = queryKey(relayList, filter, false) + ':fast'

  return dedupeInFlight(key, () => new Promise<NostrEvent[]>((resolve) => {
    const events: NostrEvent[] = []
    const seen = new Set<string>()
    let eoseCount = 0
    let lastEventAt = Date.now()
    let settled = false
    let quietTimer: ReturnType<typeof setTimeout> | null = null

    const finish = () => {
      if (settled) return
      settled = true
      if (quietTimer) clearTimeout(quietTimer)
      try { sub.close() } catch { /* ignore */ }
      resolve(events)
    }

    // Quorum reached → wait until the stream has been quiet for `minWaitMs`,
    // i.e. no new event has landed. Catches the "EOSE came first, events
    // still trickling" pattern without paying full maxWait.
    const armQuietTimer = () => {
      if (quietTimer) clearTimeout(quietTimer)
      const wait = Math.max(0, minWaitMs - (Date.now() - lastEventAt))
      quietTimer = setTimeout(finish, wait)
    }

    const sub = pool.subscribeMany(relayList, [filter], {
      onevent(ev) {
        if (!seen.has(ev.id)) {
          seen.add(ev.id)
          events.push(ev)
          lastEventAt = Date.now()
          // If we're already past quorum and a fresh event arrived, restart
          // the quiet-timer so we don't truncate a slow batch.
          if (eoseCount >= eoseQuorum) armQuietTimer()
        }
      },
      oneose() {
        eoseCount++
        if (eoseCount >= relayList.length) return finish()
        if (eoseCount === eoseQuorum) armQuietTimer()
      },
    })
    setTimeout(finish, maxWaitMs)
  })) as Promise<NostrEvent[]>
}
