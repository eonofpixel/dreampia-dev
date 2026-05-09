/**
 * rateLimit — token bucket per (plugin, method) tuple.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 4.3 (US-402).
 *
 * Defaults (configurable per-plugin via manifest, or per-method override):
 *   - host.fs.*    → 100 req/sec, burst 200
 *   - host.audit.* → 10 req/sec,  burst 20
 *   - host.*       → 50 req/sec,  burst 100   (fallback for any unmatched host method)
 *
 * Used by HostBridgeDispatcher: dispatcher calls `consume(plugin_id, method)`
 * BEFORE invoking the handler. Returns false → dispatcher returns
 * RATE_LIMITED error envelope and audit-warns.
 *
 * Pure in-memory; no persistence (rate limits reset on restart, which is
 * acceptable since they're an abuse cap, not a billing meter).
 */

export interface RateLimitConfig {
  /** Sustained refill rate (tokens per second). */
  refill_per_second: number;
  /** Maximum burst (bucket capacity). */
  burst: number;
}

const DEFAULTS: Array<{ pattern: RegExp; config: RateLimitConfig }> = [
  { pattern: /^host\.fs\./, config: { refill_per_second: 100, burst: 200 } },
  { pattern: /^host\.audit\./, config: { refill_per_second: 10, burst: 20 } },
  { pattern: /^host\./, config: { refill_per_second: 50, burst: 100 } },
];

interface BucketState {
  tokens: number;
  lastRefillMs: number;
  config: RateLimitConfig;
}

export interface RateLimitOverrides {
  /** plugin_id → method-prefix → override config. */
  [plugin_id: string]: { [methodOrPrefix: string]: RateLimitConfig };
}

export interface RateLimiterOptions {
  overrides?: RateLimitOverrides;
  /** Test clock injection. */
  now?: () => number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, BucketState>();
  private readonly overrides: RateLimitOverrides;
  private readonly now: () => number;

  constructor(options: RateLimiterOptions = {}) {
    this.overrides = options.overrides ?? {};
    this.now = options.now ?? Date.now;
  }

  /**
   * Attempt to consume one token. Returns true if allowed (token consumed),
   * false if rate-limit-exceeded.
   */
  consume(plugin_id: string, method: string): boolean {
    const key = `${plugin_id}::${method}`;
    let bucket = this.buckets.get(key);
    if (bucket === undefined) {
      bucket = {
        tokens: 0,
        lastRefillMs: this.now(),
        config: this.resolveConfig(plugin_id, method),
      };
      bucket.tokens = bucket.config.burst;
      this.buckets.set(key, bucket);
    }
    this.refill(bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  /** Test inspection — current token count for (plugin, method). */
  tokensRemaining(plugin_id: string, method: string): number {
    const bucket = this.buckets.get(`${plugin_id}::${method}`);
    if (bucket === undefined) return this.resolveConfig(plugin_id, method).burst;
    this.refill(bucket);
    return bucket.tokens;
  }

  /** Reset (test only). */
  reset(): void {
    this.buckets.clear();
  }

  private refill(bucket: BucketState): void {
    const now = this.now();
    const dtMs = now - bucket.lastRefillMs;
    if (dtMs <= 0) return;
    const refilled = (dtMs / 1000) * bucket.config.refill_per_second;
    bucket.tokens = Math.min(bucket.config.burst, bucket.tokens + refilled);
    bucket.lastRefillMs = now;
  }

  private resolveConfig(plugin_id: string, method: string): RateLimitConfig {
    // Per-plugin override: longest-prefix match.
    const pluginOverrides = this.overrides[plugin_id];
    if (pluginOverrides !== undefined) {
      const prefixes = Object.keys(pluginOverrides).sort((a, b) => b.length - a.length);
      for (const prefix of prefixes) {
        if (method === prefix || method.startsWith(prefix + '.')) {
          const override = pluginOverrides[prefix];
          if (override !== undefined) return override;
        }
      }
    }
    // Default by method-namespace pattern.
    for (const { pattern, config } of DEFAULTS) {
      if (pattern.test(method)) return config;
    }
    // Catch-all (non-host methods get a conservative cap).
    return { refill_per_second: 10, burst: 20 };
  }
}
