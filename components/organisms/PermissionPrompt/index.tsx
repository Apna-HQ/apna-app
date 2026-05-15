'use client';

import { useMemo, useState } from 'react';
import type {
  Permission,
  PermissionDecision,
  PermissionScope,
} from '@apna/sdk';
import { ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { describeCapability } from '@/lib/apna-host/permissions';
import { cn } from '@/lib/utils';

export interface PermissionPromptProps {
  open: boolean;
  appId: string;
  appName?: string;
  capabilities: string[];
  onResolve: (permissions: Permission[]) => void;
  onCancel?: () => void;
}

const scopeLabels: Record<PermissionScope, string> = {
  once: 'Once',
  session: 'Session',
  always: 'Always',
};

export default function PermissionPrompt({
  open,
  appId,
  appName,
  capabilities,
  onResolve,
  onCancel,
}: PermissionPromptProps) {
  const [scope, setScope] = useState<PermissionScope>('once');
  const displayName = appName || appId;
  const uniqueCapabilities = useMemo(
    () => Array.from(new Set(capabilities)),
    [capabilities]
  );

  const resolveAll = (decision: PermissionDecision) => {
    onResolve(
      uniqueCapabilities.map((capability) => ({
        capability,
        decision,
        scope,
      }))
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel?.();
      }}
    >
      <DialogContent className="max-w-md rounded-lg p-0">
        <DialogHeader className="border-b px-5 py-4 text-left">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-base">Permission Request</DialogTitle>
              <p className="break-words text-sm text-muted-foreground">
                {displayName}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-2">
            {uniqueCapabilities.map((capability) => (
              <div
                key={capability}
                className="rounded-md border bg-background px-3 py-2"
              >
                <p className="text-sm font-medium">
                  {describeCapability(capability)}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  {capability}
                </p>
              </div>
            ))}
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Duration</span>
            <Select
              value={scope}
              onValueChange={(value) => setScope(value as PermissionScope)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['once', 'session', 'always'] as PermissionScope[]).map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {scopeLabels[value]}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t px-5 py-4">
          <Button
            type="button"
            variant="outline"
            className={cn('w-full')}
            onClick={() => resolveAll('deny')}
          >
            Deny
          </Button>
          <Button
            type="button"
            className={cn('w-full')}
            onClick={() => resolveAll('allow')}
          >
            Allow
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
