'use client';

import { useMemo, useState } from 'react';
import type {
  Permission,
  PermissionDecision,
  PermissionScope,
} from '@apna/sdk';
import { Clock3, KeyRound, ShieldCheck } from 'lucide-react';

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
      <DialogContent className="max-w-[460px] overflow-hidden rounded-xl border-ink/15 bg-shell p-0 text-ink shadow-[0_18px_70px_rgba(40,30,20,0.28)]">
        <DialogHeader className="border-b border-ink/10 bg-chrome px-5 py-4 text-left">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-soft text-amber-strong">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-base">
                {displayName} wants access
              </DialogTitle>
              <p className="break-words text-sm text-ink-3">
                Apna will grant these capabilities to this mini-app only.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-2">
            {uniqueCapabilities.map((capability) => (
              <div
                key={capability}
                className="rounded-lg border border-ink/10 bg-surface px-3 py-2.5"
              >
                <div className="flex items-start gap-2">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-mark" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {describeCapability(capability)}
                    </p>
                    <p className="break-all font-mono text-[11px] text-ink-3">
                      {capability}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-ink/10 bg-chrome px-3 py-2.5 text-xs leading-5 text-ink-3">
            Denying keeps the mini-app open, but the requested action may fail.
            You can revoke saved grants later from settings.
          </div>

          <label className="block space-y-2">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Clock3 className="h-4 w-4 text-ink-3" />
              Duration
            </span>
            <Select
              value={scope}
              onValueChange={(value) => setScope(value as PermissionScope)}
            >
              <SelectTrigger className="border-ink/15 bg-surface">
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

          <div className="flex items-center justify-between gap-3 font-mono text-[11px] text-ink-3">
            <span>
              {uniqueCapabilities.length} capability request
              {uniqueCapabilities.length === 1 ? '' : 's'}
            </span>
            <span className="min-w-0 truncate">{appId}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-ink/10 bg-chrome px-5 py-4">
          <Button
            type="button"
            variant="outline"
            className={cn(
              'w-full border-ink/15 bg-surface text-ink-2 hover:bg-shell'
            )}
            onClick={() => resolveAll('deny')}
          >
            Deny
          </Button>
          <Button
            type="button"
            className={cn('w-full bg-ink text-shell hover:bg-ink/85')}
            onClick={() => resolveAll('allow')}
          >
            Allow
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
