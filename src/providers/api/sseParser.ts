/**
 * SSE (Server-Sent Events) parser — Direct API stream 파싱 (v1.2.2 / P2).
 *
 * Spec: https://html.spec.whatwg.org/multipage/server-sent-events.html
 *
 * 사용:
 *   const parser = new SseParser();
 *   for (const event of parser.push(chunk)) {
 *     // { event: 'message_delta', data: '{"type":...}' }
 *   }
 *   parser.flush(); // 마지막 line 처리
 *
 * 형식:
 *   event: <name>\n
 *   data: <line1>\n
 *   data: <line2>\n
 *   \n
 */

export interface SseEvent {
  /** event field — 미지정 시 'message' (HTML 명세). */
  event: string;
  /** 누적된 data lines (concat with '\n'). JSON 의 경우 caller 가 parse. */
  data: string;
  /** id field — 명시 시 client 가 last-event-id 추적. */
  id?: string;
}

export class SseParser {
  private buffer = '';
  private currentEvent = 'message';
  private currentData: string[] = [];
  private currentId: string | undefined;

  /**
   * 새 chunk 를 누적하고 완성된 SSE event 를 yield.
   */
  *push(chunk: string): Generator<SseEvent> {
    this.buffer += chunk;
    let newlineIdx = this.buffer.indexOf('\n');
    while (newlineIdx >= 0) {
      const line = this.buffer.slice(0, newlineIdx);
      this.buffer = this.buffer.slice(newlineIdx + 1);
      const event = this.processLine(line);
      if (event !== null) yield event;
      newlineIdx = this.buffer.indexOf('\n');
    }
  }

  /** 마지막 buffered line 처리 — caller 가 stream end 시 호출. */
  *flush(): Generator<SseEvent> {
    if (this.buffer.length > 0) {
      const event = this.processLine(this.buffer);
      this.buffer = '';
      if (event !== null) yield event;
    }
    // 미완성 event 가 남아있으면 한 번 더 flush.
    if (this.currentData.length > 0) {
      const event: SseEvent = {
        event: this.currentEvent,
        data: this.currentData.join('\n'),
        ...(this.currentId !== undefined && { id: this.currentId }),
      };
      this.resetCurrent();
      yield event;
    }
  }

  private processLine(rawLine: string): SseEvent | null {
    // CRLF 정규화.
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    // 빈 줄 = event 종료.
    if (line === '') {
      if (this.currentData.length === 0) return null;
      const event: SseEvent = {
        event: this.currentEvent,
        data: this.currentData.join('\n'),
        ...(this.currentId !== undefined && { id: this.currentId }),
      };
      this.resetCurrent();
      return event;
    }

    // Comment line — 무시.
    if (line.startsWith(':')) return null;

    const colonIdx = line.indexOf(':');
    let field: string;
    let value: string;
    if (colonIdx < 0) {
      field = line;
      value = '';
    } else {
      field = line.slice(0, colonIdx);
      value = line.slice(colonIdx + 1);
      if (value.startsWith(' ')) value = value.slice(1);
    }

    switch (field) {
      case 'event':
        this.currentEvent = value;
        break;
      case 'data':
        this.currentData.push(value);
        break;
      case 'id':
        this.currentId = value;
        break;
      case 'retry':
        // ignored — caller 가 reconnect 정책 결정.
        break;
      default:
        // unknown field — 명세상 무시.
        break;
    }
    return null;
  }

  private resetCurrent(): void {
    this.currentEvent = 'message';
    this.currentData = [];
    this.currentId = undefined;
  }
}
