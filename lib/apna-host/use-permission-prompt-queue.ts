"use client";

import { useCallback, useRef, useState } from "react";

import type {
  PermissionPromptHandler,
  PermissionPromptRequest,
  PermissionPromptResult,
} from "@/lib/apna-host/permissions";

interface PendingPermissionPrompt {
  request: PermissionPromptRequest;
  resolve: (permissions: PermissionPromptResult) => void;
}

function denyAll(request: PermissionPromptRequest): PermissionPromptResult {
  return request.capabilities.map((capability) => ({
    capability,
    decision: "deny",
    scope: "once",
  }));
}

export function usePermissionPromptQueue(): {
  activePermissionRequest: PermissionPromptRequest | null;
  permissionPrompt: PermissionPromptHandler;
  resolveActivePermissionPrompt: (permissions: PermissionPromptResult) => void;
  cancelActivePermissionPrompt: () => void;
  clearPermissionPrompts: () => void;
} {
  const queueRef = useRef<PendingPermissionPrompt[]>([]);
  const activePromptRef = useRef<PendingPermissionPrompt | null>(null);
  const [activePrompt, setActivePrompt] =
    useState<PendingPermissionPrompt | null>(null);

  const showNextPrompt = useCallback(() => {
    if (activePromptRef.current) return;
    const next = queueRef.current.shift() ?? null;
    activePromptRef.current = next;
    setActivePrompt(next);
  }, []);

  const advance = useCallback(() => {
    const next = queueRef.current.shift() ?? null;
    activePromptRef.current = next;
    setActivePrompt(next);
  }, []);

  const permissionPrompt = useCallback<PermissionPromptHandler>(
    (request) =>
      new Promise((resolve) => {
        queueRef.current.push({ request, resolve });
        showNextPrompt();
      }),
    [showNextPrompt]
  );

  const resolveActivePermissionPrompt = useCallback(
    (permissions: PermissionPromptResult) => {
      const active = activePromptRef.current;
      if (!active) return;
      active.resolve(permissions);
      advance();
    },
    [advance]
  );

  const cancelActivePermissionPrompt = useCallback(() => {
    const active = activePromptRef.current;
    if (!active) return;
    active.resolve(denyAll(active.request));
    advance();
  }, [advance]);

  const clearPermissionPrompts = useCallback(() => {
    const active = activePromptRef.current;
    if (active) {
      active.resolve(denyAll(active.request));
    }
    queueRef.current.forEach((pending) => {
      pending.resolve(denyAll(pending.request));
    });
    queueRef.current = [];
    activePromptRef.current = null;
    setActivePrompt(null);
  }, []);

  return {
    activePermissionRequest: activePrompt?.request ?? null,
    permissionPrompt,
    resolveActivePermissionPrompt,
    cancelActivePermissionPrompt,
    clearPermissionPrompts,
  };
}
