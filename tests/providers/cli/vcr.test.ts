/**
 * VCR helper unit tests (v1.1.5).
 *
 * Spec: docs/v1.x-roadmap.md (v1.1.4 Real CLI integration e2e), Codex Q9/Q10.
 *
 * 검증:
 *   - getVcrMode 가 env 파싱 정확.
 *   - getCliCommandOverride 가 env 파싱 정확 (DREAMPIA_CLI_COMMAND/PREARGS).
 *   - 미지정 / 빈 값 fallback.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getVcrMode, getCliCommandOverride } from '../../../src/providers/cli/vcr';

describe('v1.1.5 — VCR mode env (Codex Q10)', () => {
  let originalMode: string | undefined;
  beforeEach(() => {
    originalMode = process.env.DREAMPIA_VCR_MODE;
  });
  afterEach(() => {
    if (originalMode === undefined) delete process.env.DREAMPIA_VCR_MODE;
    else process.env.DREAMPIA_VCR_MODE = originalMode;
  });

  it("미지정 시 'replay' (default)", () => {
    delete process.env.DREAMPIA_VCR_MODE;
    expect(getVcrMode()).toBe('replay');
  });

  it("'replay' 명시", () => {
    process.env.DREAMPIA_VCR_MODE = 'replay';
    expect(getVcrMode()).toBe('replay');
  });

  it("'record' 명시", () => {
    process.env.DREAMPIA_VCR_MODE = 'record';
    expect(getVcrMode()).toBe('record');
  });

  it("'live' 명시", () => {
    process.env.DREAMPIA_VCR_MODE = 'live';
    expect(getVcrMode()).toBe('live');
  });

  it("알 수 없는 값 → 'replay' fallback", () => {
    process.env.DREAMPIA_VCR_MODE = 'whatever';
    expect(getVcrMode()).toBe('replay');
  });
});

describe('v1.1.5 — CLI command override env (Codex Q10)', () => {
  let originalCmd: string | undefined;
  let originalPre: string | undefined;
  beforeEach(() => {
    originalCmd = process.env.DREAMPIA_CLI_COMMAND;
    originalPre = process.env.DREAMPIA_CLI_PREARGS;
  });
  afterEach(() => {
    if (originalCmd === undefined) delete process.env.DREAMPIA_CLI_COMMAND;
    else process.env.DREAMPIA_CLI_COMMAND = originalCmd;
    if (originalPre === undefined) delete process.env.DREAMPIA_CLI_PREARGS;
    else process.env.DREAMPIA_CLI_PREARGS = originalPre;
  });

  it('DREAMPIA_CLI_COMMAND 미지정 → null', () => {
    delete process.env.DREAMPIA_CLI_COMMAND;
    expect(getCliCommandOverride()).toBeNull();
  });

  it('DREAMPIA_CLI_COMMAND 빈 문자열 → null', () => {
    process.env.DREAMPIA_CLI_COMMAND = '';
    expect(getCliCommandOverride()).toBeNull();
  });

  it('DREAMPIA_CLI_COMMAND 만 지정 → preArgs 빈 배열', () => {
    process.env.DREAMPIA_CLI_COMMAND = '/usr/local/bin/claude';
    delete process.env.DREAMPIA_CLI_PREARGS;
    const override = getCliCommandOverride();
    expect(override).toEqual({
      command: '/usr/local/bin/claude',
      pre_args: [],
    });
  });

  it('DREAMPIA_CLI_PREARGS 공백 split', () => {
    process.env.DREAMPIA_CLI_COMMAND = 'node';
    process.env.DREAMPIA_CLI_PREARGS = 'tests/fixtures/fake-claude-cli.js';
    const override = getCliCommandOverride();
    expect(override).toEqual({
      command: 'node',
      pre_args: ['tests/fixtures/fake-claude-cli.js'],
    });
  });

  it('DREAMPIA_CLI_PREARGS 다중 토큰', () => {
    process.env.DREAMPIA_CLI_COMMAND = 'node';
    process.env.DREAMPIA_CLI_PREARGS = '--inspect tests/fixtures/fake.js --foo';
    const override = getCliCommandOverride();
    expect(override).toEqual({
      command: 'node',
      pre_args: ['--inspect', 'tests/fixtures/fake.js', '--foo'],
    });
  });
});
