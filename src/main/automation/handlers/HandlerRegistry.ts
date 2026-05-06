/**
 * v1.7.23 — Automation handler registry.
 *
 * AutomationManager rule fire 시점에 실행될 named handler 의 lookup table.
 *
 * 설계:
 *   - HandlerRegistry 는 module-level singleton (`handlerRegistry`).
 *   - 각 builtin handler 는 register() 로 자기 이름으로 등록.
 *   - IPC 의 automation/register 가 raw rule 을 받을 때
 *     `handler_name` + `handler_config` 를 사용해 registry 에서 lookup.
 *   - lookup 결과를 closure 로 wrap 해 AutomationRule.handler 에 주입.
 *
 * 구별 — `AutomationRule.handler` 는 closure (직렬화 불가).
 *        `handler_name` / `handler_config` 는 직렬화 가능 (settings.json 영속).
 *        registry 가 두 세계를 잇는 다리 역할.
 */

export interface HandlerContext {
  /** Rule 이름. audit log 에 포함. */
  rule_name: string;
  /** Rule.handler_config — handler 별 schema. 없으면 빈 객체. */
  config: Record<string, unknown>;
}

export interface HandlerResult {
  ok: boolean;
  /** 사람 가독성 한 줄 요약. audit 에 truncated 로 포함. */
  output?: string;
  /** ok=false 인 경우 사유. */
  error?: string;
}

export type AutomationHandler = (
  ctx: HandlerContext
) => Promise<HandlerResult>;

/**
 * Handler 식별자 → 실행 함수 lookup.
 *
 * 모든 builtin handler 는 부팅 시 자동 등록. 외부 (e.g. plugin) 에서
 * 추가 handler 를 등록할 수 있도록 register() 도 노출.
 */
export class HandlerRegistry {
  private readonly handlers = new Map<string, AutomationHandler>();

  register(name: string, handler: AutomationHandler): void {
    if (name.length === 0) throw new Error('handler name required');
    this.handlers.set(name, handler);
  }

  unregister(name: string): boolean {
    return this.handlers.delete(name);
  }

  get(name: string): AutomationHandler | undefined {
    return this.handlers.get(name);
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }

  /** 등록된 handler 이름 목록. UI 의 dropdown 에서 사용. */
  list(): string[] {
    return Array.from(this.handlers.keys()).sort();
  }

  /** Test 전용 — registry 초기화. */
  clearForTesting(): void {
    this.handlers.clear();
  }
}

/**
 * Module-level singleton. 부팅 시 builtin handler 들이 자동 등록.
 */
export const handlerRegistry = new HandlerRegistry();

/**
 * Default fallback handler. Rule 이 handler_name 미지정 시 사용.
 * 기존 v1.7.4~v1.7.22 의 'no-op log' 동작과 호환.
 */
export const NOOP_LOG_HANDLER_NAME = 'noop-log';

export const noopLogHandler: AutomationHandler = async (ctx) => {
  console.info(`[automation] rule fired (noop-log): ${ctx.rule_name}`);
  return { ok: true, output: 'noop' };
};

/**
 * Truncate audit log output. handler 결과가 너무 길면 잘라서 audit 에 포함.
 */
export function truncateOutput(text: string, max = 2000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...[truncated ${text.length - max} chars]`;
}
