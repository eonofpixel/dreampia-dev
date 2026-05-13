/**
 * Real CLI smoke tests.
 *
 * Default test runs skip these because they call external authenticated CLIs.
 * Run explicitly with:
 *   DREAMPIA_REAL_CLI_SMOKE=1 npm test -- tests/providers/cli/realCliSmoke.test.ts
 */

import { describe, expect, it } from 'vitest';

import { CliProvider } from '../../../src/providers/cli/CliProvider';
import { detectCli } from '../../../src/providers/cli/detect';
import { translateClaudeJsonl } from '../../../src/providers/cli/translateClaudeJsonl';
import { translateCodexJsonl } from '../../../src/providers/cli/translateCodexJsonl';
import type { StreamEvent } from '../../../src/providers/types';
import type { Turn } from '../../../src/types';
import { newTurnId, nowIso } from '../../../src/types';

const enabled = process.env.DREAMPIA_REAL_CLI_SMOKE === '1';
const EXPECTED = 'DREAMPIA_REAL_PROVIDER_OK';
const PROMPT = `Reply with exactly: ${EXPECTED}`;
const TIMEOUT_MS = Number(process.env.DREAMPIA_REAL_CLI_TIMEOUT_MS ?? 120_000);

function userTurn(text: string): Turn {
  return {
    id: newTurnId(),
    role: 'user',
    timestamp: nowIso(),
    status: 'completed',
    content: [{ type: 'text', text }],
  };
}

async function collect(
  provider: CliProvider,
  model: string
): Promise<{
  text: string;
  errors: string[];
  usageEvents: number;
}> {
  const events: StreamEvent[] = [];
  for await (const ev of provider.stream({ turns: [userTurn(PROMPT)], model })) {
    events.push(ev);
  }

  return {
    text: events
      .filter((ev): ev is Extract<StreamEvent, { type: 'text_delta' }> => ev.type === 'text_delta')
      .map((ev) => ev.text)
      .join(''),
    errors: events
      .filter((ev): ev is Extract<StreamEvent, { type: 'error' }> => ev.type === 'error')
      .map((ev) => ev.error),
    usageEvents: events.filter((ev) => ev.type === 'usage').length,
  };
}

describe.skipIf(!enabled)('real authenticated CLI smoke', () => {
  it(
    'streams through the real Codex CLI adapter',
    async () => {
      const detected = await detectCli();
      expect(detected.codex, 'Codex CLI must be installed for real smoke').not.toBeNull();
      if (detected.codex === null) return;

      const provider = new CliProvider({
        binaryPath: detected.codex.path,
        provider: 'codex',
        cwd: process.cwd(),
        permissionLevel: 'read_only',
        timeout_ms: TIMEOUT_MS,
        translate: translateCodexJsonl,
      });

      const result = await collect(
        provider,
        process.env.DREAMPIA_REAL_CODEX_MODEL ?? 'gpt-5.4-mini'
      );
      expect(result.errors).toEqual([]);
      expect(result.text).toContain(EXPECTED);
      expect(result.usageEvents).toBeGreaterThanOrEqual(1);
    },
    TIMEOUT_MS + 15_000
  );

  it(
    'streams through the real Claude CLI adapter',
    async () => {
      const detected = await detectCli();
      expect(detected.claude, 'Claude CLI must be installed for real smoke').not.toBeNull();
      if (detected.claude === null) return;

      const provider = new CliProvider({
        binaryPath: detected.claude.path,
        provider: 'claude',
        cwd: process.cwd(),
        permissionLevel: 'read_only',
        timeout_ms: TIMEOUT_MS,
        translate: translateClaudeJsonl,
      });

      const result = await collect(
        provider,
        process.env.DREAMPIA_REAL_CLAUDE_MODEL ?? 'claude-haiku-4-5'
      );
      expect(result.errors).toEqual([]);
      expect(result.text).toContain(EXPECTED);
      expect(result.usageEvents).toBeGreaterThanOrEqual(1);
    },
    TIMEOUT_MS + 15_000
  );
});
