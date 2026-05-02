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
});

export type Workspace = z.infer<typeof WorkspaceSchema>;
