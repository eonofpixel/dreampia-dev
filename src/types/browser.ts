/**
 * Browser sub-schema: BrowserState, BrowserTab.
 *
 * Spec: docs/session/browser.md
 */

import { z } from 'zod';
import { TabIdSchema, TurnIdSchema, ISO8601Schema, UriSchema } from './common';
import { AnnotationSchema } from './conversation';

// ────────────────────────────────────────────────────────────
// Browser layout & backend
// ────────────────────────────────────────────────────────────

export const BrowserLayoutSchema = z.enum(['panel', 'fullscreen', 'mini', 'hidden']);
export type BrowserLayout = z.infer<typeof BrowserLayoutSchema>;

export const BrowserBackendSchema = z.enum(['iab', 'system_default', 'playwright', 'cdp_attach']);
export type BrowserBackend = z.infer<typeof BrowserBackendSchema>;

// ────────────────────────────────────────────────────────────
// BrowserTab
// ────────────────────────────────────────────────────────────

const TabHistoryEntrySchema = z.object({
  url: z.string().min(1),
  ts: ISO8601Schema,
});

export const BrowserTabStatusSchema = z.enum(['loading', 'ready', 'failed']);
export type BrowserTabStatus = z.infer<typeof BrowserTabStatusSchema>;

export const BrowserTabSpawnedBySchema = z.enum(['user', 'ai', 'embedded_card']);
export type BrowserTabSpawnedBy = z.infer<typeof BrowserTabSpawnedBySchema>;

export const BrowserTabSchema = z.object({
  id: TabIdSchema,
  title: z.string(),
  url: z.string().min(1),
  favicon_uri: UriSchema.optional(),

  status: BrowserTabStatusSchema,
  last_load: ISO8601Schema,

  history: z.array(TabHistoryEntrySchema),
  history_index: z.number().int().nonnegative(),

  annotation_mode: z.boolean(),
  annotations: z.array(AnnotationSchema),

  last_screenshot_uri: UriSchema.optional(),
  last_dom_dump_uri: UriSchema.optional(),

  spawned_by: BrowserTabSpawnedBySchema,
  spawning_turn_id: TurnIdSchema.optional(),
});

export type BrowserTab = z.infer<typeof BrowserTabSchema>;

// ────────────────────────────────────────────────────────────
// BrowserState (top-level for this sub-schema)
// ────────────────────────────────────────────────────────────

export const BrowserStateSchema = z.object({
  tabs: z.array(BrowserTabSchema),
  active_tab_id: TabIdSchema.optional(),
  panel_visible: z.boolean(),
  layout: BrowserLayoutSchema,

  partition_id: z.string().min(1),
});

export type BrowserState = z.infer<typeof BrowserStateSchema>;
