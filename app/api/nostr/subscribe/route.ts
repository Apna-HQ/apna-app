/**
 * GET /api/nostr/subscribe — server-side Nostr subscriptions streamed to
 * mini-apps over Server-Sent Events.
 *
 * Query params:
 *   - `filters` : URL-encoded JSON `NostrFilter[]` (required)
 *   - `relays`  : URL-encoded JSON `string[]` (optional; defaults to DEFAULT_RELAYS)
 *
 * Each matching relay event is emitted as an SSE `data:` frame. Heartbeat
 * comment frames keep the connection alive through proxies. The relay
 * subscription is torn down on stream close / client disconnect so nothing
 * leaks.
 */

import { type NextRequest } from 'next/server'
import { SimplePool } from 'nostr-tools/pool'
import { DEFAULT_RELAYS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

// Heartbeat interval — comment frames that keep intermediaries from timing out.
const HEARTBEAT_MS = 25_000

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  const filtersParam = searchParams.get('filters')
  if (!filtersParam) {
    return new Response('Bad request: `filters` query param is required', {
      status: 400,
    })
  }

  let filters: any[]
  try {
    filters = JSON.parse(decodeURIComponent(filtersParam))
  } catch {
    return new Response('Bad request: `filters` must be URL-encoded JSON', {
      status: 400,
    })
  }
  if (!Array.isArray(filters) || filters.length === 0) {
    return new Response('Bad request: `filters` must be a non-empty array', {
      status: 400,
    })
  }

  let relays: string[] = DEFAULT_RELAYS
  const relaysParam = searchParams.get('relays')
  if (relaysParam) {
    try {
      const parsed = JSON.parse(decodeURIComponent(relaysParam))
      if (Array.isArray(parsed) && parsed.length > 0) {
        relays = parsed
      }
    } catch {
      return new Response('Bad request: `relays` must be URL-encoded JSON', {
        status: 400,
      })
    }
  }

  const encoder = new TextEncoder()
  const pool = new SimplePool()

  // References captured so cleanup can run from either `cancel` or disconnect.
  let closer: { close: () => void } | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let closed = false

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // Controller already closed — trigger cleanup.
          cleanup()
        }
      }

      // Initial comment frame so the client knows the stream is open.
      send(': connected\n\n')

      heartbeat = setInterval(() => send(`: heartbeat ${Date.now()}\n\n`), HEARTBEAT_MS)

      closer = pool.subscribeMany(relays, filters as any, {
        onevent(event) {
          send(`data: ${JSON.stringify(event)}\n\n`)
        },
        oneose() {
          // End of stored events — keep the connection open for live events.
          send('event: eose\ndata: {}\n\n')
        },
        onclose() {
          cleanup()
        },
      })

      const cleanup = () => {
        if (closed) return
        closed = true
        if (heartbeat) {
          clearInterval(heartbeat)
          heartbeat = null
        }
        try {
          closer?.close()
        } catch {
          /* best-effort */
        }
        try {
          pool.close(relays)
        } catch {
          /* best-effort */
        }
        try {
          controller.close()
        } catch {
          /* already closed */
        }
        console.log('[api/nostr/subscribe] subscription cleaned up')
      }

      // Tear down when the client navigates away / aborts the request.
      request.signal.addEventListener('abort', cleanup)
    },
    cancel() {
      // Reader cancelled — release relay resources.
      closed = true
      if (heartbeat) clearInterval(heartbeat)
      try {
        closer?.close()
      } catch {
        /* best-effort */
      }
      try {
        pool.close(relays)
      } catch {
        /* best-effort */
      }
      console.log('[api/nostr/subscribe] subscription cancelled by client')
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
