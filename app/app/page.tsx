"use client";

import Image from "next/image";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Bell,
  BellRing,
  Bot,
  ChevronDown,
  Code2,
  Globe2,
  Home as HomeIcon,
  KeyRound,
  Layers,
  LayoutDashboard,
  LockKeyhole,
  Palette,
  PanelRight,
  Pencil,
  Plus,
  Repeat,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  UserRound,
  X,
  Zap,
} from "lucide-react";

import { ApnaLogo } from "@/components/atoms/ApnaLogo";
import { PWAReinstallButton } from "@/components/PWAReinstallButton";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FEATURED_APPS } from "@/components/organisms/FeaturedApps";
import GenerateAppFab from "@/components/molecules/GenerateAppFab";
import GeneratedAppModal from "@/components/organisms/GeneratedAppModal";
import MiniAppTabFrame from "@/components/organisms/MiniAppTabFrame";
import OpenRouteApiKeySettings from "@/components/molecules/OpenRouteApiKeySettings";
import PushNotificationSettings from "@/components/molecules/PushNotificationSettings";
import { RenameAppSheet } from "@/components/molecules/RenameAppSheet";
import ThemeToggle from "@/components/molecules/ThemeToggle";
import AppPermissionsSettings from "@/components/organisms/AppPermissionsSettings";
import ProfileManager from "@/components/organisms/ProfileManager";
import {
  clearShellLaunchPayload,
  readShellLaunchPayload,
  type ShellLaunchPayload,
} from "@/lib/apna-launch-cache";
import { miniAppInstanceManager } from "@/lib/apna-host/instance-manager";
import { useGeneratedApps } from "@/lib/contexts/GeneratedAppsContext";
import { useFavorites } from "@/lib/hooks/useFavorites";
import { useProfile } from "@/lib/hooks/useProfile";
import { cn, getKeyPairFromLocalStorage, getUserProfileByNpub } from "@/lib/utils";
import { deriveHosting, type AppDefaultDisplay, type AppDetails, type AppHosting } from "@/lib/types/apps";
import { ChatMessage, GeneratedApp } from "@/lib/generatedAppsDB";

type WorkspaceTab = {
  id: string;
  appId: string;
  name: string;
  glyph: string;
  iconUrl?: string;
  tone: "amber" | "orange" | "green" | "blue" | "violet" | "plain";
  kind: "home" | "new" | "mini-app";
  hosting?: "url" | "nostr";
  appUrl?: string | null;
  htmlContent?: string | null;
  defaultDisplay?: AppDefaultDisplay;
};

type CatalogApp = {
  id: string;
  name: string;
  hint: string;
  source: "featured" | "favorite" | "generated" | "explore";
  hosting: AppHosting;
  appUrl?: string;
  htmlContent?: string;
  glyph: string;
  iconUrl?: string;
  tone: WorkspaceTab["tone"];
  description?: string;
  published?: boolean;
  messages?: ChatMessage[];
  defaultDisplay?: AppDefaultDisplay;
};

type ActiveProfileSummary = {
  npub: string;
  alias?: string;
  signerType?: string;
  isRemoteSigner?: boolean;
};

const HOME_TAB: WorkspaceTab = {
  id: "home",
  appId: "home",
  name: "Home",
  glyph: "A",
  tone: "plain",
  kind: "home",
};

const NEW_TAB_NAME = "New Tab";
const WORKSPACE_STATE_STORAGE_KEY = "apna:workspace-tabs:v1";
const WORKSPACE_STATE_VERSION = 1;
const VALID_TAB_TONES: WorkspaceTab["tone"][] = [
  "amber",
  "orange",
  "green",
  "blue",
  "violet",
  "plain",
];

type PersistedWorkspaceState = {
  version: typeof WORKSPACE_STATE_VERSION;
  tabs: WorkspaceTab[];
  activeTabId: string;
  updatedAt: number;
};

const FEATURED_APP_DETAILS: Record<string, Pick<CatalogApp, "hint" | "glyph" | "tone" | "description">> = {
  "social-mini-app": {
    hint: "feed · threads · DMs",
    glyph: "S",
    tone: "amber",
    description: "Open social timeline powered by Nostr capabilities.",
  },
};

function AppHomeContent() {
  const { loading: profileLoading, error: profileError } = useProfile();
  const { favoriteApps, loading: favoritesLoading } = useFavorites();
  const {
    apps: generatedApps,
    loading: generatedLoading,
    deleteApp,
    refreshApps,
  } = useGeneratedApps();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tabs, setTabs] = useState<WorkspaceTab[]>([HOME_TAB]);
  const [activeTabId, setActiveTabId] = useState(HOME_TAB.id);
  const [workspaceRestored, setWorkspaceRestored] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileManagerOpen, setProfileManagerOpen] = useState(false);
  const [tabSwitcherOpen, setTabSwitcherOpen] = useState(false);
  const [activeProfile, setActiveProfile] = useState<ActiveProfileSummary | null>(null);
  const [generatedAppToRename, setGeneratedAppToRename] = useState<CatalogApp | null>(null);
  const [generatedAppToDelete, setGeneratedAppToDelete] = useState<CatalogApp | null>(null);
  const [generatedApp, setGeneratedApp] = useState<{
    htmlContent: string;
    id: string;
    messages: ChatMessage[];
    name: string;
  } | null>(null);

  const catalogApps = useMemo(
    () => buildCatalogApps(favoriteApps, generatedApps),
    [favoriteApps, generatedApps]
  );

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? HOME_TAB;
  const miniAppTabs = tabs.filter((tab) => tab.kind === "mini-app");
  const switchableTabs = tabs.filter((tab) => tab.kind !== "home");

  const loadActiveProfile = useCallback(() => {
    const keyPair = getKeyPairFromLocalStorage();
    if (!keyPair?.npub) {
      setActiveProfile(null);
      return;
    }

    const storedProfile = getUserProfileByNpub(keyPair.npub);
    setActiveProfile({
      npub: keyPair.npub,
      alias: storedProfile?.alias,
      signerType: storedProfile?.signerType,
      isRemoteSigner: storedProfile?.isRemoteSigner,
    });
  }, []);

  useEffect(() => {
    loadActiveProfile();
  }, [loadActiveProfile]);

  useEffect(() => {
    const restoredState = readPersistedWorkspaceState();
    if (restoredState) {
      setTabs(restoredState.tabs);
      setActiveTabId(restoredState.activeTabId);
    }
    setWorkspaceRestored(true);
  }, []);

  useEffect(() => {
    if (!workspaceRestored) return;
    writePersistedWorkspaceState(tabs, activeTabId);
  }, [activeTabId, tabs, workspaceRestored]);

  useEffect(() => {
    if (!workspaceRestored) return;

    setTabs((current) => {
      let changed = false;
      const nextTabs = current.map((tab) => {
        if (tab.kind !== "mini-app") return tab;

        const catalogApp = catalogApps.find((app) => app.id === tab.appId);
        if (!catalogApp) return tab;

        const nextTab = catalogAppToWorkspaceTab(catalogApp);
        if (workspaceTabsEqual(tab, nextTab)) return tab;

        changed = true;
        return nextTab;
      });

      return changed ? nextTabs : current;
    });
  }, [catalogApps, workspaceRestored]);

  const replaceWorkspaceUrlForTab = useCallback(
    (tab: WorkspaceTab) => {
      router.replace(workspaceUrlForTab(tab), { scroll: false });
    },
    [router]
  );

  const createNewTab = useCallback(() => {
    const nextTab = createBlankWorkspaceTab();

    setTabs((current) => [...current, nextTab]);
    setActiveTabId(nextTab.id);
    replaceWorkspaceUrlForTab(nextTab);
  }, [replaceWorkspaceUrlForTab]);

  const openCatalogApp = useCallback(
    (app: CatalogApp, options: { replaceTabId?: string } = {}) => {
      const nextTab = catalogAppToWorkspaceTab(app);

      setTabs((current) => {
        const existingTab = current.find((tab) => tab.id === nextTab.id);
        if (existingTab) {
          if (options.replaceTabId && options.replaceTabId !== existingTab.id) {
            return current.filter((tab) => tab.id !== options.replaceTabId);
          }
          return current;
        }

        if (options.replaceTabId && current.some((tab) => tab.id === options.replaceTabId)) {
          return current.map((tab) => (tab.id === options.replaceTabId ? nextTab : tab));
        }

        return [...current, nextTab];
      });
      setActiveTabId(nextTab.id);
      replaceWorkspaceUrlForTab(nextTab);
    },
    [replaceWorkspaceUrlForTab]
  );

  const openMiniAppUrlInTab = useCallback(
    (rawUrl: string, replaceTabId: string) => {
      const normalizedUrl = normalizeMiniAppUrl(rawUrl);
      if (!normalizedUrl) return "Enter a valid http(s) URL.";

      const matchingCatalogApp = catalogApps.find((app) => {
        if (app.hosting !== "url" || !app.appUrl) return false;
        return normalizeMiniAppUrl(app.appUrl) === normalizedUrl;
      });

      openCatalogApp(matchingCatalogApp ?? urlToCatalogApp(normalizedUrl), {
        replaceTabId,
      });
      return null;
    },
    [catalogApps, openCatalogApp]
  );

  const activateTab = useCallback(
    (tabId: string) => {
      const nextTab = tabs.find((tab) => tab.id === tabId) ?? HOME_TAB;
      setActiveTabId(nextTab.id);
      replaceWorkspaceUrlForTab(nextTab);
    },
    [replaceWorkspaceUrlForTab, tabs]
  );

  useEffect(() => {
    if (!workspaceRestored) return;

    const appId = searchParams.get("appId");
    if (!appId || tabs.some((tab) => tab.appId === appId)) return;

    const appUrl = searchParams.get("appUrl");
    const isGenerated = searchParams.get("isGenerated") === "true";
    const defaultDisplay =
      searchParams.get("defaultDisplay") === "fullscreen" ? "fullscreen" : "tab";
    const launchPayload = readShellLaunchPayload(appId);
    const generated = generatedApps.find((app) => app.id === appId);
    const catalog = catalogApps.find((app) => app.id === appId);

    if (launchPayload) {
      clearShellLaunchPayload(appId);
      openCatalogApp(launchPayloadToCatalog(launchPayload));
      return;
    }

    if (catalog) {
      openCatalogApp(catalog);
      return;
    }

    if (isGenerated && generated) {
      openCatalogApp(generatedAppToCatalog(generated));
      return;
    }

    if (appUrl) {
      openCatalogApp({
        id: appId,
        name:
          [...FEATURED_APPS].find((app) => app.id === appId)?.appName ??
          "Mini-app",
        hint: "external app",
        source: "featured",
        hosting: "url",
        appUrl,
        glyph: "M",
        tone: "blue",
        defaultDisplay,
      });
    }
  }, [
    catalogApps,
    generatedApps,
    openCatalogApp,
    searchParams,
    tabs,
    workspaceRestored,
  ]);

  const closeTab = useCallback((tabId: string) => {
    if (tabId === HOME_TAB.id) return;

    const closingActiveTab = activeTabId === tabId;
    const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
    const nextActiveTab = closingActiveTab
      ? tabs[tabIndex - 1] ?? HOME_TAB
      : activeTab;

    setTabs((current) => current.filter((tab) => tab.id !== tabId));
    if (closingActiveTab) {
      setActiveTabId(nextActiveTab.id);
      replaceWorkspaceUrlForTab(nextActiveTab);
    }
  }, [activeTab, activeTabId, replaceWorkspaceUrlForTab, tabs]);

  const handleGenerateApp = (
    htmlContent: string,
    appId: string,
    messages: ChatMessage[],
    appName: string
  ) => {
    setGeneratedApp({
      htmlContent,
      id: appId,
      messages,
      name: appName,
    });
  };

  const handleGeneratedAppUpdate = (app: GeneratedApp) => {
    setGeneratedApp({
      htmlContent: app.htmlContent,
      id: app.id,
      messages: app.messages,
      name: app.name,
    });
    refreshApps();
  };

  const handleProfileChange = useCallback(() => {
    loadActiveProfile();
    miniAppInstanceManager.emitToAll("profile:switched");
  }, [loadActiveProfile]);

  const handleIterateGeneratedApp = (app: CatalogApp) => {
    if (app.source !== "generated" || !app.htmlContent) return;
    setGeneratedApp({
      htmlContent: app.htmlContent,
      id: app.id,
      messages: app.messages ?? [],
      name: app.name,
    });
  };

  const handleDeleteGeneratedApp = async () => {
    if (!generatedAppToDelete) return;
    const appId = generatedAppToDelete.id;

    await deleteApp(appId);
    setTabs((current) => current.filter((tab) => tab.appId !== appId));
    if (activeTabId === `tab-${appId}`) {
      setActiveTabId(HOME_TAB.id);
      replaceWorkspaceUrlForTab(HOME_TAB);
    }
    setGeneratedAppToDelete(null);
    refreshApps();
  };

  if (profileLoading) {
    return <WorkspaceMessage label="Initializing profile..." />;
  }

  if (profileError) {
    return <WorkspaceMessage tone="error" label={`Failed to initialize profile: ${profileError}`} />;
  }

  const goHome = () => activateTab(HOME_TAB.id);

  return (
    <>
      <div className="h-[100dvh] bg-shell text-ink">
        <section className="flex h-[100dvh] w-full flex-col overflow-hidden bg-shell">
          <TabStrip
            tabs={tabs}
            activeTabId={activeTabId}
            activeProfile={activeProfile}
            switchableTabsCount={switchableTabs.length}
            onActivate={activateTab}
            onClose={closeTab}
            onCreateTab={createNewTab}
            onGoHome={goHome}
            onOpenTabSwitcher={() => setTabSwitcherOpen(true)}
            onOpenProfile={() => setProfileManagerOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />

          <div className="min-h-0 flex-1 overflow-hidden bg-shell">
            <div
              className={cn(
                "h-full min-h-0",
                activeTabId === HOME_TAB.id ? "block" : "hidden"
              )}
            >
              <LauncherWorkspace
                apps={catalogApps}
                openTabs={miniAppTabs}
                loadingApps={favoritesLoading || generatedLoading}
                onOpenApp={openCatalogApp}
                onActivateTab={activateTab}
                activeProfile={activeProfile}
                onOpenProfile={() => setProfileManagerOpen(true)}
                onOpenSettings={() => setSettingsOpen(true)}
                onOpenBuilder={() => router.push("/build/editor")}
                onOpenStore={() => router.push("/explore")}
                onGenerateApp={handleGenerateApp}
                onIterateGenerated={handleIterateGeneratedApp}
                onRenameGenerated={setGeneratedAppToRename}
                onDeleteGenerated={setGeneratedAppToDelete}
                onPublishGenerated={(app) => router.push(`/explore?publish=${app.id}`)}
              />
            </div>

            {switchableTabs
              .filter((tab) => tab.kind === "new")
              .map((tab) => (
                <div
                  key={tab.id}
                  className={cn(
                    "h-full min-h-0",
                    activeTabId === tab.id ? "block" : "hidden"
                  )}
                >
                  <NewTabWorkspace
                    apps={catalogApps}
                    loadingApps={favoritesLoading || generatedLoading}
                    onOpenApp={(app) => openCatalogApp(app, { replaceTabId: tab.id })}
                    onOpenUrl={(rawUrl) => openMiniAppUrlInTab(rawUrl, tab.id)}
                  />
                </div>
              ))}

            {miniAppTabs.map((tab) => (
              <div
                key={tab.id}
                className={cn(
                  "h-full min-h-0",
                  activeTabId === tab.id ? "block" : "hidden"
                )}
              >
                <MiniAppTabFrame
                  appId={tab.appId}
                  appName={tab.name}
                  appUrl={tab.appUrl}
                  htmlContent={tab.htmlContent}
                  hosting={tab.hosting}
                  defaultDisplay={tab.defaultDisplay}
                  isActive={activeTabId === tab.id}
                />
              </div>
            ))}
          </div>

          <footer className="hidden h-7 items-center justify-between border-t border-ink/10 bg-chrome px-4 font-mono text-[11px] text-ink-3 md:flex">
            <span>
              {activeTab.kind === "home"
                ? "launcher ready"
                : activeTab.kind === "new"
                  ? "new tab ready"
                  : `${activeTab.name.toLowerCase()} running`}
            </span>
            <span className="flex items-center gap-4">
              <span>permissions broker active</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-apna-green" />
                online
              </span>
            </span>
          </footer>
        </section>
      </div>

      <GeneratedAppModal
        isOpen={!!generatedApp}
        onClose={() => setGeneratedApp(null)}
        htmlContent={generatedApp?.htmlContent || ""}
        appId={generatedApp?.id || ""}
        appName={generatedApp?.name || ""}
        messages={generatedApp?.messages || []}
        onUpdate={handleGeneratedAppUpdate}
      />

      <ShellSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        activeProfile={activeProfile}
        onOpenProfile={() => {
          setSettingsOpen(false);
          setTimeout(() => setProfileManagerOpen(true), 0);
        }}
      />

      <TabSwitcherSheet
        open={tabSwitcherOpen}
        onOpenChange={setTabSwitcherOpen}
        tabs={switchableTabs}
        activeTabId={activeTabId}
        onActivateTab={(id) => {
          activateTab(id);
          setTabSwitcherOpen(false);
        }}
        onCloseTab={closeTab}
        onGoHome={() => {
          goHome();
          setTabSwitcherOpen(false);
        }}
      />

      <ProfileManager
        open={profileManagerOpen}
        onOpenChange={(open) => {
          setProfileManagerOpen(open);
          if (!open) loadActiveProfile();
        }}
        onProfileChange={handleProfileChange}
      />

      {generatedAppToRename && (
        <RenameAppSheet
          appId={generatedAppToRename.id}
          appName={generatedAppToRename.name}
          isOpen={!!generatedAppToRename}
          onOpenChange={(open) => !open && setGeneratedAppToRename(null)}
          onRenameComplete={refreshApps}
        />
      )}

      <AlertDialog
        open={!!generatedAppToDelete}
        onOpenChange={(open) => !open && setGeneratedAppToDelete(null)}
      >
        <AlertDialogContent className="border-ink/15 bg-chrome text-ink">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete generated app?</AlertDialogTitle>
            <AlertDialogDescription className="text-ink-3">
              This removes {generatedAppToDelete?.name ?? "this app"} from local generated apps and closes its tab if it is open.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-ink/10 bg-surface text-ink-2 hover:bg-surface-2">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGeneratedApp}
              className="bg-danger text-white hover:bg-danger/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TabStrip({
  tabs,
  activeTabId,
  activeProfile,
  switchableTabsCount,
  onActivate,
  onClose,
  onCreateTab,
  onGoHome,
  onOpenTabSwitcher,
  onOpenProfile,
  onOpenSettings,
}: {
  tabs: WorkspaceTab[];
  activeTabId: string;
  activeProfile: ActiveProfileSummary | null;
  switchableTabsCount: number;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onCreateTab: () => void;
  onGoHome: () => void;
  onOpenTabSwitcher: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
}) {
  const showTabSwitcher = switchableTabsCount >= 2;
  const visibleTabs = tabs.filter((tab) => tab.kind !== "home");
  const homeActive = activeTabId === HOME_TAB.id;

  return (
    <div className="flex h-[46px] shrink-0 items-end border-b border-ink/10 bg-chrome px-2">
      <div className="flex min-w-0 flex-1 items-end gap-px overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={onGoHome}
          aria-label="Home"
          aria-current={homeActive ? "page" : undefined}
          className={cn(
            "mb-[-1px] mt-1 grid h-[38px] w-11 shrink-0 place-items-center rounded-t-[9px] border transition-colors",
            homeActive
              ? "border-ink/10 border-b-shell bg-shell text-ink"
              : "border-transparent text-ink-3 hover:bg-surface-2 hover:text-ink-2"
          )}
        >
          <HomeIcon className="h-4 w-4" />
        </button>

        {visibleTabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onActivate(tab.id)}
              className={cn(
                "group mb-[-1px] mt-1 inline-flex h-[38px] min-w-[132px] max-w-[190px] items-center gap-2 rounded-t-[9px] border px-3 text-left text-[12.5px] transition-colors",
                active
                  ? "border-ink/10 border-b-shell bg-shell text-ink"
                  : "border-transparent text-ink-3 hover:bg-surface-2"
              )}
            >
              <TabGlyph tab={tab} />
              <span className="min-w-0 flex-1 truncate font-medium">{tab.name}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onClose(tab.id);
                  }
                }}
                className={cn(
                  "grid h-5 w-5 place-items-center rounded text-ink-3 hover:bg-ink/5",
                  active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                aria-label={`Close ${tab.name}`}
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onCreateTab}
          className="mb-1 ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-surface-2"
          aria-label="New tab"
        >
          <Plus className="h-4 w-4" />
        </button>
        <span className="min-w-3 flex-1" />
      </div>

      <div className="mb-2 ml-2 flex shrink-0 items-center gap-1.5 text-ink-3">
        <span className="hidden items-center gap-1 rounded-full border border-ink/10 bg-shell px-2 py-1 font-mono text-[11px] md:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-apna-green" />
          4 relays
        </span>
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="Manage profiles"
          className="hidden h-7 max-w-[132px] items-center gap-1.5 rounded-md border border-ink/10 bg-surface px-2 text-xs font-medium text-ink-2 hover:bg-surface-2 md:inline-flex"
        >
          <UserRound className="h-3.5 w-3.5 shrink-0 text-amber-strong" />
          <span className="truncate">
            {activeProfile?.alias ?? (activeProfile ? shortKey(activeProfile.npub) : "Profile")}
          </span>
        </button>
        {showTabSwitcher ? (
          <button
            type="button"
            onClick={onOpenTabSwitcher}
            aria-label={`Switch tab (${switchableTabsCount} open)`}
            className="relative grid h-7 w-7 place-items-center rounded-md hover:bg-surface-2"
          >
            <Layers className="h-4 w-4" />
            <span className="absolute -right-1 -top-1 grid h-3.5 min-w-[14px] place-items-center rounded-full bg-amber-strong px-1 text-[9px] font-semibold text-white">
              {switchableTabsCount}
            </span>
          </button>
        ) : (
          <button
            type="button"
            aria-label="Search apps"
            onClick={onGoHome}
            className="grid h-7 w-7 place-items-center rounded-md hover:bg-surface-2"
          >
            <Search className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          aria-label="Notifications"
          className="grid h-7 w-7 place-items-center rounded-md hover:bg-surface-2"
        >
          <Bell className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Shell settings"
          className="grid h-7 w-7 place-items-center rounded-md hover:bg-surface-2"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function NewTabWorkspace({
  apps,
  loadingApps,
  onOpenApp,
  onOpenUrl,
}: {
  apps: CatalogApp[];
  loadingApps: boolean;
  onOpenApp: (app: CatalogApp) => void;
  onOpenUrl: (rawUrl: string) => string | null;
}) {
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const installed = apps.slice(0, 18);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error = onOpenUrl(urlInput);
    setUrlError(error);
  };

  return (
    <div className="h-full min-h-0 overflow-auto bg-shell px-4 py-5 md:px-10 md:py-8">
      <main className="mx-auto max-w-4xl">
        <form
          onSubmit={handleSubmit}
          className="flex max-w-2xl items-center gap-2 rounded-full border border-ink/10 bg-surface px-3 py-2 text-sm text-ink focus-within:border-amber-strong/40 focus-within:ring-2 focus-within:ring-amber-strong/15"
        >
          <Globe2 className="h-4 w-4 shrink-0 text-ink-3" />
          <input
            type="text"
            inputMode="url"
            value={urlInput}
            onChange={(event) => {
              setUrlInput(event.target.value);
              if (urlError) setUrlError(null);
            }}
            placeholder="https://mini-app.example"
            aria-label="Mini-app URL"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
          />
          <Button
            type="submit"
            className="h-8 shrink-0 rounded-full bg-ink px-3 text-xs font-semibold text-shell hover:bg-ink-2"
          >
            <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" />
            Open
          </Button>
        </form>
        {urlError && (
          <p className="mt-2 px-3 text-xs text-danger">{urlError}</p>
        )}

        <section className="mt-7">
          <SectionLabel>Your Apps</SectionLabel>
          {loadingApps && installed.length === 0 ? (
            <div className="rounded-lg border border-ink/10 bg-surface p-6 text-sm text-ink-3">
              Loading apps...
            </div>
          ) : installed.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ink/15 bg-transparent p-6 text-sm text-ink-3">
              No apps available.
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6">
              {installed.map((app) => (
                <NewTabAppOption
                  key={`${app.source}-${app.id}`}
                  app={app}
                  onOpen={onOpenApp}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function LauncherWorkspace({
  apps,
  openTabs,
  loadingApps,
  onOpenApp,
  onActivateTab,
  activeProfile,
  onOpenProfile,
  onOpenSettings,
  onOpenBuilder,
  onOpenStore,
  onGenerateApp,
  onIterateGenerated,
  onRenameGenerated,
  onDeleteGenerated,
  onPublishGenerated,
}: {
  apps: CatalogApp[];
  openTabs: WorkspaceTab[];
  loadingApps: boolean;
  onOpenApp: (app: CatalogApp) => void;
  onActivateTab: (tabId: string) => void;
  activeProfile: ActiveProfileSummary | null;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onOpenBuilder: () => void;
  onOpenStore: () => void;
  onGenerateApp: (htmlContent: string, appId: string, messages: ChatMessage[], appName: string) => void;
  onIterateGenerated: (app: CatalogApp) => void;
  onRenameGenerated: (app: CatalogApp) => void;
  onDeleteGenerated: (app: CatalogApp) => void;
  onPublishGenerated: (app: CatalogApp) => void;
}) {
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filteredApps = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((app) => {
      return (
        app.name.toLowerCase().includes(q) ||
        app.hint.toLowerCase().includes(q) ||
        (app.description?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [apps, query]);

  const installed = filteredApps.slice(0, 18);

  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_340px]">
      <main className="min-h-0 overflow-auto px-4 py-5 md:px-10 md:py-8">
        <section className="mb-6 md:mb-7">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
            Sunday · May 17
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-ink md:text-4xl">
            Morning, Satsuki.
          </h1>
          <form
            onSubmit={(event) => event.preventDefault()}
            className="mt-4 flex max-w-xl items-center gap-3 rounded-full border border-ink/10 bg-surface px-4 py-2 text-sm text-ink focus-within:border-amber-strong/40 focus-within:ring-2 focus-within:ring-amber-strong/15"
          >
            <Search className="h-4 w-4 shrink-0 text-ink-3" />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search apps, people, notes..."
              aria-label="Search apps"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
            />
            <kbd className="hidden rounded-full border border-ink/10 bg-chrome px-2 py-0.5 font-mono text-[11px] text-ink-3 sm:inline-block">
              Cmd K
            </kbd>
          </form>
        </section>

        <SectionLabel
          right={query ? `${filteredApps.length} match${filteredApps.length === 1 ? "" : "es"}` : undefined}
        >
          Your Apps
        </SectionLabel>
        {loadingApps && installed.length === 0 ? (
          <div className="rounded-lg border border-ink/10 bg-surface p-6 text-sm text-ink-3">
            Loading apps...
          </div>
        ) : installed.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink/15 bg-transparent p-6 text-sm text-ink-3">
            {query ? `No apps match "${query}".` : "No apps yet. Visit the store to install one."}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6">
            {installed.map((app) => (
              <AppTile
                key={`${app.source}-${app.id}`}
                app={app}
                onOpen={onOpenApp}
                onIterateGenerated={onIterateGenerated}
                onRenameGenerated={onRenameGenerated}
                onDeleteGenerated={onDeleteGenerated}
                onPublishGenerated={onPublishGenerated}
              />
            ))}
            {!query && (
              <button
                type="button"
                onClick={onOpenStore}
                className="flex min-h-[74px] flex-col items-center justify-start gap-1 rounded-lg p-1 text-center text-ink-3 transition-colors hover:bg-surface/60 sm:min-h-[104px] sm:justify-center sm:border sm:border-dashed sm:border-ink/15 sm:p-2"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-dashed border-ink/15 bg-chrome sm:h-10 sm:w-10 sm:rounded-lg">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="line-clamp-2 text-[11px] font-medium leading-tight sm:text-xs">Add app</span>
                <span className="hidden font-mono text-[10px] sm:block">from store</span>
              </button>
            )}
          </div>
        )}

        <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section>
            <SectionLabel right="Live Mini-Apps">Open Tabs</SectionLabel>
            <div className="grid gap-3 md:grid-cols-2">
              {openTabs.length > 0 ? (
                openTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onActivateTab(tab.id)}
                    className="flex items-center gap-3 rounded-lg border border-ink/10 bg-surface p-3 text-left transition-colors hover:border-ink/20"
                  >
                    <AppGlyph glyph={tab.glyph} iconUrl={tab.iconUrl} tone={tab.tone} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{tab.name}</p>
                      <p className="truncate font-mono text-[11px] text-ink-3">
                        running · permission scoped
                      </p>
                    </div>
                    <ChevronDown className="-rotate-90 h-4 w-4 text-ink-3" />
                  </button>
                ))
              ) : (
                <div className="rounded-lg border border-ink/10 bg-surface p-4 text-sm text-ink-3">
                  Open Social or a generated app to pin it as a tab.
                </div>
              )}
            </div>
          </section>

          <section>
            <SectionLabel>Quick Links</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              <GenerateAppFab
                onGenerateApp={onGenerateApp}
                trigger={({ open, disabled }) => (
                  <QuickAction
                    icon={Sparkles}
                    title="Generate app"
                    sub="AI mini-app"
                    onClick={open}
                    disabled={disabled}
                  />
                )}
              />
              <QuickAction icon={LockKeyhole} title="Review grants" sub="per mini-app" onClick={onOpenSettings} />
              <QuickAction icon={Code2} title="Build app" sub="editor + AI" onClick={onOpenBuilder} />
              <QuickAction icon={Store} title="Browse store" sub="apps + widgets" onClick={onOpenStore} />
              <QuickAction icon={Palette} title="Appearance" sub="theme + density" onClick={onOpenSettings} />
            </div>
          </section>
        </div>
      </main>

      <aside className="hidden min-h-0 flex-col gap-4 overflow-auto border-l border-ink/10 bg-shell p-5 lg:flex">
        <AccountWidget
          activeProfile={activeProfile}
          onOpenProfile={onOpenProfile}
          onOpenSettings={onOpenSettings}
        />
        <ActiveAppsWidget openTabs={openTabs} onActivateTab={onActivateTab} />
        <PermissionsWidget onOpenSettings={onOpenSettings} />
        <WidgetsPreview />
      </aside>
    </div>
  );
}

function NewTabAppOption({
  app,
  onOpen,
}: {
  app: CatalogApp;
  onOpen: (app: CatalogApp) => void;
}) {
  const canOpen = app.hosting === "url" ? !!app.appUrl : !!app.htmlContent;

  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={() => onOpen(app)}
      className="flex min-h-[74px] min-w-0 flex-col items-center justify-start gap-1 rounded-lg p-1 text-center transition-colors hover:bg-surface/70 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[104px] sm:justify-center sm:border sm:border-ink/10 sm:bg-surface sm:p-2 sm:hover:border-ink/20"
    >
      <AppGlyph glyph={app.glyph} iconUrl={app.iconUrl} tone={app.tone} size="launcher" />
      <span className="line-clamp-2 max-w-full text-[11px] font-semibold leading-tight text-ink sm:line-clamp-1 sm:text-sm">
        {app.name}
      </span>
      <span className="hidden max-w-full truncate font-mono text-[10px] text-ink-3 sm:block sm:text-[11px]">
        {app.hint}
      </span>
    </button>
  );
}

function AppTile({
  app,
  onOpen,
  onIterateGenerated,
  onRenameGenerated,
  onDeleteGenerated,
  onPublishGenerated,
}: {
  app: CatalogApp;
  onOpen: (app: CatalogApp) => void;
  onIterateGenerated: (app: CatalogApp) => void;
  onRenameGenerated: (app: CatalogApp) => void;
  onDeleteGenerated: (app: CatalogApp) => void;
  onPublishGenerated: (app: CatalogApp) => void;
}) {
  const canOpen = app.hosting === "url" ? !!app.appUrl : !!app.htmlContent;
  const isGenerated = app.source === "generated";

  return (
    <div className="group min-w-0 sm:rounded-lg sm:border sm:border-ink/10 sm:bg-surface sm:p-2 sm:transition sm:hover:-translate-y-0.5 sm:hover:border-ink/20 sm:hover:shadow-[0_6px_18px_rgba(40,30,20,0.06)] sm:dark:hover:shadow-[0_6px_18px_rgba(0,0,0,0.35)]">
      <button
        type="button"
        disabled={!canOpen}
        onClick={() => onOpen(app)}
        className="flex min-h-[74px] w-full flex-col items-center justify-start gap-1 text-center disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[96px] sm:justify-center sm:gap-1.5"
      >
        <AppGlyph glyph={app.glyph} iconUrl={app.iconUrl} tone={app.tone} size="launcher" />
        <span className="line-clamp-2 max-w-full text-[11px] font-semibold leading-tight text-ink sm:line-clamp-1 sm:text-sm">
          {app.name}
        </span>
        <span className="hidden font-mono text-[10px] text-ink-3 sm:line-clamp-1 sm:block sm:text-[11px]">
          {app.hint}
        </span>
      </button>

      {isGenerated && (
        <div className="mt-1.5 hidden grid-cols-2 gap-1 border-t border-ink/10 pt-1.5 sm:grid">
          <TileAction icon={Repeat} label="Iterate" onClick={() => onIterateGenerated(app)} />
          <TileAction icon={Pencil} label="Rename" onClick={() => onRenameGenerated(app)} />
          {!app.published && (
            <TileAction icon={ArrowUpRight} label="Publish" onClick={() => onPublishGenerated(app)} />
          )}
          <TileAction icon={Trash2} label="Delete" danger onClick={() => onDeleteGenerated(app)} />
        </div>
      )}
    </div>
  );
}

function TileAction({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: typeof Repeat;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center justify-center gap-1 rounded-md px-1 text-[10px] font-medium hover:bg-shell",
        danger ? "text-danger" : "text-ink-2"
      )}
    >
      <Icon className="h-3 w-3" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function SectionLabel({
  children,
  right,
}: {
  children: string;
  right?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">
        {children}
      </h2>
      {right && <span className="text-xs text-ink-3">{right}</span>}
    </div>
  );
}

function QuickAction({
  icon: Icon,
  title,
  sub,
  onClick,
  disabled,
}: {
  icon: typeof Zap;
  title: string;
  sub: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 rounded-lg border border-ink/10 bg-surface p-3 text-left hover:bg-chrome disabled:cursor-wait disabled:opacity-60"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-soft text-amber-strong">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{title}</span>
        <span className="block truncate font-mono text-[11px] text-ink-3">
          {sub}
        </span>
      </span>
    </button>
  );
}

function AccountWidget({
  activeProfile,
  onOpenProfile,
  onOpenSettings,
}: {
  activeProfile: ActiveProfileSummary | null;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <section className="rounded-lg border border-ink/10 bg-surface p-4">
      <SectionLabel>Account</SectionLabel>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-soft text-amber-strong">
          <UserRound className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            {activeProfile?.alias ?? (activeProfile ? "Active profile" : "No profile")}
          </p>
          <p className="truncate font-mono text-[11px] text-ink-3">
            {activeProfile ? shortKey(activeProfile.npub) : "import or connect a signer"}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase text-amber-strong">
            {activeProfile?.signerType ?? (activeProfile?.isRemoteSigner ? "nip46" : "local shell")}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          onClick={onOpenProfile}
          className="h-8 border border-ink/10 bg-chrome text-xs text-ink-2 hover:bg-surface-2"
        >
          Profiles
        </Button>
        <Button
          type="button"
          onClick={onOpenSettings}
          className="h-8 border border-ink/10 bg-chrome text-xs text-ink-2 hover:bg-surface-2"
        >
          Settings
        </Button>
      </div>
    </section>
  );
}

function ActiveAppsWidget({
  openTabs,
  onActivateTab,
}: {
  openTabs: WorkspaceTab[];
  onActivateTab: (tabId: string) => void;
}) {
  return (
    <section className="rounded-lg border border-ink/10 bg-surface p-4">
      <SectionLabel>Active Tabs</SectionLabel>
      <div className="space-y-2">
        {openTabs.length ? (
          openTabs.slice(0, 4).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onActivateTab(tab.id)}
              className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-shell"
            >
              <AppGlyph glyph={tab.glyph} iconUrl={tab.iconUrl} tone={tab.tone} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                {tab.name}
              </span>
              <span className="font-mono text-[10px] text-ink-3">live</span>
            </button>
          ))
        ) : (
          <p className="text-sm text-ink-3">No mini-app tabs open.</p>
        )}
      </div>
    </section>
  );
}

function PermissionsWidget({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <section className="rounded-lg border border-ink/10 bg-surface p-4">
      <SectionLabel>Shell Permissions</SectionLabel>
      <div className="space-y-3 text-sm">
        <WidgetRow icon={ShieldCheck} title="Per-app grants" sub="once · session · always" />
        <WidgetRow icon={KeyRound} title="Signer stays in Apna" sub="mini-apps request capabilities" />
        <WidgetRow icon={Globe2} title="Nostr hidden by default" sub="plumbing remains inspectable" />
      </div>
      <Button
        type="button"
        onClick={onOpenSettings}
        className="mt-4 h-8 w-full border border-ink/10 bg-chrome text-xs text-ink-2 hover:bg-surface-2"
      >
        Review grants
      </Button>
    </section>
  );
}

function TabSwitcherSheet({
  open,
  onOpenChange,
  tabs,
  activeTabId,
  onActivateTab,
  onCloseTab,
  onGoHome,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tabs: WorkspaceTab[];
  activeTabId: string;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onGoHome: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(100vw,420px)] overflow-y-auto border-ink/15 bg-shell p-0 text-ink sm:max-w-[420px]"
      >
        <div className="border-b border-ink/10 bg-chrome px-5 py-4">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-ink">
              <Layers className="h-5 w-5 text-amber-strong" />
              Open tabs
            </SheetTitle>
            <SheetDescription className="text-ink-3">
              {tabs.length} open tab{tabs.length === 1 ? "" : "s"}.
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="space-y-2 p-4">
          <button
            type="button"
            onClick={onGoHome}
            className="flex w-full items-center gap-3 rounded-lg border border-ink/10 bg-surface p-3 text-left hover:bg-surface-2"
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-soft text-amber-strong">
              <HomeIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">Home</p>
              <p className="truncate font-mono text-[11px] text-ink-3">launcher + widgets</p>
            </div>
          </button>
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-2 transition-colors",
                  active
                    ? "border-amber-strong/30 bg-surface"
                    : "border-ink/10 bg-surface hover:bg-surface-2"
                )}
              >
                <button
                  type="button"
                  onClick={() => onActivateTab(tab.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <TabGlyph tab={tab} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{tab.name}</p>
                    <p className="truncate font-mono text-[11px] text-ink-3">
                      {active
                        ? "currently active"
                        : tab.kind === "new"
                          ? "ready · tap to switch"
                          : "running · tap to switch"}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onCloseTab(tab.id)}
                  aria-label={`Close ${tab.name}`}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-ink/5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ShellSettingsSheet({
  open,
  onOpenChange,
  activeProfile,
  onOpenProfile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeProfile: ActiveProfileSummary | null;
  onOpenProfile: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(100vw,620px)] overflow-y-auto border-ink/15 bg-shell p-0 text-ink sm:max-w-[620px]"
      >
        <div className="border-b border-ink/10 bg-chrome px-5 py-4">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-ink">
              <PanelRight className="h-5 w-5 text-amber-strong" />
              Shell settings
            </SheetTitle>
            <SheetDescription className="text-ink-3">
              Account, builder, permissions, notifications, and install controls.
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="space-y-4 p-5">
          <SettingsCard
            icon={Palette}
            title="Appearance"
            description="Match your device theme or pick light/dark explicitly."
          >
            <ThemeToggle />
          </SettingsCard>

          <SettingsCard
            icon={UserRound}
            title="Profile management"
            description="Switch local keys, browser extension signers, or remote signers without handing secrets to mini-apps."
          >
            <div className="rounded-lg border border-ink/10 bg-chrome p-3">
              <p className="text-sm font-semibold text-ink">
                {activeProfile?.alias ?? (activeProfile ? "Active profile" : "No active profile")}
              </p>
              <p className="mt-1 break-all font-mono text-[11px] text-ink-3">
                {activeProfile?.npub ?? "Open profile management to import or connect a signer."}
              </p>
            </div>
            <Button
              type="button"
              onClick={onOpenProfile}
              className="mt-3 border border-ink/10 bg-surface text-ink-2 hover:bg-surface-2"
            >
              <KeyRound className="mr-2 h-4 w-4" />
              Manage profiles
            </Button>
          </SettingsCard>

          <SettingsCard
            icon={Code2}
            title="Builder API"
            description="Keys and model preferences used by the app builder."
          >
            <OpenRouteApiKeySettings />
          </SettingsCard>

          <SettingsCard
            icon={ShieldCheck}
            title="App permissions"
            description="Inspect or revoke capability grants that mini-apps requested through the shell."
          >
            <AppPermissionsSettings />
          </SettingsCard>

          <SettingsCard
            icon={BellRing}
            title="Notifications"
            description="Push subscription controls for Apna notifications."
          >
            <PushNotificationSettings />
          </SettingsCard>

          <SettingsCard
            icon={LayoutDashboard}
            title="Installed app"
            description="Refresh the installed PWA shell when shortcuts or cached app metadata need a reset."
          >
            <PWAReinstallButton />
          </SettingsCard>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SettingsCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Settings;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-ink/10 bg-surface p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-soft text-amber-strong">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <p className="mt-1 text-sm text-ink-3">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function WidgetsPreview() {
  return (
    <section className="rounded-lg border border-ink/10 bg-surface p-4">
      <SectionLabel>Widget SDK</SectionLabel>
      <div className="space-y-3 text-sm">
        <WidgetRow icon={LayoutDashboard} title="Home widgets" sub="launcher and sidebar surfaces" />
        <WidgetRow icon={Bot} title="Mini-app authored" sub="declared through SDK metadata" />
        <WidgetRow icon={Sparkles} title="Shell rendered" sub="permissions still host-owned" />
      </div>
    </section>
  );
}

function WidgetRow({
  icon: Icon,
  title,
  sub,
}: {
  icon: typeof ShieldCheck;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-shell text-amber-strong">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block font-medium text-ink">{title}</span>
        <span className="block font-mono text-[11px] text-ink-3">{sub}</span>
      </span>
    </div>
  );
}

function TabGlyph({ tab }: { tab: WorkspaceTab }) {
  if (tab.kind === "new") {
    return <NewTabGlyph />;
  }

  return <AppGlyph glyph={tab.glyph} iconUrl={tab.iconUrl} tone={tab.tone} size="sm" />;
}

function NewTabGlyph() {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-ink/10 bg-shell">
      <ApnaLogo variant="mark" size={13} className="grayscale opacity-50" />
    </span>
  );
}

function AppGlyph({
  glyph,
  iconUrl,
  tone,
  size = "md",
}: {
  glyph: string;
  iconUrl?: string;
  tone: WorkspaceTab["tone"];
  size?: "sm" | "md" | "lg" | "launcher";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const iconSrc = iconUrl && !imageFailed ? iconUrl : null;
  const toneClasses = {
    amber: "bg-[#f2d89d] text-[#6f4610] dark:bg-[#5c3d12] dark:text-[#f2d89d]",
    orange: "bg-[#f1c19e] text-[#743b16] dark:bg-[#5b2f10] dark:text-[#f1c19e]",
    green: "bg-[#cfe7d5] text-[#1f5b35] dark:bg-[#22452f] dark:text-[#cfe7d5]",
    blue: "bg-[#cddff5] text-[#214f88] dark:bg-[#1f3354] dark:text-[#cddff5]",
    violet: "bg-[#ddcff2] text-[#593889] dark:bg-[#382558] dark:text-[#ddcff5]",
    plain: "bg-[#ece8df] text-[#4a443c] dark:bg-[#2a241d] dark:text-[#ece8df]",
  };
  const sizeClasses = {
    sm: "h-5 w-5 rounded text-[11px]",
    md: "h-10 w-10 rounded-lg text-lg",
    lg: "h-14 w-14 rounded-xl text-2xl",
    launcher: "h-11 w-11 rounded-xl text-lg sm:h-10 sm:w-10 sm:rounded-lg",
  };
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center font-semibold",
        iconSrc
          ? "overflow-hidden border border-ink/10 bg-chrome p-1"
          : toneClasses[tone],
        sizeClasses[size]
      )}
    >
      {iconSrc ? (
        <Image
          src={iconSrc}
          alt=""
          width={48}
          height={48}
          className="h-full w-full object-contain"
          unoptimized
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        glyph.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

function WorkspaceMessage({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "error";
}) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-shell p-6">
      <div
        className={cn(
          "rounded-lg border bg-surface px-5 py-4 text-sm shadow-sm",
          tone === "error"
            ? "border-danger/30 text-danger"
            : "border-ink/10 text-ink-2"
        )}
      >
        {label}
      </div>
    </div>
  );
}

function catalogAppToWorkspaceTab(app: CatalogApp): WorkspaceTab {
  const hosting = app.hosting === "url" ? "url" : "nostr";

  return {
    id: `tab-${app.id}`,
    appId: app.id,
    name: app.name,
    glyph: app.glyph,
    iconUrl: app.iconUrl,
    tone: app.tone,
    kind: "mini-app",
    hosting,
    appUrl: hosting === "url" ? app.appUrl : null,
    htmlContent: hosting === "nostr" ? app.htmlContent : null,
    defaultDisplay: app.defaultDisplay,
  };
}

function createBlankWorkspaceTab(): WorkspaceTab {
  return blankWorkspaceTab(createWorkspaceTabId("new-tab"));
}

function blankWorkspaceTab(id: string): WorkspaceTab {
  return {
    id,
    appId: id,
    name: NEW_TAB_NAME,
    glyph: "A",
    tone: "plain",
    kind: "new",
  };
}

function createWorkspaceTabId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function workspaceUrlForTab(tab: WorkspaceTab) {
  if (tab.kind === "home") return "/app";
  if (tab.kind === "new") return `/app?newTab=${encodeURIComponent(tab.id)}`;

  const params = new URLSearchParams();
  params.set("appId", tab.appId);
  if (tab.hosting === "url" && tab.appUrl) params.set("appUrl", tab.appUrl);
  params.set("isGenerated", String(tab.hosting === "nostr"));
  if (tab.defaultDisplay) params.set("defaultDisplay", tab.defaultDisplay);

  return `/app?${params.toString()}`;
}

function readPersistedWorkspaceState(): { tabs: WorkspaceTab[]; activeTabId: string } | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(WORKSPACE_STATE_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedWorkspaceState>;
    if (parsed.version !== WORKSPACE_STATE_VERSION || !Array.isArray(parsed.tabs)) {
      return null;
    }

    const seenTabIds = new Set<string>();
    const restoredTabs = parsed.tabs.reduce<WorkspaceTab[]>((acc, tab) => {
      const restoredTab = normalizePersistedWorkspaceTab(tab);
      if (!restoredTab || seenTabIds.has(restoredTab.id)) return acc;

      seenTabIds.add(restoredTab.id);
      acc.push(restoredTab);
      return acc;
    }, []);
    const tabs = [HOME_TAB, ...restoredTabs];
    const activeTabId =
      typeof parsed.activeTabId === "string" &&
      tabs.some((tab) => tab.id === parsed.activeTabId)
        ? parsed.activeTabId
        : HOME_TAB.id;

    return { tabs, activeTabId };
  } catch {
    return null;
  }
}

function writePersistedWorkspaceState(tabs: WorkspaceTab[], activeTabId: string) {
  if (typeof window === "undefined") return;

  try {
    const persistedTabs = tabs
      .filter((tab) => tab.kind !== "home")
      .map(serializeWorkspaceTab);
    const persistedActiveTabId = tabs.some((tab) => tab.id === activeTabId)
      ? activeTabId
      : HOME_TAB.id;
    const state: PersistedWorkspaceState = {
      version: WORKSPACE_STATE_VERSION,
      tabs: persistedTabs,
      activeTabId: persistedActiveTabId,
      updatedAt: Date.now(),
    };

    window.localStorage.setItem(WORKSPACE_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Workspace restore is a convenience; quota or privacy-mode failures should not block the shell.
  }
}

function normalizePersistedWorkspaceTab(value: unknown): WorkspaceTab | null {
  const tab = value as Partial<WorkspaceTab>;
  if (!tab || typeof tab !== "object") return null;

  if (tab.kind === "new") {
    const id =
      typeof tab.id === "string" && tab.id.trim()
        ? tab.id.trim()
        : createWorkspaceTabId("new-tab");
    return blankWorkspaceTab(id);
  }

  const appId = typeof tab.appId === "string" ? tab.appId.trim() : "";
  if (!appId || appId === HOME_TAB.appId) return null;

  const name =
    typeof tab.name === "string" && tab.name.trim() ? tab.name.trim() : "Mini-app";
  const glyph =
    typeof tab.glyph === "string" && tab.glyph.trim()
      ? tab.glyph.trim().slice(0, 2)
      : name.charAt(0);
  const tone = isWorkspaceTabTone(tab.tone) ? tab.tone : toneForName(name);
  const hosting =
    tab.hosting === "url" || tab.hosting === "nostr"
      ? tab.hosting
      : typeof tab.htmlContent === "string"
        ? "nostr"
        : "url";
  const defaultDisplay =
    tab.defaultDisplay === "fullscreen" || tab.defaultDisplay === "tab"
      ? tab.defaultDisplay
      : undefined;

  return {
    id: typeof tab.id === "string" && tab.id.trim() ? tab.id.trim() : `tab-${appId}`,
    appId,
    name,
    glyph,
    iconUrl: typeof tab.iconUrl === "string" ? tab.iconUrl : undefined,
    tone,
    kind: "mini-app" as const,
    hosting,
    appUrl: typeof tab.appUrl === "string" ? tab.appUrl : null,
    htmlContent: typeof tab.htmlContent === "string" ? tab.htmlContent : null,
    defaultDisplay,
  };
}

function serializeWorkspaceTab(tab: WorkspaceTab): WorkspaceTab {
  if (tab.kind === "new") {
    return blankWorkspaceTab(tab.id);
  }

  return {
    id: tab.id,
    appId: tab.appId,
    name: tab.name,
    glyph: tab.glyph,
    iconUrl: tab.iconUrl,
    tone: tab.tone,
    kind: "mini-app",
    hosting: tab.hosting,
    appUrl: tab.appUrl ?? null,
    htmlContent: tab.htmlContent ?? null,
    defaultDisplay: tab.defaultDisplay,
  };
}

function workspaceTabsEqual(a: WorkspaceTab, b: WorkspaceTab) {
  return (
    a.id === b.id &&
    a.appId === b.appId &&
    a.name === b.name &&
    a.glyph === b.glyph &&
    a.iconUrl === b.iconUrl &&
    a.tone === b.tone &&
    a.kind === b.kind &&
    a.hosting === b.hosting &&
    a.appUrl === b.appUrl &&
    a.htmlContent === b.htmlContent &&
    a.defaultDisplay === b.defaultDisplay
  );
}

function isWorkspaceTabTone(value: unknown): value is WorkspaceTab["tone"] {
  return (
    typeof value === "string" &&
    VALID_TAB_TONES.includes(value as WorkspaceTab["tone"])
  );
}

function buildCatalogApps(
  favoriteApps: AppDetails[],
  generatedApps: GeneratedApp[]
): CatalogApp[] {
  const seen = new Set<string>();
  const featured = FEATURED_APPS.map((app) => {
    const details = FEATURED_APP_DETAILS[app.id];
    return {
      id: app.id,
      name: app.appName,
      hint: details?.hint ?? "featured mini-app",
      source: "featured" as const,
      hosting: "url" as const,
      appUrl: app.appURL,
      glyph: details?.glyph ?? app.appName.charAt(0),
      iconUrl: faviconUrlForAppUrl(app.appURL),
      tone: details?.tone ?? "blue",
      description: details?.description,
      defaultDisplay: app.defaultDisplay ?? "tab",
    };
  });

  const favorites = favoriteApps.map((app) => appDetailsToCatalog(app));
  const generated = generatedApps.map(generatedAppToCatalog);

  return [...featured, ...favorites, ...generated].filter((app) => {
    if (seen.has(app.id)) return false;
    seen.add(app.id);
    return true;
  });
}

function appDetailsToCatalog(app: AppDetails): CatalogApp {
  const hosting = deriveHosting(app);
  return {
    id: app.id,
    name: app.appName,
    hint: app.categories?.[0]?.toLowerCase() ?? "favorite mini-app",
    source: "favorite",
    hosting,
    appUrl: app.appURL,
    htmlContent: app.htmlContent,
    glyph: app.appName.charAt(0),
    iconUrl: faviconUrlForAppUrl(app.appURL),
    tone: toneForName(app.appName),
    description: app.description,
    defaultDisplay: app.defaultDisplay ?? "tab",
  };
}

function generatedAppToCatalog(app: GeneratedApp): CatalogApp {
  return {
    id: app.id,
    name: app.name,
    hint: "generated · local",
    source: "generated",
    hosting: "nostr",
    htmlContent: app.htmlContent,
    glyph: app.icon || app.name.charAt(0),
    tone: toneForName(app.name),
    published: Boolean(app.published?.some(Boolean)),
    messages: app.messages,
    defaultDisplay: "tab",
  };
}

function launchPayloadToCatalog(app: ShellLaunchPayload): CatalogApp {
  const hosting = deriveHosting({
    hosting: app.hosting,
    isGeneratedApp: app.isGeneratedApp,
    appURL: app.appURL,
    blossomUrl: app.blossomUrl,
  });

  return {
    id: app.id,
    name: app.appName,
    hint: app.categories?.[0]?.toLowerCase() ?? "explore mini-app",
    source: "explore",
    hosting,
    appUrl: app.appURL,
    htmlContent: app.htmlContent,
    glyph: app.appName.charAt(0),
    iconUrl: faviconUrlForAppUrl(app.appURL),
    tone: toneForName(app.appName),
    description: app.description,
    defaultDisplay: app.defaultDisplay ?? "tab",
  };
}

function normalizeMiniAppUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function urlToCatalogApp(appUrl: string): CatalogApp {
  const url = new URL(appUrl);
  const hostname = url.hostname.replace(/^www\./, "");
  const name = hostname || "Mini-app";
  const path = url.pathname && url.pathname !== "/" ? url.pathname : "";

  return {
    id: `url-${stableHash(appUrl)}`,
    name,
    hint: `${url.host}${path}`,
    source: "explore",
    hosting: "url",
    appUrl,
    glyph: name.charAt(0) || "M",
    iconUrl: faviconUrlForAppUrl(appUrl),
    tone: toneForName(name),
    description: "URL mini-app",
    defaultDisplay: "tab",
  };
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function shortKey(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function faviconUrlForAppUrl(appUrl?: string) {
  if (!appUrl) return undefined;
  return `/api/favicon?appUrl=${encodeURIComponent(appUrl)}`;
}

function toneForName(name: string): WorkspaceTab["tone"] {
  const tones: WorkspaceTab["tone"][] = [
    "amber",
    "orange",
    "green",
    "blue",
    "violet",
    "plain",
  ];
  const sum = name
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return tones[sum % tones.length];
}

export default function AppHomePage() {
  return (
    <Suspense fallback={<WorkspaceMessage label="Loading workspace..." />}>
      <AppHomeContent />
    </Suspense>
  );
}
