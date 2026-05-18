"use client"
import { useRouter } from 'next/navigation';
import { useFavorites } from '@/lib/hooks/useFavorites';
import { SimpleAppCard } from '@/components/molecules/SimpleAppCard';
import { deriveHosting } from '@/lib/types/apps';

export default function FavoritesList() {
  const { favoriteApps, loading: favoritesLoading } = useFavorites();
  const router = useRouter();

  // Route launches through `/app` (new shell). Legacy MiniAppModal removed.
  const handleAppSelect = (appURL: string | null, appId: string, isGeneratedApp?: boolean) => {
    const app = favoriteApps.find(a => a.id === appId);
    const hosting = app
      ? deriveHosting({
          hosting: app.hosting,
          isGeneratedApp: app.isGeneratedApp,
          appURL: app.appURL,
          blossomUrl: app.blossomUrl,
        })
      : (isGeneratedApp ? 'nostr' : 'url');

    const params = new URLSearchParams();
    params.set('appId', appId);
    if (hosting === 'nostr') {
      params.set('isGenerated', 'true');
    } else {
      params.set('isGenerated', 'false');
      const url = appURL ?? app?.appURL ?? '';
      if (url) params.set('appUrl', url);
    }
    router.push(`/app?${params.toString()}`);
  };

  if (favoritesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-ink-3">Loading apps...</p>
      </div>
    );
  }

  if (favoriteApps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] text-center">
        <p className="text-ink-2 mb-2">No favorite apps yet</p>
        <p className="text-sm text-ink-3">
          Visit Explore to discover and favorite apps
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full space-y-3">
      {favoriteApps.map((app) => (
        <SimpleAppCard
          key={app.id}
          app={app}
          onSelect={handleAppSelect}
        />
      ))}
    </div>
  );
}
