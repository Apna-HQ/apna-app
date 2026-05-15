/**
 * POST /api/apna/notifications/send
 *
 * Per-mini-app push endpoint called by the @apna/sdk/server `apna.notifications.send()`.
 *
 * Authentication: NIP-98 HTTP Auth — the caller must include an `Authorization: Nostr <base64-event>`
 * header signed with the mini-app publisher's private key.
 *
 * Authorization: the signer's pubkey must be the author of at least one published
 * mini-app metadata note (a reply to APPS_ROOT_NOTE_ID). Non-owners receive 403.
 *
 * Rate-limit: 30 requests per pubkey per 60-second window (in-memory; resets on cold start).
 *
 * Request body (JSON, matches NotificationPayload in @apna/sdk):
 *   { title: string; body: string; url?: string; icon?: string; data?: unknown }
 *
 * Success response: { success: true; sent: number; total: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { nip98 } from 'nostr-tools'
import { pushSubscriptionStore, SERVER_NSEC } from '@/lib/pushSubscriptionStore'
import { sendPushNotification } from '@/app/actions/push-notifications'
import { sendPushUnsubscription } from '@/lib/nostr/nip04Utils'
import { fetchAllFromRelay } from '@/lib/nostr/core'
import { APPS_ROOT_NOTE_ID } from '@/lib/constants'

/* -------------------------------------------------------------------------- */
/* In-memory rate limiter — 30 requests per pubkey per 60 s                   */
/* -------------------------------------------------------------------------- */

const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_MS = 60_000

interface RateLimitEntry {
  count: number
  windowStart: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()

/**
 * Returns true if the pubkey is within its rate-limit quota; increments the counter.
 * Returns false if the quota is exceeded.
 */
function checkRateLimit(pubkey: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(pubkey)

  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    // Start a fresh window
    rateLimitMap.set(pubkey, { count: 1, windowStart: now })
    return true
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false
  }

  entry.count += 1
  return true
}

/* -------------------------------------------------------------------------- */
/* App-ownership check — does this pubkey own a published mini-app?           */
/* -------------------------------------------------------------------------- */

/**
 * Checks whether `pubkey` is the author of at least one reply to APPS_ROOT_NOTE_ID
 * that contains valid mini-app metadata (appURL or isGeneratedApp + htmlContent).
 *
 * We query the relays directly (no cache) so authorisation decisions are fresh.
 */
async function pubkeyOwnsApp(pubkey: string): Promise<boolean> {
  try {
    const events = await fetchAllFromRelay({
      kinds: [1],
      '#e': [APPS_ROOT_NOTE_ID],
      authors: [pubkey],
    })

    for (const event of events) {
      try {
        const json = JSON.parse(event.content)
        if (
          json &&
          typeof json === 'object' &&
          (
            (typeof json.appURL === 'string' && json.appURL !== '') ||
            (json.isGeneratedApp === true && typeof json.htmlContent === 'string' && json.htmlContent !== '')
          )
        ) {
          return true
        }
      } catch {
        // Ignore non-JSON events
      }
    }

    return false
  } catch (error) {
    console.error('[apna/notifications/send] Error checking app ownership:', error)
    // Fail closed — treat relay errors as "not authorised" to avoid bypassing the check.
    return false
  }
}

/* -------------------------------------------------------------------------- */
/* POST handler                                                                */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest): Promise<NextResponse> {
  /* ---- 1. NIP-98 authentication ----------------------------------------- */

  const authHeader = request.headers.get('Authorization')

  if (!authHeader || !authHeader.startsWith('Nostr ')) {
    return NextResponse.json(
      { error: 'Missing or invalid Nostr Authorization header' },
      { status: 401 }
    )
  }

  const token = authHeader.slice(6) // Remove 'Nostr ' prefix

  let pubkey: string
  try {
    const valid = await nip98.validateToken(
      token,
      request.url,
      request.method
    )
    if (!valid) {
      return NextResponse.json(
        { error: 'NIP-98 validation failed' },
        { status: 401 }
      )
    }

    const eventObj = await nip98.unpackEventFromToken(token)
    pubkey = eventObj.pubkey
  } catch (err) {
    console.error('[apna/notifications/send] NIP-98 auth error:', err)
    return NextResponse.json(
      { error: 'Authentication error' },
      { status: 401 }
    )
  }

  /* ---- 2. Rate limit per pubkey ----------------------------------------- */

  if (!checkRateLimit(pubkey)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Maximum 30 requests per 60 seconds.' },
      { status: 429 }
    )
  }

  /* ---- 3. Authorisation: pubkey must own a published mini-app ------------ */

  const ownsApp = await pubkeyOwnsApp(pubkey)
  if (!ownsApp) {
    return NextResponse.json(
      { error: 'Forbidden: the signing pubkey does not own a published mini-app.' },
      { status: 403 }
    )
  }

  /* ---- 4. Parse and validate request body -------------------------------- */

  let body: { title?: unknown; body?: unknown; url?: unknown; icon?: unknown; data?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const { title, body: notifBody, url, icon, data } = body

  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json(
      { error: '"title" is required and must be a non-empty string' },
      { status: 400 }
    )
  }
  if (typeof notifBody !== 'string' || !notifBody.trim()) {
    return NextResponse.json(
      { error: '"body" is required and must be a non-empty string' },
      { status: 400 }
    )
  }

  /* ---- 5. Fan out via pushSubscriptionStore + web-push ------------------- */

  let subscriptions
  try {
    subscriptions = await pushSubscriptionStore.getAllSubscriptions()
  } catch (err) {
    console.error('[apna/notifications/send] Failed to load subscriptions:', err)
    return NextResponse.json(
      { error: 'Failed to load push subscriptions' },
      { status: 500 }
    )
  }

  const payload = {
    title,
    message: notifBody, // web-push helper expects "message" key
    ...(url ? { url } : {}),
    ...(icon ? { icon } : {}),
    ...(data !== undefined ? { data } : {}),
  }

  console.log(
    `[apna/notifications/send] pubkey=${pubkey} → ${subscriptions.length} subscribers`,
    { title, body: notifBody }
  )

  const results = await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        const success = await sendPushNotification(subscription, payload)
        if (!success) {
          console.warn(
            '[apna/notifications/send] Delivery failed for subscription; scheduling unsubscription.'
          )
          await sendPushUnsubscription(SERVER_NSEC, JSON.stringify(subscription.endpoint))
        }
        return success
      } catch (err) {
        console.error('[apna/notifications/send] Error delivering notification:', err)
        if (
          err &&
          typeof err === 'object' &&
          'statusCode' in err &&
          (err as { statusCode: number }).statusCode === 410
        ) {
          console.warn('[apna/notifications/send] Subscription expired (410); removing.')
          await sendPushUnsubscription(SERVER_NSEC, JSON.stringify(subscription.endpoint))
        }
        return false
      }
    })
  )

  const sent = results.filter(Boolean).length

  return NextResponse.json(
    {
      success: true,
      sent,
      total: subscriptions.length,
      message: `Notification sent to ${sent} out of ${subscriptions.length} subscribers`,
    },
    { status: 200 }
  )
}
