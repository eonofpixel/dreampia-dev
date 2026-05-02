/**
 * Plan sub-schema: PlanState, PlanItem.
 *
 * Spec: docs/session/plan.md
 */

import { z } from 'zod';
import { TurnIdSchema } from './common';

// ────────────────────────────────────────────────────────────
// PlanItem status
// ────────────────────────────────────────────────────────────

export const PlanItemStatusSchema = z.enum(['pending', 'in_progress', 'done', 'skipped']);

export type PlanItemStatus = z.infer<typeof PlanItemStatusSchema>;

// ────────────────────────────────────────────────────────────
// PlanItem (recursive — sub_items same shape)
// ────────────────────────────────────────────────────────────

export type PlanItem = {
  id: string;
  text: string;
  status: PlanItemStatus;
  sub_items?: PlanItem[];
  related_turns: string[];
  evidence?: string;
};

export const PlanItemSchema: z.ZodType<PlanItem> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    status: PlanItemStatusSchema,
    sub_items: z.array(PlanItemSchema).optional(),
    related_turns: z.array(TurnIdSchema),
    evidence: z.string().optional(),
  })
);

// ────────────────────────────────────────────────────────────
// PlanState (top-level for this sub-schema)
// ────────────────────────────────────────────────────────────

export const PlanStateSchema = z.object({
  active: z.boolean(),

  checklist: z.array(PlanItemSchema).optional(),
  current_item_index: z.number().int().nonnegative().optional(),

  browser_tool_enabled: z.boolean(),
});

export type PlanState = z.infer<typeof PlanStateSchema>;
