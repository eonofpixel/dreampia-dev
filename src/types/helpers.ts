/**
 * Helpers for ID generation and normalization.
 *
 * Renderer-reachable (App.tsx 가 import). 모든 함수는 browser-safe
 * (Web Crypto + 표준 ECMA) 또는 `node:crypto` 의 `vite-plugin-electron-renderer`
 * polyfill 호환.
 *
 * Spec: docs/session/schema.md (UUIDv7 + workspace hash)
 *
 * E2E fix 2026-05-07: 이전엔 `import { v7 } from 'uuid'` 사용. `uuid` 의
 * default ESM (`dist/esm/`) 가 `import { randomFillSync } from 'crypto'`
 * 를 포함, `vite-plugin-electron-renderer` 의 `node` condition 으로 인해
 * dual-package 의 Node 측이 선택돼 renderer 번들에 `require('crypto')` leak
 * → CSP `script-src 'self'` 환경에서 `require is not defined` 로 React
 * 마운트 즉시 실패 (E2E 102 specs all timeout, 4일+ red CI).
 *
 * 해결: uuid v7 알고리즘을 vendored — `Web Crypto API` 의 `crypto.getRandomValues`
 * 만 사용해 conditional resolution 회피. uuid npm dependency 는 main process
 * (`SessionStore`/`UsageStore`/`CompareStore`) 에선 그대로 사용 가능.
 *
 * vendored 알고리즘은 RFC 9562 + uuid 12.x esm-browser/v7.js 준수:
 *   - 48-bit unix_ts_ms (big-endian)
 *   - 4-bit version (0x7) + 12-bit seq_high
 *   - 2-bit variant (0b10) + 14-bit seq_low + 48-bit random
 */

import type {
  SessionId,
  TurnId,
  ToolCallId,
  WorkspaceId,
  WorkTreeId,
  PaneId,
  TabId,
} from './common';

// ────────────────────────────────────────────────────────────
// UUIDv7 (vendored — browser-safe, no Node crypto require)
// ────────────────────────────────────────────────────────────

const _v7State: { msecs: number; seq: number } = { msecs: -Infinity, seq: 0 };
const _byteToHex: string[] = [];
for (let i = 0; i < 256; i += 1) {
  _byteToHex.push((i + 0x100).toString(16).slice(1));
}

function _rng16(): Uint8Array {
  const buf = new Uint8Array(16);
  // globalThis.crypto.getRandomValues — Web Crypto API.
  // Node 16+ + 모든 evergreen 브라우저 + Electron renderer 모두 지원.
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

function _stringify(arr: Uint8Array): string {
  return (
    _byteToHex[arr[0]!]! +
    _byteToHex[arr[1]!]! +
    _byteToHex[arr[2]!]! +
    _byteToHex[arr[3]!]! +
    '-' +
    _byteToHex[arr[4]!]! +
    _byteToHex[arr[5]!]! +
    '-' +
    _byteToHex[arr[6]!]! +
    _byteToHex[arr[7]!]! +
    '-' +
    _byteToHex[arr[8]!]! +
    _byteToHex[arr[9]!]! +
    '-' +
    _byteToHex[arr[10]!]! +
    _byteToHex[arr[11]!]! +
    _byteToHex[arr[12]!]! +
    _byteToHex[arr[13]!]! +
    _byteToHex[arr[14]!]! +
    _byteToHex[arr[15]!]!
  );
}

function uuidv7(): string {
  const now = Date.now();
  const rnds = _rng16();
  if (now > _v7State.msecs) {
    _v7State.seq = (rnds[6]! << 23) | (rnds[7]! << 16) | (rnds[8]! << 8) | rnds[9]!;
    _v7State.msecs = now;
  } else {
    _v7State.seq = (_v7State.seq + 1) | 0;
    if (_v7State.seq === 0) _v7State.msecs += 1;
  }
  const msecs = _v7State.msecs;
  const seq = _v7State.seq;
  const buf = new Uint8Array(16);
  buf[0] = (msecs / 0x10000000000) & 0xff;
  buf[1] = (msecs / 0x100000000) & 0xff;
  buf[2] = (msecs / 0x1000000) & 0xff;
  buf[3] = (msecs / 0x10000) & 0xff;
  buf[4] = (msecs / 0x100) & 0xff;
  buf[5] = msecs & 0xff;
  buf[6] = 0x70 | ((seq >>> 28) & 0x0f);
  buf[7] = (seq >>> 20) & 0xff;
  buf[8] = 0x80 | ((seq >>> 14) & 0x3f);
  buf[9] = (seq >>> 6) & 0xff;
  buf[10] = ((seq << 2) & 0xff) | (rnds[10]! & 0x03);
  buf[11] = rnds[11]!;
  buf[12] = rnds[12]!;
  buf[13] = rnds[13]!;
  buf[14] = rnds[14]!;
  buf[15] = rnds[15]!;
  return _stringify(buf);
}

// ────────────────────────────────────────────────────────────
// ID factories (branded types)
// ────────────────────────────────────────────────────────────

export const newSessionId = (): SessionId => uuidv7() as SessionId;
export const newTurnId = (): TurnId => uuidv7() as TurnId;
export const newToolCallId = (): ToolCallId => uuidv7() as ToolCallId;
export const newWorkTreeId = (): WorkTreeId => uuidv7() as WorkTreeId;
export const newPaneId = (): PaneId => uuidv7() as PaneId;
export const newTabId = (): TabId => uuidv7() as TabId;

// ────────────────────────────────────────────────────────────
// FNV-1a 64-bit hash (browser + node safe, no deps)
// ────────────────────────────────────────────────────────────

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;

/** Deterministic 64-bit hash. Not cryptographic. */
function fnv1a(str: string): string {
  let h = FNV_OFFSET;
  const bytes = new TextEncoder().encode(str);
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= BigInt(bytes[i]!);
    h = (h * FNV_PRIME) & FNV_MASK;
  }
  return h.toString(16).padStart(16, '0');
}

// ────────────────────────────────────────────────────────────
// WorkspaceId derivation (deterministic from path)
// ────────────────────────────────────────────────────────────

/**
 * Derive a stable WorkspaceId from an absolute path.
 *
 * Normalization:
 *   - Lowercase (Windows case-insensitive)
 *   - Forward-slash separators
 *   - FNV-1a 64-bit hash (16 hex chars)
 *
 * Same path → same id. Different cases / separators → same id.
 *
 * Example:
 *   workspaceIdFor('C:\\Dev\\foo')   → "ws-<16 hex>"
 *   workspaceIdFor('c:/dev/foo')     → "ws-<same>"
 *
 * Note: FNV-1a is not cryptographic. For workspace identification it's
 * sufficient (collision risk negligible for human-scale path counts).
 */
export function workspaceIdFor(absolutePath: string): WorkspaceId {
  const normalized = absolutePath.toLowerCase().replace(/\\/g, '/');
  const hash = fnv1a(normalized);
  return `ws-${hash}` as WorkspaceId;
}

// ────────────────────────────────────────────────────────────
// v1.4.0 — sha256-based deterministic workspace_id
//
// 이전 FNV-1a 64-bit 는 collision 위험이 무시할 수 있는 수준이지만 cryptographic
// 검증 / 서명 / 외부 시스템과의 ID 교환에는 부적합. v1.4.0 부터 sha256 기반으로
// 점진 전환 — 본 commit 은 "병행 utility + 백필 helper" 까지. application code
// 의 default 전환은 후속 (v1.4.0.x).
//
// Same-path 정규화는 `workspaceIdFor` 와 동일 — 대소문자 무시 + 백슬래시 →
// 슬래시. sha256 의 16-hex prefix (= 64-bit) 사용 → FNV 와 같은 길이 보존.
// ────────────────────────────────────────────────────────────

// E2E fix 2026-05-07 — `node:crypto` import 제거 → 본 파일은 renderer
// (App.tsx) 에서 import 되므로 Node 전용 import 가 있으면 vite-plugin-electron
// -renderer 가 polyfill 로 `require('crypto')` 를 emit, sandbox=true 의
// renderer 에서 ReferenceError 로 React 마운트 실패. 동기 sha256 vendored
// 구현 (FIPS 180-4 / RFC 6234) — pure JS, 70줄. main process 에선 native
// crypto 보다 약간 느리지만 workspaceIdForSha256 호출 빈도가 낮아 무시 가능.
function _sha256Hex(input: string): string {
  const utf8 = new TextEncoder().encode(input);
  // Padding: append 1 bit + zeros + 64-bit length to multiple of 512 bits.
  const bitLen = utf8.length * 8;
  const padLen = (utf8.length + 9 + 63) & ~63; // align to 64 bytes
  const msg = new Uint8Array(padLen);
  msg.set(utf8);
  msg[utf8.length] = 0x80;
  // 64-bit big-endian length (use only low 32 bits — string len * 8 fits).
  const view = new DataView(msg.buffer);
  view.setUint32(padLen - 4, bitLen >>> 0, false);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);

  // Initial hash values (FIPS 180-4 §5.3.3).
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
    0x5be0cd19,
  ]);
  // Round constants (first 32 bits of fractional parts of cube roots of first 64 primes).
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
    0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
    0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
    0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
    0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
    0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
  ]);
  const W = new Uint32Array(64);

  for (let chunk = 0; chunk < padLen; chunk += 64) {
    for (let t = 0; t < 16; t += 1) W[t] = view.getUint32(chunk + t * 4, false);
    for (let t = 16; t < 64; t += 1) {
      const s0 = ((W[t - 15]! >>> 7) | (W[t - 15]! << 25)) ^
        ((W[t - 15]! >>> 18) | (W[t - 15]! << 14)) ^ (W[t - 15]! >>> 3);
      const s1 = ((W[t - 2]! >>> 17) | (W[t - 2]! << 15)) ^
        ((W[t - 2]! >>> 19) | (W[t - 2]! << 13)) ^ (W[t - 2]! >>> 10);
      W[t] = (W[t - 16]! + s0 + W[t - 7]! + s1) >>> 0;
    }
    let a = H[0]!, b = H[1]!, c = H[2]!, d = H[3]!;
    let e = H[4]!, f = H[5]!, g = H[6]!, h = H[7]!;
    for (let t = 0; t < 64; t += 1) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t]! + W[t]!) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0]! + a) >>> 0;
    H[1] = (H[1]! + b) >>> 0;
    H[2] = (H[2]! + c) >>> 0;
    H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0;
    H[5] = (H[5]! + f) >>> 0;
    H[6] = (H[6]! + g) >>> 0;
    H[7] = (H[7]! + h) >>> 0;
  }
  return Array.from(H, (n) => n.toString(16).padStart(8, '0')).join('');
}

export function workspaceIdForSha256(absolutePath: string): WorkspaceId {
  const normalized = absolutePath.toLowerCase().replace(/\\/g, '/');
  const full = _sha256Hex(normalized);
  return `ws-${full.slice(0, 16)}` as WorkspaceId;
}

/**
 * v1.4.0 — 주어진 path 가 FNV-1a 기반 legacy id 와 매칭되는지 검사.
 * Backfill helper 가 "FNV-기반인지" 판단할 때 사용 (random UUIDv7 인 row 는
 * 건드리지 않도록).
 */
export function isLegacyFnvWorkspaceId(id: WorkspaceId, absolutePath: string): boolean {
  return id === workspaceIdFor(absolutePath);
}

// ────────────────────────────────────────────────────────────
// Browser partition id (Codex codex-browser-app pattern)
// ────────────────────────────────────────────────────────────

/**
 * Generate the Electron Partition id for a session's in-app browser.
 * Each session gets an isolated partition.
 *
 * Spec: docs/findings/round5-msix-paths.md (codex-browser-app pattern)
 */
export function partitionIdFor(sessionId: SessionId): string {
  return `persist:dreampia-browser-app-${sessionId}`;
}

// ────────────────────────────────────────────────────────────
// ISO8601 helpers
// ────────────────────────────────────────────────────────────

export const nowIso = (): string => new Date().toISOString();
