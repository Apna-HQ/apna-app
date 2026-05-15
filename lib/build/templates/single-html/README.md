# Apna Single-HTML Mini-App Starter

A zero-build-step mini-app: one `index.html` file, `@apna/sdk` loaded from CDN,
no bundler, no server.

## How it works

Open `index.html` in a browser to develop. When ready to publish, paste its
contents (or the file itself) into the Apna host's **Builder → Publish** flow.
Choose **"Host on Nostr"** — the entire source is stored in a Nostr event; the
host runs it via a `srcDoc` iframe. No URL or static hosting is required.

## Nostr-hosted publishing (`hosting: 'nostr'`)

When you publish via the Apna host with the "Host on Nostr" option, the host
sets `hosting: 'nostr'` on your app's Nostr metadata event. This means:

- Your app's HTML source lives **entirely on Nostr** (in the metadata event's
  `htmlContent` field, or a referenced content event if the source is large).
- The host loads it with `<iframe srcdoc="…">` — no `appURL` needed.
- The app runs with full `@apna/sdk` capability: identity, social, nostr, permissions.
- Other users discover it via `/explore` just like a URL-hosted mini-app.

The actual publish wiring is implemented in the host's **Build → Editor** flow
(HOST-020). This starter explains the concept and gets you ready to use it.

## Development

1. Open `index.html` in your browser — it connects to the Apna host on
   `http://localhost:3000` (or whichever host tab has you logged in).
2. Edit the `<script type="module">` block.
3. Reload — no build step needed.

## SDK API reference

| Call | What it does |
|---|---|
| `apna.identity.me()` | Active user's profile |
| `apna.social.publishNote(content)` | Publish a Kind-1 note |
| `apna.nostr.query(filters)` | Raw Nostr filter query |
| `apna.nostr.getPublicKey()` | Active user's pubkey (hex) |
| `apna.permissions.request([...])` | Request capability grants upfront |

## Limitations

- The entire app source must fit in a single HTML file (typically < 64 KB for
  the inline metadata path; larger sources are stored in a referenced content
  event — the host handles this transparently).
- No build-time optimizations (tree shaking, minification) unless you run the
  file through a bundler before publishing.
- CDN access required in development; self-host the SDK bundle for offline use.
