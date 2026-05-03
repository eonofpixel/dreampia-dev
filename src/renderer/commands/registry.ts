/**
 * Slash command registry — F-018 (v0.5.0).
 *
 * 채팅 입력 첫 문자가 `/` 일 때 popover 가 열리고 등록된 command 중 하나를
 * 실행한다. 새 도메인은 추가하지 않고 기존 기능(`새 채팅`, `MCP 설정`,
 * `사용량`, `온보딩 다시 보기`, `대화 초기화`, `모델 변경`) 의 접근성만 끌어
 * 올린다 — 키보드만으로 주요 화면/액션 도달이 가능하도록.
 *
 * Spec:
 *   - docs/ux/patterns/F-018-slash-commands.md
 *   - PRD.md (v0.5.0 acceptance: "마우스 없이 주요 화면/액션 접근 가능")
 *
 * 한국어 우선 — Spec: docs/design/principles.md
 */

export type SlashCommandId =
  | 'help'
  | 'clear'
  | 'new'
  | 'model'
  | 'settings'
  | 'usage'
  | 'onboarding'
  | 'compare';

export interface SlashCommand {
  id: SlashCommandId;
  /** Trigger 문자열, 항상 `/` 로 시작. */
  trigger: string;
  /** Popover 에 표시되는 한국어 라벨. */
  label: string;
  /** Popover 의 1줄 설명 (한국어). */
  description: string;
  /** true 면 인자가 필요 (예: `/model claude-3-5-sonnet`). */
  hasArgs?: boolean;
  /** 인자 입력 시 popover 에 표시할 힌트 (예: "<모델명>"). */
  argHint?: string;
}

/**
 * 등록된 슬래시 명령 목록.
 *
 * 순서가 곧 기본 popover 순서 — 자주 쓰는 항목부터 위에 둔다.
 * `id` 별로 unique. 새 명령은 SlashCommandId union 에도 추가해야 한다.
 */
export const SLASH_COMMANDS: ReadonlyArray<SlashCommand> = [
  {
    id: 'help',
    trigger: '/help',
    label: '도움말',
    description: '사용 가능한 명령어 보기',
  },
  {
    id: 'clear',
    trigger: '/clear',
    label: '대화 초기화',
    description: '현재 세션의 메시지를 모두 비웁니다',
  },
  {
    id: 'new',
    trigger: '/new',
    label: '새 채팅',
    description: '새 세션을 만들고 전환',
  },
  {
    id: 'model',
    trigger: '/model',
    label: '모델 변경',
    description: '현재 세션의 AI 모델 변경',
    hasArgs: true,
    argHint: '<모델명>',
  },
  {
    id: 'settings',
    trigger: '/settings',
    label: 'MCP 설정',
    description: 'MCP 서버 설정 모달 열기',
  },
  {
    id: 'usage',
    trigger: '/usage',
    label: '사용량',
    description: '토큰/비용 사용량 보기',
  },
  {
    id: 'onboarding',
    trigger: '/onboarding',
    label: '온보딩 다시 보기',
    description: '5-step 환영 가이드 다시 진행',
  },
  {
    id: 'compare',
    trigger: '/compare',
    label: '응답 비교',
    description: 'Claude 와 Codex 양쪽 응답을 나란히 비교',
    hasArgs: true,
    argHint: '<프롬프트>',
  },
];

/**
 * `/model <name>` 커맨드 입력 시 허용되는 모델 ID.
 *
 * v0.5.0 — slash 커맨드 인자 검증용 화이트리스트. 실제 routing 은 main 의
 * `auto.ts` 에서 prefix 기반으로 결정되지만, slash 입력은 사용자가 직접
 * 타이핑하므로 알 수 없는 모델은 거절해 silent failure 를 막는다.
 *
 * 새 모델이 출시되면 여기와 `src/providers/pricing.ts` 양쪽에 추가.
 */
export const KNOWN_MODELS: ReadonlyArray<string> = [
  // Claude
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet',
  'claude-3-5-haiku',
  'claude-3-opus',
  // Codex / OpenAI
  'gpt-5.5',
  'gpt-4o',
  'o1',
  'o3-mini',
];

export interface ParsedSlashInput {
  command: SlashCommand;
  /** Trigger 뒤에 따라오는 인자 (trim). 인자 없으면 빈 문자열. */
  arg: string;
}

/**
 * 입력 문자열을 슬래시 명령 + 인자로 파싱.
 *
 * @param text 사용자가 입력한 raw 문자열
 * @returns 매칭되는 명령 + 인자, 매칭 실패 시 null
 *
 * 규칙:
 *   - `/` 로 시작하지 않으면 null
 *   - 첫 공백까지가 trigger, 그 뒤가 arg
 *   - trigger 가 `SLASH_COMMANDS` 와 정확히 일치해야 매칭
 *   - 알 수 없는 trigger 는 null (예: `/foo` 는 null, `/help` 는 매칭)
 */
export function parseSlashInput(text: string): ParsedSlashInput | null {
  if (!text.startsWith('/')) return null;
  const space = text.indexOf(' ');
  const trigger = space === -1 ? text : text.slice(0, space);
  const arg = space === -1 ? '' : text.slice(space + 1).trim();
  const command = SLASH_COMMANDS.find((c) => c.trigger === trigger);
  if (command === undefined) return null;
  return { command, arg };
}

/**
 * 부분 입력에 대해 매칭되는 명령 목록을 반환 (popover filter 용).
 *
 * @param query 사용자가 지금까지 입력한 raw 문자열 (보통 `/` 또는 `/u` 같은 부분)
 * @returns 관련도 순으로 정렬된 매칭 명령 배열
 *
 * 정렬 우선순위:
 *   1. trigger 가 query 로 시작하는 명령 (prefix match)
 *   2. label 에 query 의 `/` 제외 부분이 포함되는 명령 (substring match)
 *
 * Empty result 는 hidden popover 를 의미한다.
 * `/` 만 입력했을 때는 모든 명령이 prefix-match 로 표시된다.
 */
export function filterCommands(query: string): ReadonlyArray<SlashCommand> {
  if (!query.startsWith('/')) return [];
  const q = query.toLowerCase();
  const matches: Array<{ cmd: SlashCommand; score: number }> = [];
  for (const cmd of SLASH_COMMANDS) {
    if (cmd.trigger.toLowerCase().startsWith(q)) {
      matches.push({ cmd, score: 0 });
      continue;
    }
    // q.slice(1) 은 '/' 다음 부분 — label 매칭 시 prefix `/` 는 제거.
    // 빈 문자열 (q === '/') 은 위의 startsWith 에서 이미 모두 매칭됨.
    const labelQuery = q.slice(1);
    if (labelQuery.length > 0 && cmd.label.toLowerCase().includes(labelQuery)) {
      matches.push({ cmd, score: 1 });
    }
  }
  matches.sort((a, b) => a.score - b.score);
  return matches.map((m) => m.cmd);
}
