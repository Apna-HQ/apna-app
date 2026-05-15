"use client";

/**
 * GeneratedAppModal — AI-iteration variant of the unified mini-app loader.
 *
 * This module re-exports MiniAppModal with `hosting='nostr'` and `showIteration=true`
 * pre-set, so existing call-sites that import GeneratedAppModal and pass
 * { htmlContent, messages, onUpdate } continue to work unchanged.
 *
 * Implementation note (HOST-020 modal-fold approach):
 *   MiniAppModal/index.tsx is the single canonical loader keyed off `hosting`.
 *   GeneratedAppModal is kept as a thin wrapper/re-export so its import path and
 *   prop interface remain stable — no changes required at call-sites.
 */

import MiniAppModal, { type MiniAppModalProps } from "@/components/organisms/MiniAppModal";
import { ChatMessage, GeneratedApp } from "@/lib/generatedAppsDB";

export interface GeneratedAppModalProps {
  isOpen: boolean;
  htmlContent: string;
  appId: string;
  appName?: string;
  messages?: ChatMessage[];
  onClose: () => void;
  onUpdate?: (app: GeneratedApp) => void;
}

export default function GeneratedAppModal({
  isOpen,
  htmlContent,
  appId,
  appName,
  messages = [],
  onClose,
  onUpdate,
}: GeneratedAppModalProps) {
  return (
    <MiniAppModal
      isOpen={isOpen}
      htmlContent={htmlContent}
      appId={appId}
      appName={appName}
      hosting="nostr"
      onClose={onClose}
      messages={messages}
      onUpdate={onUpdate}
      showIteration={true}
    />
  );
}
