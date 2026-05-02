/**
 * Terminal sub-schema: TerminalState, TerminalPane.
 *
 * Spec: docs/session/terminal.md
 */

import { z } from 'zod';
import {
  PaneIdSchema,
  TurnIdSchema,
  AbsolutePathSchema,
  UriSchema,
} from './common';

// ────────────────────────────────────────────────────────────
// Shell type
// ────────────────────────────────────────────────────────────

export const ShellTypeSchema = z.enum(['bash', 'powershell', 'wsl', 'cmd', 'gitbash']);

export type ShellType = z.infer<typeof ShellTypeSchema>;

// ────────────────────────────────────────────────────────────
// Pane status
// ────────────────────────────────────────────────────────────

export const PaneStatusSchema = z.enum(['running', 'exited', 'killed']);

export type PaneStatus = z.infer<typeof PaneStatusSchema>;

// ────────────────────────────────────────────────────────────
// TerminalPane
// ────────────────────────────────────────────────────────────

export const TerminalPaneSchema = z.object({
  id: PaneIdSchema,
  title: z.string().min(1),

  shell: ShellTypeSchema,
  cwd: AbsolutePathSchema,
  env: z.record(z.string()),

  status: PaneStatusSchema,
  pid: z.number().int().positive().optional(),
  exit_code: z.number().int().optional(),

  scrollback_lines: z.number().int().nonnegative(),
  scrollback_uri: UriSchema.optional(),

  input_history: z.array(z.string()),

  spawned_by_ai: z.boolean(),
  turn_id: TurnIdSchema.optional(),
});

export type TerminalPane = z.infer<typeof TerminalPaneSchema>;

// ────────────────────────────────────────────────────────────
// TerminalState (top-level for this sub-schema)
// ────────────────────────────────────────────────────────────

export const TerminalStateSchema = z.object({
  panes: z.array(TerminalPaneSchema),
  active_pane_id: PaneIdSchema.optional(),
  panel_open: z.boolean(),
  height_px: z.number().int().nonnegative(),
});

export type TerminalState = z.infer<typeof TerminalStateSchema>;
