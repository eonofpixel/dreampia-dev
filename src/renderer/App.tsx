/**
 * App.tsx — Main React component
 *
 * Day 6: 3-패널 layout (F-013) + ChatInput (IME-safe).
 * Day 7: MockProvider streaming wire-through (P0 final).
 * P1-2: SessionStore IPC integration — sessions persist across reload.
 * P1-4: Real CLI subprocess via IpcStreamingProvider + CLI status indicator.
 *
 * Spec: docs/design/layout/3panel.md, docs/ia/chat-flow.md,
 *       docs/session/persistence.md, docs/session/cross-ai-sync.md
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ThreePanelLayout } from './components/layout/ThreePanelLayout';
import { Sidebar } from './components/sidebar/Sidebar';
import type { SearchResultEntry } from './components/sidebar/SearchSection';
import { ChatPanel, type CliStatus } from './components/chat/ChatPanel';
import type { ResolverContext } from './mentions/resolver';
import { PreviewPanel } from './components/preview/PreviewPanel';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { SettingsModal, applyTheme, type SettingsTabId } from './components/settings/SettingsModal';
import { SlashHelpModal } from './components/chat/SlashHelpModal';
import { CompareModal } from './components/chat/CompareModal';
import { useCompare, type CompareSide } from './hooks/useCompare';
import { KNOWN_MODELS, type SlashCommandId } from './commands/registry';
import {
  SessionSchema,
  newSessionId,
  newTurnId,
  workspaceIdFor,
  partitionIdFor,
  nowIso,
  type ContentBlock,
  type PermissionLevel,
  type Session,
  type SessionId,
  type Turn,
} from '@/types';
import { MockProvider } from '@/providers';
import type { StreamingProvider } from '@/providers/types';
import type { WorkspaceInfo } from '@/main/types';
import { IpcStreamingProvider } from './providers/IpcStreamingProvider';
import { useStreamingTurn } from './hooks/useStreamingTurn';
import { useSessionStore } from './hooks/useSessionStore';
import { useWorkspace } from './hooks/useWorkspace';
import { useOnboarding } from './hooks/useOnboarding';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useKeyboardOverrides } from './hooks/useKeyboardOverrides';
import type { ShortcutAction } from './keyboard/shortcuts';
import { setLocale, isLocale, useT } from './i18n';

/**
 * Renderer-side mock fallback gate.
 *
 * Phase 3 audit (HIGH): production 에서 IPC bridge 가 깨졌을 때 MockProvider
 * 로 silently fallback 하면 사용자에게 가짜 AI 응답을 보여줄 수 있다.
 * `import.meta.env.DEV` 는 Vite 가 build-time 에 inline 하므로 production
 * bundle 에선 항상 false → fail-closed.
 *
 * E2E 는 production build 의 dist/main 을 띄우므로 DEV=false 지만, 그땐
 * preload 가 정상 로드되어 hasIpc 가 true 가 되므로 mock fallback 자체가
 * 필요 없다 — 이 함수를 거치지 않는다. 만약 preload 가 깨지면 e2e 도 정상적
 * 으로 fail 표시되어야 하고, 그게 의도한 동작이다.
 */
function isMockAllowed(): boolean {
  // Vite 의 `import.meta.env.DEV` 는 production build 시 false 로 inline 된다.
  // SSR / Node test 환경 (vitest) 에선 DEV 가 undefined 일 수 있어 falsy guard.
  return Boolean(import.meta.env.DEV);
}

/**
 * v0.3.0 — defaultPermissionLevel 인자가 추가됨. wizard / 설정에서 사용자가
 * 선택한 값을 그대로 새 session 의 default_level 로 inherit. 미지정 시
 * 'workspace_write' (codebase 의 기존 default).
 */
function createDemoSession(
  title: string,
  workspace: WorkspaceInfo,
  defaultPermissionLevel: PermissionLevel = 'workspace_write'
): Session {
  const id = newSessionId();
  const now = nowIso();
  const workspaceId = workspaceIdFor(workspace.root);

  return SessionSchema.parse({
    id,
    schema_version: 1,
    created_at: now,
    updated_at: now,
    provider: 'codex',
    workspace_id: workspaceId,
    title,
    pinned: false,
    archived: false,
    conversation: {
      turns: [],
      current_model: 'gpt-5.5',
      current_effort: 'high',
      current_mode: 'standard',
    },
    workspace: {
      root: workspace.root,
      name: workspace.name,
      worktrees: [],
      recent_files: [],
      open_files: [],
      ignore_patterns: ['node_modules/**', '.git/**', 'dist/**'],
      index_status: 'idle',
      is_temporary: false,
    },
    terminal: { panes: [], panel_open: false, height_px: 200 },
    browser: {
      tabs: [],
      panel_visible: false,
      layout: 'hidden',
      partition_id: partitionIdFor(id),
    },
    plan: { active: false, browser_tool_enabled: false },
    permission: {
      grants: [],
      default_level: defaultPermissionLevel,
      temporarily_blocked_capabilities: [],
    },
    metadata: {},
  });
}

export function App(): React.JSX.Element {
  // v0.11.0 — locale 변경 시 App 가 직접 사용하는 fallback 문자열도 갱신.
  const t = useT();
  const {
    state: { sessions, error: storeError },
    create: createSession,
    get: getSession,
    appendTurn: persistTurn,
    clearTurns: persistClearTurns,
    updateConversation: persistUpdateConversation,
    updatePermission: persistUpdatePermission,
  } = useSessionStore();

  // Phase 3 B2: 첫 실행 wizard. completed=true 면 main app, false 면 wizard 표시.
  // null 동안은 splash (flicker 방지) — Spec: docs/ia/onboarding.md
  // v0.3.0: reset 추가 — Sidebar 의 [온보딩 다시 보기] 클릭 시 호출.
  const {
    completed: onboardingCompleted,
    loading: onboardingLoading,
    complete: completeOnboarding,
    reset: resetOnboarding,
  } = useOnboarding();

  // The full active session lives only in the renderer during chat;
  // the database holds the source of truth, but we shadow it locally
  // so streaming text_delta events update synchronously.
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  // Onboarding 추천 prompt → ChatInput 자동 채움. 새 prompt 가 도착할 때마다
  // 식별 가능하도록 Date.now() 같은 monotonic 값으로 들고 다닐 수 있지만,
  // ChatInput 의 useEffect 가 빈 문자열 무시하므로 string 자체로 충분.
  const [pendingPrompt, setPendingPrompt] = useState<string | undefined>(undefined);
  // launchWorkspace 는 main 이 보내준 default. packaged 에서 settings 없으면
  // null 이 반환되므로 nullable. dev/e2e 에선 process.cwd() 가 들어옴.
  const [launchWorkspace, setLaunchWorkspace] = useState<WorkspaceInfo | null>(null);
  const [launchWorkspaceLoaded, setLaunchWorkspaceLoaded] = useState(false);
  // v0.8.0 — 통합 SettingsModal. 이전엔 McpSettings + UsageSettings 가 별도
  // state 였으나, D1 + H 작업으로 7-tab 단일 모달로 통합. tab 은 슬래시 명령
  // 또는 진입 버튼에 따라 분기 — `/settings` → 'mcp' (default), `/usage` →
  // 'usage', Sidebar 사용량 버튼 → 'usage'.
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTabId>('mcp');
  // v0.5.0 (F-018) — `/help` 슬래시 명령으로 여는 명령어 도움말 모달.
  const [slashHelpOpen, setSlashHelpOpen] = useState(false);
  // v0.12.0 (I) — `/compare <prompt>` 슬래시 명령으로 여는 cross-AI 비교 모달.
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const compareHook = useCompare({
    onError: (msg) => {
      console.error('[useCompare]', msg);
    },
  });
  // v0.10.0 (F-025) — 사이드바 토글. Mod+B 로 표시/숨김.
  const [sidebarVisible, setSidebarVisible] = useState(true);
  // v0.7.0 (F-026) — Sidebar 메시지 검색 state. 입력은 즉시 반영, 실제 IPC
  // 호출은 300ms debounce 후 별도 useEffect 가 트리거. results / error /
  // loading 은 IPC 응답에 따라 갱신. pendingFocusTurnId 는 사용자가 검색 결과
  // 를 클릭한 직후 ChatPanel 이 해당 turn 으로 scroll 하도록 보관.
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultEntry[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pendingFocusTurnId, setPendingFocusTurnId] = useState<string | null>(null);
  // Phase 3 audit (HIGH): picker auto-launch 가 사용자 취소 시 무한루프 방지.
  // Phase 3 B2: useState + useRef 이중 보호 — useState 는 React deps 에 반영,
  // useRef 는 같은 commit 내 빠른 연속 effect 실행에도 즉시 차단.
  const [workspacePickAttempted, setWorkspacePickAttempted] = useState(false);
  const workspacePickAttemptedRef = useRef(false);

  // 사용자가 picker 로 선택한 워크스페이스 (settings.json 영속). 있으면 우선,
  // 없으면 main 이 보내준 launch workspace (보통 process.cwd()) 로 폴백.
  const {
    workspace: pickedWorkspace,
    loading: pickedWorkspaceLoading,
    pick: pickWorkspace,
  } = useWorkspace();

  // When the list changes and we have no selection, pick the first one.
  useEffect(() => {
    if (activeSessionId !== '' || sessions.length === 0) return;
    const first = sessions[0];
    if (first !== undefined) setActiveSessionId(first.id);
  }, [sessions, activeSessionId]);

  // Fetch the full session (with conversation) whenever the selection changes.
  useEffect(() => {
    if (activeSessionId === '') {
      setActiveSession(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const session = await getSession(activeSessionId as SessionId);
      if (!cancelled) setActiveSession(session);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, getSession]);

  // Renderer has no Node path access in sandbox mode. Ask main for the
  // launch workspace instead of hardcoding a Windows path into new sessions.
  useEffect(() => {
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined) {
      // IPC 미존재 (preload 깨짐) — launchWorkspace 는 null 유지. provider 도
      // null 이 되어 ipcUnavailable banner 가 표시된다.
      setLaunchWorkspaceLoaded(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await appApi.getDefaultWorkspace();
        if (cancelled) return;
        // result.value 가 null 일 수 있음 (packaged + settings 없음).
        if (result.ok) setLaunchWorkspace(result.value);
      } catch {
        // Keep null fallback.
      } finally {
        if (!cancelled) setLaunchWorkspaceLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 새 세션은 항상 (사용자 선택 > launch) 우선순위로 root 결정.
  // packaged + settings 없음 + 사용자가 picker 로 선택 안함 = null.
  // null 이면 새 채팅 생성 disabled.
  const defaultWorkspace = useMemo<WorkspaceInfo | null>(() => {
    if (pickedWorkspace !== null) {
      return { root: pickedWorkspace.path, name: pickedWorkspace.name };
    }
    return launchWorkspace;
  }, [pickedWorkspace, launchWorkspace]);

  // Phase 3 audit (HIGH): packaged 에서 workspace 가 null 이면 자동으로
  // picker 띄우기. 단 한 번만 시도 — 사용자가 picker 취소하면 onboarding
  // screen 으로 안내 (무한 루프 방지).
  //
  // Phase 3 B2: onboarding wizard 가 step 4 에서 picker 를 직접 호출하므로
  // wizard 표시 중에는 auto picker 비활성화 (이중 dialog 방지). wizard 완료
  // 후 (onboardingCompleted=true) 까지 보류.
  const workspaceResolved = launchWorkspaceLoaded && !pickedWorkspaceLoading;
  const showOnboarding = !onboardingLoading && onboardingCompleted === false;
  useEffect(() => {
    if (!workspaceResolved) return;
    if (defaultWorkspace !== null) return;
    if (workspacePickAttempted) return;
    if (workspacePickAttemptedRef.current) return;
    if (showOnboarding) return; // wizard 가 picker 를 owner
    workspacePickAttemptedRef.current = true;
    setWorkspacePickAttempted(true);
    void pickWorkspace();
  }, [workspaceResolved, defaultWorkspace, workspacePickAttempted, pickWorkspace, showOnboarding]);

  // P1-4: IpcStreamingProvider 가 main 의 ai/start-stream 으로 위임.
  // window.dreampia.ai 가 없는 환경 (preload script 로딩 실패 / legacy build)
  // 에서는:
  //   - dev/test (vite dev / e2e / vitest) → MockProvider 로 빠른 iteration
  //   - production (packaged build) → null → UI 가 명시적 error banner 표시
  //
  // Phase 3 audit (HIGH) — 이전엔 production 에서도 MockProvider 로
  // silently fallback 했다. 이러면 preload 가 깨졌을 때 사용자에게 가짜
  // AI 응답을 보여주는 위험이 있다. fail-closed 로 명확히 표시하도록 변경.
  const provider = useMemo<StreamingProvider | null>(() => {
    const hasIpc = typeof window !== 'undefined' && window.dreampia?.ai !== undefined;
    if (hasIpc) return new IpcStreamingProvider();
    if (isMockAllowed()) return new MockProvider({ delayMs: 15 });
    return null;
  }, []);

  // v0.3.0 — wizard / 설정에서 사용자가 선택한 기본 permission level.
  // 새 session 생성 시 default_level 로 inherit. IPC 응답 전엔 'workspace_write'
  // safe default 유지.
  const [defaultPermissionLevel, setDefaultPermissionLevel] =
    useState<PermissionLevel>('workspace_write');
  useEffect(() => {
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.getDefaultPermissionLevel !== 'function') {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await appApi.getDefaultPermissionLevel();
        if (cancelled) return;
        if (result.ok) setDefaultPermissionLevel(result.value);
      } catch {
        // safe default 유지
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    // useOnboarding 의 completed 가 false → true 로 바뀐 시점 (= wizard 끝
    // 직후) 에 사용자가 wizard 에서 변경한 default 를 다시 fetch 해 반영.
    onboardingCompleted,
  ]);

  // CLI 감지 결과 — onMount 한 번 가져와 ChatHeader 에 표시.
  const [cliStatus, setCliStatus] = useState<CliStatus>(null);
  useEffect(() => {
    const ai = typeof window !== 'undefined' ? window.dreampia?.ai : undefined;
    if (ai === undefined) {
      setCliStatus({ source: 'mock', claude: null, codex: null });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await ai.detectCli();
        if (cancelled) return;
        if (result.ok) {
          setCliStatus({
            source: 'auto',
            claude: result.value.claude,
            codex: result.value.codex,
          });
        } else {
          setCliStatus({ source: 'mock', claude: null, codex: null });
        }
      } catch {
        if (!cancelled) setCliStatus({ source: 'mock', claude: null, codex: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // v0.7.0 (F-026) — Sidebar 검색 입력 → debounced IPC 호출. q 가 빈 문자열일
  // 땐 즉시 results 를 비우고 loading/error 도 초기화 (사용자가 X 로 입력을
  // 지웠을 때 stale state 가 남지 않도록). 300ms debounce 는 keystroke 마다
  // FTS5 query 가 spam 되는 걸 막는다 (slash command popover 와 동일 값).
  // cancelled flag 로 race 방어 — 두 input 이 빠르게 연속 입력될 때 첫 응답이
  // 더 늦게 오더라도 두 번째 응답으로 덮어쓰지 않는다.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length === 0) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const timer = setTimeout(() => {
      const sessApi =
        typeof window !== 'undefined' ? window.dreampia?.session : undefined;
      // search method 가 미정 (구버전 preload, 또는 mock 미설정) 이면 silent
      // fallback — UI 는 빈 결과 + loading=false 로 종료.
      if (sessApi === undefined || typeof sessApi.search !== 'function') {
        if (!cancelled) {
          setSearchResults([]);
          setSearchError(null);
          setSearchLoading(false);
        }
        return;
      }
      void sessApi
        .search({ q })
        .then((r) => {
          if (cancelled) return;
          if (r.ok) {
            setSearchResults(r.value);
            setSearchError(null);
          } else {
            setSearchResults([]);
            setSearchError(String(r.error));
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setSearchResults([]);
          setSearchError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  // v0.7.0 (F-026) — 검색 결과 클릭 → 활성 세션 전환 + scroll target 보관.
  // ChatPanel 이 다음 render cycle 에 pendingFocusTurnId 를 보고 scrollIntoView.
  const handleSearchResultClick = useCallback(
    (sessionId: string, turnId: string): void => {
      setActiveSessionId(sessionId);
      setPendingFocusTurnId(turnId);
    },
    []
  );

  // ChatPanel 의 onTurnFocused — scroll 끝나면 pendingFocusTurnId 를 비워야
  // 다음 검색 클릭이 다시 동작.
  const handleTurnFocused = useCallback((): void => {
    setPendingFocusTurnId(null);
  }, []);

  // Streaming pattern (see useSessionStore for rationale):
  //   - text_delta:        update local activeSession only (NO IPC)
  //   - message_complete:  appendTurn() through IPC + refresh
  const handleTurnUpdate = useCallback((turn: Turn): void => {
    setActiveSession((prev) => {
      if (prev === null) return prev;
      const turns = [...prev.conversation.turns];
      const idx = turns.findIndex((t) => t.id === turn.id);
      if (idx >= 0) {
        turns[idx] = turn;
      } else {
        turns.push(turn);
      }
      return {
        ...prev,
        updated_at: nowIso(),
        conversation: { ...prev.conversation, turns },
      };
    });
  }, []);

  const handleStreamComplete = useCallback(
    (turn: Turn, toolResultTurn?: Turn): void => {
      // 스트리밍 도중에는 매 delta 마다 DB write 하지 않는다 (퍼포먼스).
      // 완성된 assistant turn 만 한 번에 persist. Tool Queue 결과가 있으면
      // assistant 직후 role='tool' turn 으로 순서를 보존해 append 한다.
      if (activeSessionId === '') return;
      void (async () => {
        await persistTurn(activeSessionId as SessionId, turn);
        if (toolResultTurn !== undefined) {
          handleTurnUpdate(toolResultTurn);
          await persistTurn(activeSessionId as SessionId, toolResultTurn);
        }
      })();
    },
    [activeSessionId, handleTurnUpdate, persistTurn]
  );

  const {
    isStreaming,
    start: startStream,
    cancel: cancelStream,
  } = useStreamingTurn({
    provider,
    onTurnUpdate: handleTurnUpdate,
    onComplete: handleStreamComplete,
    onError: (err) => {
      console.error('[ChatStreaming] error:', err);
    },
  });

  const handleNewChat = useCallback(async (): Promise<void> => {
    // Phase 3 audit (HIGH): workspace 가 없으면 picker 먼저. 사용자가 취소하면
    // 새 채팅 만들지 않음 — 우연한 process.cwd() 위치를 root 로 쓰지 않도록.
    let workspace = defaultWorkspace;
    if (workspace === null) {
      const picked = await pickWorkspace();
      if (picked === null) return;
      workspace = { root: picked.path, name: picked.name };
    }
    // v0.3.0 — settings.default_permission_level 을 새 session 의 default_level
    // 로 사용. wizard step 4 / 설정에서 사용자가 변경하면 다음 session 부터 반영.
    const newSession = createDemoSession(
      `새 채팅 ${sessions.length + 1}`,
      workspace,
      defaultPermissionLevel
    );
    const created = await createSession(newSession);
    if (created !== null) {
      setActiveSessionId(created.id);
    }
  }, [
    createSession,
    defaultWorkspace,
    defaultPermissionLevel,
    pickWorkspace,
    sessions.length,
  ]);

  // v0.5.0 (F-018) — `/clear` 슬래시 명령. 활성 세션의 turn 만 비우고 session
  // 자체는 유지. local activeSession shadow 도 즉시 갱신해 UI 가 빠르게 반응.
  const handleClearTurns = useCallback(async (): Promise<void> => {
    if (activeSession === null) return;
    const ok = await persistClearTurns(activeSession.id);
    if (!ok) return;
    setActiveSession((prev) =>
      prev === null
        ? prev
        : {
            ...prev,
            updated_at: nowIso(),
            conversation: { ...prev.conversation, turns: [] },
          }
    );
  }, [activeSession, persistClearTurns]);

  // v0.8.0 — H Permission Dropdown. ChatHeader 의 dropdown 변경 시 호출.
  // optimistic local update + IPC 영속. 영속 결과 반환된 Session 으로 다시
  // shadow 갱신해 server-canonical 상태로 reconcile.
  const handleChangePermission = useCallback(
    async (next: PermissionLevel): Promise<void> => {
      if (activeSession === null) return;
      // 1) Optimistic local update — UI 즉시 반응.
      setActiveSession((prev) =>
        prev === null
          ? prev
          : {
              ...prev,
              updated_at: nowIso(),
              permission: { ...prev.permission, default_level: next },
            }
      );
      // 2) IPC 영속. 실패해도 optimistic state 가 그대로 — 다음 fetch 에서
      //    reconcile (또는 사용자가 다시 변경). p2 toast UI 추가 가능.
      const updated = await persistUpdatePermission(activeSession.id, {
        default_level: next,
      });
      if (updated !== null) {
        setActiveSession(updated);
      }
    },
    [activeSession, persistUpdatePermission]
  );

  // v0.8.0 — App 부팅 시 settings.theme 을 한 번 fetch + data-theme 적용.
  // SettingsModal 의 ThemePanel 도 mount 시 동일 fetch 를 하지만, 모달이 한
  // 번도 안 열렸을 때도 사용자 선호가 즉시 적용되도록 root 에서도 호출.
  useEffect(() => {
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.getTheme !== 'function') return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await appApi.getTheme();
        if (cancelled) return;
        if (result.ok) {
          applyTheme(result.value);
        }
      } catch {
        // safe default — data-theme 미설정 시 CSS 기본값 fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // v0.11.0 (B2) — App 부팅 시 settings.language 를 한 번 fetch + setLocale.
  // 미지정 시 'ko' (default). 사용자가 LanguageSettings 에서 변경하면 거기서
  // 직접 setLocale + IPC persist 를 호출 — 여기선 boot-time 1회 sync 만.
  useEffect(() => {
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.getLanguage !== 'function') return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await appApi.getLanguage();
        if (cancelled) return;
        if (result.ok && isLocale(result.value)) {
          setLocale(result.value);
        }
      } catch {
        // safe default — 한국어 유지.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // v0.5.0 (F-018) — `/model <name>` 슬래시 명령. KNOWN_MODELS 화이트리스트
  // 검증은 ChatInput 단에서 이미 거치지만 호출자도 방어적으로 체크.
  const handleChangeModel = useCallback(
    async (model: string): Promise<void> => {
      if (activeSession === null) return;
      if (!KNOWN_MODELS.includes(model)) {
        // ChatInput 의 commandHandlers 가 이미 검증했지만 외부 호출도 보호.
        console.warn(`[slash] unknown model rejected: ${model}`);
        return;
      }
      const updated = await persistUpdateConversation(activeSession.id, {
        current_model: model,
      });
      if (updated !== null) {
        setActiveSession(updated);
      }
    },
    [activeSession, persistUpdateConversation]
  );

  const handleSubmitMessage = useCallback(
    async (text: string, extraBlocks?: ContentBlock[]): Promise<void> => {
      if (activeSession === null || isStreaming) return;
      // Phase 3 audit (HIGH) — production 에서 IPC bridge 누락 시 fail-closed.
      // ChatPanel 이 이미 banner 와 input disable 로 표시 중이지만 방어적으로 가드.
      if (provider === null) return;

      // v0.13.0 (J) — typed block 경로:
      //   text 가 비어있으면 (사용자가 멘션만 입력) text block 자체를 skip
      //   해서 user turn 을 chip 한 줄짜리로 만든다. text 가 있으면 [text, ...
      //   blocks] 순서로 합친다 (사용자가 의도한 메시지가 먼저, 첨부가 뒤).
      const blocks: ContentBlock[] = [];
      if (text.length > 0) {
        blocks.push({ type: 'text', text });
      }
      if (extraBlocks !== undefined && extraBlocks.length > 0) {
        blocks.push(...extraBlocks);
      }
      // 둘 다 비어있으면 (이론적으로 불가, ChatInput 가 trim 후 호출) — 안전 가드.
      if (blocks.length === 0) return;

      const userTurn: Turn = {
        id: newTurnId(),
        role: 'user',
        timestamp: nowIso(),
        status: 'completed',
        content: blocks,
      };

      // 1) Optimistic local push so the UI is responsive.
      setActiveSession((prev) =>
        prev === null
          ? prev
          : {
              ...prev,
              updated_at: nowIso(),
              conversation: {
                ...prev.conversation,
                turns: [...prev.conversation.turns, userTurn],
              },
            }
      );

      // 2) Persist user turn (refresh updates Sidebar's updated_at order).
      await persistTurn(activeSession.id, userTurn);

      // 3) Kick off streaming; assistant turn shadowed locally,
      //    persisted on message_complete (handleStreamComplete).
      // session.permission.default_level 을 명시적으로 forward — main 이 이걸로
      // CLI sandbox/tool-policy 결정. Spec: docs/permission/provider-mapping.md
      void startStream({
        turns: [...activeSession.conversation.turns, userTurn],
        model: activeSession.conversation.current_model,
        sessionId: activeSession.id,
        workspaceRoot: activeSession.workspace.root,
        permissionLevel: activeSession.permission.default_level,
      });
    },
    [activeSession, isStreaming, persistTurn, startStream, provider]
  );

  // Surface IPC errors in the console; UI-level error states come later.
  useEffect(() => {
    if (storeError !== null) {
      console.error('[useSessionStore] error:', storeError);
    }
  }, [storeError]);

  // Sidebar consumes a lightweight subset of the session list.
  const sidebarSessions = useMemo(
    () => sessions.map((s) => ({ id: s.id, title: s.title, pinned: s.pinned })),
    [sessions]
  );
  // Sidebar 의 project name — active session 우선, 없으면 default, 둘 다 없으면
  // 사용자가 picker 누르도록 안내 placeholder.
  const projectName =
    activeSession?.workspace.name ?? defaultWorkspace?.name ?? t('sidebar.workspace.fallback');

  // v0.6.0 (F-019) — @ mention 의 file/session 후보 + resolver context.
  // 활성 session 의 workspace.root / ignore_patterns 를 그대로 forward.
  // resolverContext 는 IPC 가 누락된 환경 (preload 깨짐 등) 에서 파일 read 를
  // sliently 실패시키도록 fallback `Result<>` 를 직접 반환.
  const mentionSessions = useMemo(
    () => sessions.map((s) => ({ id: s.id, title: s.title })),
    [sessions]
  );
  const mentionWorkspaceRoot = activeSession?.workspace.root;
  const mentionIgnorePatterns = activeSession?.workspace.ignore_patterns;
  const mentionResolverContext = useMemo<ResolverContext | undefined>(() => {
    if (mentionWorkspaceRoot === undefined) return undefined;
    return {
      workspaceRoot: mentionWorkspaceRoot,
      readFile: async (args) => {
        const ws = typeof window !== 'undefined' ? window.dreampia?.workspace : undefined;
        if (ws === undefined || typeof ws.readFile !== 'function') {
          return { ok: false, error: 'IPC unavailable' } as const;
        }
        return ws.readFile(args);
      },
      getSession: async (id: string) => {
        return getSession(id as SessionId);
      },
    };
  }, [mentionWorkspaceRoot, getSession]);

  // Phase 3 audit fix #4 — ChatHeader 가 표시할 workspace name.
  // 우선순위: active session 의 workspace.name (실제 메시지가 향하는 폴더) >
  //          defaultWorkspace.name (새 채팅이 만들어질 폴더).
  // 이전엔 항상 defaultWorkspace.name 만 보여서 session.workspace 와 drift 가
  // 났다 (사용자가 picker 로 폴더 바꿔도 기존 session 에는 반영 X).
  const chatHeaderWorkspaceName = activeSession?.workspace.name ?? defaultWorkspace?.name;

  // v0.5.0 (F-018) — slash command handler 맵. ChatInput 으로 forward 되어
  // 사용자가 `/help`, `/clear` 등을 입력했을 때 호출된다. 인자가 없는 명령은
  // arg 인자를 무시한다. KNOWN_MODELS 화이트리스트는 `/model` 에서만 사용.
  const commandHandlers = useMemo<
    Partial<Record<SlashCommandId, (arg?: string) => void>>
  >(
    () => ({
      help: () => {
        setSlashHelpOpen(true);
      },
      clear: () => {
        if (activeSession === null) return;
        void handleClearTurns();
      },
      new: () => {
        void handleNewChat();
      },
      model: (arg) => {
        if (arg === undefined || arg.length === 0) {
          // 빈 인자 → 도움말 모달로 안내.
          setSlashHelpOpen(true);
          return;
        }
        if (!KNOWN_MODELS.includes(arg)) {
          // 알 수 없는 모델 → 도움말 모달로 안내 + 콘솔 경고. 향후 toast 추가 가능.
          console.warn(`[slash] unknown model: ${arg}`);
          setSlashHelpOpen(true);
          return;
        }
        void handleChangeModel(arg);
      },
      settings: () => {
        // v0.8.0 — 슬래시 `/settings` → 통합 모달의 MCP 탭으로 진입.
        setSettingsInitialTab('mcp');
        setSettingsModalOpen(true);
      },
      usage: () => {
        // v0.8.0 — 슬래시 `/usage` → 통합 모달의 사용량 탭으로 진입.
        setSettingsInitialTab('usage');
        setSettingsModalOpen(true);
      },
      onboarding: () => {
        void resetOnboarding();
      },
      compare: (arg) => {
        // v0.12.0 (I) — 양쪽 model 은 첫 MVP 에선 KNOWN_MODELS 에서 hard-code.
        // 향후 settings 에 default 모델 pair 추가 검토. arg 가 없으면 modal 만
        // 열고 사용자에게 prompt 입력을 안내 (이후 P1 에서 모달 내 prompt input
        // 추가 예정 — 현재는 슬래시 인자 필수).
        if (activeSession === null) return;
        if (arg === undefined || arg.length === 0) {
          // 빈 인자 → 도움말 모달로 안내. /compare 는 prompt 가 필수.
          setSlashHelpOpen(true);
          return;
        }
        compareHook.reset();
        setCompareModalOpen(true);
        void compareHook.start({
          prompt: arg,
          session_id: activeSession.id,
          workspace_root: activeSession.workspace.root,
          permission_level: activeSession.permission.default_level,
          // MVP defaults: Claude Sonnet + GPT-5.5. 두 prefix 가 model-prefix
          // routing 으로 각각 Claude / Codex CLI 로 향한다.
          claude_model: 'claude-3-5-sonnet-20241022',
          codex_model: 'gpt-5.5',
        });
      },
    }),
    [activeSession, handleClearTurns, handleNewChat, handleChangeModel, resetOnboarding, compareHook]
  );

  // v0.12.0 (I) — 응답 채택. 사용자가 "이 응답 채택" 클릭 시 active session 에
  // user/assistant turn pair 를 append. user turn 은 compare 의 원본 prompt,
  // assistant turn 은 채택된 side 의 누적 text. model 정보도 보존.
  const handleAcceptCompare = useCallback(
    (side: CompareSide, text: string, model: string | null): void => {
      if (activeSession === null) return;
      const run = compareHook.run;
      if (run === null || text.length === 0) return;
      const userTurn: Turn = {
        id: newTurnId(),
        role: 'user',
        timestamp: nowIso(),
        status: 'completed',
        content: [{ type: 'text', text: run.prompt }],
      };
      const assistantTurn: Turn = {
        id: newTurnId(),
        role: 'assistant',
        timestamp: nowIso(),
        status: 'completed',
        content: [{ type: 'text', text }],
        ...(model !== null && { model }),
      };
      // Optimistic local push + persist.
      setActiveSession((prev) =>
        prev === null
          ? prev
          : {
              ...prev,
              updated_at: nowIso(),
              conversation: {
                ...prev.conversation,
                turns: [...prev.conversation.turns, userTurn, assistantTurn],
              },
            }
      );
      void persistTurn(activeSession.id, userTurn);
      void persistTurn(activeSession.id, assistantTurn);
      void side; // side 정보는 향후 metadata 활용 — 현재는 turn append 만.
      setCompareModalOpen(false);
      compareHook.reset();
    },
    [activeSession, compareHook, persistTurn]
  );

  // Phase 3 B2: Wizard 완료 시 호출 — settings 영속 + 옵션으로 첫 채팅 생성.
  // firstPrompt 가 있으면 새 세션 + ChatInput 자동 채움 (auto-submit X).
  // v0.3.0 — wizard 가 default_permission_level 을 변경했을 수 있으므로 다시
  // fetch 한 후 새 session 의 default_level 로 사용. wizard 가 IPC 호출에
  // 실패해도 기존 state 의 default 값 유지.
  const handleOnboardingComplete = useCallback(
    async (firstPrompt?: string): Promise<void> => {
      await completeOnboarding();
      // wizard 에서 변경됐을 가능성 — 한 번 더 read 후 새 session 에 반영.
      let levelForNewSession: PermissionLevel = defaultPermissionLevel;
      const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
      if (appApi !== undefined && typeof appApi.getDefaultPermissionLevel === 'function') {
        try {
          const result = await appApi.getDefaultPermissionLevel();
          if (result.ok) {
            levelForNewSession = result.value;
            setDefaultPermissionLevel(result.value);
          }
        } catch {
          // 실패해도 in-memory state 사용 — 매우 안전한 fallback
        }
      }
      if (firstPrompt === undefined || firstPrompt.length === 0) return;
      // workspace 결정: wizard step 4 에서 사용자가 선택했거나 기존 settings 사용.
      // 둘 다 null 이면 새 세션 생성 X (process.cwd() 우연 매칭 방지).
      const refreshedDefault = defaultWorkspace;
      if (refreshedDefault === null) return;
      const newSession = createDemoSession(
        `새 채팅 ${sessions.length + 1}`,
        refreshedDefault,
        levelForNewSession
      );
      const created = await createSession(newSession);
      if (created !== null) {
        setActiveSessionId(created.id);
        setPendingPrompt(firstPrompt);
      }
    },
    [
      completeOnboarding,
      defaultWorkspace,
      defaultPermissionLevel,
      createSession,
      sessions.length,
    ]
  );

  const handleOnboardingSkip = useCallback(async (): Promise<void> => {
    await completeOnboarding();
  }, [completeOnboarding]);

  // ── v0.10.0 (G F-025) — 키보드 단축키 시스템 ──────────────
  // overrides 는 settings.json 에 영속된 사용자 지정 매핑. SettingsModal
  // 에서 변경되면 즉시 반영 — useKeyboardOverrides 의 save 가 setOverrides
  // 호출 후 IPC. App level 의 단축키 dispatcher 는 이 overrides 를 매번
  // 최신 ref 로 참조 (useKeyboardShortcuts 내부 구현).
  const { overrides: keyboardOverrides } = useKeyboardOverrides();

  // 단축키 → 핸들러 맵. modal.close 와 chat.cancel 이 같은 Escape 를 공유
  // 하므로 modal.close handler 안에서 priority chain 을 구현 + chat.cancel
  // 은 모달이 모두 닫힌 상태에서만 streaming abort. 두 handler 가 모두
  // 등록되어 있으면 SHORTCUT_DEFS 의 순서 (modal.close 가 chat.cancel 보다
  // 먼저) 로 dispatch 되지만, 아래 modal.close 에서 모달이 없을 때는 false
  // 반환으로 다음 handler 가 실행되도록 명시적 chain 을 짠다 — 단순화를
  // 위해 modal.close handler 가 직접 cancel 도 처리한다.
  const keyboardHandlers = useMemo<Partial<Record<ShortcutAction, () => void>>>(() => {
    return {
      'search.focus': (): void => {
        const el = document.querySelector<HTMLInputElement>(
          '[data-testid="sidebar-search-input"]'
        );
        if (el !== null) {
          // 사이드바가 collapse 되어 있으면 먼저 펼쳐 input 이 표시되도록.
          if (!sidebarVisible) setSidebarVisible(true);
          // 다음 microtask 에 focus — display:none 직후엔 focus 가 적용 X.
          requestAnimationFrame(() => {
            el.focus();
            el.select();
          });
        }
      },
      'usage.open': (): void => {
        setSettingsInitialTab('usage');
        setSettingsModalOpen(true);
      },
      'settings.open': (): void => {
        setSettingsInitialTab('mcp');
        setSettingsModalOpen(true);
      },
      'chat.new': (): void => {
        void handleNewChat();
      },
      'sidebar.toggle': (): void => {
        setSidebarVisible((v) => !v);
      },
      'help.open': (): void => {
        setSlashHelpOpen(true);
      },
      // Escape 우선순위: open modal > popover > streaming cancel > no-op.
      // 단일 handler 안에서 chain 을 직접 처리해 SHORTCUT_DEFS 순서 의존을
      // 줄인다 — chat.cancel handler 는 모달이 없을 때만 실행되도록 modal.close
      // 가 모달이 있을 때만 close + 그 외엔 cancel 까지 처리.
      'modal.close': (): void => {
        if (slashHelpOpen) {
          setSlashHelpOpen(false);
          return;
        }
        if (settingsModalOpen) {
          setSettingsModalOpen(false);
          return;
        }
        // 모달이 없으면 Escape 를 streaming cancel 로 사용.
        if (isStreaming) {
          cancelStream();
        }
      },
      // chat.cancel 은 above 의 modal.close 가 이미 cancelStream 까지 처리.
      // 이 handler 는 사실상 dead-code 지만 SHORTCUT_DEFS 표시 / 사용자
      // override 가능성을 위해 유지. modal.close 와 같은 Escape 를 갖지만
      // first-match-wins 으로 modal.close 가 항상 먼저 dispatch.
      'chat.cancel': (): void => {
        if (isStreaming) cancelStream();
      },
    };
  }, [
    sidebarVisible,
    handleNewChat,
    slashHelpOpen,
    settingsModalOpen,
    isStreaming,
    cancelStream,
  ]);

  useKeyboardShortcuts({
    handlers: keyboardHandlers,
    overrides: keyboardOverrides,
    // Wizard 활성 중에는 단축키 비활성 (wizard 자체 navigation 우선).
    enabled: !showOnboarding,
  });

  // Wizard 표시 중일 땐 main 3-panel 도 mount — 사용자가 wizard 끝낸 직후
  // 데이터가 이미 fetch 되어 있도록. wizard 가 z-50 overlay 라 위에 덮인다.
  // 단 onboarding loading 중 (= null) 에는 빈 div 로 splash 처럼 처리해
  // 잠깐 wizard 가 깜빡이는 걸 방지.
  if (onboardingLoading) {
    return <div className="h-full w-full bg-bg-primary" aria-hidden="true" />;
  }

  return (
    <>
      {showOnboarding && (
        <OnboardingWizard
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
          onOpenMcpSettings={() => {
            // v0.9.0 — wizard 의 [더 알아보기] 클릭 시 wizard 닫고 settings 의 MCP 탭으로.
            setSettingsInitialTab('mcp');
            setSettingsModalOpen(true);
            // wizard 는 onboarding_completed 와 별도 — settings 모달이 위에 표시.
          }}
        />
      )}
      <ThreePanelLayout
        sidebarVisible={sidebarVisible}
        sidebar={
          <Sidebar
            sessions={sidebarSessions}
            activeSessionId={activeSessionId}
            projectName={projectName}
            onSelectSession={setActiveSessionId}
            onNewChat={() => {
              void handleNewChat();
            }}
            onOpenSettings={() => {
              // v0.8.0 — 통합 SettingsModal 진입 (default tab=MCP).
              setSettingsInitialTab('mcp');
              setSettingsModalOpen(true);
            }}
            onReopenOnboarding={() => {
              // v0.3.0 — settings 의 onboarding_completed=false 영속 + state 토글.
              // useOnboarding 의 completed 가 false 로 바뀌면 showOnboarding=true →
              // OnboardingWizard 가 다시 mount.
              void resetOnboarding();
            }}
            onOpenUsage={() => {
              // v0.8.0 — 통합 SettingsModal 의 '사용량' 탭으로 직진입.
              setSettingsInitialTab('usage');
              setSettingsModalOpen(true);
            }}
            onOpenMcpSettings={() => {
              // v0.9.0 — Sidebar 의 MCP status indicator 클릭 시 MCP 탭으로 직진입.
              setSettingsInitialTab('mcp');
              setSettingsModalOpen(true);
            }}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            searchResults={searchResults}
            searchLoading={searchLoading}
            searchError={searchError}
            onSearchResultClick={handleSearchResultClick}
          />
        }
        chat={
          <ChatPanel
            session={activeSession}
            onSubmit={(text) => {
              setPendingPrompt(undefined);
              void handleSubmitMessage(text);
            }}
            onSubmitBlocks={(text, blocks) => {
              // v0.13.0 (J) — ChatInput 가 typed block 경로로 호출. text 는
              // 멘션 토큰이 strip 된 사용자 메시지, blocks 는 file_reference /
              // session_reference / (실패한) text(error) 블록들.
              setPendingPrompt(undefined);
              void handleSubmitMessage(text, blocks);
            }}
            onPickSession={(id) => {
              // v0.13.0 (J) — session_reference chip 의 "open" 클릭. 그 세션
              // 으로 active 를 전환. 세션이 sidebar 의 sessions 목록에 있으면
              // 자연스럽게 로드되고, 없으면 (archived/deleted) 무시.
              if (sessions.some((s) => s.id === id)) {
                setActiveSessionId(id);
              }
            }}
            isStreaming={isStreaming}
            onCancel={cancelStream}
            cliStatus={cliStatus}
            workspaceName={chatHeaderWorkspaceName}
            onPickWorkspace={() => {
              void pickWorkspace();
            }}
            ipcUnavailable={provider === null}
            initialInputValue={pendingPrompt}
            commandHandlers={commandHandlers}
            {...(mentionWorkspaceRoot !== undefined && {
              mentionWorkspaceRoot,
            })}
            {...(mentionIgnorePatterns !== undefined && {
              mentionIgnorePatterns,
            })}
            mentionSessions={mentionSessions}
            {...(mentionResolverContext !== undefined && {
              mentionResolverContext,
            })}
            pendingFocusTurnId={pendingFocusTurnId}
            onTurnFocused={handleTurnFocused}
            onChangePermission={(next) => {
              void handleChangePermission(next);
            }}
          />
        }
        preview={
          <PreviewPanel
            sessionId={(activeSession?.id ?? null) as SessionId | null}
            browser={activeSession?.browser ?? null}
          />
        }
      />
      <SettingsModal
        open={settingsModalOpen}
        initialTab={settingsInitialTab}
        onClose={() => {
          setSettingsModalOpen(false);
        }}
        onReopenOnboarding={() => {
          setSettingsModalOpen(false);
          void resetOnboarding();
        }}
      />
      <SlashHelpModal
        open={slashHelpOpen}
        onClose={() => {
          setSlashHelpOpen(false);
        }}
      />
      <CompareModal
        open={compareModalOpen}
        run={compareHook.run}
        isRunning={compareHook.isRunning}
        onClose={() => {
          setCompareModalOpen(false);
          compareHook.reset();
        }}
        onCancel={() => {
          void compareHook.cancel();
        }}
        onAccept={handleAcceptCompare}
      />
    </>
  );
}
