/**
 * Settings — minimal JSON persistence at `userData/settings.json`.
 *
 * Phase 2: 사용자가 picker 로 선택한 workspace 경로를 reload 후에도
 * 기억하도록 저장. 추후 theme/language 등 사용자 preference 도 여기로 확장.
 *
 * v0.2.0 추가: MCP 서버 설정 (mcp_servers) 영속화. McpManager 가 이 파일을
 * read/write 어댑터로 받아 사용 (Phase 1 P0 — Issue #5).
 *
 * MAIN process 전용 — preload/renderer 에서 import 금지 (electron / node:fs 사용).
 *
 * 캐시 정책:
 *   - 첫 read 시 디스크 → memory cache 채움
 *   - write 시 cache 와 디스크 둘 다 갱신 (next read 는 cache hit)
 *   - 테스트는 `__resetSettingsCache()` 로 모듈 캐시 초기화 가능
 *
 * Spec: docs/findings/round5-ipc-telemetry.md (settings.json 패턴),
 *       docs/tools/mcp-bridge.md (mcp_servers 영속)
 */

import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  McpServerConfigSchema,
  PermissionLevelSchema,
  type McpServerConfig,
  type PermissionLevel,
} from '@/types';

/**
 * v0.3.0 — 사용자가 onboarding wizard 또는 설정에서 선택할 수 있는 기본 provider.
 * 'auto' (default) → routing.ts 의 model-prefix 기반 자동 선택.
 * 그 외 명시 선택 시 auto.ts 의 routing 을 override (단 CLI 가 감지된 경우만).
 */
export const DEFAULT_PROVIDER_VALUES = ['auto', 'claude', 'codex', 'mock'] as const;
export type DefaultProviderChoice = (typeof DEFAULT_PROVIDER_VALUES)[number];

function isDefaultProviderChoice(v: unknown): v is DefaultProviderChoice {
  return typeof v === 'string' && (DEFAULT_PROVIDER_VALUES as readonly string[]).includes(v);
}

/**
 * v0.8.0 — Settings 모달의 [테마] 탭에서 선택. 'system' 이면 prefers-color-scheme
 * 매핑 (renderer 가 적용). 미지정 시 'system'. data-theme 속성으로 CSS 토큰
 * (bg-primary 등) 을 분기.
 */
export const THEME_VALUES = ['light', 'dark', 'system'] as const;
export type ThemeChoice = (typeof THEME_VALUES)[number];

function isThemeChoice(v: unknown): v is ThemeChoice {
  return typeof v === 'string' && (THEME_VALUES as readonly string[]).includes(v);
}

/**
 * v0.11.0 (B2) — Settings 모달의 [언어] 탭에서 선택. 'ko' 가 default — 영어는
 * opt-in. 미지정 시 'ko'. 알 수 없는 값은 silent drop.
 *
 * 영문화 범위는 chat / search / usage / settings / error 핵심 화면에 한정
 * (Codex 권고). 누락된 키는 자동으로 한국어로 fallback.
 */
export const LANGUAGE_VALUES = ['ko', 'en'] as const;
export type LanguageChoice = (typeof LANGUAGE_VALUES)[number];

function isLanguageChoice(v: unknown): v is LanguageChoice {
  return typeof v === 'string' && (LANGUAGE_VALUES as readonly string[]).includes(v);
}

export interface AppSettings {
  /** 마지막으로 선택한 작업 폴더 절대 경로. */
  workspace_root?: string;
  /** UI 표시용 폴더 이름 (basename). */
  workspace_name?: string;
  /**
   * 첫 실행 onboarding wizard 완료 여부 (Phase 3 B2).
   * absent / false → 다음 실행 시 wizard 표시. true → main app 으로 직행.
   * Spec: docs/ia/onboarding.md
   */
  onboarding_completed?: boolean;
  /**
   * v0.2.0 — 사용자가 등록한 MCP 서버 목록 (Issue #5).
   * 부팅 시 McpManager.loadFromSettings() 가 enabled=true 인 항목만 spawn.
   */
  mcp_servers?: McpServerConfig[];
  /**
   * v0.3.0 — 사용자가 wizard / 설정에서 선택한 기본 provider.
   *   undefined / 'auto' → 자동 (model prefix 기반)
   *   'claude' / 'codex'  → CLI 감지 시 강제 사용
   *   'mock'              → MockProvider 사용 (개발/테스트 옵트인)
   */
  default_provider?: DefaultProviderChoice;
  /**
   * v0.3.0 — 새 세션이 만들어질 때 사용할 기본 permission level.
   * 미지정 시 'workspace_write' (codebase 의 기존 default).
   */
  default_permission_level?: PermissionLevel;
  /**
   * v0.8.0 — UI 테마 선택. 'system' 이면 OS 의 prefers-color-scheme 을 따라가며,
   * renderer 가 document.documentElement 에 data-theme 속성을 적용한다.
   * 미지정 시 'system'.
   */
  theme?: ThemeChoice;
  /**
   * v0.9.0 — 월별 비용 한도 (USD). 미설정 시 한도 없음.
   * 음수 금지 (writeSettings 에서 검증). 0 은 "한도 없음" 으로 해석되지 않고
   * "한도 0 USD" — UI 에서 즉시 경고 표시.
   */
  usage_cost_limit_usd?: number;
  /**
   * v0.9.0 — 알림 임계값 비율 (0~1). 예: 0.8 → 한도의 80% 도달 시 경고.
   * 미설정 시 0.8 default. 한도 미설정 시엔 의미 없음.
   */
  usage_alert_threshold?: number;
  /**
   * v0.10.0 — 사용자가 [단축키] 패널에서 변경한 키 매핑.
   * 키: ShortcutAction (e.g. 'search.focus'), 값: combo 문자열 ("Mod+K").
   * 미설정 시 SHORTCUT_DEFS 의 default 사용. 본 필드는 plain object —
   * IPC 직렬화 안전. 알 수 없는 액션은 silent drop.
   */
  keyboard_shortcut_overrides?: Record<string, string>;
  /**
   * v0.11.0 (B2) — Settings 모달 [언어] 탭에서 선택한 UI locale.
   *   'ko' → 한국어 (default)
   *   'en' → 영어 (opt-in, chat/search/settings 등 핵심 화면만)
   * 미설정 시 'ko'. renderer 가 부팅 시 한 번 fetch + locale 적용.
   */
  language?: LanguageChoice;
  /**
   * v1.2.3 — Direct API mode API key 저장 (Anthropic / OpenAI).
   * 본 commit 은 storage 만 — UI 입력 + auto-routing 은 후속.
   *
   * 보안 주의: settings.json 은 OS 의 userData 에 plain text. 사용자가
   * 인지하고 입력하는 게 전제. 향후 OS keychain (electron-store w/ keytar)
   * 으로 마이그레이션 권고.
   */
  api_key_anthropic?: string;
  api_key_openai?: string;
  /**
   * v1.7.14 — Automation rules 영속. AutomationManager 가 부팅 시 load,
   * register/unregister 시 write. handler 는 직렬화 불가 → 'no-op log'
   * default 로 hydrate.
   */
  automation_rules?: AutomationRulePersisted[];
  /**
   * v1.7.15 — Telemetry opt-in 플래그. true 일 때만 SentrySink/ConsoleSink
   * 가 emit. default false (사용자가 명시 opt-in). bootstrapTelemetry 가 본
   * 값을 읽어 setEnabled.
   */
  telemetry_enabled?: boolean;
  /**
   * v1.7.24 — Shell exec automation handler opt-in. default false.
   * true 일 때만 'shell-exec' handler 가 동작. user 가 explicit 으로
   * 활성화해야 자동화 rule 의 shell command 가 실행됨 (보안상).
   */
  automation_shell_enabled?: boolean;
  /**
   * v1.4.8 — Workspace ID backfill (FNV-1a → sha256) 완료 또는 dismiss
   * 플래그. 부팅 시 이 값이 false/undefined 면 workspace/check-backfill
   * 호출해 legacy FNV row 가 있는지 확인. 사용자가 [실행] / [다시 묻지
   * 않기] 둘 중 하나 선택 시 true 로 설정.
   * - undefined → 처음 부팅 또는 아직 결정 안함 (modal 가능).
   * - true → 이미 완료 또는 dismiss → 부팅 시 modal skip.
   */
  workspace_backfill_done?: boolean;
}

/**
 * Persisted shape — handler 는 직렬화 불가라 제외. 현재 schema 에 align.
 *
 * v1.7.23 — handler_name / handler_config 추가. handler closure 는 직렬화
 * 불가하지만 식별자 + config 는 영속 가능. 부팅 시 registry lookup 으로
 * 실 closure 재구성.
 */
export interface AutomationRulePersisted {
  name: string;
  kind: 'interval' | 'cron' | 'webhook';
  interval_ms?: number;
  cron_expr?: string;
  cron_tz?: string;
  webhook_path?: string;
  handler_name?: string;
  handler_config?: Record<string, unknown>;
  /** v1.7.27 — false 면 비활성. undefined/true 는 활성. */
  enabled?: boolean;
}

let cached: AppSettings | null = null;

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

export function readSettings(): AppSettings {
  if (cached !== null) return cached;
  const path = settingsPath();
  if (!existsSync(path)) {
    cached = {};
    return cached;
  }
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const next: AppSettings = {};
      if (typeof obj['workspace_root'] === 'string') {
        next.workspace_root = obj['workspace_root'];
      }
      if (typeof obj['workspace_name'] === 'string') {
        next.workspace_name = obj['workspace_name'];
      }
      if (typeof obj['onboarding_completed'] === 'boolean') {
        next.onboarding_completed = obj['onboarding_completed'];
      }
      // mcp_servers — 런타임에 받은 신뢰 못할 데이터 → 각 항목을 Zod 로 검증.
      // 1개 깨진 항목이 전체 기능을 막지 않도록 통과한 것만 보존.
      if (Array.isArray(obj['mcp_servers'])) {
        const valid: McpServerConfig[] = [];
        for (const item of obj['mcp_servers']) {
          const result = McpServerConfigSchema.safeParse(item);
          if (result.success) {
            valid.push(result.data);
          }
          // 손상된 항목은 silent drop — 다음 write 시 정상 항목만 남는다.
        }
        next.mcp_servers = valid;
      }
      // v0.3.0 — default_provider / default_permission_level. 알 수 없는 값은
      // silent drop (undefined 로 fallback) — corrupt 한 값이 전체 기능을 막지
      // 않도록.
      if (isDefaultProviderChoice(obj['default_provider'])) {
        next.default_provider = obj['default_provider'];
      }
      const dplResult = PermissionLevelSchema.safeParse(obj['default_permission_level']);
      if (dplResult.success) {
        next.default_permission_level = dplResult.data;
      }
      // v0.8.0 — theme. 알 수 없는 값은 silent drop.
      if (isThemeChoice(obj['theme'])) {
        next.theme = obj['theme'];
      }
      // v0.9.0 — usage limits. 음수 / non-finite 는 silent drop.
      if (
        typeof obj['usage_cost_limit_usd'] === 'number' &&
        Number.isFinite(obj['usage_cost_limit_usd']) &&
        obj['usage_cost_limit_usd'] >= 0
      ) {
        next.usage_cost_limit_usd = obj['usage_cost_limit_usd'];
      }
      if (
        typeof obj['usage_alert_threshold'] === 'number' &&
        Number.isFinite(obj['usage_alert_threshold']) &&
        obj['usage_alert_threshold'] >= 0 &&
        obj['usage_alert_threshold'] <= 1
      ) {
        next.usage_alert_threshold = obj['usage_alert_threshold'];
      }
      // v0.11.0 (B2) — language. 알 수 없는 값은 silent drop.
      if (isLanguageChoice(obj['language'])) {
        next.language = obj['language'];
      }
      // v1.2.3 — Direct API key. plain string. 빈 문자열은 미설정으로 취급.
      if (typeof obj['api_key_anthropic'] === 'string' && obj['api_key_anthropic'].length > 0) {
        next.api_key_anthropic = obj['api_key_anthropic'];
      }
      if (typeof obj['api_key_openai'] === 'string' && obj['api_key_openai'].length > 0) {
        next.api_key_openai = obj['api_key_openai'];
      }
      // v1.7.15 — telemetry_enabled. boolean 만 인정.
      if (typeof obj['telemetry_enabled'] === 'boolean') {
        next.telemetry_enabled = obj['telemetry_enabled'];
      }
      // v1.7.24 — automation_shell_enabled. boolean 만 인정.
      if (typeof obj['automation_shell_enabled'] === 'boolean') {
        next.automation_shell_enabled = obj['automation_shell_enabled'];
      }
      // v1.4.8 — workspace_backfill_done. boolean 만 인정.
      if (typeof obj['workspace_backfill_done'] === 'boolean') {
        next.workspace_backfill_done = obj['workspace_backfill_done'];
      }
      // v1.7.14 — automation_rules. 손상된 항목 silent drop.
      if (Array.isArray(obj['automation_rules'])) {
        const validRules: AutomationRulePersisted[] = [];
        for (const item of obj['automation_rules']) {
          if (item === null || typeof item !== 'object') continue;
          const r = item as Record<string, unknown>;
          if (typeof r['name'] !== 'string' || r['name'].length === 0) continue;
          if (
            r['kind'] !== 'interval' &&
            r['kind'] !== 'cron' &&
            r['kind'] !== 'webhook'
          ) {
            continue;
          }
          const persisted: AutomationRulePersisted = {
            name: r['name'],
            kind: r['kind'],
          };
          if (typeof r['interval_ms'] === 'number' && r['interval_ms'] > 0) {
            persisted.interval_ms = r['interval_ms'];
          }
          if (typeof r['cron_expr'] === 'string' && r['cron_expr'].length > 0) {
            persisted.cron_expr = r['cron_expr'];
          }
          if (typeof r['cron_tz'] === 'string' && r['cron_tz'].length > 0) {
            persisted.cron_tz = r['cron_tz'];
          }
          if (
            typeof r['webhook_path'] === 'string' &&
            r['webhook_path'].length > 0
          ) {
            persisted.webhook_path = r['webhook_path'];
          }
          // v1.7.23 — handler_name / handler_config. 손상된 항목 silent drop.
          if (
            typeof r['handler_name'] === 'string' &&
            r['handler_name'].length > 0
          ) {
            persisted.handler_name = r['handler_name'];
          }
          if (
            r['handler_config'] !== null &&
            typeof r['handler_config'] === 'object' &&
            !Array.isArray(r['handler_config'])
          ) {
            persisted.handler_config = r['handler_config'] as Record<string, unknown>;
          }
          // v1.7.27 — enabled. boolean 만 인정. 누락은 default 활성 (undefined).
          if (typeof r['enabled'] === 'boolean') {
            persisted.enabled = r['enabled'];
          }
          validRules.push(persisted);
        }
        if (validRules.length > 0) {
          next.automation_rules = validRules;
        }
      }
      // v0.10.0 — keyboard_shortcut_overrides. plain Record<string,string>.
      // string 키 / string 값만 보존, 그 외 (number / object / null) 은 drop.
      // 빈 string 값도 silent drop — 의미 없는 매핑이 영속되지 않도록.
      if (
        obj['keyboard_shortcut_overrides'] !== null &&
        typeof obj['keyboard_shortcut_overrides'] === 'object' &&
        !Array.isArray(obj['keyboard_shortcut_overrides'])
      ) {
        const raw = obj['keyboard_shortcut_overrides'] as Record<string, unknown>;
        const validated: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) {
          if (typeof k === 'string' && k.length > 0 && typeof v === 'string' && v.length > 0) {
            validated[k] = v;
          }
        }
        if (Object.keys(validated).length > 0) {
          next.keyboard_shortcut_overrides = validated;
        }
      }
      cached = next;
    } else {
      cached = {};
    }
  } catch {
    // 손상된 JSON / 권한 문제 → 빈 객체로 안전 fallback. 다음 write 시 정상화.
    cached = {};
  }
  return cached;
}

export function writeSettings(patch: Partial<AppSettings>): void {
  const current = readSettings();
  cached = { ...current, ...patch };
  const path = settingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cached, null, 2), 'utf-8');
}

/**
 * 테스트 전용 — module-level cache 초기화.
 * Production 코드는 호출 X.
 */
export function __resetSettingsCache(): void {
  cached = null;
}
