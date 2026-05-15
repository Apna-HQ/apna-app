"use client";

import Link from "next/link";
import BottomNav from "@/components/organisms/BottomNav";

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
      "@apna/sdk 0.2.0 is already configured.",
    cta: "Browse starters",
  },
  {
    href: "/build/editor",
    title: "Write in the browser",
    subtitle:
      "Code, preview, and publish without leaving the host. " +
      "Single-file apps publish entirely to Nostr — no URL or hosting required.",
    cta: "Open editor",
  },
];

export default function BuildPage() {
  return (
    <>
      <div className="min-h-[100dvh] bg-[#f8faf9] pb-20">
        <div className="max-w-2xl mx-auto px-4 py-10">
          {/* Header */}
          <div className="mb-10">
            <h1 className="text-3xl font-bold text-gray-900 mb-3">Build on Apna</h1>
            <p className="text-gray-500 text-base leading-relaxed">
              Mini-apps run inside the Apna host, inherit the user&apos;s Nostr
              identity, and access social, signing, and storage via{" "}
              <span className="font-medium text-gray-700">@apna/sdk</span>.
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
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
              SDK quick-reference
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {SDK_EXAMPLES.map((ex, i) => (
                <div
                  key={ex.label}
                  className={`px-5 py-4 ${
                    i < SDK_EXAMPLES.length - 1 ? "border-b border-gray-100" : ""
                  }`}
                >
                  <p className="text-xs font-medium text-gray-400 mb-1">{ex.label}</p>
                  <code className="text-sm text-gray-800 font-mono">{ex.code}</code>
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
              className="text-[#368564] hover:underline"
            >
              SDK source on GitHub
            </a>
            <Link href="/explore" className="text-[#368564] hover:underline">
              Explore published mini-apps
            </Link>
          </section>
        </div>
      </div>

      <BottomNav />
    </>
  );
}

function PathCard({ path }: { path: Path }) {
  const inner = (
    <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-4 h-full hover:border-[#368564]/40 hover:shadow-sm transition-all">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <h2 className="font-semibold text-gray-900 text-base">{path.title}</h2>
          {path.badge && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
              {path.badge}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">{path.subtitle}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-sm font-medium text-[#368564]">
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
