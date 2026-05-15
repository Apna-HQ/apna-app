"use client"

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Boxes, Code2, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";

// Wrapped in Suspense below — useSearchParams() requires a Suspense boundary for
// static prerender in Next.js 14, otherwise `next build` bails out of SSG.
function DeepLinkRedirector() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = searchParams.toString();
    if (searchParams.has("appId")) {
      router.replace(`/app${params ? `?${params}` : ""}`);
    }
  }, [router, searchParams]);

  return null;
}

export default function LandingPage() {
  return (
    <>
      <Suspense fallback={null}>
        <DeepLinkRedirector />
      </Suspense>
      <LandingPageBody />
    </>
  );
}

function LandingPageBody() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <section className="relative overflow-hidden px-6 py-16 md:py-24 lg:py-28">
        {/* Ambient backdrop — two soft brand-green glows plus a faint dot grid.
            Replaces the watermark logo that read as visual noise behind the
            feature list. Decorative only, no content. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
          <div className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(circle_at_1px_1px,#368564_1px,transparent_0)] [background-size:24px_24px]" />
          <div className="absolute -right-32 -top-24 h-[28rem] w-[28rem] rounded-full bg-[#368564]/20 blur-3xl" />
          <div className="absolute -bottom-32 -left-24 h-[22rem] w-[22rem] rounded-full bg-[#368564]/10 blur-3xl" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
        </div>

        <div className="relative mx-auto grid w-full max-w-6xl gap-10 md:gap-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center">
          {/* Left: brand + tagline + CTAs */}
          <div className="max-w-2xl space-y-7">
            <div className="flex items-center gap-3">
              <Image
                src="/icon-192x192.png"
                alt="Apna"
                width={48}
                height={48}
                className="h-12 w-12 rounded-lg"
              />
              <span className="text-sm font-medium text-muted-foreground">
                Open mini-app host
              </span>
            </div>
            <div className="space-y-4">
              <h1 className="text-5xl font-semibold leading-none sm:text-6xl lg:text-7xl">
                Apna
              </h1>
              <p className="max-w-xl text-lg leading-8 text-muted-foreground lg:text-xl lg:leading-9">
                A host for iframe mini-apps, Nostr-rooted identity, and an SDK
                that lets apps ask for only the capabilities they need.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/app">
                  Launch App
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/build">Build</Link>
              </Button>
            </div>
          </div>

          {/* Right: feature cards. Stack on mobile, balanced grid on desktop. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {[
              {
                icon: Boxes,
                title: "Discover & launch mini-apps",
                body: "Browse, install, and run third-party apps in a sandboxed iframe.",
              },
              {
                icon: KeyRound,
                title: "Bring your own signer",
                body: "Switch between local, browser-extension, and remote NIP-46 signers.",
              },
              {
                icon: Code2,
                title: "Build with the SDK",
                body: "Capability-gated bridge — apps request only what they need.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="group flex items-start gap-3 rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm transition-colors hover:border-[#368564]/40 hover:bg-card"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#368564]/10 text-[#368564] transition-colors group-hover:bg-[#368564]/15">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold leading-snug">{title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t px-6 py-8 md:py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Reference host, SDK, and mini-app builder in one workspace.</p>
          <Link className="font-medium text-foreground hover:text-[#368564]" href="/explore">
            Browse public apps →
          </Link>
        </div>
      </section>
    </div>
  );
}

