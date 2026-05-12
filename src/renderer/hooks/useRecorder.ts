/**
 * useRecorder — Renderer-side MediaRecorder wrapper for annotation voice
 * memos (v2.10.0 β-4, F-021 inline panel).
 *
 * Spec: docs/ux/patterns/F-021-annotation.md
 *
 * Wraps `navigator.mediaDevices.getUserMedia` + `MediaRecorder` into a
 * small state machine that React components can consume. The renderer
 * uses this from `AnnotationOverlay`'s inline panel; the recorded Blob
 * is later shipped over IPC to `AnnotationAudioStore.saveAnnotationAudio`.
 *
 * Lifecycle:
 *   idle    → start()  → recording
 *   recording → stop() or auto (size/duration cap) → stopped
 *   any → reset() → idle
 *   any → error path → error (errorMessage set)
 *
 * The hook enforces two caps:
 *   - maxDurationMs (60s in the F-021 spec). Hit → auto stop.
 *   - maxSizeBytes  (5MB). Hit → auto stop, errorMessage set so the
 *     panel can flash a toast / hint.
 *
 * MediaRecorder MIME negotiation is best-effort: we try
 * 'audio/webm;codecs=opus' first because Electron 33+ ships libwebm,
 * then fall back to 'audio/webm' and the empty default.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'recording' | 'stopped' | 'error';

export interface UseRecorderState {
  state: RecorderState;
  /** Elapsed time in ms since `start()` resolved. 0 in idle/error states. */
  elapsedMs: number;
  /** Final blob — populated when state === 'stopped'. */
  blob: Blob | null;
  /** Human-readable error reason (i18n keys / native msgs). */
  errorMessage: string | null;
}

export interface UseRecorderApi extends UseRecorderState {
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export interface UseRecorderOptions {
  /** Hard duration cap in ms. Default 60000 (60s). */
  maxDurationMs: number;
  /** Hard size cap in bytes. Default 5_242_880 (5MB). */
  maxSizeBytes: number;
}

/**
 * Pick a supported WebM Opus mime type, falling back to plain WebM.
 *
 * Returns the empty string when no candidate is supported — `new MediaRecorder(
 * stream, { mimeType: '' })` is valid (browser picks default).
 */
function preferredMimeType(): string {
  if (typeof window === 'undefined') return '';
  const M = (window as unknown as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (M === undefined) return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm'];
  for (const c of candidates) {
    try {
      if (typeof M.isTypeSupported === 'function' && M.isTypeSupported(c)) {
        return c;
      }
    } catch {
      // ignore — fall through
    }
  }
  return '';
}

/**
 * MediaRecorder hook with size + duration caps.
 *
 * Design notes:
 *   - state is reactive (React useState); elapsedMs ticks every 250ms via
 *     setInterval while recording.
 *   - chunks accumulate in a ref (no re-render per dataavailable).
 *   - getUserMedia rejection / MediaRecorder construction failure → state
 *     'error' with errorMessage; the panel shows a toast / disables the mic.
 *   - Component unmount safely stops the recorder + releases the mic.
 */
export function useRecorder(opts: UseRecorderOptions): UseRecorderApi {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sizeRef = useRef(0);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks the reason for stop: 'user' (default), 'duration', 'size'.
  // The dataavailable→stop sequence needs this so we know whether to
  // surface a 'size limit reached' error message.
  const stopReasonRef = useRef<'user' | 'duration' | 'size'>('user');

  // Stable refs to caps so the effect that owns the tick interval doesn't
  // need them in its dep array.
  const maxDurationRef = useRef(opts.maxDurationMs);
  const maxSizeRef = useRef(opts.maxSizeBytes);
  useEffect(() => {
    maxDurationRef.current = opts.maxDurationMs;
    maxSizeRef.current = opts.maxSizeBytes;
  }, [opts.maxDurationMs, opts.maxSizeBytes]);

  const clearTick = useCallback((): void => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const releaseStream = useCallback((): void => {
    const stream = streamRef.current;
    if (stream === null) return;
    try {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // best effort
        }
      }
    } catch {
      // best effort
    }
    streamRef.current = null;
  }, []);

  const reset = useCallback((): void => {
    clearTick();
    const rec = recorderRef.current;
    if (rec !== null && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        // ignore — already inactive or errored
      }
    }
    recorderRef.current = null;
    releaseStream();
    chunksRef.current = [];
    sizeRef.current = 0;
    startedAtRef.current = 0;
    stopReasonRef.current = 'user';
    setState('idle');
    setElapsedMs(0);
    setBlob(null);
    setErrorMessage(null);
  }, [clearTick, releaseStream]);

  // Cleanup on unmount so the mic doesn't stay hot.
  useEffect(() => {
    return (): void => {
      clearTick();
      const rec = recorderRef.current;
      if (rec !== null && rec.state !== 'inactive') {
        try {
          rec.stop();
        } catch {
          // best effort
        }
      }
      recorderRef.current = null;
      const stream = streamRef.current;
      if (stream !== null) {
        try {
          for (const track of stream.getTracks()) {
            try {
              track.stop();
            } catch {
              // best effort
            }
          }
        } catch {
          // best effort
        }
        streamRef.current = null;
      }
    };
  }, [clearTick]);

  const stop = useCallback((): void => {
    const rec = recorderRef.current;
    if (rec === null) return;
    if (rec.state === 'inactive') return;
    try {
      rec.stop();
    } catch {
      // ignore — already inactive
    }
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (state === 'recording') return;
    if (typeof navigator === 'undefined') {
      setState('error');
      setErrorMessage('preview.annotation.mic.permission_denied');
      return;
    }
    const md = (navigator as unknown as { mediaDevices?: MediaDevices }).mediaDevices;
    if (md === undefined || typeof md.getUserMedia !== 'function') {
      setState('error');
      setErrorMessage('preview.annotation.mic.permission_denied');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await md.getUserMedia({ audio: true });
    } catch (err) {
      setState('error');
      setErrorMessage(
        err instanceof Error && err.message.length > 0
          ? err.message
          : 'preview.annotation.mic.permission_denied'
      );
      return;
    }
    streamRef.current = stream;
    const mime = preferredMimeType();
    let recorder: MediaRecorder;
    try {
      const M = (window as unknown as { MediaRecorder: typeof MediaRecorder }).MediaRecorder;
      recorder = mime.length > 0 ? new M(stream, { mimeType: mime }) : new M(stream);
    } catch (err) {
      releaseStream();
      setState('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'preview.annotation.mic.permission_denied'
      );
      return;
    }
    recorderRef.current = recorder;
    chunksRef.current = [];
    sizeRef.current = 0;
    stopReasonRef.current = 'user';

    recorder.ondataavailable = (ev: BlobEvent): void => {
      if (ev.data === undefined || ev.data.size === 0) return;
      chunksRef.current.push(ev.data);
      sizeRef.current += ev.data.size;
      if (sizeRef.current >= maxSizeRef.current) {
        stopReasonRef.current = 'size';
        try {
          if (recorder.state !== 'inactive') recorder.stop();
        } catch {
          // ignore
        }
      }
    };
    recorder.onstop = (): void => {
      clearTick();
      const type = mime.length > 0 ? mime : 'audio/webm';
      const merged = new Blob(chunksRef.current, { type });
      setBlob(merged);
      setState('stopped');
      if (stopReasonRef.current === 'size') {
        setErrorMessage('preview.annotation.mic.size_limit_reached');
      }
      releaseStream();
    };
    recorder.onerror = (): void => {
      clearTick();
      setState('error');
      setErrorMessage('preview.annotation.mic.permission_denied');
      releaseStream();
    };

    try {
      // Slice every 1s — gives the size cap a usable resolution without
      // flooding the main thread.
      recorder.start(1000);
    } catch (err) {
      releaseStream();
      setState('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'preview.annotation.mic.permission_denied'
      );
      return;
    }
    setBlob(null);
    setErrorMessage(null);
    setElapsedMs(0);
    startedAtRef.current = Date.now();
    setState('recording');

    // Tick the elapsed counter; also enforce the duration cap from here
    // so we don't need a second timer.
    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      setElapsedMs(elapsed);
      if (elapsed >= maxDurationRef.current) {
        stopReasonRef.current = 'duration';
        try {
          if (recorder.state !== 'inactive') recorder.stop();
        } catch {
          // ignore
        }
      }
    }, 250);
  }, [state, clearTick, releaseStream]);

  return { state, elapsedMs, blob, errorMessage, start, stop, reset };
}
