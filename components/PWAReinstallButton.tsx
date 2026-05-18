'use client'

import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
}

export function PWAReinstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Check if app is installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }

    // Handle install prompt
    const handleBeforeInstallPrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault()
      setDeferredPrompt(event)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleReinstall = async () => {
    if (!deferredPrompt) {
      // If no install prompt is available, try to unregister service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const registration of registrations) {
          await registration.unregister()
        }
        // Force reload to clear cache and get fresh manifest
        window.location.reload()
      }
      return
    }

    // Show install prompt
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    
    if (outcome === 'accepted') {
      console.log('PWA reinstall accepted')
    } else {
      console.log('PWA reinstall dismissed')
    }
    
    setDeferredPrompt(null)
  }

  if (!isInstalled) {
    return null
  }

  return (
    <Button 
      onClick={handleReinstall}
      variant="outline"
      className="border-ink/10 bg-surface text-ink-2 hover:bg-surface-2"
    >
      Reinstall PWA
    </Button>
  )
}
