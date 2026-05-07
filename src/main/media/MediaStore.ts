/**
 * MediaStore — `~/.dreampia/media/<sha256>/<filename>` 영속화 + LRU (v1.5.5).
 *
 * Spec: docs/v1.x-roadmap.md (P5 v1.5.5 Media 영속화).
 *
 * 정책:
 *  - 파일 hash 기반 dedup (sha256 of bytes).
 *  - 디스크 cap (default 50GB) 초과 시 LRU eviction (oldest mtime 부터).
 *  - access 시 mtime 갱신 (LRU touch).
 *  - 영속 형식: `<root>/<sha256[0:2]>/<sha256[2:]>.<ext>` (파일시스템 분산).
 *  - meta sidecar `<sha256>.meta.json` — 원본 파일명 + mime + 추가시각.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, promises as fsp, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { homedir } from 'node:os';

export interface StoreOptions {
  rootDir?: string;
  /** Disk cap (bytes). default 50 GB. */
  cap_bytes?: number;
}

export interface StoreInput {
  /** 원본 파일 이름 (e.g. 'photo.png') — meta 저장만, 디스크 path X. */
  originalName: string;
  mime: string;
  /** Base64 (no `data:` prefix). */
  base64: string;
}

export interface StoredMedia {
  sha256: string;
  /** 절대 경로. */
  abs_path: string;
  mime: string;
  size_bytes: number;
  /** 원본 파일명. */
  original_name: string;
}

const DEFAULT_CAP_BYTES = 50 * 1024 * 1024 * 1024; // 50GB.

export class MediaStore {
  private readonly rootDir: string;
  private readonly cap: number;

  constructor(options: StoreOptions = {}) {
    this.rootDir = options.rootDir ?? join(homedir(), '.dreampia', 'media');
    this.cap = options.cap_bytes ?? DEFAULT_CAP_BYTES;
  }

  getRootDir(): string {
    return this.rootDir;
  }

  /**
   * 파일 저장 + sha256 기반 dedup. 이미 존재하면 mtime touch + 그대로 반환.
   */
  async store(input: StoreInput): Promise<StoredMedia> {
    const buf = Buffer.from(input.base64, 'base64');
    const sha256 = createHash('sha256').update(buf).digest('hex');
    const ext = sanitizeExt(extname(input.originalName));
    const subDir = join(this.rootDir, sha256.slice(0, 2));
    mkdirSync(subDir, { recursive: true });
    const filePath = join(subDir, `${sha256.slice(2)}${ext}`);
    const metaPath = join(subDir, `${sha256.slice(2)}.meta.json`);

    let exists = false;
    try {
      await fsp.access(filePath);
      exists = true;
    } catch {
      // not present.
    }

    if (!exists) {
      await fsp.writeFile(filePath, buf);
      await fsp.writeFile(
        metaPath,
        JSON.stringify(
          {
            sha256,
            mime: input.mime,
            original_name: input.originalName,
            stored_at: new Date().toISOString(),
            size_bytes: buf.length,
          },
          null,
          2
        ),
        'utf8'
      );
    } else {
      // touch — LRU.
      const now = new Date();
      try {
        await fsp.utimes(filePath, now, now);
      } catch {
        // ignore
      }
    }

    // LRU eviction — store 종료 전에 await (test deterministic). production
    // 에선 ms 단위라 latency 영향 미미.
    await this.enforceCap();

    return {
      sha256,
      abs_path: filePath,
      mime: input.mime,
      size_bytes: buf.length,
      original_name: input.originalName,
    };
  }

  /**
   * 디스크 cap 초과 시 oldest mtime 부터 evict.
   */
  async enforceCap(): Promise<void> {
    if (!safeIsDir(this.rootDir)) return;
    let entries: Array<{ path: string; size: number; mtime_ms: number }> = [];
    try {
      entries = await collectFiles(this.rootDir);
    } catch {
      return;
    }
    let total = 0;
    for (const e of entries) total += e.size;
    if (total <= this.cap) return;
    // oldest first.
    entries.sort((a, b) => a.mtime_ms - b.mtime_ms);
    for (const e of entries) {
      if (total <= this.cap) break;
      try {
        await fsp.unlink(e.path);
        total -= e.size;
      } catch {
        // ignore — 다음 enforceCap 사이클이 retry.
      }
    }
  }
}

function sanitizeExt(ext: string): string {
  // 안전한 alpha-num 만 허용 (e.g. '.png', '.pdf'). 그 외는 빈 문자열.
  if (ext.length === 0) return '';
  if (!/^\.[a-zA-Z0-9]{1,6}$/.test(ext)) return '';
  return ext.toLowerCase();
}

function safeIsDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

async function collectFiles(
  dir: string
): Promise<Array<{ path: string; size: number; mtime_ms: number }>> {
  const out: Array<{ path: string; size: number; mtime_ms: number }> = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectFiles(p)));
    } else if (entry.isFile()) {
      // .meta.json sidecar 는 evict 대상 X — content 만 LRU.
      if (entry.name.endsWith('.meta.json')) continue;
      try {
        const st = statSync(p);
        out.push({ path: p, size: st.size, mtime_ms: st.mtimeMs });
      } catch {
        // ignore
      }
    }
  }
  return out;
}
