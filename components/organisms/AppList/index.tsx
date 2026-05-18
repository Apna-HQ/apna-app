'use client'
import React from 'react'
import { useEffect } from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppCard } from '@/components/molecules/AppCard'
import { useApps, APP_CATEGORIES } from '@/lib/hooks/useApps'
import { deriveHosting } from '@/lib/types/apps'
import { writeShellLaunchPayload } from '@/lib/apna-launch-cache'
import { Button } from '@/components/ui/button'

export default function AppLauncherList() {
  const [selectedCategory, setSelectedCategory] = useState<string>("popular")
  const { apps, loading, error, refetch } = useApps();
  const router = useRouter();

  // Listen for drawer close events to refresh the list
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'apna_drawer_closed') {
        refetch(true);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [refetch]);

  // Route launch through the new `/app` workspace shell rather than the
  // legacy MiniAppModal. The workspace mounts based on the URL params —
  // see `app/app/page.tsx`'s deep-link `useEffect`.
  const handleAppSelect = (appURL: string | null, appId: string, isGeneratedApp?: boolean) => {
    const app = apps.find(a => a.id === appId);
    const hosting = app
      ? deriveHosting({
          hosting: app.hosting,
          isGeneratedApp: app.isGeneratedApp,
          appURL: app.appURL,
          blossomUrl: app.blossomUrl,
        })
      : (isGeneratedApp ? 'nostr' : 'url');

    if (app) {
      writeShellLaunchPayload({
        id: app.id,
        appName: app.appName,
        appURL: app.appURL,
        htmlContent: app.htmlContent,
        hosting: app.hosting,
        isGeneratedApp: app.isGeneratedApp,
        blossomUrl: app.blossomUrl,
        sha256: app.sha256,
        categories: app.categories,
        description: app.description,
        defaultDisplay: app.defaultDisplay,
      });
    }

    const params = new URLSearchParams();
    params.set('appId', appId);
    if (hosting === 'nostr' || hosting === 'blossom') {
      params.set('isGenerated', 'true');
    } else {
      params.set('isGenerated', 'false');
      const url = appURL ?? app?.appURL ?? '';
      if (url) params.set('appUrl', url);
    }
    if (app?.defaultDisplay) params.set('defaultDisplay', app.defaultDisplay);
    router.push(`/app?${params.toString()}`);
  }

  const filteredApps = apps.filter(app => {
    if (selectedCategory === "popular") {
      return true; // Show all apps, they're already sorted by rating
    }
    return app.categories.includes(selectedCategory as any);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-ink/10 bg-surface py-8">
        <p className="text-ink-3">Loading apps...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-danger/25 bg-surface py-8">
        <p className="text-danger">Failed to load apps</p>
        <Button 
          onClick={() => refetch(true)}
          className="mt-4 rounded-md bg-amber-strong px-4 py-2 text-white hover:bg-amber-strong/90"
        >
          Retry
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="mx-auto w-full">
        <div className="mb-6 overflow-x-auto">
          <div className="flex min-w-max space-x-2 pb-2">
            <button
              onClick={() => setSelectedCategory("popular")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${selectedCategory === "popular"
                  ? "bg-amber-strong text-white"
                  : "border border-ink/10 bg-surface text-ink-2 hover:bg-surface-2"
                }`}
            >
              Most Popular
            </button>
            {APP_CATEGORIES.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${selectedCategory === category
                    ? "bg-amber-strong text-white"
                    : "border border-ink/10 bg-surface text-ink-2 hover:bg-surface-2"
                  }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          {filteredApps.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              selected={false}
              onSelect={handleAppSelect}
            />
          ))}
        </div>
        
        {filteredApps.length === 0 && (
          <div className="rounded-lg border border-ink/10 bg-surface py-8 text-center text-ink-3">
            {selectedCategory === "popular" 
              ? "No apps found"
              : `No apps found in ${selectedCategory} category`}
          </div>
        )}
      </div>
    </>
  )
}
