"use client"
import { AppIcon } from '@/components/molecules/AppIcon';
import type { AppDefaultDisplay } from '@/lib/types/apps';

const SOCIAL_MINI_APP_URL = process.env.NEXT_PUBLIC_SOCIAL_MINI_APP_URL || 'https://social-mini-app.vercel.app';

type FeaturedApp = {
  id: string;
  appName: string;
  appURL: string;
  defaultDisplay?: AppDefaultDisplay;
};

// Featured apps constant array
export const FEATURED_APPS: readonly FeaturedApp[] = [
  {
    id: 'social-mini-app',
    appName: 'Social',
    appURL: SOCIAL_MINI_APP_URL,
    defaultDisplay: 'tab',
  },
] as const;

interface FeaturedAppsProps {
  onAppSelect: (appURL: string | null, appId: string, isGeneratedApp?: boolean) => void;
}

export default function FeaturedApps({ onAppSelect }: FeaturedAppsProps) {
  return (
    <div className="w-full">
      <h2 className="text-lg font-medium text-ink-2 mb-4">Featured Apps</h2>
      <div className="grid grid-cols-4 gap-4">
        {FEATURED_APPS.map((app) => (
          <AppIcon
            key={app.id}
            appId={app.id}
            appName={app.appName}
            appURL={app.appURL}
            isGeneratedApp={false}
            onSelect={onAppSelect}
          />
        ))}
      </div>
    </div>
  );
}
