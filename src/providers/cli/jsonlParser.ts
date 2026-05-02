/**
 * JSONL 스트림 파서 — 청크 누적 후 라인 단위 JSON.parse.
 *
 * Spec: docs/findings/round5-bugs.md (MCP message parser 약함 회피)
 *
 * Skip 규칙 (round5-bugs 의 MCP parser 결함을 우리는 처음부터 피한다):
 *   - 빈 라인 → skip
 *   - `{` 또는 `[` 로 시작하지 않는 라인 → skip
 *     (CLI 는 banner / ANSI 코드 / 진행상황 텍스트 등을 stdout 에 섞을 수 있음)
 *   - JSON.parse 실패 → skip silently
 *
 * 이 파서는 throw 하지 않는다 — 모든 비정상 입력은 조용히 버린다.
 */

export class JsonlParser {
  private buffer = '';

  /**
   * 청크 1개 누적 후 완전한 라인을 모두 파싱해 반환.
   *
   * 마지막 라인이 newline 으로 끝나지 않으면 buffer 에 남겨둔다 (다음 push
   * 또는 flush 에서 처리).
   */
  push(chunk: string): unknown[] {
    this.buffer += chunk;
    const out: unknown[] = [];
    let idx = this.buffer.indexOf('\n');
    while (idx >= 0) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      const parsed = this.parseLine(line);
      if (parsed !== undefined) out.push(parsed);
      idx = this.buffer.indexOf('\n');
    }
    return out;
  }

  /**
   * EOF 시 버퍼에 남은 마지막 라인 처리.
   */
  flush(): unknown[] {
    if (this.buffer.length === 0) return [];
    const parsed = this.parseLine(this.buffer);
    this.buffer = '';
    return parsed !== undefined ? [parsed] : [];
  }

  /** 파싱 가능한 JSON 값을 반환. 실패하면 undefined (skip). */
  private parseLine(line: string): unknown {
    // \r\n / \r 처리: trim 으로 양끝 whitespace 제거
    const trimmed = line.trim();
    if (trimmed.length === 0) return undefined;

    // round5-bugs guard: JSON 시작 문자가 아니면 즉시 skip
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined;

    try {
      return JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
}
