import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import TopBar from '@/components/organisms/TopBar'
import { ManifestHandler } from '@/components/ManifestHandler'
import { GeneratedAppsProvider } from '@/lib/contexts/GeneratedAppsContext'
import Script from 'next/script'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Apna',
  description: 'Reference host for Apna apps!',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <head />
      <body className={`${inter.className} antialiased h-full`}>
        <ManifestHandler />
        <GeneratedAppsProvider>
          <div className="min-h-[100dvh] flex flex-col">
            <div className="sticky top-0 z-50">
              <TopBar />
            </div>
            <main className="flex-1 pb-safe">
              {children}
            </main>
          </div>
        </GeneratedAppsProvider>
      </body>
      <Script id="my-sw">
        {` 
          if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')
          else console.warning("Ups, your navigator doesn't support service worker, offline feature wont work, update your browser or chose other modern browser")
        `}
      </Script>
    </html>
  )
}
