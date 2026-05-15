# Apna React (Vite) Mini-App Starter

A production-ready starter for building Apna mini-apps with React 18 + Vite 5 +
TypeScript. `@apna/sdk` 0.3.2 is pre-wired — you can call `apna.social`,
`apna.identity`, and `apna.nostr` out of the box.

## Quick start

```bash
npm install
npm run dev
```

Then open the Apna host at **http://localhost:3000**, navigate to your mini-app,
and enter `http://localhost:5173` as the mini-app URL.

## Project structure

```
src/
  main.tsx          — React entry; wraps App in <ApnaProvider>
  apna-provider.tsx — SDK bootstrap + React context (edit appId here)
  App.tsx           — Your app UI (replace this)
index.html
vite.config.ts
tsconfig.json
package.json
```

## Hosting

Deploy your built app anywhere that serves static files (Vercel, Netlify, a VPS,
etc.) and submit the URL via the Apna **Publish** flow. The host stores your app
URL in a Nostr Kind-1 metadata event; visitors load your mini-app from that URL
inside an iframe.

See the `single-html` starter if you want to publish without any hosting.

## SDK reference

| API | Purpose |
|---|---|
| `apna.identity.me()` | Active user's profile |
| `apna.identity.profile(pubkey)` | Any user's profile |
| `apna.social.publishNote(content)` | Publish a Kind-1 note |
| `apna.social.feed(pubkey)` | User's notes |
| `apna.social.like(eventId)` | Kind-7 reaction |
| `apna.nostr.query(filters)` | Raw Nostr query |
| `apna.nostr.publish(event)` | Raw Nostr publish |
| `apna.nostr.getPublicKey()` | Active user's pubkey |
| `apna.permissions.request([...])` | Request capability grants upfront |

Full docs: https://github.com/pablof7z/apna
