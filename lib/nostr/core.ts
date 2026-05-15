import { Event as NostrEvent, Filter } from 'nostr-tools'
import { SimplePool } from 'nostr-tools/pool'

import { DEFAULT_RELAYS } from '@/lib/constants'

export { DEFAULT_RELAYS } from '@/lib/constants'

export const pool = new SimplePool()

const QUERY_MAX_WAIT_MS = 5000
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
