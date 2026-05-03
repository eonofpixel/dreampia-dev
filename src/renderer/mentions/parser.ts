/**
 * @ mention parser — F-019 (v0.6.0).
 *
 * 사용자가 채팅 입력 중에 `@<query>` 형태로 파일 / 세션을 멘션하면, 그 토큰을
 * 식별해 popover 후보 필터링과 resolve 단계에 넘기는 책임을 진다.
 *
 * 주요 인터페이스:
 *   - findActiveMention(text, cursorPos): 커서 위치에 활성 멘션이 있으면 반환,
 *     없으면 null. ChatInput 의 popover trigger 에 사용.
 *   - findAllMentions(text): 전체 텍스트의 모든 멘션을 (start asc) 순서로
 *     반환. 메시지 submit 시 resolver 가 일괄 fetch 하기 위해 사용.
 *
 * 규칙:
 *   - `@` 가 멘션 시작이 되려면 그 앞이 BOF 이거나 whitespace 여야 한다
 *     (이메일 같은 `user@host` 가 멘션으로 잘못 잡히지 않도록).
 *   - 멘션 토큰의 끝은 다음 whitespace (공백, 탭, 개행) 또는 EOF.
 *   - `query` 는 `@` 직후부터 끝까지 (양 끝 trim 없음 — 사용자가 입력 중인 그대로).
 *   - kind:
 *       'session'  : query 가 `session:` 으로 시작 → value = query.slice(8)
 *       'file'     : query 가 비어있지 않고 위 케이스에 해당 안 됨 → value = query
 *       'unknown'  : query 가 빈 문자열 (= `@` 만 입력하고 아직 더 안 침)
 *
 * 본 모듈은 plain TS, React 의존성 X — main / renderer 어디서든 사용 가능.
 *
 * Spec: docs/ux/patterns/F-019-mention-palette.md
 */

export type MentionKind = 'file' | 'session' | 'unknown';

export interface MentionMatch {
  /** Position in original text where '@' appears (inclusive). */
  start: number;
  /**
   * Position right after the mention ends (exclusive). 즉 text.slice(start, end)
   * = `@<query>` 가 된다. 공백 / EOF 까지 진행.
   */
  end: number;
  /** Query after '@' (e.g. "src/main" for "@src/main", "session:abc" for "@session:abc"). */
  query: string;
  /** Kind based on query prefix. */
  kind: MentionKind;
  /**
   * Stripped value:
   *   - file    : query 그대로 (relative path)
   *   - session : query.slice("session:".length) (session id 또는 그 prefix)
   *   - unknown : 빈 문자열
   */
  value: string;
}

const SESSION_PREFIX = 'session:';

function isWhitespace(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  // 일반 공백 + 탭 + 개행. 멘션 경계로 사용.
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

/**
 * `@` 이 멘션 trigger 가 되려면 BOF 이거나 직전이 whitespace 여야 한다.
 * 이메일 / 코드 syntax 등의 부정행위 방지.
 */
function canStartMention(text: string, atIdx: number): boolean {
  if (atIdx === 0) return true;
  return isWhitespace(text[atIdx - 1]);
}

function classify(query: string): { kind: MentionKind; value: string } {
  if (query.length === 0) return { kind: 'unknown', value: '' };
  if (query.startsWith(SESSION_PREFIX)) {
    return { kind: 'session', value: query.slice(SESSION_PREFIX.length) };
  }
  return { kind: 'file', value: query };
}

/**
 * 커서가 멘션 안에 있는지 판단해 활성 멘션을 반환.
 *
 * - cursor 위치 직전까지 거슬러 올라가며 가장 가까운 `@` 찾기 (whitespace 만나면 중단)
 * - 그 `@` 이 멘션 시작 자격을 갖춰야 함 (BOF 또는 whitespace 직후)
 * - 그 `@` 부터 cursor 또는 다음 whitespace 까지가 멘션 토큰
 *
 * 끝 경계 결정:
 *   - cursor 가 토큰 안 (공백 만나기 전) → end = cursor 그 자체. 사용자가 입력
 *     "중인" 부분만 query 로 잡아 popover 가 부드럽게 좁혀진다.
 *   - cursor 가 토큰 끝 또는 직후 (다음 공백 직전이거나 EOF) → end = whitespace 위치 또는 EOF.
 */
export function findActiveMention(text: string, cursorPos: number): MentionMatch | null {
  if (text.length === 0) return null;
  const cur = Math.max(0, Math.min(cursorPos, text.length));
  // 1) cursor 위치 바로 앞까지 backscan — 공백을 만나면 멘션 아님.
  let atIdx = -1;
  for (let i = cur - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === undefined) break;
    if (isWhitespace(ch)) {
      // 공백을 만나기 전에 `@` 가 없었으므로 cursor 는 멘션 안에 없음.
      return null;
    }
    if (ch === '@') {
      atIdx = i;
      break;
    }
  }
  if (atIdx === -1) return null;
  if (!canStartMention(text, atIdx)) return null;

  // 2) end 는 cursor 위치 (사용자가 입력 중인 prefix 까지만).
  // cursor 가 이미 공백을 지났을 수 있으므로 보수적으로 cursor + 토큰 끝 중 작은 값.
  let tokenEnd = cur;
  // 만약 cursor 위치 자체가 공백 이후라 가능하면, 예외적으로 token end 는
  // cursor 직전의 마지막 non-whitespace 위치 — 하지만 위의 backscan 이 이미
  // 공백을 만나면 null 을 반환했으므로 여기에 도달했다면 cursor 는 토큰 안
  // 또는 토큰 끝.
  // 그래도 cursor 뒤쪽에 멘션이 더 이어질 수 있다 — cursor 다음부터 첫 whitespace 까지 확장.
  for (let j = cur; j < text.length; j++) {
    const ch = text[j];
    if (ch === undefined) break;
    if (isWhitespace(ch)) break;
    tokenEnd = j + 1;
  }

  const query = text.slice(atIdx + 1, tokenEnd);
  const { kind, value } = classify(query);
  return { start: atIdx, end: tokenEnd, query, kind, value };
}

/**
 * 입력 텍스트의 모든 멘션을 첫 등장 순서대로 반환. submit 시 resolver 가 한
 * 번에 fetch 하기 위해 사용.
 *
 * 동일 텍스트에 같은 멘션이 여러 번 등장해도 각각 1개의 MentionMatch 로 잡힘
 * — 결과 형식 보존을 위해 dedup 은 호출 측 책임.
 */
export function findAllMentions(text: string): MentionMatch[] {
  const out: MentionMatch[] = [];
  if (text.length === 0) return out;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch !== '@') {
      i += 1;
      continue;
    }
    if (!canStartMention(text, i)) {
      i += 1;
      continue;
    }
    // i 부터 다음 whitespace 또는 EOF 까지가 토큰.
    let j = i + 1;
    while (j < text.length && !isWhitespace(text[j])) j += 1;
    const query = text.slice(i + 1, j);
    if (query.length === 0) {
      // `@` 만 외따로 있는 경우 — submit 단계 mention 으로는 의미 X. skip.
      i = j + 1;
      continue;
    }
    const { kind, value } = classify(query);
    out.push({ start: i, end: j, query, kind, value });
    i = j + 1;
  }
  return out;
}
