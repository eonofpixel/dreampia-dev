/**
 * AutomationHttpListener — Webhook trigger 용 localhost-only HTTP server (v1.7.2).
 *
 * Spec: docs/v1.x-roadmap.md (v1.7.2 — Automation HTTP listener).
 *
 * 외부 시스템 (curl, GitHub Actions, 다른 Electron 앱 등) 이 자동화 규칙을
 * 트리거할 수 있도록 작은 HTTP 서버를 띄움. AutomationManager 의 'webhook'
 * kind 규칙이 등록한 path 를 listen.
 *
 * 보안 정책:
 *  - 기본 bind 는 `127.0.0.1` (localhost) — 외부 노출 금지.
 *  - port 0 → OS 가 사용 가능 포트 자동 할당 (테스트 + 부팅 시 충돌 회피).
 *  - body 는 stub — 본 MVP 는 fire 만 트리거. payload 처리는 후속.
 *  - URL pathname 만 매칭 (querystring / hash 무시).
 *
 * 라우팅:
 *  - POST /hooks/<name> → 해당 webhook 규칙 fire. 200 OK + JSON.
 *  - 다른 method → 405.
 *  - 미등록 path → 404.
 *
 * 에러 시 fail-closed: 핸들러 throw 는 500 + audit (AutomationManager 가
 * 이미 records). 클라이언트는 에러 모름.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { AutomationManager, AutomationRule } from './AutomationManager';

export interface AutomationHttpListenerOptions {
  /**
   * 바인딩할 host. default '127.0.0.1' — 외부 노출 시 사용자가 명시 옵트인.
   * '0.0.0.0' 은 사용 권장 X (LAN 노출).
   */
  host?: string;
  /**
   * 바인딩할 port. 0 이면 OS 자동 할당. default 0.
   */
  port?: number;
  /** Test/instrumentation — 모든 요청을 audit. */
  auditSink?: (event: AutomationHttpAudit) => void;
}

export interface AutomationHttpAudit {
  timestamp: string;
  event:
    | 'http.request'
    | 'http.fired'
    | 'http.not_found'
    | 'http.method_not_allowed'
    | 'http.error';
  method: string;
  pathname: string;
  rule_name?: string;
  status: number;
  error?: string;
}

const HOOK_PATH_PREFIX = '/hooks/';

export class AutomationHttpListener {
  private server: Server | null = null;
  private actualPort: number | null = null;
  private readonly auditSink: (event: AutomationHttpAudit) => void;
  private readonly host: string;
  private readonly desiredPort: number;

  constructor(
    private readonly manager: AutomationManager,
    options: AutomationHttpListenerOptions = {}
  ) {
    this.host = options.host ?? '127.0.0.1';
    this.desiredPort = options.port ?? 0;
    this.auditSink = options.auditSink ?? ((): void => {});
  }

  /**
   * Server start. listen 완료 시 실제 할당된 port 반환 (port=0 일 때 유용).
   * 이미 실행 중이면 기존 port 반환.
   */
  async start(): Promise<number> {
    if (this.server !== null && this.actualPort !== null) {
      return this.actualPort;
    }
    return new Promise<number>((resolve, reject) => {
      const server = createServer((req, res) => {
        this.handleRequest(req, res);
      });
      server.once('error', (err) => {
        reject(err);
      });
      server.listen(this.desiredPort, this.host, () => {
        const addr = server.address();
        if (addr === null || typeof addr === 'string') {
          reject(new Error('listen returned non-AddressInfo'));
          return;
        }
        this.server = server;
        this.actualPort = addr.port;
        resolve(addr.port);
      });
    });
  }

  /** 실행 중인 서버 close. 미시작 상태면 no-op. */
  async stop(): Promise<void> {
    const server = this.server;
    if (server === null) return;
    this.server = null;
    this.actualPort = null;
    return new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }

  /** 현재 listening port (없으면 null). 테스트용 노출. */
  getPort(): number | null {
    return this.actualPort;
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const method = req.method ?? 'GET';
    // Node 's url' 의 URL 객체로 pathname 추출. host header 가 없을 수 있어
    // dummy origin 으로 normalize.
    let pathname = '/';
    try {
      const u = new URL(req.url ?? '/', 'http://internal/');
      pathname = u.pathname;
    } catch {
      pathname = req.url ?? '/';
    }

    this.auditSink({
      timestamp: new Date().toISOString(),
      event: 'http.request',
      method,
      pathname,
      status: 0,
    });

    if (!pathname.startsWith(HOOK_PATH_PREFIX)) {
      this.respond(res, 404, { error: 'not_found' });
      this.auditSink({
        timestamp: new Date().toISOString(),
        event: 'http.not_found',
        method,
        pathname,
        status: 404,
      });
      return;
    }

    if (method !== 'POST') {
      this.respond(res, 405, { error: 'method_not_allowed', allowed: ['POST'] });
      this.auditSink({
        timestamp: new Date().toISOString(),
        event: 'http.method_not_allowed',
        method,
        pathname,
        status: 405,
      });
      return;
    }

    const rule = this.findWebhookRuleByPath(pathname);
    if (rule === null) {
      this.respond(res, 404, { error: 'unknown_hook', pathname });
      this.auditSink({
        timestamp: new Date().toISOString(),
        event: 'http.not_found',
        method,
        pathname,
        status: 404,
      });
      return;
    }

    // body 는 drain 만 (현재 MVP 는 payload 미처리). 메모리 폭탄 차단을 위해
    // 누적 byte 가 일정 이상이면 abort.
    let received = 0;
    const MAX_BYTES = 64 * 1024;
    let aborted = false;
    req.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > MAX_BYTES) {
        aborted = true;
        req.destroy();
      }
    });
    req.on('end', () => {
      if (aborted) {
        // 클라이언트 abort — 이미 connection 끊김. 응답 X.
        return;
      }
      void this.fireAndRespond(rule, method, pathname, res);
    });
    req.on('error', () => {
      // 무응답 — connection 깨졌을 가능성.
    });
  }

  private async fireAndRespond(
    rule: AutomationRule,
    method: string,
    pathname: string,
    res: ServerResponse
  ): Promise<void> {
    try {
      await this.manager.fire(rule.name);
      this.respond(res, 200, { ok: true, rule: rule.name });
      this.auditSink({
        timestamp: new Date().toISOString(),
        event: 'http.fired',
        method,
        pathname,
        rule_name: rule.name,
        status: 200,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.respond(res, 500, { error: 'internal' });
      this.auditSink({
        timestamp: new Date().toISOString(),
        event: 'http.error',
        method,
        pathname,
        rule_name: rule.name,
        status: 500,
        error: msg,
      });
    }
  }

  private findWebhookRuleByPath(pathname: string): AutomationRule | null {
    for (const rule of this.manager.list()) {
      if (rule.kind !== 'webhook') continue;
      const path = rule.webhook_path;
      if (path === undefined) continue;
      if (path === pathname) return rule;
    }
    return null;
  }

  private respond(res: ServerResponse, status: number, body: unknown): void {
    if (res.headersSent || res.writableEnded) return;
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  }
}
