/**
 * Compare orchestrator — v0.12.0 I (Cross-AI Verify/Compare MVP).
 *
 * Spec: ROADMAP.md (v0.12.0 I — Codex 권고)
 *
 * 역할
 * ────
 *   사용자가 동일 prompt 를 Claude / Codex 양쪽에서 동시에 실행하고 결과를
 *   side-by-side 로 비교하는 MVP. 한쪽이 실패해도 다른 쪽은 계속한다.
 *
 *   Flow:
 *     1) CompareStore.createRun → DB 에 row + 양쪽 'pending' 상태로 영속
 *     2) Claude / Codex 양쪽 provider 를 병렬 실행 (Promise.allSettled 로 격리)
 *     3) 각 stream 의 text_delta / message_complete / error 를 받아
 *        a. 누적 buffer 에 추가
 *        b. CompareStore.updateSide 로 영속
 *        c. CompareEvent 를 emit (renderer 가 실시간 표시)
 *     4) 양쪽 종료 후 finalizeRun → overall status 결정 → 'compare_complete'
 *
 * 실패 격리 (CRITICAL)
 * ────────────────
 *   - one provider 의 detect 또는 stream throw 가 다른 provider 를 abort 시키지
 *     않는다. 양쪽에 별도 AbortController 를 둔다.
 *   - parent abortSignal 이 set 되면 양쪽 모두 abort.
 *   - try/catch 가 양쪽 stream 의 모든 yield 단계를 감싼다 — 한쪽 reject 가
 *     orchestrator 자체를 reject 시키지 않도록.
 */

import type { PermissionLevel } from '@/types/permission';
import type { Turn, TurnId } from '@/types';
import { newTurnId, nowIso } from '@/types';
import type { StreamEvent, StreamingProvider } from '@/providers';
import { CompareStore, type CompareRun, type CompareSide, type CompareSideStatus } from '@/storage';

// ────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────

export interface CompareOrchestratorArgs {
  prompt: string;
  session_id: string;
  workspace_root: string;
  permission_level: PermissionLevel;
  /** e.g. 'claude-3-5-sonnet-20241022' */
  claude_model: string;
  /** e.g. 'gpt-5.5' */
  codex_model: string;
  /** Optional parent abort — orchestrator forwards to both providers. */
  abortSignal?: AbortSignal;
}

export type CompareEvent =
  | { type: 'compare_start'; run_id: string }
  | {
      type: 'compare_side_delta';
      run_id: string;
      side: CompareSide;
      text_delta: string;
    }
  | { type: 'compare_side_done'; run_id: string; side: CompareSide }
  | {
      type: 'compare_side_error';
      run_id: string;
      side: CompareSide;
      error: string;
    }
  | { type: 'compare_complete'; run_id: string; run: CompareRun };

/**
 * Provider factory — orchestrator 가 두 번 (claude / codex) 호출한다.
 *
 * 한쪽 호출이 throw 해도 다른 쪽이 계속되도록 try/catch 가 wrapping. 'mock'
 * source 는 production 에서 fail-closed 의 결과 (testing only).
 */
export type ProviderFactory = (
  side: CompareSide,
  model: string,
  signal: AbortSignal,
  cwd: string,
  permissionLevel: PermissionLevel
) => Promise<{ provider: StreamingProvider; source: string }>;

// ────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────

/**
 * 한 user turn 을 만들어 provider 에 넘긴다. compare 는 fresh 1턴 prompt 만
 * — 이전 conversation 은 의도적으로 제외 (양쪽이 동일 입력 받도록).
 */
function buildUserTurn(prompt: string): Turn {
  return {
    id: newTurnId(),
    role: 'user',
    timestamp: nowIso(),
    status: 'completed',
    content: [{ type: 'text', text: prompt }],
  };
}

/**
 * 한 side 의 stream 을 소비. 실패는 reject 가 아니라 internal status 갱신 +
 * compare_side_error event emit 으로만 표현. 호출자는 await 만 — never throws.
 */
async function pumpSide(args: {
  runId: string;
  side: CompareSide;
  prompt: string;
  model: string;
  workspaceRoot: string;
  permissionLevel: PermissionLevel;
  factory: ProviderFactory;
  parentSignal: AbortSignal;
  store: CompareStore;
  emit: (event: CompareEvent) => void;
}): Promise<void> {
  const sideController = new AbortController();
  const onParentAbort = (): void => sideController.abort();
  if (args.parentSignal.aborted) {
    sideController.abort();
  } else {
    args.parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }

  const startedAt = nowIso();
  args.store.updateSide(args.runId, args.side, {
    status: 'streaming' satisfies CompareSideStatus,
    started_at: startedAt,
  });

  let accumulated = '';
  let currentTurnId: TurnId | null = null;
  let terminalEmitted = false;

  const finishOk = (): void => {
    if (terminalEmitted) return;
    terminalEmitted = true;
    args.store.updateSide(args.runId, args.side, {
      status: 'done',
      text: accumulated,
      finished_at: nowIso(),
    });
    args.emit({ type: 'compare_side_done', run_id: args.runId, side: args.side });
  };

  const finishError = (msg: string): void => {
    if (terminalEmitted) return;
    terminalEmitted = true;
    args.store.updateSide(args.runId, args.side, {
      status: 'error',
      text: accumulated,
      error: msg,
      finished_at: nowIso(),
    });
    args.emit({
      type: 'compare_side_error',
      run_id: args.runId,
      side: args.side,
      error: msg,
    });
  };

  try {
    const { provider } = await args.factory(
      args.side,
      args.model,
      sideController.signal,
      args.workspaceRoot,
      args.permissionLevel
    );

    const userTurn = buildUserTurn(args.prompt);

    for await (const ev of provider.stream({
      turns: [userTurn],
      model: args.model,
      config: {
        session_id: args.runId,
        workspace_root: args.workspaceRoot,
        permission_level: args.permissionLevel,
      },
      signal: sideController.signal,
    })) {
      if (sideController.signal.aborted) break;
      if (ev.type === 'message_start') {
        currentTurnId = ev.turn_id as TurnId;
        // model 이 stream 시작 시점에 정해질 수 있어 한 번 sync.
        args.store.updateSide(args.runId, args.side, { model: ev.model });
        continue;
      }
      if (ev.type === 'text_delta') {
        accumulated += ev.text;
        args.store.updateSide(args.runId, args.side, { text: accumulated });
        args.emit({
          type: 'compare_side_delta',
          run_id: args.runId,
          side: args.side,
          text_delta: ev.text,
        });
        continue;
      }
      if (ev.type === 'message_complete') {
        // message_complete.turn 이 final text 를 가지고 있을 수 있음.
        // 단 이미 누적된 accumulated 가 더 길거나 같으면 그대로 쓴다.
        const finalText = extractAssistantText(ev.turn);
        if (finalText.length > accumulated.length) {
          accumulated = finalText;
          args.store.updateSide(args.runId, args.side, { text: accumulated });
        }
        finishOk();
        break;
      }
      if (ev.type === 'error') {
        finishError(ev.error);
        break;
      }
      // text 외의 event (tool_call_*, usage 등) 는 compare MVP 에서 무시.
      // 향후 P1+ 에서 tool 사용도 비교 가능하도록 확장.
    }

    if (sideController.signal.aborted && !terminalEmitted) {
      finishError(args.parentSignal.aborted ? 'compare cancelled' : 'side aborted');
    }
    if (!terminalEmitted) {
      // stream 이 자연스럽게 끝났는데 message_complete 도 error 도 없는 케이스
      // (provider 의 비정상 종료). done 으로 마무리해 사용자 경험 보호.
      finishOk();
    }
  } catch (err) {
    // factory 자체가 throw 했거나 stream() 이 동기적으로 throw — 격리.
    const msg = err instanceof Error ? err.message : String(err);
    finishError(msg);
  } finally {
    args.parentSignal.removeEventListener('abort', onParentAbort);
    // currentTurnId 는 향후 P1 (turn 기반 추가 메타) 용 — 현재 사용 X.
    void currentTurnId;
  }
}

function extractAssistantText(turn: Turn): string {
  if (!Array.isArray(turn.content)) return '';
  let acc = '';
  for (const block of turn.content) {
    if (block.type === 'text') {
      acc += block.text;
    }
  }
  return acc;
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Compare run 시작. CompareStore 에 row 를 만든 후 양쪽 provider 를 병렬 실행.
 *
 * 반환값은 새로 만들어진 run id — orchestrator 가 background 에서 stream 을
 * 진행하므로 호출자는 즉시 id 를 받아 IPC 응답할 수 있다. 결과는 emit 으로
 * 흘러들어간다.
 *
 * 양쪽이 모두 종료될 때까지 await — 호출자는 결과 row 가 영속된 후의 final
 * status 를 알 수 있다. abort 도 양쪽 모두에 forward.
 */
export async function runCompare(
  args: CompareOrchestratorArgs,
  store: CompareStore,
  factory: ProviderFactory,
  emit: (event: CompareEvent) => void
): Promise<CompareRun> {
  if (args.prompt.trim().length === 0) {
    throw new Error('runCompare: prompt must be non-empty');
  }
  const run = store.createRun({
    session_id: args.session_id,
    prompt: args.prompt,
    workspace_root: args.workspace_root,
    permission_level: args.permission_level,
    claude_model: args.claude_model,
    codex_model: args.codex_model,
  });

  emit({ type: 'compare_start', run_id: run.id });

  const parentController = new AbortController();
  const onAbort = (): void => parentController.abort();
  if (args.abortSignal !== undefined) {
    if (args.abortSignal.aborted) {
      parentController.abort();
    } else {
      args.abortSignal.addEventListener('abort', onAbort, { once: true });
    }
  }

  // Promise.allSettled — one side 의 reject 가 전체를 reject 시키지 않음.
  // pumpSide 는 자체 try/catch 로 never-throw 이지만 방어적으로 한 번 더.
  await Promise.allSettled([
    pumpSide({
      runId: run.id,
      side: 'claude',
      prompt: args.prompt,
      model: args.claude_model,
      workspaceRoot: args.workspace_root,
      permissionLevel: args.permission_level,
      factory,
      parentSignal: parentController.signal,
      store,
      emit,
    }),
    pumpSide({
      runId: run.id,
      side: 'codex',
      prompt: args.prompt,
      model: args.codex_model,
      workspaceRoot: args.workspace_root,
      permissionLevel: args.permission_level,
      factory,
      parentSignal: parentController.signal,
      store,
      emit,
    }),
  ]);

  if (args.abortSignal !== undefined) {
    args.abortSignal.removeEventListener('abort', onAbort);
  }

  const finalRun = store.finalizeRun(run.id);
  emit({ type: 'compare_complete', run_id: run.id, run: finalRun });
  return finalRun;
}

// Re-export StreamEvent for callers building a factory in tests.
export type { StreamEvent };
