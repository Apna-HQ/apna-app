"use client";

/**
 * Unified mini-app loader.
 *
 * This single component handles both hosting modes:
 *
 *   - hosting === 'url'   — renders the app from `appUrl` (external URL)
 *   - hosting === 'nostr' — renders the app from `htmlContent` (srcDoc / Nostr-stored source)
 *
 * The old `isGeneratedApp` boolean prop is kept for back-compat (it maps to hosting === 'nostr').
 * Call-sites that pass `isGeneratedApp` do not need to change.
 *
 * GeneratedAppModal (the AI iteration variant) extends this by adding the PromptIterationSheet
 * and re-exports as its own component — see components/organisms/GeneratedAppModal/index.tsx.
 *
 * Both variants are wired through lib/apna-host/instance-manager (one instance at a time).
 *
 * Design-selections sync (APNA-RD-HOST-016):
 *   - On mount, the host instance is created with the `designRemote` URL so the HandshakeAck
 *     advertises it to the mini-app.
 *   - Current selections are emitted as `design:selections` once the mini-app connects
 *     (inside the instance creation effect).
 *   - Any subsequent change to selections (via setDesignSelections) is broadcast to all
 *     running instances by the subscription wired here.
 */

import { Dialog, DialogContent } from "@/components/ui/dialog";
import TopBar from "@/components/organisms/TopBar";
import { useCallback, useEffect, useRef, useState } from "react";
import { Fab } from "@/components/ui/fab";
import {
  miniAppInstanceManager,
  type MiniAppInstance,
} from "@/lib/apna-host/instance-manager";
import { apnaHostCapabilities } from "@/lib/apna-host/capabilities";
import PermissionPrompt from "@/components/organisms/PermissionPrompt";
import type {
  PermissionPromptRequest,
  PermissionPromptResult,
} from "@/lib/apna-host/permissions";
import { ChatMessage, GeneratedApp } from "@/lib/generatedAppsDB";
import PromptIterationSheet from "@/components/molecules/PromptIterationSheet";
import { useGeneratedApps } from "@/lib/contexts/GeneratedAppsContext";
import { callOpenRouterApi } from "@/lib/utils/openRouterApi";
import { useOpenRouteApiKey } from "@/lib/hooks/useOpenRouteApiKey";
import {
  getDesignSelections,
  subscribeToDesignSelections,
} from "@/lib/apna-host/design-selections";

export interface MiniAppModalProps {
  isOpen: boolean;
  /** URL for url-hosted apps. */
  appUrl?: string | null;
  /** Inline HTML source for nostr-hosted apps. */
  htmlContent?: string | null;
  appId: string;
  appName?: string;
  /**
   * Hosting mode. Determines whether the iframe uses `src` or `srcDoc`.
   * Defaults to 'url' when omitted and `appUrl` is set, 'nostr' when `htmlContent` is set.
   * Back-compat: `isGeneratedApp=true` maps to hosting='nostr'.
   */
  hosting?: "nostr" | "url";
  /** @deprecated Use hosting='nostr' instead. Kept for back-compat. */
  isGeneratedApp?: boolean;
  onClose: () => void;
  /** Present only for the AI-iteration variant (GeneratedAppModal). */
  messages?: ChatMessage[];
  onUpdate?: (app: GeneratedApp) => void;
  /** When true the PromptIterationSheet is available. */
  showIteration?: boolean;
}

export default function MiniAppModal({
  isOpen,
  appUrl,
  htmlContent,
  appId,
  appName,
  hosting,
  isGeneratedApp = false,
  onClose,
  messages = [],
  onUpdate,
  showIteration = false,
}: MiniAppModalProps) {
  // Derive effective hosting mode from new or legacy props.
  const effectiveHosting: "nostr" | "url" =
    hosting ?? (isGeneratedApp ? "nostr" : htmlContent ? "nostr" : "url");

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const permissionResolverRef = useRef<
    ((permissions: PermissionPromptResult) => void) | null
  >(null);
  const [miniAppInstance, setMiniAppInstance] = useState<MiniAppInstance>();
  const [permissionRequest, setPermissionRequest] =
    useState<PermissionPromptRequest | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(true);

  // Iteration sheet state (only used when showIteration===true)
  const [isIterationSheetOpen, setIsIterationSheetOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const { getApp, updateApp, refreshApps } = useGeneratedApps();
  const { apiKey } = useOpenRouteApiKey();

  // Track the iframe element via state (not just a ref) so the effect below
  // re-runs once the iframe is actually attached. The iframe is rendered
  // inside Radix's <DialogContent>, which portals; on the render where
  // `isOpen` flips true the useEffect can run BEFORE the iframe ref is
  // populated, leading to a silent no-op and no host-side ApnaHost.
  const [iframeEl, setIframeEl] = useState<HTMLIFrameElement | null>(null);
  const attachIframe = useCallback((el: HTMLIFrameElement | null) => {
    iframeRef.current = el;
    setIframeEl(el);
  }, []);

  useEffect(() => {
    if (!isOpen || !iframeEl) return;

    // Build the designRemote URL from the current origin.
    // This is the Module Federation remoteEntry.js emitted by next.config.mjs.
    // Mini-apps receive it in HandshakeAck and use it to load host design components.
    const designRemote =
      typeof window !== "undefined"
        ? `${window.location.origin}/_next/static/chunks/remoteEntry.js`
        : undefined;

    const instance = miniAppInstanceManager.create({
      appId,
      appName: appName ?? "App",
      iframe: iframeEl,
      handlers: apnaHostCapabilities,
      designRemote,
      permissionPrompt: (request) =>
        new Promise((resolve) => {
          permissionResolverRef.current = resolve;
          setPermissionRequest(request);
        }),
    });
    setMiniAppInstance(instance);

    // Send the current design-selections to the mini-app as its initial state.
    // We use a small delay so the mini-app has time to complete the handshake
    // and register its `apna.on('design:selections')` listener before we push.
    const initialSelections = getDesignSelections();
    const sendInitialSelections = setTimeout(() => {
      instance.emit("design:selections", initialSelections);
    }, 500);

    // Subscribe to future selection changes and re-emit to this instance.
    const unsubscribeSelections = subscribeToDesignSelections((selections) => {
      instance.emit("design:selections", selections);
    });

    return () => {
      clearTimeout(sendInitialSelections);
      unsubscribeSelections();
      instance.dispose();
      setMiniAppInstance(undefined);
      if (typeof document !== "undefined") {
        document.body.style.pointerEvents = "";
        document.body.style.overflow = "";
      }
    };
  }, [appId, appName, isOpen, iframeEl]);

  const handleRegenerateContent = async (newMessage: string) => {
    if (!newMessage.trim()) return;

    setIsRegenerating(true);
    try {
      const userMessage: ChatMessage = { role: "user", content: newMessage.trim() };

      let updatedMessages: ChatMessage[];
      if (messages.length > 0 && messages[0].role === "system") {
        updatedMessages = [messages[0], ...messages.slice(1), userMessage];
      } else {
        updatedMessages = [...messages, userMessage];
      }

      if (!apiKey) throw new Error("OpenRouter API key is not provided. Please add your API key in settings.");

      const data = await callOpenRouterApi({ messages: updatedMessages, apiKey });

      if (data.html && data.messages) {
        const app = await getApp(appId);
        const htmlContents = app?.htmlContents ?? [];

        const updatedApp: GeneratedApp = {
          id: appId,
          htmlContent: data.html,
          htmlContents: [...htmlContents, data.html],
          messages: data.messages,
          name: appName ?? "Generated App",
          createdAt: app?.createdAt ?? Date.now(),
          updatedAt: Date.now(),
        };

        await updateApp(appId, {
          htmlContent: data.html,
          htmlContents: [...htmlContents, data.html],
          messages: data.messages,
          name: appName ?? "Generated App",
        });

        await refreshApps();

        if (onUpdate) onUpdate(updatedApp);
      }
    } catch (error) {
      console.error("Error regenerating content:", error);
    } finally {
      setIsRegenerating(false);
      setIsIterationSheetOpen(false);
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      if (typeof window !== "undefined") {
        miniAppInstance?.dispose();
        document.body.style.pointerEvents = "";
        document.body.style.overflow = "";
        document.querySelectorAll('[aria-hidden="true"]').forEach((el) => {
          if (el instanceof HTMLElement) el.removeAttribute("aria-hidden");
        });
        document.body.offsetHeight;
      }
      setTimeout(() => onClose(), 0);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent variant="fullscreen" className="p-0 overflow-hidden">
        <div className="flex flex-col h-full">
          {!isFullscreen && (
            <TopBar
              appId={appId}
              appName={appName ?? (effectiveHosting === "nostr" ? "Generated App" : "App")}
              onClose={onClose}
              showBackButton
            />
          )}
          <div className="flex-1">
            {isOpen && (
              <iframe
                ref={attachIframe}
                id={effectiveHosting === "nostr" ? "generatedAppIframe" : "miniAppIframe"}
                src={effectiveHosting === "url" && appUrl ? appUrl : undefined}
                srcDoc={effectiveHosting === "nostr" && htmlContent ? htmlContent : undefined}
                style={{
                  overflow: "hidden",
                  height: "100dvh",
                  width: "100%",
                  border: "none",
                }}
                allow="camera"
                // nostr-hosted apps get the sandbox attribute (same as old GeneratedAppModal)
                sandbox={effectiveHosting === "nostr" ? "allow-scripts allow-same-origin allow-forms" : undefined}
              />
            )}

            <Fab
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
              appId={appId}
              onRate={
                effectiveHosting === "url"
                  ? () => {
                      const iframe = iframeRef.current;
                      if (iframe?.src) iframe.src = iframe.src;
                    }
                  : undefined
              }
              onToggleHighlight={() => {
                miniAppInstance?.emit("customise:toggleHighlight");
              }}
              onProfileChange={() => {
                miniAppInstance?.emit("profile:switched");
              }}
              onClose={onClose}
              isGeneratedApp={effectiveHosting === "nostr"}
              onIterate={showIteration ? () => setIsIterationSheetOpen(true) : undefined}
            />

            {/* Prompt iteration sheet — only rendered when showIteration is true */}
            {showIteration && (
              <PromptIterationSheet
                isOpen={isIterationSheetOpen}
                onClose={() => setIsIterationSheetOpen(false)}
                messages={messages}
                onSubmit={handleRegenerateContent}
                isLoading={isRegenerating}
              />
            )}
          </div>
        </div>
      </DialogContent>

      {permissionRequest && (
        <PermissionPrompt
          open={!!permissionRequest}
          appId={permissionRequest.appId}
          appName={permissionRequest.appName}
          capabilities={permissionRequest.capabilities}
          onResolve={(permissions) => {
            permissionResolverRef.current?.(permissions);
            permissionResolverRef.current = null;
            setPermissionRequest(null);
          }}
          onCancel={() => {
            permissionResolverRef.current?.(
              permissionRequest.capabilities.map((capability) => ({
                capability,
                decision: "deny",
                scope: "once",
              }))
            );
            permissionResolverRef.current = null;
            setPermissionRequest(null);
          }}
        />
      )}
    </Dialog>
  );
}
