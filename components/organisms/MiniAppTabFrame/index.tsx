"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import { Maximize2, Minimize2, Palette, UserRound } from "lucide-react";

import { ApnaLogo } from "@/components/atoms/ApnaLogo";
import ProfileManager from "@/components/organisms/ProfileManager";
import PermissionPrompt from "@/components/organisms/PermissionPrompt";
import { Button } from "@/components/ui/button";
import { apnaHostCapabilities } from "@/lib/apna-host/capabilities";
import {
  miniAppInstanceManager,
  type MiniAppInstance,
} from "@/lib/apna-host/instance-manager";
import { onIframeHandshake } from "@/lib/apna-host/iframe-handshake";
import { usePermissionPromptQueue } from "@/lib/apna-host/use-permission-prompt-queue";
import {
  getDesignSelections,
  subscribeToDesignSelections,
} from "@/lib/apna-host/design-selections";
import type { PermissionPromptResult } from "@/lib/apna-host/permissions";
import { cn } from "@/lib/utils";

export interface MiniAppTabFrameProps {
  appId: string;
  appName: string;
  appUrl?: string | null;
  htmlContent?: string | null;
  hosting?: "url" | "nostr";
  isActive?: boolean;
  /**
   * Initial open mode for the mini-app frame. Defaults to `"tab"`.
   * Only seeds initial state — the user can still toggle fullscreen via the FAB.
   */
  defaultDisplay?: "tab" | "fullscreen";
}

const FAB_SIZE = 44; // px — round, draggable trigger
const SAFE_INSET = 16; // px — gutter from frame edges
const DRAG_CLICK_SUPPRESS_MS = 180;

export default function MiniAppTabFrame({
  appId,
  appName,
  appUrl,
  htmlContent,
  hosting,
  isActive = true,
  defaultDisplay,
}: MiniAppTabFrameProps) {
  const effectiveHosting: "url" | "nostr" =
    hosting ?? (htmlContent ? "nostr" : "url");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeEl, setIframeEl] = useState<HTMLIFrameElement | null>(null);
  const [miniAppInstance, setMiniAppInstance] = useState<MiniAppInstance>();
  const [isFullscreen, setIsFullscreen] = useState(
    defaultDisplay === "fullscreen"
  );
  const [isProfileManagerOpen, setIsProfileManagerOpen] = useState(false);
  const suppressPromptCloseUntilRef = useRef(0);
  const {
    activePermissionRequest,
    permissionPrompt,
    resolveActivePermissionPrompt,
    cancelActivePermissionPrompt,
    clearPermissionPrompts,
  } = usePermissionPromptQueue();

  const attachIframe = useCallback((el: HTMLIFrameElement | null) => {
    iframeRef.current = el;
    setIframeEl(el);
  }, []);

  useEffect(() => {
    if (!iframeEl) return;

    const designRemote =
      typeof window !== "undefined"
        ? `${window.location.origin}/_next/static/chunks/remoteEntry.js`
        : undefined;

    let instance: MiniAppInstance | null = null;
    let initialSelectionsTimer: ReturnType<typeof setTimeout> | null = null;
    const initialSelections = getDesignSelections();
    const stopHandshakeListener = onIframeHandshake(iframeEl, () => {
      if (initialSelectionsTimer) clearTimeout(initialSelectionsTimer);
      initialSelectionsTimer = setTimeout(() => {
        instance?.emit("design:selections", initialSelections);
      }, 250);
    });

    instance = miniAppInstanceManager.create({
      appId,
      appName,
      iframe: iframeEl,
      handlers: apnaHostCapabilities,
      designRemote,
      permissionPrompt,
    });
    setMiniAppInstance(instance);

    const unsubscribeSelections = subscribeToDesignSelections((selections) => {
      instance?.emit("design:selections", selections);
    });

    return () => {
      stopHandshakeListener();
      if (initialSelectionsTimer) clearTimeout(initialSelectionsTimer);
      unsubscribeSelections();
      instance?.dispose();
      clearPermissionPrompts();
      setMiniAppInstance(undefined);
    };
  }, [
    appId,
    appName,
    clearPermissionPrompts,
    iframeEl,
    permissionPrompt,
  ]);

  const suppressPromptCloseBriefly = useCallback(() => {
    suppressPromptCloseUntilRef.current = Date.now() + 1000;
  }, []);

  const handlePermissionResolve = useCallback(
    (permissions: PermissionPromptResult) => {
      suppressPromptCloseBriefly();
      resolveActivePermissionPrompt(permissions);
      miniAppInstance?.emit("permissions:changed", {});
    },
    [
      miniAppInstance,
      resolveActivePermissionPrompt,
      suppressPromptCloseBriefly,
    ]
  );

  const handlePermissionCancel = useCallback(() => {
    suppressPromptCloseBriefly();
    cancelActivePermissionPrompt();
  }, [cancelActivePermissionPrompt, suppressPromptCloseBriefly]);

  return (
    <div
      className={cn(
        "relative h-full min-h-0 bg-white",
        isFullscreen && "fixed inset-0 z-40"
      )}
    >
      <iframe
        ref={attachIframe}
        id={`miniAppIframe-${appId}`}
        title={appName}
        src={effectiveHosting === "url" && appUrl ? appUrl : undefined}
        srcDoc={
          effectiveHosting === "nostr" && htmlContent ? htmlContent : undefined
        }
        className="h-full w-full border-0 bg-white"
        allow="camera"
        sandbox={
          effectiveHosting === "nostr"
            ? "allow-scripts allow-same-origin allow-forms"
            : undefined
        }
      />

      <DraggableMiniAppFab
        isActive={isActive}
        onToggleHighlight={() =>
          miniAppInstance?.emit("customise:toggleHighlight")
        }
        onSwitchProfile={() => setIsProfileManagerOpen(true)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen((current) => !current)}
      />

      {activePermissionRequest && (
        <PermissionPrompt
          open={
            !!activePermissionRequest ||
            Date.now() < suppressPromptCloseUntilRef.current
          }
          appId={activePermissionRequest.appId}
          appName={activePermissionRequest.appName}
          capabilities={activePermissionRequest.capabilities}
          onResolve={handlePermissionResolve}
          onCancel={handlePermissionCancel}
        />
      )}

      <ProfileManager
        open={isProfileManagerOpen}
        onOpenChange={setIsProfileManagerOpen}
        onProfileChange={() => {
          miniAppInstanceManager.emitToApp(appId, "profile:switched");
        }}
      />
    </div>
  );
}

/**
 * Round, draggable FAB that expands into the horizontal mini-app toolbar on click.
 *
 * - Resting state: small round logo button anchored top-right with safe-area inset.
 * - Click → expands the existing horizontal pill (Palette / UserRound / Fullscreen)
 *   inline next to the FAB; click outside or click again collapses it.
 * - Drag anywhere within the frame; snaps to nearest left/right edge on release.
 * - Drag-vs-click discrimination: while drag is active we set a flag, and we suppress
 *   any click that fires within ~180 ms of drag-end. Without this, framer-motion's
 *   touch drag would also trigger the underlying button's onClick on release.
 */
function DraggableMiniAppFab({
  isActive,
  onToggleHighlight,
  onSwitchProfile,
  isFullscreen,
  onToggleFullscreen,
}: {
  isActive: boolean;
  onToggleHighlight: () => void;
  onSwitchProfile: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { damping: 22, stiffness: 220 });
  const springY = useSpring(y, { damping: 22, stiffness: 220 });
  const [constraints, setConstraints] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });
  const [isOpen, setIsOpen] = useState(false);
  const [menuSide, setMenuSide] = useState<"left" | "right">("left");
  const [hasPositioned, setHasPositioned] = useState(false);
  const draggingRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Compute drag constraints and initial resting position (top-right) against
  // the iframe's parent frame so the FAB never escapes the visible mini-app area.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const parent = containerRef.current?.parentElement;
    if (!parent) return;

    const update = () => {
      const rect = parent.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const width = rect.width;
      const height = rect.height;
      const right = Math.max(SAFE_INSET, width - FAB_SIZE - SAFE_INSET);
      const bottom = Math.max(SAFE_INSET, height - FAB_SIZE - SAFE_INSET);
      setConstraints({
        top: SAFE_INSET,
        bottom,
        left: SAFE_INSET,
        right,
      });
      if (!hasPositioned) {
        x.set(right);
        y.set(SAFE_INSET);
        setMenuSide("left");
        setHasPositioned(true);
      } else {
        // Keep the FAB inside the visible area on resize.
        const currentX = x.get();
        const currentY = y.get();
        let nextX = currentX;
        if (currentX > right) {
          x.set(right);
          nextX = right;
        }
        if (currentX < SAFE_INSET) {
          x.set(SAFE_INSET);
          nextX = SAFE_INSET;
        }
        if (currentY > bottom) y.set(bottom);
        if (currentY < SAFE_INSET) y.set(SAFE_INSET);
        const midpoint = (SAFE_INSET + right) / 2;
        setMenuSide(nextX < midpoint ? "right" : "left");
      }
    };

    update();
    const frame = window.requestAnimationFrame(update);
    const ro = new ResizeObserver(update);
    ro.observe(parent);
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [hasPositioned, isActive, x, y]);

  // Click-outside collapses the expanded pill.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointer = (event: PointerEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    window.addEventListener("pointerdown", handlePointer);
    return () => window.removeEventListener("pointerdown", handlePointer);
  }, [isOpen]);

  const handleDragStart = () => {
    draggingRef.current = true;
  };

  const handleDragEnd = () => {
    draggingRef.current = false;
    suppressClickUntilRef.current = Date.now() + DRAG_CLICK_SUPPRESS_MS;

    const currentX = x.get();
    const currentY = y.get();
    const midpoint = (constraints.left + constraints.right) / 2;
    // Snap to the nearest left/right edge with SAFE_INSET padding.
    const snappedX = currentX < midpoint ? constraints.left : constraints.right;
    x.set(snappedX);
    setMenuSide(snappedX < midpoint ? "right" : "left");
    // Keep Y in bounds.
    if (currentY < constraints.top) y.set(constraints.top);
    if (currentY > constraints.bottom) y.set(constraints.bottom);
  };

  const guardClick = (handler: () => void) => () => {
    if (Date.now() < suppressClickUntilRef.current) return;
    if (draggingRef.current) return;
    handler();
  };

  const toggleOpen = guardClick(() => {
    const midpoint = (constraints.left + constraints.right) / 2;
    setMenuSide(x.get() < midpoint ? "right" : "left");
    setIsOpen((prev) => !prev);
  });

  return (
    <motion.div
      ref={(node) => {
        containerRef.current = node;
        rootRef.current = node;
      }}
      drag
      dragMomentum={false}
      dragElastic={0.1}
      dragConstraints={constraints}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        x: springX,
        y: springY,
        touchAction: "none",
        // Hidden until the first layout pass measures the parent — avoids a flash
        // at (0,0) before snapping to the top-right resting position.
        visibility: hasPositioned ? "visible" : "hidden",
      }}
      className={cn(
        "z-20 flex items-center gap-1",
        menuSide === "left" && "flex-row-reverse"
      )}
    >
      <button
        type="button"
        aria-label={isOpen ? "Collapse mini-app menu" : "Expand mini-app menu"}
        aria-expanded={isOpen}
        onClick={toggleOpen}
        className={cn(
          "relative grid place-items-center overflow-hidden rounded-full border border-ink/10 bg-chrome shadow-[0_8px_24px_rgba(40,30,20,0.18)] backdrop-blur transition-colors hover:bg-surface-2 dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]",
          "h-11 w-11 cursor-grab active:cursor-grabbing"
        )}
      >
        <ApnaLogo size={22} />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="pill"
            initial={{ opacity: 0, scale: 0.85, x: menuSide === "left" ? 8 : -8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.85, x: menuSide === "left" ? 8 : -8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex items-center gap-1 rounded-full border border-ink/10 bg-chrome/95 p-1 text-ink-2 shadow-[0_8px_24px_rgba(40,30,20,0.12)] backdrop-blur dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
            style={{ transformOrigin: menuSide === "left" ? "right center" : "left center" }}
          >
            <Button
              type="button"
              size="icon"
              title="Customize mini-app components"
              aria-label="Customize mini-app components"
              className="h-8 w-8 bg-transparent text-ink-2 hover:bg-surface-2"
              onClick={guardClick(() => {
                onToggleHighlight();
                setIsOpen(false);
              })}
            >
              <Palette className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              title="Switch profile"
              aria-label="Switch profile"
              className="h-8 w-8 bg-transparent text-ink-2 hover:bg-surface-2"
              onClick={guardClick(() => {
                onSwitchProfile();
                setIsOpen(false);
              })}
            >
              <UserRound className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              className="h-8 w-8 bg-transparent text-ink-2 hover:bg-surface-2"
              onClick={guardClick(() => {
                onToggleFullscreen();
                setIsOpen(false);
              })}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
