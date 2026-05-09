/**
 * dispatcher — central RPC router for child→host requests over the plugin
 * IPC bridge.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 4.1 (US-400), gates G5/G2.
 *
 * Responsibilities:
 *   - **zod fail-closed validation** on every incoming RPC envelope and per-method
 *     params. Malformed payload is rejected BEFORE the handler is invoked.
 *   - **Per-call grant_epoch snapshot** — every RPC reads the current epoch at
 *     entry; if the epoch has advanced by the time the handler is about to
 *     return, the response is converted to an abort error (G5 codex sync
 *     invalidation).
 *   - **AbortSignal threading** — handlers receive an AbortSignal that fires on
 *     revoke (via AbortRegistry), worker exit, or external cancellation.
 *   - **Audit hook** — every dispatch produces one audit event with the result.
 *
 * Independence: this module does not import @sigstore, electron, or
 * better-sqlite3. The integration layer (Phase 4.4 / US-403) wires:
 *   `dispatcher.dispatch(...)` ← `parentPort.on('message', ...)`
 *   `dispatcher.auditSink` → `AuditLogStore.recordEvent(...)`
 *   `dispatcher.epochProvider` → `McpCapabilityGate.getGrantEpoch / GrantLedger`
 *   `dispatcher.abortRegistry` → `AbortRegistry`
 */

import { z, type ZodSchema } from 'zod';

// ────────────────────────────────────────────────────────────
// Wire envelope
// ────────────────────────────────────────────────────────────

const RpcEnvelopeSchema = z
  .object({
    type: z.literal('plugin-rpc'),
    call_id: z.string().min(1).max(128),
    method: z.string().min(1).max(128),
    params: z.unknown(),
  })
  .strict();

export type RpcEnvelope = z.infer<typeof RpcEnvelopeSchema>;

export const RpcResultEnvelopeSchema = z
  .object({
    type: z.literal('plugin-rpc-result'),
    call_id: z.string(),
    result: z.unknown(),
  })
  .strict();

export const RpcErrorEnvelopeSchema = z
  .object({
    type: z.literal('plugin-rpc-error'),
    call_id: z.string(),
    error: z.object({ code: z.string(), message: z.string() }).strict(),
  })
  .strict();

export type RpcResponseEnvelope =
  | z.infer<typeof RpcResultEnvelopeSchema>
  | z.infer<typeof RpcErrorEnvelopeSchema>;

// ────────────────────────────────────────────────────────────
// Handler registry
// ────────────────────────────────────────────────────────────

export interface DispatchContext {
  /** Caller plugin id — provided by the worker channel binding. */
  plugin_id: string;
  /** AbortSignal fires on revoke / worker exit / external cancel. */
  signal: AbortSignal;
  /** Snapshot epoch at dispatch entry. Used for AC-4.4 staleness check. */
  grant_epoch_snapshot: number;
}

export interface HandlerRegistration<P, R> {
  paramsSchema: ZodSchema<P>;
  /** Capability required to invoke this method. Used for capability gate check + audit. */
  capability: string;
  handler(params: P, ctx: DispatchContext): Promise<R> | R;
}

export interface DispatcherDeps {
  /** Returns current grant_epoch for the given plugin (from GrantLedger / McpCapabilityGate). */
  epochProvider: (plugin_id: string) => number;
  /** Capability check — true if capability is currently granted. */
  isGranted: (plugin_id: string, capability: string) => boolean;
  /** Create an abort handle for this RPC. Caller registers + cleans up. */
  abortRegistry: {
    create(
      plugin_id: string,
      call_id: string
    ): { signal: AbortSignal; abort: (reason?: string) => void };
  };
  /** Audit hook — one event per dispatch (success / fail / cancelled / unauthorized). */
  auditSink: (event: DispatcherAuditEvent) => void;
}

export type DispatcherAuditEventKind =
  | 'rpc.dispatched'
  | 'rpc.success'
  | 'rpc.failed'
  | 'rpc.unauthorized'
  | 'rpc.aborted'
  | 'rpc.stale_epoch'
  | 'rpc.malformed';

export interface DispatcherAuditEvent {
  timestamp: string;
  kind: DispatcherAuditEventKind;
  plugin_id: string;
  call_id?: string;
  method?: string;
  capability?: string;
  grant_epoch_at_entry?: number;
  grant_epoch_at_exit?: number;
  duration_ms?: number;
  error?: { code: string; message: string };
}

// ────────────────────────────────────────────────────────────
// Dispatcher
// ────────────────────────────────────────────────────────────

export class HostBridgeDispatcher {
  private readonly handlers = new Map<string, HandlerRegistration<unknown, unknown>>();
  private readonly deps: DispatcherDeps;

  constructor(deps: DispatcherDeps) {
    this.deps = deps;
  }

  register<P, R>(method: string, registration: HandlerRegistration<P, R>): void {
    if (this.handlers.has(method)) {
      throw new Error(`HostBridgeDispatcher: method already registered: ${method}`);
    }
    this.handlers.set(method, registration as HandlerRegistration<unknown, unknown>);
  }

  /**
   * Process a single RPC envelope from the plugin worker. The returned
   * promise resolves to the response envelope to post back over parentPort.
   * Never throws — internal errors are converted to plugin-rpc-error.
   */
  async dispatch(plugin_id: string, payload: unknown): Promise<RpcResponseEnvelope> {
    const startTs = Date.now();
    const envelope = RpcEnvelopeSchema.safeParse(payload);
    if (!envelope.success) {
      this.deps.auditSink({
        timestamp: new Date().toISOString(),
        kind: 'rpc.malformed',
        plugin_id,
        error: { code: 'MALFORMED_ENVELOPE', message: envelope.error.message },
      });
      return {
        type: 'plugin-rpc-error',
        call_id: '<malformed>',
        error: { code: 'MALFORMED_ENVELOPE', message: envelope.error.message },
      };
    }

    const { call_id, method, params } = envelope.data;
    const reg = this.handlers.get(method);
    if (reg === undefined) {
      this.deps.auditSink({
        timestamp: new Date().toISOString(),
        kind: 'rpc.failed',
        plugin_id,
        call_id,
        method,
        error: { code: 'METHOD_NOT_FOUND', message: `unknown method: ${method}` },
      });
      return {
        type: 'plugin-rpc-error',
        call_id,
        error: { code: 'METHOD_NOT_FOUND', message: `unknown method: ${method}` },
      };
    }

    // Per-RPC capability check (AC-4.4 — closes Triple-Product-Risk race A).
    if (!this.deps.isGranted(plugin_id, reg.capability)) {
      this.deps.auditSink({
        timestamp: new Date().toISOString(),
        kind: 'rpc.unauthorized',
        plugin_id,
        call_id,
        method,
        capability: reg.capability,
      });
      return {
        type: 'plugin-rpc-error',
        call_id,
        error: { code: 'UNAUTHORIZED', message: `capability not granted: ${reg.capability}` },
      };
    }

    const paramsParsed = reg.paramsSchema.safeParse(params);
    if (!paramsParsed.success) {
      this.deps.auditSink({
        timestamp: new Date().toISOString(),
        kind: 'rpc.malformed',
        plugin_id,
        call_id,
        method,
        capability: reg.capability,
        error: { code: 'INVALID_PARAMS', message: paramsParsed.error.message },
      });
      return {
        type: 'plugin-rpc-error',
        call_id,
        error: { code: 'INVALID_PARAMS', message: paramsParsed.error.message },
      };
    }

    const grant_epoch_at_entry = this.deps.epochProvider(plugin_id);
    const abort = this.deps.abortRegistry.create(plugin_id, call_id);
    const ctx: DispatchContext = {
      plugin_id,
      signal: abort.signal,
      grant_epoch_snapshot: grant_epoch_at_entry,
    };

    this.deps.auditSink({
      timestamp: new Date().toISOString(),
      kind: 'rpc.dispatched',
      plugin_id,
      call_id,
      method,
      capability: reg.capability,
      grant_epoch_at_entry,
    });

    try {
      const result = await reg.handler(paramsParsed.data, ctx);
      const grant_epoch_at_exit = this.deps.epochProvider(plugin_id);

      // G5 staleness check — if revoke happened mid-call, fail the response
      // even though the handler completed. This is the synchronous-grant-
      // invalidation invariant.
      if (grant_epoch_at_exit !== grant_epoch_at_entry) {
        this.deps.auditSink({
          timestamp: new Date().toISOString(),
          kind: 'rpc.stale_epoch',
          plugin_id,
          call_id,
          method,
          capability: reg.capability,
          grant_epoch_at_entry,
          grant_epoch_at_exit,
          duration_ms: Date.now() - startTs,
        });
        return {
          type: 'plugin-rpc-error',
          call_id,
          error: {
            code: 'GRANT_EPOCH_STALE',
            message: `grant_epoch advanced from ${grant_epoch_at_entry} to ${grant_epoch_at_exit} during RPC`,
          },
        };
      }

      this.deps.auditSink({
        timestamp: new Date().toISOString(),
        kind: 'rpc.success',
        plugin_id,
        call_id,
        method,
        capability: reg.capability,
        grant_epoch_at_entry,
        grant_epoch_at_exit,
        duration_ms: Date.now() - startTs,
      });
      return { type: 'plugin-rpc-result', call_id, result };
    } catch (err) {
      const aborted = abort.signal.aborted;
      const code = aborted
        ? 'ABORTED'
        : err instanceof Error
          ? err.name === 'AbortError'
            ? 'ABORTED'
            : 'HANDLER_ERROR'
          : 'HANDLER_ERROR';
      const message = err instanceof Error ? err.message : String(err);
      this.deps.auditSink({
        timestamp: new Date().toISOString(),
        kind: aborted ? 'rpc.aborted' : 'rpc.failed',
        plugin_id,
        call_id,
        method,
        capability: reg.capability,
        grant_epoch_at_entry,
        grant_epoch_at_exit: this.deps.epochProvider(plugin_id),
        duration_ms: Date.now() - startTs,
        error: { code, message },
      });
      return { type: 'plugin-rpc-error', call_id, error: { code, message } };
    }
  }

  /** Test helper — list registered methods. */
  registeredMethods(): string[] {
    return Array.from(this.handlers.keys()).sort();
  }
}
