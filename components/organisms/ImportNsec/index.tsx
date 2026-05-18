"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { getKeyPairFromLocalStorage, getUserProfileByNpub } from "@/lib/utils"
import { User, KeyRound } from "lucide-react"
import ProfileManager from "@/components/organisms/ProfileManager"

export default function ImportNsecApp() {
  const [isProfileManagerOpen, setIsProfileManagerOpen] = useState(false)
  const [activeProfile, setActiveProfile] = useState<{
    npub: string;
    alias?: string;
  } | null>(null)

  // Load active profile on mount
  const loadActiveProfile = () => {
    const keyPair = getKeyPairFromLocalStorage()
    if (keyPair && keyPair.npub) {
      const profile = getUserProfileByNpub(keyPair.npub)
      setActiveProfile({
        npub: keyPair.npub,
        alias: profile?.alias
      })
    } else {
      setActiveProfile(null)
    }
  }

  // Get active profile on mount and when it changes
  useEffect(() => {
    loadActiveProfile()
  }, [])

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4">
          <h3 className="text-md font-medium text-ink">Active Profile</h3>
          
          {activeProfile ? (
            <div className="flex flex-col rounded-lg border border-ink/10 bg-chrome p-4">
              <div className="mb-3 flex items-center gap-2">
                <User className="w-5 h-5 text-amber-strong" />
                {activeProfile.alias ? (
                  <span className="text-sm font-medium">
                    {activeProfile.alias}
                  </span>
                ) : (
                  <span className="text-sm font-medium">
                    Unnamed Profile
                  </span>
                )}
                <span className="text-xs bg-amber-strong text-white px-2 py-0.5 rounded-full">
                  Active
                </span>
              </div>
              
              <div className="mb-4">
                <div className="mb-1 text-xs text-ink-3">Public Key:</div>
                <div className="break-all rounded border border-ink/10 bg-surface p-2 font-mono text-sm">
                  {activeProfile.npub}
                </div>
              </div>
              
              <Button
                className="border border-ink/10 bg-surface text-ink-2 shadow-sm transition-all duration-300 hover:bg-surface-2 hover:text-ink"
                onClick={() => setIsProfileManagerOpen(true)}
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5" />
                  Manage Profiles
                </span>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col rounded-lg border border-ink/10 bg-chrome p-4">
              <div className="mb-4 text-sm text-ink-3">No active profile found</div>
              <Button
                className="border border-ink/10 bg-surface text-ink-2 shadow-sm transition-all duration-300 hover:bg-surface-2 hover:text-ink"
                onClick={() => setIsProfileManagerOpen(true)}
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5" />
                  Manage Profiles
                </span>
              </Button>
            </div>
          )}
        </div>
      </div>

      <ProfileManager 
        open={isProfileManagerOpen} 
        onOpenChange={setIsProfileManagerOpen}
        onProfileChange={loadActiveProfile}
      />
    </>
  )
}
