# DESIGN.md — apna-app

> Portable design system spec for the **apna-app** host PWA, following the
> [Google Labs DESIGN.md](https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-design-md/)
> concept: a machine-readable record of design tokens **and the reasoning
> behind them**, so AI agents and humans generate UI that stays on-brand.
>
> Source of truth: [tailwind.config.ts](tailwind.config.ts) +
> [app/globals.css](app/globals.css). Update this file when those change.

## Project

- **Name:** apna-app — reference host for Apna mini-apps
- **Type:** Next.js 14 (App Router, RSC) PWA, mobile-first
- **Stack:** Tailwind CSS, shadcn/ui (`style: default`, `baseColor: gray`), Radix UI primitives, framer-motion
- **Theming:** HSL CSS custom properties, `class`-based dark mode (`.dark`)

## Color tokens

All colors are HSL triplets consumed as `hsl(var(--token))`. Each pairs a
surface with a `-foreground` for text/icons on that surface.

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `background` / `foreground` | `0 0% 100%` / `224 71.4% 4.1%` | `224 71.4% 4.1%` / `210 20% 98%` | App canvas + default text |
| `primary` / `primary-foreground` | `220.9 39.3% 11%` / `210 20% 98%` | `210 20% 98%` / `220.9 39.3% 11%` | Primary actions (CTAs, active states). Near-black/near-white — high contrast, brand-neutral |
| `secondary` / `secondary-foreground` | `220 14.3% 95.9%` / `220.9 39.3% 11%` | `215 27.9% 16.9%` / `210 20% 98%` | Secondary buttons, low-emphasis fills |
| `muted` / `muted-foreground` | `220 14.3% 95.9%` / `220 8.9% 46.1%` | `215 27.9% 16.9%` / `217.9 10.6% 64.9%` | Subtle backgrounds, placeholder/helper text |
| `accent` / `accent-foreground` | `220 14.3% 95.9%` / `220.9 39.3% 11%` | `215 27.9% 16.9%` / `210 20% 98%` | Hover/highlight states on ghost & outline elements |
| `destructive` / `destructive-foreground` | `0 84.2% 60.2%` / `210 20% 98%` | `0 62.8% 30.6%` / `210 20% 98%` | Errors, delete actions — the only hue-bearing token |
| `card` / `card-foreground` | `0 0% 100%` / `224 71.4% 4.1%` | `224 71.4% 4.1%` / `210 20% 98%` | Elevated content surfaces |
| `popover` / `popover-foreground` | same as card | same as card | Floating surfaces (dropdowns, sheets) |
| `border` | `220 13% 91%` | `215 27.9% 16.9%` | Default border; applied globally via `* { @apply border-border }` |
| `input` | `220 13% 91%` | `215 27.9% 16.9%` | Form control borders |
| `ring` | `224 71.4% 4.1%` | `216 12.2% 83.9%` | Focus ring — always visible, never removed |

**Rules for agents**
- Never hardcode hex/raw HSL in components — use the semantic token.
- The palette is intentionally **monochrome gray** except `destructive`. Don't introduce new accent hues without updating this file.
- `destructive` means danger only. Don't reuse it for emphasis.
- Maintain WCAG AA: body text on its surface must hit ≥ 4.5:1. The
  `*-foreground` pairs above are pre-validated — stay within a pair.

## Typography

- **Font:** `Inter` (`next/font/google`), exposed as `--font-sans`; `font-sans` falls back to the Tailwind default sans stack.
- `body` is `antialiased`.
- Use Tailwind's type scale (`text-sm` is the UI default, per shadcn). Weight: `font-medium` for interactive labels.

## Shape & spacing

- **Radius:** `--radius: 0.5rem`. Use `rounded-lg` (`var(--radius)`), `rounded-md` (`-2px`), `rounded-sm` (`-4px`). No other radii.
- **Container:** centered, `2rem` padding, max width `1400px` at `2xl`.
- **Touch:** mobile-first. Interactive elements use `.touch-target` (min 44×44px).

## Motion

- Accordion: `accordion-down` / `accordion-up`, `0.2s ease-out`.
- Sheets/drawers: `.animate-in` / `.animate-out` — 200ms slide+fade from left (`enter`/`exit` keyframes in globals.css).
- Provided by `tailwindcss-animate` + `framer-motion`. Keep durations ≤ 200ms for UI feedback.

## PWA / mobile conventions

- Safe-area utilities: `.safe-top` `.safe-bottom` `.safe-left` `.safe-right` (use these, not raw `env(safe-area-inset-*)`).
- `.overscroll-none`, `.momentum-scroll`, `.no-scrollbar` for native-feel scrolling.
- Viewport is locked (`userScalable: false`, `maximumScale: 1`) — design for a fixed viewport.
- Layout shell: sticky `TopBar` + scrollable `main` with `pb-safe`.

## Components

- shadcn/ui primitives live in [components/ui/](components/ui/) — `button`, `card`, `dialog`, `drawer`, `sheet`, `tabs`, `form`, `input`, `select`, etc. Prefer these over new primitives.
- App components follow **atomic design**: [atoms/](components/atoms/) → [molecules/](components/molecules/) → [organisms/](components/organisms/) → [templates/](components/templates/).
- `Button` variants: `default` `destructive` `outline` `secondary` `ghost` `link`; sizes: `default` `sm` `lg` `icon`. `default` size is `h-10`.
- Compose classes with `cn()` from `@/lib/utils`. Always expose `className` passthrough.
