/**
 * Unit tests for lib/apna-host/permissions.ts
 *
 * Runner: Node.js built-in `node:test` (Node 18+), executed with
 * `--experimental-strip-types` (Node 22) so no transpile step is needed and
 * no new test-runner dependency is introduced.
 *
 * Run:
 *   node --experimental-strip-types \
 *        lib/apna-host/__tests__/permissions.test.ts
 *
 * Or via the npm script added to package.json:
 *   npm test
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Permission, PermissionDecision, PermissionScope } from '@apna/sdk';

// ---------------------------------------------------------------------------
// Minimal window mock — must be set on globalThis BEFORE the module is first
// imported, because permissions.ts checks `typeof window` at call-time (not
// at module-evaluation time), so this is safe to do at the top of the file.
// ---------------------------------------------------------------------------

type EventHandler = (event: Event) => void;

function createWindowMock() {
  const storage = new Map<string, string>();
  const listeners = new Map<string, Set<EventHandler>>();

  return {
    localStorage: {
      getItem: (key: string): string | null => storage.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        storage.set(key, value);
      },
      removeItem: (key: string): void => {
        storage.delete(key);
      },
      clear: (): void => {
        storage.clear();
      },
      _storage: storage,
    },
    addEventListener: (type: string, handler: EventHandler): void => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
    },
    removeEventListener: (type: string, handler: EventHandler): void => {
      listeners.get(type)?.delete(handler);
    },
    dispatchEvent: (event: Event): boolean => {
      const ls = listeners.get(event.type);
      if (ls) {
        ls.forEach((l) => l(event));
      }
      return true;
    },
    _listeners: listeners,
    _reset: (): void => {
      storage.clear();
      listeners.clear();
    },
  };
}

// Install a fresh mock for the global window (one that survives module import).
// We keep a stable reference so each beforeEach can reset its internal state.
const windowMock = createWindowMock();
(globalThis as Record<string, unknown>).window = windowMock;

// Also expose CustomEvent (Node 22 has it globally but guard anyway)
if (typeof (globalThis as Record<string, unknown>).CustomEvent === 'undefined') {
  (globalThis as Record<string, unknown>).CustomEvent = class CustomEvent extends Event {
    readonly detail: unknown;
    constructor(type: string, options?: CustomEventInit) {
      super(type, options);
      this.detail = options?.detail ?? null;
    }
  };
}

// ---------------------------------------------------------------------------
// Import the module under test AFTER the window mock is in place.
// ---------------------------------------------------------------------------

import {
  PermissionGate,
  recordPermission,
  revokePermission,
  subscribeToPermissionChanges,
  clearSessionPermissions,
  listAllPermissions,
  listPermissions,
} from '../permissions.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a Permission object with sensible defaults. */
function perm(
  capability: string,
  decision: PermissionDecision = 'allow',
  scope: PermissionScope = 'always',
): Permission {
  return { capability, decision, scope };
}

/** Return a unique appId so module-level Maps don't bleed between tests. */
let idCounter = 0;
function uniqueAppId(): string {
  return `test-app-${++idCounter}`;
}

/**
 * Build a PermissionGate whose prompt always answers with the supplied
 * decision + scope for any capability requested.
 */
function makeGate(
  appId: string,
  decision: PermissionDecision = 'allow',
  scope: PermissionScope = 'always',
): { gate: PermissionGate; promptCallCount: () => number } {
  let calls = 0;
  const gate = new PermissionGate({
    appId,
    appName: 'Test App',
    prompt: async (req) => {
      calls++;
      return req.capabilities.map((cap) => perm(cap, decision, scope));
    },
  });
  return { gate, promptCallCount: () => calls };
}

// ---------------------------------------------------------------------------
// Reset shared state before each test.
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset the mock window (clears localStorage and event listeners).
  windowMock._reset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('always scope', () => {
  test('prompt is called only on the first check; subsequent checks return the standing decision without re-prompting', async () => {
    const appId = uniqueAppId();
    const { gate, promptCallCount } = makeGate(appId, 'allow', 'always');

    const r1 = await gate.check('nostr.signEvent');
    assert.equal(r1, 'allow');
    assert.equal(promptCallCount(), 1);

    // Second call: standing "always" decision exists → no prompt
    const r2 = await gate.check('nostr.signEvent');
    assert.equal(r2, 'allow');
    assert.equal(promptCallCount(), 1, 'prompt must not be called again for always scope');
  });

  test('concurrent checks for the same capability share a single prompt', async () => {
    const appId = uniqueAppId();
    let calls = 0;
    let resolvePrompt: (() => void) | undefined;
    const gate = new PermissionGate({
      appId,
      appName: 'Test App',
      prompt: async (req) => {
        calls++;
        return new Promise<Permission[]>((resolve) => {
          resolvePrompt = () =>
            resolve(
              req.capabilities.map((capability) =>
                perm(capability, 'allow', 'once')
              )
            );
        });
      },
    });

    const first = gate.check('identity.v1.me');
    const second = gate.check('identity.v1.me');
    await Promise.resolve();

    assert.equal(calls, 1, 'only one prompt should be opened for duplicate concurrent checks');
    resolvePrompt?.();
    assert.deepEqual(await Promise.all([first, second]), ['allow', 'allow']);
  });

  test('always decision is persisted to localStorage', async () => {
    const appId = uniqueAppId();
    const { gate } = makeGate(appId, 'allow', 'always');

    await gate.check('nostr.getPublicKey');

    const raw = windowMock.localStorage.getItem('apna_permission_grants_v1');
    assert.ok(raw, 'localStorage must contain a persisted grant');
    const parsed = JSON.parse(raw!) as Record<string, Record<string, Permission>>;
    assert.ok(
      parsed[appId]?.['nostr.getPublicKey'],
      'persisted store must contain the granted capability',
    );
    assert.equal(parsed[appId]['nostr.getPublicKey'].decision, 'allow');
    assert.equal(parsed[appId]['nostr.getPublicKey'].scope, 'always');
  });

  test('always grant from recordPermission is reflected without prompting', async () => {
    const appId = uniqueAppId();
    recordPermission(appId, perm('nostr.publish', 'allow', 'always'));

    const { gate, promptCallCount } = makeGate(appId);
    const r = await gate.check('nostr.publish');
    assert.equal(r, 'allow');
    assert.equal(promptCallCount(), 0, 'should not prompt when always grant pre-exists');
  });
});

describe('session scope', () => {
  test('prompt is called only once; subsequent checks in the same session return the standing decision', async () => {
    const appId = uniqueAppId();
    const { gate, promptCallCount } = makeGate(appId, 'allow', 'session');

    const r1 = await gate.check('nostr.signEvent');
    assert.equal(r1, 'allow');
    assert.equal(promptCallCount(), 1);

    const r2 = await gate.check('nostr.signEvent');
    assert.equal(r2, 'allow');
    assert.equal(promptCallCount(), 1, 'prompt must not be called again for session scope');
  });

  test('session decision is NOT persisted to localStorage', async () => {
    const appId = uniqueAppId();
    const { gate } = makeGate(appId, 'allow', 'session');

    await gate.check('nostr.nip04');

    const raw = windowMock.localStorage.getItem('apna_permission_grants_v1');
    // Either nothing in localStorage, or the appId is absent
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, Record<string, Permission>>;
      assert.ok(
        !parsed[appId]?.['nostr.nip04'],
        'session grant must not appear in localStorage',
      );
    }
    // If raw is null/empty, the assertion trivially passes.
  });

  test('session grant disappears after clearSessionPermissions', async () => {
    const appId = uniqueAppId();
    const { gate, promptCallCount } = makeGate(appId, 'allow', 'session');

    await gate.check('nostr.signEvent');
    assert.equal(promptCallCount(), 1);

    clearSessionPermissions(appId);

    // After clearing, must prompt again
    await gate.check('nostr.signEvent');
    assert.equal(promptCallCount(), 2, 'should re-prompt after session is cleared');
  });
});

describe('once scope', () => {
  test('a pre-recorded once grant is consumed by the first check, and the second check re-prompts', async () => {
    const appId = uniqueAppId();
    // Pre-record a once grant directly (simulating request() or host pre-auth)
    recordPermission(appId, perm('nostr.signEvent', 'allow', 'once'));

    const { gate, promptCallCount } = makeGate(appId, 'allow', 'once');

    // First check: consumes the standing "once" grant — no prompt
    const r1 = await gate.check('nostr.signEvent');
    assert.equal(r1, 'allow');
    assert.equal(promptCallCount(), 0, 'first check must consume the once grant without prompting');

    // Second check: grant consumed, must prompt
    const r2 = await gate.check('nostr.signEvent');
    assert.equal(r2, 'allow');
    assert.equal(promptCallCount(), 1, 'second check must prompt because once grant was consumed');
  });

  test('check() with once-scoped prompt result never stores the decision (always re-prompts)', async () => {
    const appId = uniqueAppId();
    const { gate, promptCallCount } = makeGate(appId, 'allow', 'once');

    // No pre-recorded grant; each call should prompt because once-scoped
    // decisions returned from prompt() are not stored.
    const r1 = await gate.check('nostr.publish');
    assert.equal(r1, 'allow');
    assert.equal(promptCallCount(), 1);

    const r2 = await gate.check('nostr.publish');
    assert.equal(r2, 'allow');
    assert.equal(promptCallCount(), 2, 'must prompt every time when prompt returns once scope');
  });

  test('deny outcome with once scope: resolved to deny and re-prompts on next call', async () => {
    const appId = uniqueAppId();
    // Pre-record a once deny
    recordPermission(appId, perm('nostr.signEvent', 'deny', 'once'));

    const { gate, promptCallCount } = makeGate(appId, 'allow', 'always');

    // First call consumes the deny grant
    const r1 = await gate.check('nostr.signEvent');
    assert.equal(r1, 'deny', 'should return deny from the once grant');
    assert.equal(promptCallCount(), 0);

    // Second call: once grant consumed, falls through to prompt → allow
    const r2 = await gate.check('nostr.signEvent');
    assert.equal(r2, 'allow');
    assert.equal(promptCallCount(), 1, 'must prompt after once deny is consumed');
  });
});

describe('deny outcome', () => {
  test('check() resolves to deny when the prompt returns a deny decision', async () => {
    const appId = uniqueAppId();
    const { gate, promptCallCount } = makeGate(appId, 'deny', 'always');

    const r = await gate.check('nostr.signEvent');
    assert.equal(r, 'deny');
    assert.equal(promptCallCount(), 1);
  });

  test('deny with always scope: subsequent checks return deny without re-prompting', async () => {
    const appId = uniqueAppId();
    const { gate, promptCallCount } = makeGate(appId, 'deny', 'always');

    const r1 = await gate.check('nostr.signEvent');
    assert.equal(r1, 'deny');
    assert.equal(promptCallCount(), 1);

    const r2 = await gate.check('nostr.signEvent');
    assert.equal(r2, 'deny');
    assert.equal(promptCallCount(), 1, 'deny+always should not re-prompt');
  });
});

describe('revoke', () => {
  test('revokePermission clears an always grant; the next check re-prompts', async () => {
    const appId = uniqueAppId();
    const { gate, promptCallCount } = makeGate(appId, 'allow', 'always');

    await gate.check('nostr.signEvent');
    assert.equal(promptCallCount(), 1);

    revokePermission(appId, 'nostr.signEvent');

    // Immediately after revoke (and BEFORE re-checking, which would re-record),
    // the grant must be gone from localStorage.
    const raw = windowMock.localStorage.getItem('apna_permission_grants_v1');
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, Record<string, Permission>>;
      assert.ok(
        !parsed[appId]?.['nostr.signEvent'],
        'revoked capability must not appear in localStorage',
      );
    }

    // After revoke, must re-prompt
    await gate.check('nostr.signEvent');
    assert.equal(promptCallCount(), 2, 'should re-prompt after always grant is revoked');
  });

  test('revokePermission clears a session grant; the next check re-prompts', async () => {
    const appId = uniqueAppId();
    const { gate, promptCallCount } = makeGate(appId, 'allow', 'session');

    await gate.check('nostr.nip44');
    assert.equal(promptCallCount(), 1);

    revokePermission(appId, 'nostr.nip44');

    await gate.check('nostr.nip44');
    assert.equal(promptCallCount(), 2, 'should re-prompt after session grant is revoked');
  });

  test('gate.revoke() delegates correctly and clears the standing grant', async () => {
    const appId = uniqueAppId();
    const { gate, promptCallCount } = makeGate(appId, 'allow', 'always');

    await gate.check('nostr.publish');
    assert.equal(promptCallCount(), 1);

    gate.revoke('nostr.publish');

    await gate.check('nostr.publish');
    assert.equal(promptCallCount(), 2, 'gate.revoke() must clear the standing grant');
  });
});

describe('subscribeToPermissionChanges', () => {
  test('fires with appId + capability when a grant is recorded', () => {
    const appId = uniqueAppId();
    const events: Array<{ appId: string; capability?: string }> = [];
    const unsub = subscribeToPermissionChanges((detail) => events.push(detail));

    recordPermission(appId, perm('nostr.signEvent', 'allow', 'always'));

    assert.equal(events.length, 1);
    assert.equal(events[0].appId, appId);
    assert.equal(events[0].capability, 'nostr.signEvent');

    unsub();
  });

  test('fires when a grant is revoked', () => {
    const appId = uniqueAppId();
    recordPermission(appId, perm('nostr.publish', 'allow', 'always'));

    const events: Array<{ appId: string; capability?: string }> = [];
    const unsub = subscribeToPermissionChanges((detail) => events.push(detail));

    revokePermission(appId, 'nostr.publish');

    assert.ok(events.length >= 1, 'at least one event must fire on revoke');
    assert.equal(events[events.length - 1].appId, appId);
    assert.equal(events[events.length - 1].capability, 'nostr.publish');

    unsub();
  });

  test('unsubscribe stops further notifications', () => {
    const appId = uniqueAppId();
    const events: Array<{ appId: string; capability?: string }> = [];
    const unsub = subscribeToPermissionChanges((detail) => events.push(detail));

    recordPermission(appId, perm('nostr.nip04', 'allow', 'session'));
    assert.equal(events.length, 1);

    unsub();

    // After unsub, no more events
    recordPermission(appId, perm('nostr.nip44', 'allow', 'session'));
    assert.equal(events.length, 1, 'no new events after unsubscribe');
  });

  test('fires on check() that results in a new always grant', async () => {
    const appId = uniqueAppId();
    const events: Array<{ appId: string; capability?: string }> = [];
    const unsub = subscribeToPermissionChanges((detail) => events.push(detail));

    const { gate } = makeGate(appId, 'allow', 'always');
    await gate.check('nostr.getPublicKey');

    assert.ok(events.some(e => e.appId === appId && e.capability === 'nostr.getPublicKey'),
      'change event must fire when check() records an always grant');

    unsub();
  });
});

describe('listPermissions / listAllPermissions', () => {
  test('listPermissions returns all standing grants for an appId across all scopes', () => {
    const appId = uniqueAppId();
    recordPermission(appId, perm('nostr.signEvent', 'allow', 'always'));
    recordPermission(appId, perm('nostr.publish', 'allow', 'session'));
    recordPermission(appId, perm('nostr.nip04', 'allow', 'once'));

    const result = listPermissions(appId);
    const caps = result.map(p => p.capability);
    assert.ok(caps.includes('nostr.signEvent'), 'always grant must appear');
    assert.ok(caps.includes('nostr.publish'), 'session grant must appear');
    assert.ok(caps.includes('nostr.nip04'), 'once grant must appear');
  });

  test('listAllPermissions snapshot includes records from all stores', () => {
    const appId1 = uniqueAppId();
    const appId2 = uniqueAppId();
    recordPermission(appId1, perm('nostr.signEvent', 'allow', 'always'));
    recordPermission(appId2, perm('nostr.publish', 'allow', 'session'));

    const snapshot = listAllPermissions();
    assert.ok(snapshot[appId1]?.['nostr.signEvent'], 'always grant must appear in snapshot');
    assert.ok(snapshot[appId2]?.['nostr.publish'], 'session grant must appear in snapshot');
  });
});

describe('open capabilities (caller responsibility note)', () => {
  test('PermissionGate.check() calls the prompt for every unrecognized / open capability — gating open caps is the caller\'s responsibility', async () => {
    // The spec states "open capabilities must never reach the gate".
    // PermissionGate itself has no concept of "open" — the capability string is
    // opaque to it. It is the caller (ApnaHost capability router) that must
    // short-circuit before calling gate.check() for open capabilities.
    // This test documents that expectation: if an "open" capability accidentally
    // reaches the gate, it will be treated like any other → prompt is invoked.
    const appId = uniqueAppId();
    const { gate, promptCallCount } = makeGate(appId, 'allow', 'always');

    await gate.check('open.someCapability');
    assert.equal(promptCallCount(), 1, 'gate prompts for any capability string; open filtering is the caller\'s concern');
  });
});
