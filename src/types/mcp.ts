/**
 * MCP (Model Context Protocol) types — server config + JSON-RPC envelope.
 *
 * Spec: docs/tools/mcp-bridge.md, https://modelcontextprotocol.io/
 *
 * Phase 1 (v0.2.0) MVP scope:
 *  - stdio transport only (HTTP/SSE 는 별도 issue)
 *  - tools/list + tools/call (resources / prompts 는 P2)
 *  - 사용자 수동 add (server discovery 미지원)
 *
 * 보안:
 *  - command/args/env 는 사용자 입력 — main process 만 spawn 호출 가능.
 *  - renderer 는 IPC 로 add/remove 만 트리거. 직접 spawn X.
 *  - NETWORK_MCP capability 가 매 tools/call 마다 검증됨 (Queue.checkPermissions).
 */

import { z } from 'zod';
import { AbsolutePathSchema, ISO8601Schema } from './common';

// ────────────────────────────────────────────────────────────
// McpServerConfig — settings.json 에 영속화되는 1개 서버 설정.
// ────────────────────────────────────────────────────────────

/**
 * id 는 사용자가 제공하는 unique key. ToolRegistry 의 'mcp.{id}.{tool_name}'
 * prefix 로 사용되므로 영문/숫자/하이픈/언더스코어만 허용.
 */
const McpServerIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, 'id must be [a-zA-Z0-9_-]+');

export const McpServerConfigSchema = z
  .object({
    id: McpServerIdSchema,
    name: z.string().min(1).max(128),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    env: z.record(z.string()).default({}),
    cwd: AbsolutePathSchema.optional(),
    enabled: z.boolean().default(true),
    added_at: ISO8601Schema,
  })
  .strict();

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

// ────────────────────────────────────────────────────────────
// Server status (lifecycle phase)
// ────────────────────────────────────────────────────────────

export type McpServerStatus =
  | 'disconnected' // not started yet OR cleanly stopped
  | 'connecting' // spawn issued, handshake pending
  | 'ready' // initialize handshake done, tools/list received
  | 'error' // spawn/handshake failed OR runtime crash
  | 'disabled'; // config.enabled=false

// ────────────────────────────────────────────────────────────
// McpToolInfo — single tool descriptor returned by tools/list.
//
// MCP spec 의 ToolDescriptor 의 minimal subset. inputSchema 는
// JSON Schema object — 그대로 보관 (P0 에선 Zod 변환 안 함).
// ────────────────────────────────────────────────────────────

export interface McpToolInfo {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────
// McpServerState — 사용자에게 표시되는 1개 서버의 런타임 상태.
//
// listServers() 가 반환하는 형식이며 IPC 로 renderer 에 그대로 전달.
// ────────────────────────────────────────────────────────────

export interface McpServerState {
  config: McpServerConfig;
  status: McpServerStatus;
  /** spawn 된 child process 의 OS pid. status='ready' 시 존재. */
  pid?: number;
  tools: McpToolInfo[];
  /** 직전 실행에서 발생한 마지막 에러 메시지. */
  last_error?: string;
  /** 최근 50 줄까지의 stdout/stderr 로그 (MCP UI 의 'logs 보기'). */
  last_log: string[];
}

// ────────────────────────────────────────────────────────────
// JSON-RPC 2.0 envelope (subset MCP uses)
//
// 참고: https://www.jsonrpc.org/specification
// ────────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponseSuccess {
  jsonrpc: '2.0';
  id: number | string;
  result: unknown;
}

export interface JsonRpcResponseError {
  jsonrpc: '2.0';
  id: number | string;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse = JsonRpcResponseSuccess | JsonRpcResponseError;

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}
