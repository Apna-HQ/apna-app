# Make Any Web App Compatible with Apna

Already have a web app? Add `@apna/sdk` 0.3.2 in under 10 minutes to give users
access to their Nostr identity, social graph, and signing — without managing keys
in your app.

## 1. Install the SDK

```bash
npm install @apna/sdk@^0.3.2
# or
yarn add @apna/sdk@^0.3.2
# or
pnpm add @apna/sdk@^0.3.2
```

## 2. Bootstrap the SDK once

Create a module that initialises `ApnaApp` and exports the instance:

```ts
// src/apna.ts
import { ApnaApp } from '@apna/sdk';

// Replace with your app's stable unique id.
export const apna = new ApnaApp({ appId: 'your-app-id' });

// Call apna.ready before using any SDK method.
// Typically you do this in your root component / provider.
```

## 3. Wait for the handshake

The SDK performs an async handshake with the Apna host on load. Await
`apna.ready` before calling any SDK method:

```ts
await apna.ready;
// SDK is live — the host has negotiated capabilities.
```

In React, do this in a `useEffect` or a root provider (see the React starter for
a drop-in `<ApnaProvider>`).

## 4. Use the SDK

### Read the active user's profile

```ts
const me = await apna.identity.me();
console.log(me.name, me.picture, me.pubkey);
```

### Publish a social note

```ts
await apna.social.publishNote('Hello from my web app!');
```

### React to a note

```ts
await apna.social.like(eventId);
await apna.social.reply(eventId, 'Nice post!');
```

### Low-level Nostr queries

```ts
const events = await apna.nostr.query({ kinds: [1], limit: 20 });
```

### Subscribe to live events

```ts
const unsubscribe = await apna.nostr.subscribe(
  [{ kinds: [1], limit: 20 }],
  (event) => console.log('new event', event),
);
// later:
unsubscribe();
```

### Request permissions upfront (optional but good UX)

```ts
await apna.permissions.request(['social.v1.publishNote', 'identity.v1.me']);
```

## 5. Deploy and submit

1. Deploy your app to any static host (Vercel, Netlify, Cloudflare Pages, VPS, …).
2. Open **https://apna.so/build** (or your local host) and go to **Publish App**.
3. Enter your deployed URL and metadata.
4. Choose `hosting: 'url'` — your app loads from its URL inside an Apna iframe.

## Checklist

- [ ] `apna.ready` is awaited before any SDK call.
- [ ] Your `appId` is a stable, unique string (e.g. your domain slug).
- [ ] CORS headers allow `https://apna.so` (and `http://localhost:3000` for dev)
      to embed your app.
- [ ] Your app does **not** call `window.parent.postMessage` with its own protocol
      — the SDK owns the host channel.
- [ ] Sensitive operations (publish, sign) work even when the permission prompt
      appears — they are async and resolve once the user allows.

## Iframe CORS / CSP notes

The Apna host embeds your app in an `<iframe sandbox="allow-scripts allow-same-origin">`.
Your app must be served over HTTPS in production. Add the following to your
server responses if you self-host:

```
Content-Security-Policy: frame-ancestors https://apna.so http://localhost:3000;
```

If you use Vercel, add to `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "ALLOW-FROM https://apna.so" },
        { "key": "Content-Security-Policy",
          "value": "frame-ancestors https://apna.so http://localhost:3000" }
      ]
    }
  ]
}
```

## Framework-specific notes

### Next.js

Use a client component for the SDK bootstrap (it uses `window`):

```tsx
// app/providers.tsx
'use client';
import { useEffect } from 'react';
import { apna } from '@/lib/apna';

export function ApnaBootstrap() {
  useEffect(() => { apna.ready.catch(console.error); }, []);
  return null;
}
```

### Vue / Nuxt

```ts
// plugins/apna.client.ts
import { ApnaApp } from '@apna/sdk';
export default defineNuxtPlugin(() => {
  const apna = new ApnaApp({ appId: 'your-app-id' });
  return { provide: { apna } };
});
```

### Svelte / SvelteKit

```ts
// src/lib/apna.ts
import { ApnaApp } from '@apna/sdk';
export const apna = new ApnaApp({ appId: 'your-app-id' });
```

Then in your root `+layout.svelte`:

```svelte
<script>
  import { apna } from '$lib/apna';
  import { onMount } from 'svelte';
  onMount(() => apna.ready.catch(console.error));
</script>
```
