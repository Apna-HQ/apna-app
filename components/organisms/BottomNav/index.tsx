"use client"
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HomeIcon, AppsIcon, BuildIcon } from './icons';

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-ink/10 bg-chrome safe-bottom">
      <div className="max-w-md mx-auto px-4">
        <div className="flex justify-around h-16">
          <Link
            href="/app"
            className={`flex flex-col items-center justify-center w-full ${
              pathname === '/app' ? 'text-amber-strong' : 'text-ink-3'
            }`}
          >
            <HomeIcon filled={pathname === '/app'} />
            <span className="text-xs mt-1">Home</span>
          </Link>
          <Link
            href="/explore"
            className={`flex flex-col items-center justify-center w-full ${
              pathname === '/explore' ? 'text-amber-strong' : 'text-ink-3'
            }`}
          >
            <AppsIcon filled={pathname === '/explore'} />
            <span className="text-xs mt-1">Explore</span>
          </Link>
          <Link
            href="/build"
            className={`flex flex-col items-center justify-center w-full ${
              pathname.startsWith('/build') ? 'text-amber-strong' : 'text-ink-3'
            }`}
          >
            <BuildIcon filled={pathname.startsWith('/build')} />
            <span className="text-xs mt-1">Build</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
