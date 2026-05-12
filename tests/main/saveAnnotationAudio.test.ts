/**
 * saveAnnotationAudio — main-process annotation voice memo store (v2.10.0 β-4).
 *
 * Mocks `electron.app.getPath` via vi.hoisted so the module under test reads a
 * temp dir we create per test. fs.writeFile uses the real fs since the path
 * lives in os.tmpdir().
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const electronRef = vi.hoisted(() => ({ userDataPath: '/tmp/dreampia-test-userdata' }));

vi.mock('electron', () => {
  return {
    app: {
      getPath: vi.fn((name: string) => {
        if (name === 'userData') return electronRef.userDataPath;
        return '/tmp';
      }),
    },
  };
});

import {
  saveAnnotationAudio,
  ANNOTATION_AUDIO_MAX_BYTES,
} from '../../src/main/AnnotationAudioStore';
import type { SessionId } from '../../src/types';

const SID = '019d-bbbb' as SessionId;

describe('saveAnnotationAudio (v2.10.0 β-4)', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'dreampia-test-annotation-audio-'));
    electronRef.userDataPath = tmpRoot;
  });

  afterEach(() => {
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  it('writes WebM to userData/annotations/<sid>/audio/<uuid>.webm + returns file URI', async () => {
    const webm_base64 = Buffer.from('fake-webm-bytes', 'utf-8').toString('base64');
    const r = await saveAnnotationAudio({
      session_id: SID,
      webm_base64,
      duration_ms: 4321,
    });
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.uri.startsWith('file://')).toBe(true);
    expect(r.size_bytes).toBe(Buffer.from('fake-webm-bytes', 'utf-8').length);

    const dir = join(tmpRoot, 'annotations', String(SID), 'audio');
    expect(existsSync(dir)).toBe(true);
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    expect(files[0]!.endsWith('.webm')).toBe(true);
    const written = readFileSync(join(dir, files[0]!));
    expect(written.toString('utf-8')).toBe('fake-webm-bytes');
  });

  it('over-cap (5MB+1) → null + console.warn', async () => {
    const oversize = Buffer.alloc(ANNOTATION_AUDIO_MAX_BYTES + 1, 0xab);
    const webm_base64 = oversize.toString('base64');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await saveAnnotationAudio({
      session_id: SID,
      webm_base64,
      duration_ms: 1000,
    });
    expect(r).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('empty base64 → null', async () => {
    const r = await saveAnnotationAudio({
      session_id: SID,
      webm_base64: '',
      duration_ms: 0,
    });
    expect(r).toBeNull();
  });

  it('multiple saves produce unique filenames (uuid)', async () => {
    const webm_base64 = Buffer.from('audio', 'utf-8').toString('base64');
    const r1 = await saveAnnotationAudio({ session_id: SID, webm_base64, duration_ms: 100 });
    const r2 = await saveAnnotationAudio({ session_id: SID, webm_base64, duration_ms: 200 });
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1!.uri).not.toBe(r2!.uri);
    const dir = join(tmpRoot, 'annotations', String(SID), 'audio');
    const files = readdirSync(dir);
    expect(files).toHaveLength(2);
  });
});
