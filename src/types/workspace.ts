/**
 * Workspace sub-schema: Workspace, WorkTree, GitState, FileRef.
 *
 * Spec: docs/session/workspace.md
 */

import { z } from 'zod';
import {
  WorkTreeIdSchema,
  SessionIdSchema,
  AbsolutePathSchema,
  UriSchema,
  ISO8601Schema,
} from './common';

// ────────────────────────────────────────────────────────────
// FileRef
// ────────────────────────────────────────────────────────────

export const FileRefSchema = z.object({
  uri: UriSchema,
  name: z.string().min(1),
  size_bytes: z.number().int().nonnegative(),
  language: z.string().optional(),
  last_accessed: ISO8601Schema,
});

export type FileRef = z.infer<typeof FileRefSchema>;

// ────────────────────────────────────────────────────────────
// WorkTree (git worktree)
// ────────────────────────────────────────────────────────────

export const WorkTreeSchema = z.object({
  id: WorkTreeIdSchema,
  path: AbsolutePathSchema,
  branch: z.string().min(1),
  is_permanent: z.boolean(),
  parent_session_id: SessionIdSchema.optional(),
  created_at: ISO8601Schema,
});

export type WorkTree = z.infer<typeof WorkTreeSchema>;

// ────────────────────────────────────────────────────────────
// GitState
// ────────────────────────────────────────────────────────────

export const GitStateSchema = z.object({
  branch: z.string().min(1),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  staged_count: z.number().int().nonnegative(),
  unstaged_count: z.number().int().nonnegative(),
  untracked_count: z.number().int().nonnegative(),
  last_commit: z
    .object({
      sha: z.string().min(1),
      subject: z.string(),
    })
    .optional(),
});

export type GitState = z.infer<typeof GitStateSchema>;

// ────────────────────────────────────────────────────────────
// Index status
// ────────────────────────────────────────────────────────────

export const IndexStatusSchema = z.enum(['idle', 'indexing', 'ready', 'failed']);

export type IndexStatus = z.infer<typeof IndexStatusSchema>;

// ────────────────────────────────────────────────────────────
// Workspace (top-level)
// ────────────────────────────────────────────────────────────

export const WorkspaceSchema = z.object({
  root: AbsolutePathSchema,
  name: z.string().min(1),

  worktrees: z.array(WorkTreeSchema),
  active_worktree_id: WorkTreeIdSchema.optional(),

  recent_files: z.array(FileRefSchema),
  open_files: z.array(FileRefSchema),

  git_state: GitStateSchema.optional(),

  ignore_patterns: z.array(z.string()),

  index_status: IndexStatusSchema,
  index_at: ISO8601Schema.optional(),
  file_count: z.number().int().nonnegative().optional(),

  is_temporary: z.boolean(),

  /**
   * v1.1.11 (Workspace UX): per-session sticky lock. true 면 사용자가 본 세션을
   * 본 workspace 에 고정 — 폴더 변경 / drift 가 발생해도 본 세션은 자기
   * workspace 로 복귀. ChatHeader 의 🔒 toggle 로 변경.
   * Migration 007 의 sessions.workspace_locked INTEGER 컬럼에서 채움.
   */
  locked: z.boolean().optional(),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

// ────────────────────────────────────────────────────────────
// FileEntry / FileContent (v0.6.0 — F-019 @ mention)
// ────────────────────────────────────────────────────────────

/**
 * `workspace/list-files` IPC 가 반환하는 한 파일의 메타데이터.
 *
 * `path` 는 workspace_root 기준 relative POSIX 경로 (e.g. `src/main/index.ts`).
 * Windows 의 backslash 는 main 측에서 forward slash 로 정규화되므로 멘션
 * 비교/표시 모두 일관되게 동작한다.
 *
 * Spec: docs/ux/patterns/F-019-mention-palette.md
 */
export interface FileEntry {
  path: string;
  size_bytes: number;
  /** ISO 8601 modified timestamp. */
  mtime: string;
}

/**
 * `workspace/read-file` IPC 가 반환하는 파일 본문 + 메타.
 *
 * `truncated` 가 true 면 `content` 는 `max_bytes` 까지만 채워진 prefix.
 * `line_count` 는 truncated content 기준 라인 수 (\n 개수 + 1).
 *
 * Spec: docs/ux/patterns/F-019-mention-palette.md
 */
export interface FileContent {
  content: string;
  truncated: boolean;
  line_count: number;
}

/**
 * `workspace/write-file` IPC 가 반환하는 결과 (v2.7.0 Phase 3).
 *
 * `mtime` 은 디스크에 기록된 후의 ISO 8601 timestamp — 클라이언트가 다음 저장
 * 시 expected_mtime 으로 보내 optimistic concurrency check 를 수행할 수 있다.
 * `size_bytes` 는 새로 기록된 본문 길이 (UTF-8 byte 단위).
 *
 * Spec: ../CODE_TAB_DECISION.md (Phase 3 편집 모드).
 */
export interface FileWriteResult {
  mtime: string;
  size_bytes: number;
  /** expected_mtime 이 주어졌고 디스크 mtime 과 다르면 'mtime_mismatch'. */
  conflict?: 'mtime_mismatch';
}

/**
 * `workspace/stat-file` IPC 결과 (v2.7.0 Phase 3 sub-PR).
 *
 * 외부 변경 감지용 — renderer 가 주기적으로 호출해 mtime 변화를 추적한다.
 * 파일이 없거나 디렉토리면 `exists: false`. content/binary 검사는 안 한다 —
 * 가벼운 metadata-only 호출.
 */
export interface FileStatResult {
  exists: boolean;
  mtime?: string;
  size_bytes?: number;
}

// ────────────────────────────────────────────────────────────
// Repo context / local coding loop summaries (v2.10.x)
// ────────────────────────────────────────────────────────────

export interface RepoLanguageSummary {
  language: string;
  files: number;
  bytes: number;
}

export interface RepoContextFile {
  path: string;
  reason: string;
}

export interface RepoScriptSummary {
  name: string;
  command: string;
}

export interface RepoGitFileChange {
  path: string;
  status: string;
  staged: boolean;
  worktree: boolean;
}

export interface RepoGitSummary {
  is_repo: boolean;
  branch: string | null;
  dirty_count: number;
  staged_count: number;
  unstaged_count: number;
  untracked_count: number;
  files: RepoGitFileChange[];
  last_commit?: {
    sha: string;
    subject: string;
  };
  error?: string;
}

export interface RepoContextSummary {
  root: string;
  generated_at: string;
  status: 'ready' | 'partial' | 'failed';
  file_count: number;
  indexed_count: number;
  truncated: boolean;
  ignored_patterns: string[];
  languages: RepoLanguageSummary[];
  key_files: RepoContextFile[];
  test_files: RepoContextFile[];
  source_roots: string[];
  scripts: RepoScriptSummary[];
  safe_commands: RepoScriptSummary[];
  git: RepoGitSummary;
  warnings: string[];
}

export interface CommandRunResult {
  command: string;
  cwd: string;
  status: 'completed' | 'failed' | 'timed_out';
  exit_code: number | null;
  stdout_tail: string;
  stderr_tail: string;
  started_at: string;
  ended_at: string;
  summary: string;
}
