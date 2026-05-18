"use client";

import { useState } from "react";
import Link from "next/link";
import { TEMPLATES, TemplateMeta } from "@/lib/build/templates/index";

export default function ScaffoldPage() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [snippet, setSnippet] = useState<{ id: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleDownload(template: TemplateMeta) {
    if (template.isGuide) {
      // Fetch the guide text and show it in a copy-box.
      setDownloading(template.id);
      try {
        const res = await fetch(
          `/api/build/scaffold?template=${template.id}&format=snippet`,
        );
        const text = await res.text();
        setSnippet({ id: template.id, text });
      } finally {
        setDownloading(null);
      }
      return;
    }

    // Downloadable starters — trigger a ZIP download.
    setDownloading(template.id);
    try {
      const res = await fetch(`/api/build/scaffold?template=${template.id}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${template.id}-starter.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const hostingBadgeColor: Record<string, string> = {
    url: "bg-[#cddff5] text-[#214f88] dark:bg-[#1f3354] dark:text-[#cddff5]",
    nostr: "bg-[#ddcff2] text-[#593889] dark:bg-[#382558] dark:text-[#ddcff5]",
    guide: "bg-amber-soft text-amber-strong",
  };

  const hostingLabel: Record<string, string> = {
    url: "Host yourself",
    nostr: "Host on Nostr",
    guide: "Integration guide",
  };

  return (
    <div className="min-h-[100dvh] bg-shell pb-20 text-ink">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href="/build"
          className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2 mb-6"
        >
          <span aria-hidden>&#8592;</span> Back to Build
        </Link>

        <h1 className="text-2xl font-bold text-ink mb-2">
          Download a starter
        </h1>
        <p className="text-ink-3 mb-8 text-sm">
          Each starter is pre-wired to{" "}
          <span className="font-medium text-ink-2">@apna/sdk 0.3.2</span>.
          Download, run, and publish — your app connects to the Apna host
          automatically.
        </p>

        <div className="space-y-4">
          {TEMPLATES.map((template) => (
            <div
              key={template.id}
              className="bg-surface rounded-xl border border-ink/10 p-5 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h2 className="font-semibold text-ink">
                      {template.title}
                    </h2>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        hostingBadgeColor[template.hosting]
                      }`}
                    >
                      {hostingLabel[template.hosting]}
                    </span>
                    {template.badge && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-soft text-amber-strong font-medium">
                        {template.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink-3">{template.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleDownload(template)}
                  disabled={downloading === template.id}
                  className="text-sm px-4 py-2 rounded-lg bg-amber-strong text-white font-medium hover:bg-amber-strong/90 disabled:opacity-50 disabled:cursor-wait transition-colors"
                >
                  {downloading === template.id
                    ? "Preparing…"
                    : template.isGuide
                    ? "View guide"
                    : "Download .zip"}
                </button>
              </div>

              {/* Inline guide viewer */}
              {snippet && snippet.id === template.id && (
                <div className="relative mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-ink-3 uppercase tracking-wide">
                      Guide
                    </span>
                    <button
                      onClick={() => handleCopy(snippet.text)}
                      className="text-xs text-amber-strong hover:underline"
                    >
                      {copied ? "Copied!" : "Copy all"}
                    </button>
                  </div>
                  <pre className="bg-chrome border border-ink/10 rounded-lg p-4 text-xs text-ink-2 overflow-auto max-h-64 whitespace-pre-wrap break-words">
                    {snippet.text}
                  </pre>
                  <button
                    onClick={() => setSnippet(null)}
                    className="text-xs text-ink-3 hover:text-ink-2 mt-2"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-ink-3 text-center mt-8">
          Need an in-browser editor?{" "}
          <Link
            href="/build/editor"
            className="text-amber-strong hover:underline"
          >
            Try the live editor
          </Link>{" "}
          — write, preview, and publish without leaving your browser.
        </p>
      </div>
    </div>
  );
}
