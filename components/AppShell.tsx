'use client';

import { usePathname } from 'next/navigation';

import TopBar from '@/components/organisms/TopBar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === '/';

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {!isLanding && (
        <div className="sticky top-0 z-50">
          <TopBar />
        </div>
      )}
      <main className="flex-1 pb-safe">{children}</main>
    </div>
  );
}
