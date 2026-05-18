'use client'

import React, { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetTrigger } from '../../ui/sheet'
import { Button } from '../../ui/button'
import { User, Settings, Layout, ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import { getKeyPairFromLocalStorage } from '../../../lib/utils'
import nip98Config from '@/lib/nostr/nip98Config'
import { decode } from 'nostr-tools/nip19'

export default function UserDrawer() {
  const [keyPair, setKeyPair] = useState<{ npub: string; nsec: string } | null>(null)
  const [open, setOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const userKeyPair = getKeyPairFromLocalStorage()
    setKeyPair(userKeyPair)
    
    // Check if the user is an admin
    if (userKeyPair) {
      try {
        // Decode the npub to get the raw hex pubkey
        const decoded = decode(userKeyPair.npub)
        
        if (decoded.type === 'npub') {
          const pubkey = decoded.data as string
          const authorizedPubkeys = [
            ...nip98Config.authorizedPubkeys.pushSend,
            ...nip98Config.authorizedPubkeys.pushTest
          ]
          setIsAdmin(authorizedPubkeys.includes(pubkey))
        }
      } catch (error) {
        console.error('Error decoding npub:', error)
        setIsAdmin(false)
      }
    }
  }, [])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-ink-3 hover:bg-surface-2 hover:text-ink">
          <User className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] border-ink/10 bg-chrome text-ink">
        <div className="flex flex-col h-full">
          <div className="flex-1 py-4">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-ink">
                {keyPair ? 'Account' : 'Sign In Required'}
              </h2>
              {!keyPair && (
                <p className="mt-2 text-sm text-ink-3">
                  Please import your Nsec key to access account features
                </p>
              )}
            </div>
            <nav className="space-y-2">
              <Link href="/my-apps" onClick={() => setOpen(false)}>
                <Button variant="ghost" className="w-full justify-start text-ink-2 hover:bg-surface-2">
                  <Layout className="mr-2 h-5 w-5 text-amber-strong" />
                  <span>My Apps</span>
                </Button>
              </Link>
              <Link href="/settings" onClick={() => setOpen(false)}>
                <Button variant="ghost" className="w-full justify-start text-ink-2 hover:bg-surface-2">
                  <Settings className="mr-2 h-5 w-5 text-amber-strong" />
                  <span>Settings</span>
                </Button>
              </Link>
              
              {isAdmin && (
                <Link href="/admin" onClick={() => setOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start text-ink-2 hover:bg-surface-2">
                    <ShieldAlert className="mr-2 h-5 w-5 text-amber-strong" />
                    <span>Admin</span>
                  </Button>
                </Link>
              )}
            </nav>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
