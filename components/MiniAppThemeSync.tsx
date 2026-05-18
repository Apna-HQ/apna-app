"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

import { miniAppInstanceManager } from "@/lib/apna-host/instance-manager";
import {
  HOST_THEME_CHANGED_EVENT,
  normalizeHostTheme,
  setCurrentHostTheme,
} from "@/lib/apna-host/theme-sync";

export default function MiniAppThemeSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const theme = normalizeHostTheme(resolvedTheme);
    if (!theme) return;

    const payload = setCurrentHostTheme(theme);
    miniAppInstanceManager.emitToAll(HOST_THEME_CHANGED_EVENT, payload);
  }, [resolvedTheme]);

  return null;
}
