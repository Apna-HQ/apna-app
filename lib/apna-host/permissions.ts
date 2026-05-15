import type {
  Permission,
  PermissionDecision,
  PermissionScope,
} from '@apna/sdk';

export type PermissionByCapability = Record<string, Permission>;
export type PermissionStoreSnapshot = Record<string, PermissionByCapability>;

export interface PermissionPromptRequest {
  appId: string;
  appName?: string;
  capabilities: string[];
}

export type PermissionPromptResult = Permission[];

export type PermissionPromptHandler = (
  request: PermissionPromptRequest
) => Promise<PermissionPromptResult>;

export interface PermissionGateOptions {
  appId: string;
  appName?: string;
  prompt: PermissionPromptHandler;
}

const STORAGE_KEY = 'apna_permission_grants_v1';
const CHANGE_EVENT = 'apna:permissions-changed';

const sessionPermissions = new Map<string, Map<string, Permission>>();
const oncePermissions = new Map<string, Map<string, Permission>>();

export class PermissionGate {
  readonly appId: string;
  readonly appName?: string;

  private readonly prompt: PermissionPromptHandler;

  constructor(options: PermissionGateOptions) {
    this.appId = options.appId;
    this.appName = options.appName;
    this.prompt = options.prompt;
  }

  async check(capability: string): Promise<PermissionDecision> {
    const standing = getPermission(this.appId, capability, {
      consumeOnce: true,
    });
    if (standing) {
      return standing.decision;
    }

    const [decision] = await this.prompt({
      appId: this.appId,
      appName: this.appName,
      capabilities: [capability],
    });
    if (!decision || decision.capability !== capability) {
      return 'deny';
    }

    if (decision.scope !== 'once') {
      recordPermission(this.appId, decision);
    }
    return decision.decision;
  }

  async request(capabilities: string[]): Promise<Permission[]> {
    if (capabilities.length === 0) return [];
    const existing: Permission[] = [];
    const missing: string[] = [];

    capabilities.forEach((capability) => {
      const permission = getPermission(this.appId, capability, {
        consumeOnce: false,
      });
      if (permission) {
        existing.push(permission);
      } else {
        missing.push(capability);
      }
    });

    if (missing.length === 0) return existing;

    const prompted = await this.prompt({
      appId: this.appId,
      appName: this.appName,
      capabilities: missing,
    });
    prompted.forEach((permission) => {
      recordPermission(this.appId, permission);
    });
    return [...existing, ...prompted];
  }

  query(): Permission[] {
    return listPermissions(this.appId);
  }

  revoke(capability: string): void {
    revokePermission(this.appId, capability);
  }
}

export function listPermissions(appId: string): Permission[] {
  const merged = new Map<string, Permission>();
  Object.values(readPersistentStore()[appId] ?? {}).forEach((permission) => {
    merged.set(permission.capability, permission);
  });
  sessionPermissions.get(appId)?.forEach((permission) => {
    merged.set(permission.capability, permission);
  });
  oncePermissions.get(appId)?.forEach((permission) => {
    merged.set(permission.capability, permission);
  });
  return Array.from(merged.values()).sort((a, b) =>
    a.capability.localeCompare(b.capability)
  );
}

export function listAllPermissions(): PermissionStoreSnapshot {
  const snapshot: PermissionStoreSnapshot = { ...readPersistentStore() };

  sessionPermissions.forEach((permissions, appId) => {
    snapshot[appId] = {
      ...(snapshot[appId] ?? {}),
      ...Object.fromEntries(permissions),
    };
  });
  oncePermissions.forEach((permissions, appId) => {
    snapshot[appId] = {
      ...(snapshot[appId] ?? {}),
      ...Object.fromEntries(permissions),
    };
  });

  return snapshot;
}

export function recordPermission(appId: string, permission: Permission): void {
  if (permission.scope === 'always') {
    const store = readPersistentStore();
    store[appId] = {
      ...(store[appId] ?? {}),
      [permission.capability]: permission,
    };
    writePersistentStore(store);
  } else if (permission.scope === 'session') {
    getMemoryStore(sessionPermissions, appId).set(
      permission.capability,
      permission
    );
  } else {
    getMemoryStore(oncePermissions, appId).set(
      permission.capability,
      permission
    );
  }
  emitPermissionChange(appId, permission.capability);
}

export function revokePermission(appId: string, capability: string): void {
  const store = readPersistentStore();
  if (store[appId]?.[capability]) {
    delete store[appId][capability];
    if (Object.keys(store[appId]).length === 0) {
      delete store[appId];
    }
    writePersistentStore(store);
  }
  sessionPermissions.get(appId)?.delete(capability);
  oncePermissions.get(appId)?.delete(capability);
  emitPermissionChange(appId, capability);
}

export function clearSessionPermissions(appId: string): void {
  sessionPermissions.delete(appId);
  oncePermissions.delete(appId);
  emitPermissionChange(appId);
}

export function subscribeToPermissionChanges(
  listener: (detail: { appId: string; capability?: string }) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    listener((event as CustomEvent).detail);
  };
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

export function describeCapability(capability: string): string {
  const descriptions: Record<string, string> = {
    'nostr.getPublicKey': 'Read your active public key',
    'nostr.signEvent': 'Ask your active profile to sign an event',
    'nostr.publish': 'Sign and publish a Nostr event',
    'nostr.nip04': 'Encrypt or decrypt a NIP-04 message',
    'nostr.nip44': 'Encrypt or decrypt a NIP-44 message',
    'identity.v1.updateProfile': 'Update your public profile metadata',
    'social.v1.publishNote': 'Publish a note',
    'social.v1.like': 'Like a note',
    'social.v1.reply': 'Reply to a note',
    'social.v1.repost': 'Repost a note',
    'social.v1.follow': 'Follow a user',
    'social.v1.unfollow': 'Unfollow a user',
  };
  return descriptions[capability] ?? capability;
}

function getPermission(
  appId: string,
  capability: string,
  options: { consumeOnce: boolean }
): Permission | undefined {
  const once = oncePermissions.get(appId)?.get(capability);
  if (once) {
    if (options.consumeOnce) {
      oncePermissions.get(appId)?.delete(capability);
      emitPermissionChange(appId, capability);
    }
    return once;
  }

  const session = sessionPermissions.get(appId)?.get(capability);
  if (session) return session;

  return readPersistentStore()[appId]?.[capability];
}

function getMemoryStore(
  root: Map<string, Map<string, Permission>>,
  appId: string
): Map<string, Permission> {
  const existing = root.get(appId);
  if (existing) return existing;
  const created = new Map<string, Permission>();
  root.set(appId, created);
  return created;
}

function readPersistentStore(): PermissionStoreSnapshot {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PermissionStoreSnapshot;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePersistentStore(store: PermissionStoreSnapshot): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function emitPermissionChange(appId: string, capability?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(CHANGE_EVENT, {
      detail: { appId, capability },
    })
  );
}
