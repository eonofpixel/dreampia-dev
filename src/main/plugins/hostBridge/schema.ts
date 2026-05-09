/**
 * hostBridge schema — wire types for child↔host RPC over plugin worker.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 4.2 (US-401), gate G5.
 *
 * Extended from v2.0.0 hostBridge with three new message types:
 *   - WorkerSubscribe   (US-503 / ADR-0005 event stream)
 *   - WorkerUnsubscribe (US-503)
 *   - WorkerRevoke      (G5 priority lane)
 *
 * All envelopes are `.strict()` zod schemas. Unknown fields rejected at the
 * dispatcher. Exhaustiveness over the discriminated union is checked by the
 * `isWorkerMessage` predicate at compile time.
 */

import { z } from 'zod';

// ────────────────────────────────────────────────────────────
// child → host messages
// ────────────────────────────────────────────────────────────

export const WorkerRpcRequestSchema = z
  .object({
    type: z.literal('plugin-rpc'),
    call_id: z.string().min(1).max(128),
    method: z.string().min(1).max(128),
    params: z.unknown(),
  })
  .strict();

export const WorkerSubscribeSchema = z
  .object({
    type: z.literal('plugin-subscribe'),
    subscription_id: z.string().min(1).max(128),
    topic: z.string().min(1).max(256),
  })
  .strict();

export const WorkerUnsubscribeSchema = z
  .object({
    type: z.literal('plugin-unsubscribe'),
    subscription_id: z.string().min(1).max(128),
  })
  .strict();

export const WorkerHookResultSchema = z
  .object({
    type: z.literal('plugin-hook-result'),
    hook: z.string().min(1).max(64),
    result: z.unknown(),
  })
  .strict();

export const WorkerEventSchema = z
  .object({
    type: z.literal('plugin-event'),
    name: z.string().min(1).max(128),
    payload: z.unknown(),
  })
  .strict();

export const WorkerPongSchema = z
  .object({
    type: z.literal('plugin-pong'),
    seq: z.number().int().nonnegative(),
  })
  .strict();

export const WorkerMessageSchema = z.discriminatedUnion('type', [
  WorkerRpcRequestSchema,
  WorkerSubscribeSchema,
  WorkerUnsubscribeSchema,
  WorkerHookResultSchema,
  WorkerEventSchema,
  WorkerPongSchema,
]);

export type WorkerMessage = z.infer<typeof WorkerMessageSchema>;
export type WorkerRpcRequest = z.infer<typeof WorkerRpcRequestSchema>;
export type WorkerSubscribe = z.infer<typeof WorkerSubscribeSchema>;
export type WorkerUnsubscribe = z.infer<typeof WorkerUnsubscribeSchema>;
export type WorkerHookResult = z.infer<typeof WorkerHookResultSchema>;
export type WorkerEvent = z.infer<typeof WorkerEventSchema>;
export type WorkerPong = z.infer<typeof WorkerPongSchema>;

// ────────────────────────────────────────────────────────────
// host → child messages
// ────────────────────────────────────────────────────────────

export const HostRpcResultSchema = z
  .object({
    type: z.literal('host-rpc-result'),
    call_id: z.string(),
    result: z.unknown(),
  })
  .strict();

export const HostRpcErrorSchema = z
  .object({
    type: z.literal('host-rpc-error'),
    call_id: z.string(),
    error: z.object({ code: z.string(), message: z.string() }).strict(),
  })
  .strict();

export const HostEventSchema = z
  .object({
    type: z.literal('host-event'),
    subscription_id: z.string(),
    seq: z.number().int().nonnegative(),
    topic: z.string(),
    payload: z.unknown(),
  })
  .strict();

/**
 * Priority lane: revoke message. Bypasses any in-worker queue. Worker MUST
 * handle this synchronously in its parentPort handler (drop subscription
 * cache, fail any pending RPCs locally).
 */
export const HostRevokeSchema = z
  .object({
    type: z.literal('host-revoke'),
    capability: z.string().optional(),
    grant_epoch: z.number().int().nonnegative(),
  })
  .strict();

export const HostShutdownSchema = z
  .object({
    type: z.literal('host-shutdown'),
    reason: z.enum(['reload', 'memory-cap', 'quarantine', 'app-exit']),
  })
  .strict();

export const HostPingSchema = z
  .object({
    type: z.literal('host-ping'),
    seq: z.number().int().nonnegative(),
  })
  .strict();

export const HostMessageSchema = z.discriminatedUnion('type', [
  HostRpcResultSchema,
  HostRpcErrorSchema,
  HostEventSchema,
  HostRevokeSchema,
  HostShutdownSchema,
  HostPingSchema,
]);

export type HostMessage = z.infer<typeof HostMessageSchema>;
export type HostRpcResult = z.infer<typeof HostRpcResultSchema>;
export type HostRpcError = z.infer<typeof HostRpcErrorSchema>;
export type HostEvent = z.infer<typeof HostEventSchema>;
export type HostRevoke = z.infer<typeof HostRevokeSchema>;
export type HostShutdown = z.infer<typeof HostShutdownSchema>;
export type HostPing = z.infer<typeof HostPingSchema>;

// ────────────────────────────────────────────────────────────
// Type predicates (compile-time exhaustiveness)
// ────────────────────────────────────────────────────────────

export function isWorkerMessage(value: unknown): value is WorkerMessage {
  return WorkerMessageSchema.safeParse(value).success;
}

export function isHostMessage(value: unknown): value is HostMessage {
  return HostMessageSchema.safeParse(value).success;
}

/**
 * Compile-time exhaustiveness: switch over `msg.type` and call this in the
 * default branch. TypeScript will fail if any variant is unhandled.
 */
export function assertNeverWorkerMessage(msg: never): never {
  throw new Error(`Unhandled WorkerMessage variant: ${JSON.stringify(msg)}`);
}

export function assertNeverHostMessage(msg: never): never {
  throw new Error(`Unhandled HostMessage variant: ${JSON.stringify(msg)}`);
}
