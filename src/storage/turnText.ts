/**
 * turnText — extract human-readable plain text from a Turn's ContentBlock[].
 *
 * v0.7.0 (F-026 Chat Search). Used by SessionStore.appendTurn / insertTurns
 * to populate the FTS5 `turns_fts` index. Single source of truth for what
 * counts as "searchable conversation text" — keep aligned with the UI
 * rendering of TurnDisplay (which only shows `text` and `embedded_card`).
 *
 * Indexing rules (intentional):
 *   - `text` blocks → joined with single space.
 *   - `mention` blocks → use `ref.display` (the human-visible token).
 *   - `embedded_card` blocks → include `card.title` (visible as fallback in UI).
 *   - `image` / `file` blocks → SKIP. base64 / URI strings are noise for FTS.
 *
 * tool_calls / tool_results are intentionally NOT considered here — they live
 * on Turn at top level (not in `content`) and represent machine output, not
 * the human conversation that users want to search.
 *
 * INV: returns '' iff no indexable text exists (so callers can skip empty
 *      INSERT into turns_fts).
 */

import type { ContentBlock } from '@/types';

export function extractTurnText(content: ContentBlock[] | undefined): string {
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    switch (block.type) {
      case 'text':
        if (typeof block.text === 'string' && block.text.length > 0) {
          parts.push(block.text);
        }
        break;
      case 'mention':
        if (typeof block.ref?.display === 'string' && block.ref.display.length > 0) {
          parts.push(block.ref.display);
        }
        break;
      case 'embedded_card':
        if (typeof block.card?.title === 'string' && block.card.title.length > 0) {
          parts.push(block.card.title);
        }
        break;
      case 'image':
      case 'file':
        // Skip — payload is bytes/URI, not searchable text.
        break;
      default:
        // Discriminated union — exhaustive. Any future block type surfaces
        // here as an unhandled case (TS will yell at the type system) but
        // at runtime we silently ignore for forward compatibility.
        break;
    }
  }
  return parts.join(' ').trim();
}
