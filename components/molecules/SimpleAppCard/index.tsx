"use client"
import type { AppDetails } from '@/lib/hooks/useApps';
import { getFaviconUrl } from '@/lib/utils';

interface SimpleAppCardProps {
  app: AppDetails;
  onSelect: (appURL: string | null, appId: string, isGeneratedApp?: boolean) => void;
}

export function SimpleAppCard({ app, onSelect }: SimpleAppCardProps) {
  const faviconUrl = app.appURL ? getFaviconUrl(app.appURL) : null;

  return (
    <button
      onClick={() => onSelect(app.appURL || null, app.id, app.isGeneratedApp)}
      className="w-full bg-surface rounded-xl border border-ink/10 hover:border-ink/20 transition-all duration-300"
    >
      <div className="flex items-center p-4 gap-4">
        <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden flex items-center justify-center">
          {faviconUrl ? (
            <img 
              src={faviconUrl} 
              alt={`${app.appName} icon`}
              className="w-full h-full object-contain"
              onError={(e) => {
                const target = e.currentTarget;
                const parent = target.parentElement;
                if (parent) {
                  parent.className = "w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-amber-soft flex items-center justify-center";
                  parent.innerHTML = `<div class="w-full h-full flex items-center justify-center text-amber-strong text-xl font-semibold">${app.appName.charAt(0).toUpperCase()}</div>`;
                }
              }}
            />
          ) : (
            <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-amber-soft flex items-center justify-center">
              <div className="w-full h-full flex items-center justify-center text-amber-strong text-xl font-semibold">
                {app.appName.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
        </div>
        <h2 className="flex-1 text-lg font-medium text-left text-ink group-hover:text-amber-strong transition-colors truncate">
          {app.appName}
        </h2>
      </div>
    </button>
  );
}
