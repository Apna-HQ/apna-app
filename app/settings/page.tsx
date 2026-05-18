'use client'

import type { ReactNode } from "react"
import { BellRing, KeyRound, MonitorDown, ShieldCheck, UserRound } from "lucide-react"

import ImportNsec from "../../components/organisms/ImportNsec"
import { PWAReinstallButton } from "@/components/PWAReinstallButton"
import OpenRouteApiKeySettings from "@/components/molecules/OpenRouteApiKeySettings"
import PushNotificationSettings from "@/components/molecules/PushNotificationSettings"
import AppPermissionsSettings from "@/components/organisms/AppPermissionsSettings"

export default function SettingsPage() {
  return (
    <div className="min-h-[calc(100dvh-3rem)] bg-shell px-4 py-6 text-ink md:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <header className="border-b border-ink/10 pb-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
            Shell
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal">
            Settings
          </h1>
        </header>

        <SettingsPanel
          icon={UserRound}
          title="Profiles"
          description="Manage local keys, browser extension signers, and remote signers used by the shell."
        >
          <ImportNsec />
        </SettingsPanel>

        <SettingsPanel
          icon={KeyRound}
          title="Builder API"
          description="Configure the key and model used by app generation workflows."
        >
          <OpenRouteApiKeySettings />
        </SettingsPanel>

        <SettingsPanel
          icon={ShieldCheck}
          title="App Permissions"
          description="Review and revoke mini-app capability grants."
        >
          <AppPermissionsSettings />
        </SettingsPanel>

        <SettingsPanel
          icon={BellRing}
          title="Notifications"
          description="Control encrypted push-notification subscriptions."
        >
          <PushNotificationSettings />
        </SettingsPanel>

        <SettingsPanel
          icon={MonitorDown}
          title="Installed App"
          description="Refresh an installed PWA shell when shortcuts or cached metadata need a reset."
        >
          <PWAReinstallButton />
        </SettingsPanel>
      </div>
    </div>
  )
}

function SettingsPanel({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof UserRound
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-ink/10 bg-surface p-4 md:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-soft text-amber-strong">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-sm text-ink-3">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}
