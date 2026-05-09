/**
 * pluginIsolationTelemetry — 3-event telemetry wrapper for utilityProcess spawn (US-603).
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 6.4 (US-603) AC-33.4b/c, gate G4.
 *
 * Codex G4 tightening:
 *   "Electron utility_process failures may surface via spawn/exit/error events,
 *    not just thrown fork(). Current wrapper lacks spawn/error/stderr telemetry.
 *    Silent in_process fallback is a security regression."
 *
 * This module wraps a `utilityProcess.fork()` call with structured telemetry
 * on all three signals (spawn / exit / error). On first failure for a plugin,
 * if isolationMode is `auto`, surfaces a consent prompt before any fallback.
 * In `utility_process` (strict) mode, fork failures are hard-failed with
 * audit log entry.
 *
 * Pure DI module — no electron import. Caller wires the real
 * `utilityProcess.fork` from `electron`. Tests inject a fake.
 */

export interface IsolationTelemetryEvent {
  timestamp: string;
  plugin_id: string;
  event: 'spawn' | 'exit' | 'error';
  pid?: number;
  exit_code?: number | null;
  signal?: string | null;
  /** Last 1KB of stderr (truncated). Optional — many spawns don't capture stderr. */
  stderr_tail?: string;
  /** For 'error': structured error message. */
  error_message?: string;
}

/** Subset of `Electron.UtilityProcess` we observe — keeps this module electron-free. */
export interface UtilityProcessLike {
  pid?: number;
  on(event: 'spawn', listener: () => void): unknown;
  on(event: 'exit', listener: (code: number | null, signal?: string | null) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  /** Optional stderr stream — Electron 33 utilityProcess exposes this. */
  stderr?: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown } | null;
}

export interface SpawnFailedDecision {
  kind: 'spawn_failed';
  /** Whether to fall back to in_process. Strict = false; auto with consent = true. */
  fallback_in_process: boolean;
  /** Reason recorded to audit. */
  reason: string;
}

export interface IsolationTelemetryOptions {
  telemetrySink: (event: IsolationTelemetryEvent) => void;
  /** Caller-provided. Returns whether the user has consented to in_process downgrade for this plugin. */
  hasDowngradeConsent: (plugin_id: string) => boolean;
  /** Caller-provided. Surface a one-time prompt; resolves with user decision. */
  promptForDowngradeConsent?: (plugin_id: string, reason: string) => Promise<boolean>;
  /** Effective isolation mode for the plugin (from resolveIsolationMode). */
  isolationMode: 'in_process' | 'utility_process' | 'auto';
}

/**
 * Hook the 3-event signals on a spawned UtilityProcess. Returns the
 * unsubscribe function (for shutdown).
 */
export function attachIsolationTelemetry(
  child: UtilityProcessLike,
  plugin_id: string,
  sink: (event: IsolationTelemetryEvent) => void
): () => void {
  let stderrBuf = '';
  const STDERR_TAIL_BYTES = 1024;

  child.on('spawn', () => {
    sink({
      timestamp: new Date().toISOString(),
      plugin_id,
      event: 'spawn',
      pid: child.pid,
    });
  });

  child.on('exit', (code, signal) => {
    sink({
      timestamp: new Date().toISOString(),
      plugin_id,
      event: 'exit',
      pid: child.pid,
      exit_code: code,
      signal: signal ?? null,
      stderr_tail: stderrBuf.length > 0 ? stderrBuf : undefined,
    });
  });

  child.on('error', (err) => {
    sink({
      timestamp: new Date().toISOString(),
      plugin_id,
      event: 'error',
      pid: child.pid,
      error_message: err.message,
      stderr_tail: stderrBuf.length > 0 ? stderrBuf : undefined,
    });
  });

  if (child.stderr !== null && child.stderr !== undefined) {
    child.stderr.on('data', (chunk) => {
      const s = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
      stderrBuf = (stderrBuf + s).slice(-STDERR_TAIL_BYTES);
    });
  }

  return (): void => {
    // Listeners auto-clean on child exit — no manual removal needed.
  };
}

/**
 * Decide what to do when `utilityProcess.fork()` itself throws (or the
 * 'error' event fires before 'spawn').
 *
 * Codex G4: hard-fail in strict mode; auto mode prompts ONCE for consent
 * before fallback to in_process; never silently fallback.
 */
export async function decideSpawnFailure(
  options: IsolationTelemetryOptions,
  plugin_id: string,
  reason: string
): Promise<SpawnFailedDecision> {
  options.telemetrySink({
    timestamp: new Date().toISOString(),
    plugin_id,
    event: 'error',
    error_message: `spawn failed: ${reason}`,
  });

  if (options.isolationMode === 'utility_process') {
    return { kind: 'spawn_failed', fallback_in_process: false, reason };
  }
  if (options.isolationMode === 'in_process') {
    return { kind: 'spawn_failed', fallback_in_process: true, reason: 'mode=in_process' };
  }
  // auto: check consent or prompt
  if (options.hasDowngradeConsent(plugin_id)) {
    return { kind: 'spawn_failed', fallback_in_process: true, reason: 'prior consent recorded' };
  }
  if (options.promptForDowngradeConsent === undefined) {
    // No prompt available — hard-fail rather than silent fallback (security regression).
    return {
      kind: 'spawn_failed',
      fallback_in_process: false,
      reason: 'auto mode but no consent prompt available',
    };
  }
  const granted = await options.promptForDowngradeConsent(plugin_id, reason);
  return {
    kind: 'spawn_failed',
    fallback_in_process: granted,
    reason: granted ? 'user granted downgrade consent' : 'user declined downgrade',
  };
}
