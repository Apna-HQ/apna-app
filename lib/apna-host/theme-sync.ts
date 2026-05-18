import type { MiniAppInstance } from "./instance-manager";

export const HOST_THEME_CHANGED_EVENT = "theme:changed";

export type HostResolvedTheme = "light" | "dark";

export interface HostThemePayload {
  theme: HostResolvedTheme;
}

let latestHostTheme: HostResolvedTheme | null = null;

export function normalizeHostTheme(value: unknown): HostResolvedTheme | null {
  return value === "dark" || value === "light" ? value : null;
}

export function getCurrentHostTheme(): HostResolvedTheme {
  if (latestHostTheme) return latestHostTheme;
  if (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  ) {
    return "dark";
  }
  return "light";
}

export function setCurrentHostTheme(theme: HostResolvedTheme): HostThemePayload {
  latestHostTheme = theme;
  return { theme };
}

export function emitHostThemeToInstance(instance: MiniAppInstance): void {
  instance.emit(HOST_THEME_CHANGED_EVENT, { theme: getCurrentHostTheme() });
}
