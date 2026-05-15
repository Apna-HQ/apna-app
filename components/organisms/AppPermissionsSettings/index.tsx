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
      <div className="rounded-lg border bg-muted/40 p-4">
        <div className="flex items-start gap-3">
          <ShieldOff className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium">No app permissions yet</p>
            <p className="text-sm text-muted-foreground">
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
          className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="break-words text-sm font-medium">{appId}</p>
              <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                {permission.decision}
              </span>
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                {permission.scope}
              </span>
            </div>
            <p className="text-sm text-foreground">
              {describeCapability(permission.capability)}
            </p>
            <p className="break-all text-xs text-muted-foreground">
              {permission.capability}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
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
