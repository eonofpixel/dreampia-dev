/**
 * MCP discovery — 추천 MCP 서버 + Claude/Codex CLI 의 mcp config 자동 탐지.
 *
 * Spec: ROADMAP.md (v0.9.0 E — MCP discovery)
 *
 * 두 개의 채널:
 *
 * 1) **SUGGESTED_MCP_SERVERS** — 정적 추천 목록.
 *    사용자가 [추가] 버튼 한 번 클릭으로 빠르게 등록할 수 있도록.
 *    install_hint 는 한국어 — npm/npx 가 PATH 에 있어야 한다는 등.
 *
 * 2) **detectMcpFromClaudeConfig / detectMcpFromCodexConfig** — best-effort.
 *    각 CLI 의 표준 config 파일 위치를 시도해서 정의된 MCP 서버 추출.
 *    파일 없거나 권한 없거나 schema 가 다르면 빈 배열 (silent — 로그만).
 *    절대 throw X — 부팅 시점에 호출해도 안전.
 *
 * 보안:
 *  - 외부 파일 read 만 — write X
 *  - command/args/env 는 그대로 보존 — 사용자가 [추가] 버튼 누를 때만
 *    settings.json 에 영속 (사용자 의도된 행위)
 *  - claude/codex config 의 server id 가 영문/숫자/하이픈/언더스코어 외
 *    문자를 포함하면 sanitize (McpServerConfigSchema 통과 보장)
 */

import { promises as fsp } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { McpServerConfigSchema, type McpServerConfig } from '@/types';

// ────────────────────────────────────────────────────────────
// SUGGESTED_MCP_SERVERS — 정적 추천 목록
// ────────────────────────────────────────────────────────────

export interface SuggestedMcpServer {
  /** UI / settings 에 등록 시 사용할 unique key. */
  id: string;
  /** UI 표시명 (한국어). */
  name: string;
  /** UI 설명 (한국어, 1-2 문장). */
  description: string;
  /** 실행 명령. 보통 'npx'. */
  command: string;
  /** 명령 인자. */
  args: string[];
  /** 설치 힌트 (한국어). 사용자가 GH_TOKEN 등 추가로 설정해야 할 때 안내. */
  install_hint: string;
}

export const SUGGESTED_MCP_SERVERS: ReadonlyArray<SuggestedMcpServer> = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: '파일 시스템 읽기/쓰기 — 워크스페이스 외부 파일 접근에 유용해요.',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
    install_hint: 'npx 가 PATH 에 있으면 자동 설치됩니다.',
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'GitHub repo / issue / PR 조회. PR 리뷰 요청 / 이슈 자동 분류에 유용해요.',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    install_hint: '환경 변수 GITHUB_TOKEN 또는 GITHUB_PERSONAL_ACCESS_TOKEN 이 필요해요.',
  },
  {
    id: 'memory',
    name: 'Memory',
    description: '대화 컨텍스트 영구 저장. 세션을 넘나들며 사용자/프로젝트 정보를 기억해요.',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    install_hint: '추가 설정 불필요 — 그대로 추가하면 됩니다.',
  },
];

// ────────────────────────────────────────────────────────────
// CLI config 자동 탐지
// ────────────────────────────────────────────────────────────

/**
 * Claude CLI 의 mcp config 후보 경로들. 첫 번째로 발견되는 파일을 사용.
 * Anthropic CLI 가 명시적으로 표준화한 path 가 아직 없어 후보를 시도.
 */
function claudeConfigCandidates(): string[] {
  const home = homedir();
  return [
    join(home, '.claude.json'),
    join(home, '.claude', 'config.json'),
    join(home, '.config', 'claude', 'config.json'),
  ];
}

/**
 * Codex CLI 의 mcp config 후보 경로들.
 */
function codexConfigCandidates(): string[] {
  const home = homedir();
  return [
    join(home, '.codex', 'config.json'),
    join(home, '.config', 'codex', 'config.json'),
  ];
}

/**
 * raw config object 에서 MCP 서버 정의를 추출.
 *
 * Claude / Codex 모두 다음 패턴 중 하나로 정의 (사용자 / 사이트마다 다양):
 *   - { mcpServers: { "<id>": { command, args?, env? } } }
 *   - { mcp_servers: [ { id, name, command, args?, env? } ] }
 *   - { mcp: { servers: { ... } } }
 *
 * 모두 시도. 매칭 안 되면 빈 배열.
 */
function extractServersFromConfig(raw: unknown, source: string): McpServerConfig[] {
  if (raw === null || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;

  const collected: McpServerConfig[] = [];

  // Pattern 1: mcpServers map (Anthropic CLI 의 일반적인 형식)
  if (obj['mcpServers'] !== undefined) {
    collected.push(...parseMcpServersMap(obj['mcpServers'], source));
  }

  // Pattern 2: mcp_servers array (Dreampia / Codex 일부)
  if (Array.isArray(obj['mcp_servers'])) {
    for (const item of obj['mcp_servers']) {
      const parsed = McpServerConfigSchema.safeParse(item);
      if (parsed.success) collected.push(parsed.data);
    }
  }

  // Pattern 3: nested mcp.servers
  if (obj['mcp'] !== null && typeof obj['mcp'] === 'object') {
    const mcp = obj['mcp'] as Record<string, unknown>;
    if (mcp['servers'] !== undefined) {
      collected.push(...parseMcpServersMap(mcp['servers'], source));
    }
  }

  // 중복 id 제거 — 같은 id 가 두 패턴 모두에 정의됐을 때 첫 번째만 유지.
  const seen = new Set<string>();
  return collected.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

/**
 * mcpServers map ({"<id>": {...}}) 을 McpServerConfig[] 로 변환.
 * id 가 [a-zA-Z0-9_-] 외 문자를 포함하면 sanitize.
 */
function parseMcpServersMap(raw: unknown, source: string): McpServerConfig[] {
  if (raw === null || typeof raw !== 'object') return [];
  const out: McpServerConfig[] = [];
  for (const [rawId, rawValue] of Object.entries(raw as Record<string, unknown>)) {
    if (rawValue === null || typeof rawValue !== 'object') continue;
    const v = rawValue as Record<string, unknown>;
    const id = sanitizeId(rawId);
    if (id.length === 0) continue;
    if (typeof v['command'] !== 'string' || v['command'].length === 0) continue;

    const candidate: Record<string, unknown> = {
      id,
      name: typeof v['name'] === 'string' && v['name'].length > 0 ? v['name'] : id,
      command: v['command'],
      args: Array.isArray(v['args']) ? v['args'].filter((a) => typeof a === 'string') : [],
      env:
        v['env'] !== null && typeof v['env'] === 'object'
          ? Object.fromEntries(
              Object.entries(v['env'] as Record<string, unknown>).filter(
                (entry): entry is [string, string] => typeof entry[1] === 'string'
              )
            )
          : {},
      enabled: typeof v['enabled'] === 'boolean' ? v['enabled'] : false,
      added_at: new Date().toISOString(),
    };
    if (typeof v['cwd'] === 'string' && v['cwd'].length > 0) {
      candidate['cwd'] = v['cwd'];
    }

    const parsed = McpServerConfigSchema.safeParse(candidate);
    if (parsed.success) {
      out.push(parsed.data);
    } else {
      // 깨진 항목은 silent drop — 사용자 환경의 손상된 config 가 wizard 를 깨뜨리지 않도록.
      // dev 모드 디버그 보조 로그는 v0.9.0 에선 생략 (lint warning 회피).
      void source;
      void rawId;
      void parsed;
    }
  }
  return out;
}

function sanitizeId(raw: string): string {
  // [a-zA-Z0-9_-] 외 문자는 '_' 로 치환. 빈 문자 / 너무 긴 건 제거 / 자르기.
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (cleaned.length === 0) return '';
  return cleaned.slice(0, 64);
}

/**
 * 후보 경로 리스트에서 첫 번째로 존재하는 파일을 read + parse + extract.
 * 실패는 모두 빈 배열로 swallow (best-effort).
 */
async function readFromFirstCandidate(
  candidates: string[],
  label: string
): Promise<McpServerConfig[]> {
  for (const path of candidates) {
    try {
      const raw = await fsp.readFile(path, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      const servers = extractServersFromConfig(parsed, label);
      if (servers.length > 0) return servers;
      // 파일이 있지만 server 정의가 없으면 다른 후보 시도.
    } catch {
      // 파일 부재 / 권한 / JSON parse 실패 → 다음 후보.
    }
  }
  return [];
}

/**
 * Claude CLI 의 mcp config 자동 탐지.
 * 발견된 서버는 사용자에게 "추가하시겠어요?" UI 로 노출 — 자동 등록 X.
 */
export async function detectMcpFromClaudeConfig(): Promise<McpServerConfig[]> {
  return readFromFirstCandidate(claudeConfigCandidates(), 'claude');
}

/**
 * Codex CLI 의 mcp config 자동 탐지.
 */
export async function detectMcpFromCodexConfig(): Promise<McpServerConfig[]> {
  return readFromFirstCandidate(codexConfigCandidates(), 'codex');
}

// ────────────────────────────────────────────────────────────
// 테스트 헬퍼 — 외부 파일 의존성을 격리할 수 있도록 export
// ────────────────────────────────────────────────────────────

/** 테스트 전용 — 외부 객체에서 직접 server 추출. */
export function __extractServersFromConfigForTesting(
  raw: unknown,
  source: string
): McpServerConfig[] {
  return extractServersFromConfig(raw, source);
}
