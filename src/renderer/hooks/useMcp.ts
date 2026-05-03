/**
 * useMcp — Renderer hook for MCP server management (Issue #5, v0.2.0).
 *
 * Spec: docs/tools/mcp-bridge.md
 *
 * Wraps the `window.dreampia.mcp.*` IPC namespace. Mirrors the pattern of
 * `useBrowser` / `useWorkspace`: graceful fallback when preload bridge is
 * absent (test / SSR / packaged build with broken preload).
 *
 * State:
 *   servers   — McpServerStateUI[] (last successful list call)
 *   loading   — true 동안 fetch/mutation 진행
 *   error     — IPC 실패 시 string (UI 가 banner 로 표시)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Result } from '@/main/types';

// ────────────────────────────────────────────────────────────
// Public types — main 의 src/types/mcp.ts shape 와 동일하나
// hook 입장에선 plain interface (zod 의존성 X) 로 노출.
// ────────────────────────────────────────────────────────────

export interface McpServerConfigUI {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  enabled: boolean;
  added_at: string;
}

export type McpServerStatusUI =
  | 'disconnected'
  | 'connecting'
  | 'ready'
  | 'error'
  | 'disabled';

export interface McpToolInfoUI {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
}

export interface McpServerStateUI {
  config: McpServerConfigUI;
  status: McpServerStatusUI;
  pid?: number;
  tools: McpToolInfoUI[];
  last_error?: string;
  last_log: string[];
}

// ────────────────────────────────────────────────────────────
// IPC API shape (preload only)
// ────────────────────────────────────────────────────────────

// v0.9.0 — Discovery shapes
export interface SuggestedMcpServerUI {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
  install_hint: string;
}

export interface McpDiscoveryUI {
  suggested: SuggestedMcpServerUI[];
  from_claude: McpServerConfigUI[];
  from_codex: McpServerConfigUI[];
}

interface McpApi {
  list: () => Promise<Result<McpServerStateUI[]>>;
  add: (config: McpServerConfigUI) => Promise<Result<void>>;
  remove: (id: string) => Promise<Result<void>>;
  restart: (id: string) => Promise<Result<void>>;
  getLogs: (id: string) => Promise<Result<string[]>>;
  discover?: () => Promise<Result<McpDiscoveryUI>>;
}

function getMcpApi(): McpApi | null {
  if (typeof window === 'undefined') return null;
  const dp = (window as unknown as { dreampia?: { mcp?: McpApi } }).dreampia;
  if (!dp || typeof dp.mcp !== 'object' || dp.mcp === null) return null;
  return dp.mcp;
}

// ────────────────────────────────────────────────────────────
// Hook return
// ────────────────────────────────────────────────────────────

export interface UseMcpApi {
  servers: McpServerStateUI[];
  loading: boolean;
  error: string | null;
  /** 디스크 + 런타임 상태 다시 fetch. */
  refresh: () => Promise<void>;
  /** 서버 추가. 성공 시 자동 refresh. */
  add: (config: McpServerConfigUI) => Promise<boolean>;
  /** 서버 제거. 성공 시 자동 refresh. */
  remove: (id: string) => Promise<boolean>;
  /** 서버 재시작. 성공 시 자동 refresh. */
  restart: (id: string) => Promise<boolean>;
  /** 서버 로그 조회. 실패 시 빈 배열. */
  getLogs: (id: string) => Promise<string[]>;
  /**
   * v0.9.0 — 추천 서버 + Claude/Codex CLI config 의 server 자동 탐지.
   * IPC 미지원 / 실패 시 null. 이미 등록된 서버는 제외된 결과.
   */
  discover: () => Promise<McpDiscoveryUI | null>;
}

export function useMcp(): UseMcpApi {
  const [servers, setServers] = useState<McpServerStateUI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    const api = getMcpApi();
    if (api === null) {
      if (mountedRef.current) {
        setLoading(false);
      }
      return;
    }
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }
    const result = await api.list();
    if (!mountedRef.current) return;
    if (result.ok) {
      setServers(result.value);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  const add = useCallback(
    async (config: McpServerConfigUI): Promise<boolean> => {
      const api = getMcpApi();
      if (api === null) return false;
      if (mountedRef.current) setError(null);
      const result = await api.add(config);
      if (!result.ok) {
        if (mountedRef.current) setError(result.error);
        return false;
      }
      await refresh();
      return true;
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const api = getMcpApi();
      if (api === null) return false;
      if (mountedRef.current) setError(null);
      const result = await api.remove(id);
      if (!result.ok) {
        if (mountedRef.current) setError(result.error);
        return false;
      }
      await refresh();
      return true;
    },
    [refresh]
  );

  const restart = useCallback(
    async (id: string): Promise<boolean> => {
      const api = getMcpApi();
      if (api === null) return false;
      if (mountedRef.current) setError(null);
      const result = await api.restart(id);
      if (!result.ok) {
        if (mountedRef.current) setError(result.error);
        return false;
      }
      await refresh();
      return true;
    },
    [refresh]
  );

  const getLogs = useCallback(async (id: string): Promise<string[]> => {
    const api = getMcpApi();
    if (api === null) return [];
    const result = await api.getLogs(id);
    if (!result.ok) {
      if (mountedRef.current) setError(result.error);
      return [];
    }
    return result.value;
  }, []);

  const discover = useCallback(async (): Promise<McpDiscoveryUI | null> => {
    const api = getMcpApi();
    if (api === null || typeof api.discover !== 'function') return null;
    try {
      const result = await api.discover();
      if (!result.ok) {
        if (mountedRef.current) setError(result.error);
        return null;
      }
      return result.value;
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { servers, loading, error, refresh, add, remove, restart, getLogs, discover };
}
