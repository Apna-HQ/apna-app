# CLAUDE.md — apna-app

Reference **host** PWA for the Apna mini-app ecosystem. Loads and runs Nostr-based
mini-apps (e.g. `social-mini-app`) inside a sandboxed shell, and exposes Nostr
capabilities to them via `@apna/sdk`.

## Stack

- Next.js 14 (App Router, RSC) — `next dev` on port **3000**
- TypeScript, Tailwind CSS, shadcn/ui (`baseColor: gray`), Radix UI, framer-motion
- `next-pwa` service worker; `idb` for local storage; `nostr-tools` for Nostr; `web-push` for notifications
- Consumes `@apna/sdk` (the `sdk/` sibling project) as the host side of the bridge

## Layout

- `app/` — routes: `explore`, `my-apps`, `settings`, `admin`, `api/`, `actions/`
- `components/` — atomic design: `atoms/` → `molecules/` → `organisms/` → `templates/`, plus `ui/` (shadcn primitives)
- `lib/` — `contexts/`, `hooks/`, `nostr/`, `types/`, `utils/`
- `worker/` — service worker source

## Conventions

- **UI / design tokens:** follow [DESIGN.md](DESIGN.md) — use semantic Tailwind tokens, never hardcode colors; respect the radius/motion/safe-area rules there.
- Prefer existing `components/ui/` primitives over new ones; compose with `cn()` from `@/lib/utils`.
- New app components go in the right atomic layer; expose a `className` passthrough.
- Mobile-first; viewport is locked (no zoom). Use the `.safe-*` / `.touch-target` utilities.
- Path alias `@/*` maps to the project root.

## Commands

- `npm run dev` — dev server (port 3000)
- `npm run build` / `npm run start` — production build & serve
- `npm run lint` — Next.js lint

> Always run `pm2 list` before starting a dev server. If `apna-host-dev` is already online, use that running PM2 service instead of starting another `npm run dev`/`next dev` process.
> After changing code, run `graphify update .` to keep the knowledge graph current.
