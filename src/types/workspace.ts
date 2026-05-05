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
