/**
 * eventBus — host-side pub/sub bus for ADR-0005 plugin event stream.
 *
 * Spec: docs/adr/0009-plugin-worker-lifecycle.md, .omc/plans/v2.3.0-plugin-ga.md §4 Phase 5A.4 (US-503), gate G5.
 *
 * Responsibilities:
 *   - Bounded queue per subscription (default 1000 events) with drop-oldest +
 *     audit warn on overflow.
 *   - Priority lane for revoke events: bypasses bounded queue, pre-empts any
 *     pending publish (G5 codex).
 *   - Per-topic FIFO ordering (monotonic seq).
 *   - Cryptographically random subscription_id (32-byte hex) — never reused
 *     after revoke.
 *   - PID-keyed subscription removal (for worker exit cleanup).
 *
 * Implements `SubscriptionRegistry` from `poolInterfaces.ts` plus a publish
 * surface for `topicPublishers.ts` (US-504).
 */

import { randomBytes } from 'node:crypto';
import type { SubscriptionRegistry as SubscriptionRegistryInterface } from './poolInterfaces';

export interface EventEnvelope {
  subscription_id: string;
  topic: string;
  seq: number;
  payload: unknown;
  /** True if this event was delivered via the priority lane (revoke). */
  priority: boolean;
}

export interface EventBusOptions {
  /** Default 1000. Per-subscription queue cap. */
  queueCap?: number;
  /** Audit hook on drops + revoke deliveries. */
  auditSink?: (event: EventBusAuditEvent) => void;
  /**
   * Delivery callback — called when an event should be sent to the
   * subscriber's worker. Production wires `pool.get(plugin_id).postPriority`
   * for priority + a worker-side queue post for normal delivery.
   */
  onDeliver: (plugin_id: string, env: EventEnvelope) => void;
  /** Test seq + id sources. */
  randomBytesFn?: (size: number) => Buffer;
}

export interface EventBusAuditEvent {
  timestamp: string;
  kind: 'event.dropped' | 'event.priority_delivered' | 'event.published';
  plugin_id: string;
  topic: string;
  subscription_id: string;
  detail?: string;
}

interface Subscription {
  subscription_id: string;
  plugin_id: string;
  pid: number;
  topic: string;
  /** Bounded queue (in-memory) — drop-oldest on overflow. */
  queue: EventEnvelope[];
  /** Per-subscription monotonic seq. */
  nextSeq: number;
}

/**
 * Per-topic publisher seq is global (across all subscribers of the same
 * topic) so that two subscribers see the same ordering. Subscription seq is
 * derivative: each subscription tracks the topic seq at delivery time.
 *
 * For ADR-0005 v1, a single-counter-per-topic is sufficient. Multiple
 * publishers on the same topic must share this counter to preserve FIFO.
 */
export class HostEventBus implements SubscriptionRegistryInterface {
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly byPlugin = new Map<string, Set<string>>();
  private readonly byPid = new Map<number, Set<string>>();
  private readonly byTopic = new Map<string, Set<string>>();
  private readonly topicSeq = new Map<string, number>();
  /** Subscription IDs that were revoked — must never be reused. */
  private readonly revokedIds = new Set<string>();
  private readonly opts: Required<Omit<EventBusOptions, 'auditSink' | 'randomBytesFn'>> & {
    auditSink: (e: EventBusAuditEvent) => void;
    randomBytesFn: (size: number) => Buffer;
  };

  constructor(options: EventBusOptions) {
    this.opts = {
      queueCap: options.queueCap ?? 1000,
      onDeliver: options.onDeliver,
      auditSink: options.auditSink ?? ((): void => {}),
      randomBytesFn: options.randomBytesFn ?? randomBytes,
    };
  }

  /**
   * Issue a new subscription_id (32-byte hex). Never reuses revoked ids.
   * Caller (pool, on `plugin-subscribe` from worker) passes this to `add()`.
   */
  newSubscriptionId(): string {
    let id: string;
    do {
      id = this.opts.randomBytesFn(32).toString('hex');
    } while (this.revokedIds.has(id) || this.subscriptions.has(id));
    return id;
  }

  // ──────────────────────────────────────────────────────────
  // SubscriptionRegistry interface
  // ──────────────────────────────────────────────────────────

  add(plugin_id: string, pid: number, subscription_id: string, topic: string): void {
    if (this.revokedIds.has(subscription_id)) {
      throw new Error(`subscription_id ${subscription_id} previously revoked`);
    }
    const sub: Subscription = {
      subscription_id,
      plugin_id,
      pid,
      topic,
      queue: [],
      nextSeq: 0,
    };
    this.subscriptions.set(subscription_id, sub);
    indexAdd(this.byPlugin, plugin_id, subscription_id);
    indexAdd(this.byPid, pid, subscription_id);
    indexAdd(this.byTopic, topic, subscription_id);
  }

  removeOne(subscription_id: string): void {
    const sub = this.subscriptions.get(subscription_id);
    if (sub === undefined) return;
    this.subscriptions.delete(subscription_id);
    indexRemove(this.byPlugin, sub.plugin_id, subscription_id);
    indexRemove(this.byPid, sub.pid, subscription_id);
    indexRemove(this.byTopic, sub.topic, subscription_id);
    this.revokedIds.add(subscription_id);
  }

  removeAllForPid(pid: number): void {
    const ids = this.byPid.get(pid);
    if (ids === undefined) return;
    for (const id of Array.from(ids)) {
      this.removeOne(id);
    }
  }

  removeForCapability(plugin_id: string, capability: string): void {
    // Capability → topic mapping is convention-based: e.g. host.audit.write
    // grants subscribe to topic 'audit.log'. We use a simple prefix match —
    // any topic that the capability "namespaces" is removed.
    const ids = this.byPlugin.get(plugin_id);
    if (ids === undefined) return;
    const prefix = capabilityToTopicPrefix(capability);
    for (const id of Array.from(ids)) {
      const sub = this.subscriptions.get(id);
      if (sub !== undefined && sub.topic.startsWith(prefix)) {
        this.removeOne(id);
      }
    }
  }

  listForPlugin(plugin_id: string): ReadonlyArray<{
    subscription_id: string;
    topic: string;
    pid: number;
  }> {
    const ids = this.byPlugin.get(plugin_id);
    if (ids === undefined) return [];
    const out: Array<{ subscription_id: string; topic: string; pid: number }> = [];
    for (const id of ids) {
      const sub = this.subscriptions.get(id);
      if (sub !== undefined) {
        out.push({ subscription_id: id, topic: sub.topic, pid: sub.pid });
      }
    }
    return out;
  }

  // ──────────────────────────────────────────────────────────
  // Publish surface (for topicPublishers.ts)
  // ──────────────────────────────────────────────────────────

  publish(topic: string, payload: unknown): void {
    const seq = (this.topicSeq.get(topic) ?? 0) + 1;
    this.topicSeq.set(topic, seq);
    const subs = this.byTopic.get(topic);
    if (subs === undefined) return;
    for (const id of subs) {
      const sub = this.subscriptions.get(id);
      if (sub === undefined) continue;
      const env: EventEnvelope = {
        subscription_id: id,
        topic,
        seq,
        payload,
        priority: false,
      };
      if (sub.queue.length >= this.opts.queueCap) {
        // Drop oldest.
        const dropped = sub.queue.shift();
        this.opts.auditSink({
          timestamp: new Date().toISOString(),
          kind: 'event.dropped',
          plugin_id: sub.plugin_id,
          topic,
          subscription_id: id,
          detail: `queue full at ${this.opts.queueCap}; dropped seq=${dropped?.seq}`,
        });
      }
      sub.queue.push(env);
      this.opts.auditSink({
        timestamp: new Date().toISOString(),
        kind: 'event.published',
        plugin_id: sub.plugin_id,
        topic,
        subscription_id: id,
      });
      this.opts.onDeliver(sub.plugin_id, env);
    }
  }

  /**
   * Priority publish — bypasses bounded queue, fires onDeliver synchronously
   * with priority=true. Used by the pool when posting host-revoke (G5).
   */
  publishPriority(plugin_id: string, topic: string, payload: unknown): void {
    const ids = this.byPlugin.get(plugin_id);
    if (ids === undefined) return;
    for (const id of Array.from(ids)) {
      const sub = this.subscriptions.get(id);
      if (sub === undefined) continue;
      if (sub.topic !== topic && topic !== '*') continue;
      const seq = (this.topicSeq.get(topic) ?? 0) + 1;
      this.topicSeq.set(topic, seq);
      const env: EventEnvelope = {
        subscription_id: id,
        topic,
        seq,
        payload,
        priority: true,
      };
      this.opts.auditSink({
        timestamp: new Date().toISOString(),
        kind: 'event.priority_delivered',
        plugin_id,
        topic,
        subscription_id: id,
      });
      this.opts.onDeliver(plugin_id, env);
    }
  }

  /** Test inspection — current queue length for a subscription. */
  queueLength(subscription_id: string): number {
    return this.subscriptions.get(subscription_id)?.queue.length ?? 0;
  }

  /** Test inspection — count of revoked subscription_ids. */
  revokedIdsCount(): number {
    return this.revokedIds.size;
  }
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

function indexAdd<K, V>(m: Map<K, Set<V>>, key: K, value: V): void {
  let s = m.get(key);
  if (s === undefined) {
    s = new Set();
    m.set(key, s);
  }
  s.add(value);
}

function indexRemove<K, V>(m: Map<K, Set<V>>, key: K, value: V): void {
  const s = m.get(key);
  if (s === undefined) return;
  s.delete(value);
  if (s.size === 0) m.delete(key);
}

/**
 * Capability → topic prefix mapping.
 *   host.audit.write  → 'audit'
 *   host.session.subscribe → 'session'
 *   host.workspace.write → 'workspace'
 *
 * Defensive default: capability without a recognized prefix → empty string,
 * which means `removeForCapability` matches all topics for that plugin.
 * This is fail-safe for revoke (over-broad cleanup is preferable to leak).
 */
function capabilityToTopicPrefix(capability: string): string {
  const m = /^host\.([a-z_]+)\b/.exec(capability);
  if (m === null) return '';
  return m[1] ?? '';
}
