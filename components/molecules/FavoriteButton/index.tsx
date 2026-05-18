"use client"
import { useState, useEffect } from 'react';
import { useFavorites } from '@/lib/hooks/useFavorites';
import type { AppDetails } from '@/lib/hooks/useApps';

interface FavoriteButtonProps {
  appId: string;
  appData?: AppDetails;
}

export function FavoriteButton({ appId, appData }: FavoriteButtonProps) {
  const { toggleFavorite, favorites } = useFavorites();
  const [isFavorited, setIsFavorited] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsFavorited(favorites.includes(appId));
  }, [favorites, appId]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsLoading(true);

    // Update local state immediately for better UX
    setIsFavorited(!isFavorited);

    try {
      await toggleFavorite(appId, appData);
    } catch (error) {
      // Revert local state if the operation failed
      setIsFavorited(isFavorited);
      console.error('Failed to toggle favorite:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={`absolute top-4 right-4 p-2 rounded-full transition-all
        ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
        ${isFavorited 
          ? 'text-amber-strong hover:text-amber-strong'
          : 'text-ink-3 hover:text-ink-2'
        }`}
    >
      {isLoading ? (
        <svg
          className="animate-spin h-6 w-6"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill={isFavorited ? "currentColor" : "none"}
          stroke="currentColor"
          className="w-6 h-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          />
        </svg>
      )}
    </button>
  );
}
