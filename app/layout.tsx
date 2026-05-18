import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ManifestHandler } from '@/components/ManifestHandler'
import { GeneratedAppsProvider } from '@/lib/contexts/GeneratedAppsContext'
import Script from 'next/script'
import AppShell from '@/components/AppShell'
import { ThemeProvider } from '@/components/ThemeProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Apna',
  description: 'Reference host for Apna apps!',
  icons: {
    icon: [
      { url: '/apna-logo.svg', type: 'image/svg+xml' },
    ],
    shortcut: ['/apna-logo.svg'],
  },
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
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head />
      <body className={`${inter.className} antialiased h-full`}>
        <ThemeProvider>
          <ManifestHandler />
          <GeneratedAppsProvider>
            <AppShell>{children}</AppShell>
          </GeneratedAppsProvider>
        </ThemeProvider>
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
