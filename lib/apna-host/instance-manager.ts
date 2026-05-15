import { ApnaHost, IframeChannel } from '@apna/sdk';
import type { CapabilityHandlers, IHostMethodHandlers } from '@apna/sdk';

import { PermissionGate, type PermissionPromptHandler } from './permissions';

export type MiniAppInstanceStatus = 'active' | 'suspended';

export interface MiniAppInstance {
  instanceId: string;
  appId: string;
  appName?: string;
  iframe: HTMLIFrameElement;
  apnaHost: ApnaHost;
  permissionGate?: PermissionGate;
  status: MiniAppInstanceStatus;
  emit: (event: string, payload?: unknown) => void;
  dispose: () => void;
}

export interface CreateMiniAppInstanceOptions {
  appId: string;
  appName?: string;
  iframe: HTMLIFrameElement;
  handlers?: CapabilityHandlers;
  methodHandlers?: IHostMethodHandlers;
  permissionPrompt?: PermissionPromptHandler;
  designRemote?: string;
}

const MAX_ACTIVE_INSTANCES = 1;

class MiniAppInstanceManager {
  private readonly instances = new Map<string, MiniAppInstance>();

  create(options: CreateMiniAppInstanceOptions): MiniAppInstance {
    this.enforceActiveCap();

    const instanceId = createInstanceId();
    const permissionGate = options.permissionPrompt
      ? new PermissionGate({
          appId: options.appId,
          appName: options.appName,
          prompt: options.permissionPrompt,
        })
      : undefined;

    const apnaHost = new ApnaHost({
      handlers: options.handlers,
      methodHandlers: options.methodHandlers,
      channel: new IframeChannel({
        getTarget: () => options.iframe.contentWindow,
        filterBySource: true,
      }),
      permissionGate,
      designRemote: options.designRemote,
    });

    const instance: MiniAppInstance = {
      instanceId,
      appId: options.appId,
      appName: options.appName,
      iframe: options.iframe,
      apnaHost,
      permissionGate,
      status: 'active',
      emit: (event, payload) => {
        (apnaHost as unknown as { emit: (e: string, p?: unknown) => void }).emit(
          event,
          payload
        );
      },
      dispose: () => {
        apnaHost.dispose();
        this.instances.delete(instanceId);
      },
    };

    this.instances.set(instanceId, instance);
    return instance;
  }

  get(instanceId: string): MiniAppInstance | undefined {
    return this.instances.get(instanceId);
  }

  listByApp(appId: string): MiniAppInstance[] {
    return Array.from(this.instances.values()).filter(
      (instance) => instance.appId === appId
    );
  }

  emitToApp(appId: string, event: string, payload?: unknown): void {
    this.listByApp(appId).forEach((instance) => {
      instance.emit(event, payload);
    });
  }

  dispose(instanceId: string): void {
    this.instances.get(instanceId)?.dispose();
  }

  disposeAll(): void {
    Array.from(this.instances.values()).forEach((instance) =>
      instance.dispose()
    );
  }

  private enforceActiveCap(): void {
    const active = Array.from(this.instances.values()).filter(
      (instance) => instance.status === 'active'
    );
    if (active.length < MAX_ACTIVE_INSTANCES) return;

    active
      .slice(0, active.length - MAX_ACTIVE_INSTANCES + 1)
      .forEach((instance) => instance.dispose());
  }
}

export const miniAppInstanceManager = new MiniAppInstanceManager();

function createInstanceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `apna-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
