/**
 * POST /api/nostr/query — the host's relay-read endpoint.
 *
 * Body: { filters: NostrFilter[], relays?: string[], revalidate?: number }
 * Response: 200 with a JSON array of Nostr events (merged + de-duped across all
 *           filters); 400 invalid body; 502 relay failure.
 *
 * ─── CACHING DEFERRED (redesign decision, 2026-05-14) ───────────────────────
 * This route was originally built with `unstable_cache` + per-filter cache tags
 * as the host's "caching moat". Caching has been intentionally deferred to a
 * later point in the redesign — the route now does a *direct* relay read on
 * every request. The full caching machinery is preserved verbatim in the
 * `CACHING (deferred)` comment block below so it can be revived wholesale.
 * The `revalidate` body field is still accepted (for forward-compat) but is
 * currently ignored.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { type NextRequest } from 'next/server'
import { SimplePool } from 'nostr-tools/pool'
import { DEFAULT_RELAYS } from '@/lib/constants'
// CACHING (deferred): import { unstable_cache } from 'next/cache'
// CACHING (deferred): import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// NostrFilter shape accepted by this route (mirrors the SDK contract).
type NostrFilter = {
  ids?: string[]
  kinds?: number[]
  authors?: string[]
  since?: number
  until?: number
  limit?: number
  search?: string
  // tag filters: "#e", "#p", "#t", ...
  [tag: `#${string}`]: string[] | undefined
}

/* ─── CACHING (deferred) ──────────────────────────────────────────────────────
 * Revive this block (and the two imports above) when re-introducing caching.
 * Originally: wrap `queryRelays` in `unstable_cache` keyed by a SHA-256 of
 * `{ filters, relays }`, register per-filter tags so `/api/nostr/revalidate`
 * can invalidate precisely, and emit a `Cache-Control` header.
 *
 * function generateSHA256Digest(message: string): string {
 *   return crypto.createHash('sha256').update(message).digest('hex')
 * }
 *
 * // Pick a default `revalidate` (s): ids-only -> 1yr, kind 0/3 -> 300s, else 30s.
 * function defaultRevalidateForFilters(filters: NostrFilter[]): number {
 *   const ONE_YEAR = 60 * 60 * 24 * 365
 *   let result = ONE_YEAR
 *   for (const filter of filters) {
 *     let value: number
 *     const isIdsOnly =
 *       Array.isArray(filter.ids) && filter.ids.length > 0 &&
 *       !filter.kinds && !filter.authors &&
 *       Object.keys(filter).every((k) => k === 'ids' || k === 'limit')
 *     if (isIdsOnly) value = ONE_YEAR
 *     else if (
 *       Array.isArray(filter.kinds) && filter.kinds.length > 0 &&
 *       filter.kinds.every((k) => k === 0 || k === 3)
 *     ) value = 300
 *     else value = 30
 *     result = Math.min(result, value)
 *   }
 *   return result
 * }
 *
 * // Per-filter cache tags so writes can invalidate precisely.
 * function perFilterTags(filters: NostrFilter[]): string[] {
 *   const tags = new Set<string>()
 *   for (const filter of filters) {
 *     filter.authors?.forEach((a) => tags.add(`author:${a}`))
 *     filter.kinds?.forEach((k) => tags.add(`kind:${k}`))
 *     for (const [key, value] of Object.entries(filter)) {
 *       if (key.startsWith('#') && Array.isArray(value)) {
 *         const tagName = key.slice(1)
 *         ;(value as string[]).forEach((v) => tags.add(`${tagName}:${v}`))
 *       }
 *     }
 *   }
 *   return Array.from(tags)
 * }
 *
 * // In POST(), instead of calling queryRelays directly:
 * const hash = generateSHA256Digest(JSON.stringify({ filters, relays }))
 * const tags = [hash, ...perFilterTags(filters as NostrFilter[])]
 * const revalidate =
 *   typeof revalidateOverride === 'number'
 *     ? revalidateOverride
 *     : defaultRevalidateForFilters(filters as NostrFilter[])
 * const cachedQuery = unstable_cache(
 *   async () => queryRelays(relays, filters as NostrFilter[]),
 *   [hash],
 *   { revalidate: revalidate === 0 ? 1 : revalidate, tags }
 * )
 * result = await cachedQuery()
 * if (revalidate > 0) {
 *   headers['Cache-Control'] = `public, s-maxage=${revalidate}, stale-while-revalidate=60`
 * }
 * ──────────────────────────────────────────────────────────────────────────── */

async function queryRelays(relays: string[], filters: NostrFilter[]) {
  const pool = new SimplePool()
  try {
    // nostr-tools' querySync takes a single filter; query each and merge,
    // de-duplicating by event id.
    const seen = new Set<string>()
    const merged: any[] = []
    for (const filter of filters) {
      const events = await pool.querySync(relays, filter as any, { maxWait: 10000 })
      for (const ev of events) {
        if (!seen.has(ev.id)) {
          seen.add(ev.id)
          merged.push(ev)
        }
      }
    }
    return merged
  } finally {
    // Release relay connections opened by this pool.
    try {
      pool.close(relays)
    } catch {
      /* best-effort cleanup */
    }
  }
}

export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return new Response('Bad request: invalid JSON body', { status: 400 })
  }

  // `revalidate` is accepted in the body for forward-compat but ignored while
  // caching is deferred — see the CACHING DEFERRED note at the top of the file.
  const { filters, relays: relaysInput } = body ?? {}

  if (!Array.isArray(filters) || filters.length === 0) {
    return new Response('Bad request: `filters` must be a non-empty array', {
      status: 400,
    })
  }

  const relays: string[] =
    Array.isArray(relaysInput) && relaysInput.length > 0 ? relaysInput : DEFAULT_RELAYS

  let result: any[]
  try {
    // CACHING (deferred): this was wrapped in `unstable_cache` — see the block above.
    result = await queryRelays(relays, filters as NostrFilter[])
  } catch (error) {
    console.error('[api/nostr/query] relay query failed:', error)
    return new Response('Upstream relay query failed', { status: 502 })
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
