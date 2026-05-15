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
      <section className="relative flex min-h-[88dvh] items-center overflow-hidden px-6 py-12">
        <Image
          src="/icon-512x512.png"
          alt=""
          width={512}
          height={512}
          priority
          className="absolute right-[-7rem] top-10 h-72 w-72 opacity-10 sm:right-12 sm:h-96 sm:w-96"
        />
        <div className="relative mx-auto grid w-full max-w-5xl gap-10 md:grid-cols-[1fr_22rem] md:items-center">
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
              <h1 className="text-5xl font-semibold leading-none sm:text-6xl">
                Apna
              </h1>
              <p className="max-w-xl text-lg leading-8 text-muted-foreground">
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

          <div className="grid gap-3">
            {[
              { icon: Boxes, label: "Discover and launch mini-apps" },
              { icon: KeyRound, label: "Switch local, extension, and remote signers" },
              { icon: Code2, label: "Create SDK-ready apps" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-3 border-b py-4 last:border-b-0"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Reference host, SDK, and mini-app builder in one workspace.</p>
          <Link className="font-medium text-foreground" href="/explore">
            Browse public apps
          </Link>
        </div>
      </section>
    </div>
  );
}

