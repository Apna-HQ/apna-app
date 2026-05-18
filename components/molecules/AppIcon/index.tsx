"use client"
import { getFaviconUrl } from '@/lib/utils';
import { Globe } from "lucide-react";

interface AppIconProps {
  appName: string;
  appURL?: string;
  appId: string;
  isGeneratedApp?: boolean;
  isPublished?: boolean;
  onSelect?: (appURL: string | null, appId: string, isGeneratedApp?: boolean) => void;
}

export function AppIcon({ appName, appURL = '', appId, isGeneratedApp = false, isPublished = false, onSelect }: AppIconProps) {
  const faviconUrl = appURL ? getFaviconUrl(appURL) : null;
  
  // Trim text to roughly fit two lines (about 24 characters)
  const trimText = (text: string) => {
    if (text.length <= 24) return text;
    
    const words = text.split(' ');
    let result = '';
    let currentLength = 0;
    
    for (const word of words) {
      if (currentLength + word.length + 1 <= 24) {
        result += (result ? ' ' : '') + word;
        currentLength += word.length + 1;
      } else {
        break;
      }
    }
    
    return result + (result.length < appName.length ? '...' : '');
  };

  const displayName = trimText(appName);

  return (
    <button
      onClick={() => onSelect?.(appURL, appId, isGeneratedApp)}
      className="flex flex-col items-center gap-1 w-16"
    >
      <div className="w-10 h-10 flex items-center justify-center relative">
        {faviconUrl ? (
          <img
            src={faviconUrl}
            alt={`${appName} icon`}
            className="w-full h-full object-contain"
            onError={(e) => {
              const target = e.currentTarget;
              const parent = target.parentElement;
              if (parent) {
                parent.className = "w-10 h-10 flex items-center justify-center text-amber-strong relative";
                parent.innerHTML = `<div class="w-full h-full flex items-center justify-center text-xl text-amber-strong font-semibold">${appName.charAt(0).toUpperCase()}</div>`;
                
                // Re-add the badge if published - lighter and grayed out
                if (isPublished) {
                  const badge = document.createElement('div');
                  badge.className = "absolute bottom-0 right-0 bg-chrome text-ink-3 rounded-full p-0.5";
                  badge.title = "Published";
                  badge.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
                  parent.appendChild(badge);
                }
              }
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-amber-strong text-xl font-semibold">
            {appName.charAt(0).toUpperCase()}
          </div>
        )}
        
        {/* Published badge - lighter and grayed out */}
        {isPublished && (
          <div className="absolute bottom-0 right-0 bg-chrome text-ink-3 rounded-full p-0.5" title="Published">
            <Globe className="h-2.5 w-2.5" />
          </div>
        )}
      </div>
      <span className="text-xs text-ink-2 text-center w-16 min-h-[2.5rem] whitespace-pre-wrap">
        {displayName}
      </span>
    </button>
  );
}
