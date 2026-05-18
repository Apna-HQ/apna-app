"use client";

import Link from "next/link";

interface Path {
  href: string;
  title: string;
  subtitle: string;
  cta: string;
  badge?: string;
  external?: boolean;
}

const BUILD_PATHS: Path[] = [
  {
    href: "/build/scaffold",
    title: "Download a starter",
    subtitle:
      "Get a pre-wired project skeleton — React + Vite, single HTML, or a guide for your existing app. " +
      "@apna/sdk 0.3.2 is already configured.",
    cta: "Browse starters",
  },
  {
    href: "/build/editor",
    title: "Write in the browser",
    subtitle:
      "VS Code-powered editor with HTML/JS/CSS syntax highlighting, live preview, and one-tap publish to Nostr — no URL or hosting required.",
    cta: "Open editor",
    badge: "Monaco",
  },
];

export default function BuildPage() {
  return (
    <div className="min-h-[calc(100dvh-3rem)] bg-shell pb-8 text-ink">
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-ink mb-3">Build on Apna</h1>
          <p className="text-ink-3 text-base leading-relaxed">
            Mini-apps run inside the Apna host, inherit the user&apos;s Nostr
            identity, and access social, signing, and storage via{" "}
            <span className="font-medium text-ink-2">@apna/sdk</span>.
            Choose a path to get started.
          </p>
        </div>

        {/* Path cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          {BUILD_PATHS.map((p) => (
            <PathCard key={p.href} path={p} />
          ))}
        </div>

        {/* SDK quick-reference */}
        <section className="mt-12">
          <h2 className="text-sm font-semibold text-ink-3 uppercase tracking-wide mb-4">
            SDK quick-reference
          </h2>
          <div className="bg-surface rounded-xl border border-ink/10 overflow-hidden">
            {SDK_EXAMPLES.map((ex, i) => (
              <div
                key={ex.label}
                className={`px-5 py-4 ${
                  i < SDK_EXAMPLES.length - 1 ? "border-b border-ink/10" : ""
                }`}
              >
                <p className="text-xs font-medium text-ink-3 mb-1">{ex.label}</p>
                <code className="text-sm text-ink-2 font-mono">{ex.code}</code>
              </div>
            ))}
          </div>
        </section>

        {/* Links */}
        <section className="mt-8 flex flex-wrap gap-4 text-sm">
          <a
            href="https://github.com/pablof7z/apna"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-strong hover:underline"
          >
            SDK source on GitHub
          </a>
          <Link href="/explore" className="text-amber-strong hover:underline">
            Explore published mini-apps
          </Link>
        </section>
      </div>
    </div>
  );
}

function PathCard({ path }: { path: Path }) {
  const inner = (
    <div className="bg-surface rounded-xl border border-ink/10 p-6 flex flex-col gap-4 h-full hover:border-amber-strong/40 hover:shadow-sm transition-all">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <h2 className="font-semibold text-ink text-base">{path.title}</h2>
          {path.badge && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-soft text-amber-strong font-medium">
              {path.badge}
            </span>
          )}
        </div>
        <p className="text-sm text-ink-3 leading-relaxed">{path.subtitle}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-strong">
        {path.cta} <span aria-hidden>&#8594;</span>
      </span>
    </div>
  );

  if (path.external) {
    return (
      <a href={path.href} target="_blank" rel="noopener noreferrer" className="block">
        {inner}
      </a>
    );
  }
  return (
    <Link href={path.href} className="block">
      {inner}
    </Link>
  );
}

const SDK_EXAMPLES = [
  { label: "Bootstrap", code: "const apna = new ApnaApp({ appId: 'my-app' })" },
  { label: "Active user", code: "const me = await apna.identity.me()" },
  { label: "Publish note", code: "await apna.social.publishNote('Hello!')" },
  { label: "Nostr query", code: "const events = await apna.nostr.query({ kinds: [1] })" },
  { label: "Subscribe", code: "const unsub = await apna.nostr.subscribe(filters, cb)" },
];
