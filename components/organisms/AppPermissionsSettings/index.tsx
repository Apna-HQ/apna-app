'use client';

import { useEffect, useMemo, useState } from 'react';
import { ShieldOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  describeCapability,
  listAllPermissions,
  revokePermission,
  subscribeToPermissionChanges,
  type PermissionStoreSnapshot,
} from '@/lib/apna-host/permissions';
import { miniAppInstanceManager } from '@/lib/apna-host/instance-manager';

export default function AppPermissionsSettings() {
  const [snapshot, setSnapshot] = useState<PermissionStoreSnapshot>({});

  const refresh = () => setSnapshot(listAllPermissions());

  useEffect(() => {
    refresh();
    return subscribeToPermissionChanges(refresh);
  }, []);

  const entries = useMemo(
    () =>
      Object.entries(snapshot).flatMap(([appId, permissions]) =>
        Object.values(permissions).map((permission) => ({
          appId,
          permission,
        }))
      ),
    [snapshot]
  );

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-ink/10 bg-chrome p-4">
        <div className="flex items-start gap-3">
          <ShieldOff className="mt-0.5 h-5 w-5 text-ink-3" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink">No app permissions yet</p>
            <p className="text-sm text-ink-3">
              Permission decisions appear here after a mini-app asks to use a
              gated capability.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map(({ appId, permission }) => (
        <div
          key={`${appId}:${permission.capability}`}
          className="flex flex-col gap-3 rounded-lg border border-ink/10 bg-chrome p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="break-words text-sm font-medium text-ink">{appId}</p>
              <span className="rounded-md border border-ink/10 bg-surface px-2 py-1 text-xs font-medium text-amber-strong">
                {permission.decision}
              </span>
              <span className="rounded-md border border-ink/10 bg-shell px-2 py-1 text-xs font-medium text-ink-3">
                {permission.scope}
              </span>
            </div>
            <p className="text-sm text-ink-2">
              {describeCapability(permission.capability)}
            </p>
            <p className="break-all text-xs text-ink-3">
              {permission.capability}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-ink/10 bg-surface text-ink-2 hover:bg-surface-2"
            onClick={() => {
              revokePermission(appId, permission.capability);
              miniAppInstanceManager.emitToApp(appId, 'permissions:changed', {
                capability: permission.capability,
              });
            }}
          >
            Revoke
          </Button>
        </div>
      ))}
    </div>
  );
}
