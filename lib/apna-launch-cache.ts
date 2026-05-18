import type { AppCategory, AppDefaultDisplay, AppHosting } from "@/lib/types/apps";

const LAUNCH_PAYLOAD_PREFIX = "apna:launch:";

export interface ShellLaunchPayload {
  id: string;
  appName: string;
  appURL?: string;
  htmlContent?: string;
  hosting?: AppHosting;
  isGeneratedApp?: boolean;
  blossomUrl?: string;
  sha256?: string;
  categories?: AppCategory[];
  description?: string;
  defaultDisplay?: AppDefaultDisplay;
}

export function writeShellLaunchPayload(payload: ShellLaunchPayload) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      `${LAUNCH_PAYLOAD_PREFIX}${payload.id}`,
      JSON.stringify(payload)
    );
  } catch {
    // Session storage is opportunistic; URL params still cover external apps.
  }
}

export function readShellLaunchPayload(appId: string): ShellLaunchPayload | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(`${LAUNCH_PAYLOAD_PREFIX}${appId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShellLaunchPayload;
    return parsed?.id === appId ? parsed : null;
  } catch {
    return null;
  }
}

export function clearShellLaunchPayload(appId: string) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(`${LAUNCH_PAYLOAD_PREFIX}${appId}`);
  } catch {
    // No-op.
  }
}
