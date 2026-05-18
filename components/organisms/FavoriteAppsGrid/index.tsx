"use client"
import { useFavorites } from '@/lib/hooks/useFavorites';
import { AppIcon } from '@/components/molecules/AppIcon';

interface FavoriteAppsGridProps {
  onAppSelect: (appURL: string | null, appId: string, isGeneratedApp?: boolean) => void;
}

export default function FavoriteAppsGrid({ onAppSelect }: FavoriteAppsGridProps) {
  const { favoriteApps, loading: favoritesLoading } = useFavorites();

  if (favoritesLoading) {
    return (
      <div className="w-full">
        <h2 className="text-lg font-medium text-ink-2 mb-4">Favorite Apps</h2>
        <div className="flex items-center justify-center min-h-[100px]">
          <p className="text-ink-3">Loading apps...</p>
        </div>
      </div>
    );
  }

  if (favoriteApps.length === 0) {
    return (
      <div className="w-full">
        <h2 className="text-lg font-medium text-ink-2 mb-4">Favorite Apps</h2>
        <div className="flex flex-col items-center justify-center min-h-[100px] text-center">
          <p className="text-ink-2 mb-2">No favorite apps yet</p>
          <p className="text-sm text-ink-3">
            Visit Explore to discover and favorite apps
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h2 className="text-lg font-medium text-ink-2 mb-4">Favorite Apps</h2>
      <div className="grid grid-cols-4 gap-4">
        {favoriteApps.map((app) => (
          <AppIcon
            key={app.id}
            appId={app.id}
            appName={app.appName}
            appURL={app.appURL}
            isGeneratedApp={app.isGeneratedApp}
            onSelect={onAppSelect}
          />
        ))}
      </div>
    </div>
  );
}
