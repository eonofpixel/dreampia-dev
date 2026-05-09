/**
 * PluginWorkerPool leak test (v2.3.0 US-506 / AC-9.5).
 *
 * 10× spawn-exit-restart cycles. After each cycle, assert that:
 *   - eventBus.activeSubscriptions count returns to baseline (0)
 *   - abortRegistry.inflightCount returns to baseline (0)
 *   - subscription_id is never reused across cycles
 *
 * Uses the real `HostEventBus` + `HostAbortRegistry` rather than mocks, because
 * the leak test is specifically about the integration between pool and
 * registry cleanup paths.
 */

import { describe, it, expect } from 'vitest';
import {
  HostPluginWorkerPool,
  type PoolWorkerHandle,
  type PoolSpawnFn,
} from '../../../src/main/plugins/PluginWorkerPool';
import { HostEventBus } from '../../../src/main/plugins/eventBus';
import { HostAbortRegistry } from '../../../src/main/plugins/hostBridge/abortRegistry';
import type {
  PluginToHostMessage,
  GrantLedger,
  PluginWorkerManifestShape,
  HostPriorityMessage,
} from '../../../src/main/plugins/poolInterfaces';
import { TOPIC_AUDIT_LOG } from '../../../src/main/plugins/topicPublishers';

interface MockHandle extends PoolWorkerHandle {
  posted: Array<HostPriorityMessage | { type: 'host-rpc'; call_id: string; method: string; params: unknown }>;
  fireMessage: (msg: PluginToHostMessage) => void;
  fireExit: (code: number | null) => void;
}

function createHandle(pid: number): MockHandle {
  let messageListener: ((m: PluginToHostMessage) => void) | null = null;
  let exitListener: ((code: number | null) => void) | null = null;
  const handle: MockHandle = {
    pid,
    posted: [],
    fireMessage: (m) => messageListener?.(m),
    fireExit: (code) => exitListener?.(code),
    postMessage: (m) => {
      handle.posted.push(m);
    },
    on: (_event, listener) => {
      messageListener = listener;
    },
    onExit: (listener) => {
      exitListener = listener;
    },
    kill: () => {},
  };
  return handle;
}

function makeGrantLedger(): GrantLedger {
  const epochs = new Map<string, number>();
  return {
    bumpEpoch: (id) => {
      const next = (epochs.get(id) ?? 0) + 1;
      epochs.set(id, next);
      return next;
    },
    currentEpoch: (id) => epochs.get(id) ?? 0,
    isStaleAt: (id, snap) => snap < (epochs.get(id) ?? 0),
  };
}

function manifest(): PluginWorkerManifestShape {
  return {
    plugin_id: 'p1',
    entrypoint: 'dist/index.js',
    capabilities: ['host.audit.write'],
    runtime: { node: '^20', heartbeat_interval_ms: 60 * 60 * 1000 }, // disable heartbeat
  };
}

describe('v2.3.0 US-506 — 10× spawn-exit-restart leak test', () => {
  it('subscription registry + abort registry return to baseline after each cycle', async () => {
    const eventBus = new HostEventBus({ onDeliver: () => {} });
    const abortRegistry = new HostAbortRegistry();
    const grantLedger = makeGrantLedger();
    const spawned: MockHandle[] = [];
    let nextPid = 100;

    const spawnFn: PoolSpawnFn = () => {
      const h = createHandle(nextPid++);
      spawned.push(h);
      return h;
    };

    // Use a no-op scheduler to avoid heartbeat firing during the test.
    const pool = new HostPluginWorkerPool({
      spawnFn,
      workerEntryPath: '/fake/entry.js',
      grantLedger,
      subscriptionRegistry: eventBus,
      abortRegistry,
      heartbeatIntervalMs: 60 * 60 * 1000,
      memoryProbe: undefined,
      onQuarantine: () => {},
    });

    const seenSubIds = new Set<string>();

    for (let cycle = 0; cycle < 10; cycle += 1) {
      // Baseline before spawn
      expect(eventBus.listForPlugin('p1').length).toBe(0);
      expect(abortRegistry.inflightForPlugin('p1')).toBe(0);

      // Spawn
      await pool.spawn('p1', manifest());
      const handle = spawned[spawned.length - 1]!;

      // Plugin subscribes
      const sub_id = eventBus.newSubscriptionId();
      expect(seenSubIds.has(sub_id)).toBe(false);
      seenSubIds.add(sub_id);
      handle.fireMessage({
        type: 'plugin-subscribe',
        subscription_id: sub_id,
        topic: TOPIC_AUDIT_LOG,
      });
      expect(eventBus.listForPlugin('p1').length).toBe(1);

      // Plugin issues an in-flight RPC (we don't await — pool registers an
      // abort entry on the worker side via dispatcher; here we simulate by
      // creating an abort entry directly).
      const abortHandle = abortRegistry.create('p1', `c-${cycle}`, handle.pid);
      expect(abortRegistry.inflightForPlugin('p1')).toBe(1);

      // Worker exits — pool.handleWorkerExit fires:
      //   - subscriptionRegistry.removeAllForPid(pid)
      //   - abortRegistry.abortAllForPid(pid)
      handle.fireExit(0);

      // Allow microtasks to settle (recordRestart schedules backoff timeout
      // that we don't actually wait for in this leak test).
      await Promise.resolve();

      // Force the pool out of restart so next cycle gets a fresh worker.
      // We accept that the worker enters 'restarting' and quarantines after 5
      // exits; reset quarantine + worker map between cycles to keep going.
      if (cycle >= 4) {
        pool.resetQuarantine('p1');
      }

      // Assertions: registries cleaned up
      expect(eventBus.listForPlugin('p1').length).toBe(0);
      expect(abortRegistry.inflightForPlugin('p1')).toBe(0);
      expect(abortHandle.signal.aborted).toBe(true);
    }

    // 10 unique subscription_ids — never reused
    expect(seenSubIds.size).toBe(10);
    expect(eventBus.revokedIdsCount()).toBe(10);
  });
});
