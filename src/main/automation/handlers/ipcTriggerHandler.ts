/**
 * v1.7.25 — IPC trigger handler.
 *
 * Renderer 로 IPC 이벤트 emit. 예) 자동화 rule fire 시 renderer 가
 * notification toast 를 띄우거나 다른 UI action 을 trigger.
 *
 * Config schema:
 *   - channel: string  (required) — renderer 가 listen 할 IPC channel.
 *     allow-list 패턴: 'automation/' prefix 만 허용 (security).
 *   - payload?: unknown — 직렬화 가능한 임의 값. JSON.stringify 통과 시 OK.
 *
 * 동작:
 *   1. registered emitter 호출 (main process 가 부팅 시 setIpcEmitter 로 주입).
 *   2. emitter 가 mainWindow.webContents.send(channel, payload) 수행.
 *   3. emitter 미주입 시 ok=false (일반적으로 boot 직후 한 번).
 *
 * Test: setIpcTriggerEmitterForTesting 으로 fake emitter 주입.
 */

import type { AutomationHandler } from './HandlerRegistry';
import { truncateOutput } from './HandlerRegistry';

export const IPC_TRIGGER_HANDLER_NAME = 'ipc-trigger';

/** Allow-list prefix. 임의 channel 차단 — 자동화 rule 이 internal IPC
 *  를 trigger 하지 않도록. */
const ALLOWED_CHANNEL_PREFIX = 'automation/';

export type IpcEmitterFn = (channel: string, payload: unknown) => void;

let injectedEmitter: IpcEmitterFn | null = null;

/**
 * main process 부팅 시 주입. mainWindow 가 이미 생성된 후 호출 가능.
 *
 * 예: setIpcTriggerEmitter((ch, p) => mainWindow.webContents.send(ch, p))
 */
export function setIpcTriggerEmitter(fn: IpcEmitterFn | null): void {
  injectedEmitter = fn;
}

/** Test 전용 alias — setIpcTriggerEmitter 와 동일. */
export function setIpcTriggerEmitterForTesting(fn: IpcEmitterFn | null): void {
  injectedEmitter = fn;
}

export const ipcTriggerHandler: AutomationHandler = async (ctx) => {
  const cfg = ctx.config;
  const channel = typeof cfg['channel'] === 'string' ? cfg['channel'].trim() : '';
  if (channel.length === 0) {
    return { ok: false, error: 'channel required (config.channel: string)' };
  }
  if (!channel.startsWith(ALLOWED_CHANNEL_PREFIX)) {
    return {
      ok: false,
      error: `channel must start with '${ALLOWED_CHANNEL_PREFIX}' (got '${channel}')`,
    };
  }
  const payload = cfg['payload'];

  // payload 직렬화 가능성 검증 — Electron IPC 가 알아서 reject 하지만,
  // 미리 확인해 명확한 에러 메시지를 audit 에 남김.
  try {
    JSON.stringify(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `payload not serializable: ${msg}` };
  }

  if (injectedEmitter === null) {
    return {
      ok: false,
      error: 'IPC emitter not configured (mainWindow not ready)',
    };
  }

  try {
    injectedEmitter(channel, payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `emit failed: ${msg}` };
  }

  const summary =
    payload === undefined ? channel : `${channel} ${truncateOutput(JSON.stringify(payload), 200)}`;
  return { ok: true, output: `[ipc] ${summary}` };
};
