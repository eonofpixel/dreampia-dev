/**
 * AnnotationAudioStore — main-process owner of annotation voice comment
 * files (v2.10.0 β-4, F-021 inline panel + voice memo).
 *
 * Spec: docs/ux/patterns/F-021-annotation.md
 *
 * Renderer records WebM/Opus blobs via MediaRecorder, then ships the bytes
 * to main as base64 over IPC. Main writes each clip to
 *   `app.getPath('userData')/annotations/<sessionId>/audio/<uuid>.webm`
 * and returns a `file://` URI + byte size. The URI flows back into the
 * `AnnotationBlock.comment_audio_uri` field so the AI sees a stable
 * reference and the renderer can render `<audio controls>` directly.
 *
 * Iron rule: never throws across IPC. Permission / write failures resolve
 * to null + console.warn; renderer falls back to "saving annotation
 * without audio" (toast).
 *
 * Size cap: 5MB. Renderer also enforces this (MediaRecorder chunks), but
 * main re-validates the decoded buffer to be defensive against a buggy /
 * compromised renderer.
 */

import { app } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SessionId } from '@/types';

/** 5MB renderer + main shared cap. */
export const ANNOTATION_AUDIO_MAX_BYTES = 5 * 1024 * 1024;

export interface SaveAnnotationAudioArgs {
  session_id: SessionId;
  /** WebM/Opus blob bytes, base64-encoded by renderer. */
  webm_base64: string;
  /** Recording duration in ms (renderer-measured). Used for chip footer. */
  duration_ms: number;
}

export interface SaveAnnotationAudioResult {
  uri: string;
  size_bytes: number;
}

/**
 * Persist a WebM annotation audio clip under the per-session audio dir.
 *
 * Returns null when:
 *   - base64 fails to decode
 *   - decoded size exceeds the 5MB cap
 *   - fs.mkdir / fs.writeFile rejects (permission, ENOSPC, etc.)
 *
 * On every failure path we emit a single console.warn for diagnosability —
 * the renderer is expected to show a toast and continue with the
 * AnnotationBlock minus the audio URI.
 */
export async function saveAnnotationAudio(
  args: SaveAnnotationAudioArgs
): Promise<SaveAnnotationAudioResult | null> {
  let buf: Buffer;
  try {
    buf = Buffer.from(args.webm_base64, 'base64');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[AnnotationAudioStore] base64 decode failed: ${msg}`);
    return null;
  }
  if (buf.length === 0) {
    console.warn('[AnnotationAudioStore] empty audio buffer — skipping save');
    return null;
  }
  if (buf.length > ANNOTATION_AUDIO_MAX_BYTES) {
    console.warn(
      `[AnnotationAudioStore] audio buffer ${buf.length} > cap ${ANNOTATION_AUDIO_MAX_BYTES} — refusing`
    );
    return null;
  }
  try {
    const userData = app.getPath('userData');
    const dir = join(userData, 'annotations', String(args.session_id), 'audio');
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${randomUUID()}.webm`);
    await writeFile(filePath, buf);
    // pathToFileURL handles Windows drive-letter + spaces correctly.
    const uri = pathToFileURL(filePath).toString();
    return { uri, size_bytes: buf.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[AnnotationAudioStore] fs write failed: ${msg}`);
    return null;
  }
}
