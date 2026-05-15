/**
 * lib/build/templates/index.ts
 *
 * Metadata registry for the three SDK-pre-wired starter templates.
 * Consumed by the scaffold API route (`app/api/build/scaffold/route.ts`)
 * and the builder landing UI (`app/build/scaffold/page.tsx`).
 */

export type TemplateId = 'react-vite' | 'single-html' | 'make-compatible';
export type HostingMode = 'url' | 'nostr' | 'guide';

export interface TemplateMeta {
  id: TemplateId;
  title: string;
  description: string;
  /** Where the built/published app is hosted. */
  hosting: HostingMode;
  /** File path relative to this directory (lib/build/templates/). */
  dir: string;
  /**
   * For 'guide' templates there is nothing to zip — the scaffold API returns
   * the README text as a plain-text snippet instead.
   */
  isGuide?: boolean;
  badge?: string;
}

export const TEMPLATES: TemplateMeta[] = [
  {
    id: 'react-vite',
    title: 'React + Vite',
    description:
      'A full React 18 + Vite 5 + TypeScript starter with @apna/sdk 0.2.0 pre-wired. ' +
      'Includes an ApnaProvider, useApna() hook, and a demo UI. ' +
      'Deploy anywhere that serves static files.',
    hosting: 'url',
    dir: 'react-vite',
    badge: 'Most popular',
  },
  {
    id: 'single-html',
    title: 'Single HTML + JS',
    description:
      'One HTML file, no build step. The SDK loads from CDN. ' +
      'Publish directly to Nostr — your entire app lives in a Nostr event; ' +
      'no URL or static hosting required (hosting: "nostr").',
    hosting: 'nostr',
    dir: 'single-html',
    badge: 'No hosting needed',
  },
  {
    id: 'make-compatible',
    title: 'Make any web app compatible',
    description:
      'Already have an app built with Next.js, Vue, Svelte, or plain JS? ' +
      'This step-by-step guide shows you how to add @apna/sdk in under 10 minutes.',
    hosting: 'guide',
    dir: 'make-compatible',
    isGuide: true,
  },
];

export function getTemplate(id: TemplateId): TemplateMeta | undefined {
  return TEMPLATES.find(t => t.id === id);
}
