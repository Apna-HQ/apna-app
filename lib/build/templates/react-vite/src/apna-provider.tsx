/**
 * apna-provider.tsx
 *
 * Bootstraps the @apna/sdk 0.3.2 ApnaApp instance and exposes it via React
 * context. Drop this file into any React mini-app — everything else (social,
 * identity, nostr) is available through `useApna()`.
 *
 * Host target: https://apna.so (or your local dev host, e.g. http://localhost:3000)
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ApnaApp } from '@apna/sdk';

interface ApnaContextValue {
  apna: ApnaApp;
}

const ApnaContext = createContext<ApnaContextValue | null>(null);

export function useApna(): ApnaContextValue {
  const ctx = useContext(ApnaContext);
  if (!ctx) throw new Error('useApna must be used inside <ApnaProvider>');
  return ctx;
}

interface ApnaProviderProps {
  /** Stable, unique identifier for this mini-app. */
  appId: string;
  children: React.ReactNode;
}

export function ApnaProvider({ appId, children }: ApnaProviderProps) {
  const [apna, setApna] = useState<ApnaApp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Dynamic import keeps the SDK out of the initial JS parse for faster load.
    import('@apna/sdk').then(({ ApnaApp }) => {
      const instance = new ApnaApp({ appId });
      instance.ready
        .then(() => setApna(instance))
        .catch((err: Error) => setError(err.message));
    });
  }, [appId]);

  if (error) {
    return (
      <div style={{ padding: 16, color: 'red' }}>
        Apna SDK init failed: {error}
      </div>
    );
  }

  if (!apna) {
    return (
      <div style={{ padding: 16, color: '#555' }}>Connecting to Apna host…</div>
    );
  }

  return (
    <ApnaContext.Provider value={{ apna }}>
      {children}
    </ApnaContext.Provider>
  );
}
