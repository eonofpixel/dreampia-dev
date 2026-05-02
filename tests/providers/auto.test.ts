/**
 * getDefaultProvider — model + 설치 상태에 따른 provider 선택 검증.
 *
 * detectCli 를 mock 으로 대체. 실제 spawn 호출은 발생하지 않음.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/providers/cli/detect', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/cli/detect')>(
    '../../src/providers/cli/detect'
  );
  return {
    ...actual,
    detectCli: vi.fn(),
  };
});

import { getDefaultProvider } from '../../src/providers/auto';
import { detectCli } from '../../src/providers/cli/detect';
import { CliProvider } from '../../src/providers/cli/CliProvider';
import { MockProvider } from '../../src/providers/MockProvider';

const mockDetect = vi.mocked(detectCli);

beforeEach(() => {
  mockDetect.mockReset();
  delete process.env.DREAMPIA_TEST;
  delete process.env.DREAMPIA_ALLOW_MOCK_PROVIDER;
});

describe('getDefaultProvider', () => {
  it('claude family + claude installed -> CliProvider claude', async () => {
    mockDetect.mockResolvedValue({
      claude: { path: '/fake/claude', version: '1.0.0' },
      codex: null,
    });
    const result = await getDefaultProvider('claude-3.5-sonnet');
    expect(result.source).toBe('claude-cli');
    expect(result.provider).toBeInstanceOf(CliProvider);
    expect((result.provider as CliProvider).provider).toBe('claude');
  });

  it('codex family + codex installed -> CliProvider codex', async () => {
    mockDetect.mockResolvedValue({
      claude: null,
      codex: { path: '/fake/codex', version: '0.5.0' },
    });
    const result = await getDefaultProvider('gpt-5.5');
    expect(result.source).toBe('codex-cli');
    expect((result.provider as CliProvider).provider).toBe('codex');
  });

  it('claude family but no claude installed -> MockProvider', async () => {
    mockDetect.mockResolvedValue({ claude: null, codex: null });
    const result = await getDefaultProvider('claude-3.5-sonnet');
    expect(result.source).toBe('mock');
    expect(result.provider).toBeInstanceOf(MockProvider);
  });

  it('unknown model prefix -> MockProvider', async () => {
    mockDetect.mockResolvedValue({
      claude: { path: '/fake/claude', version: '1.0.0' },
      codex: { path: '/fake/codex', version: '0.5.0' },
    });
    const result = await getDefaultProvider('unknown-model');
    expect(result.source).toBe('mock');
  });

  it('production without a matching CLI fails closed instead of using MockProvider', async () => {
    mockDetect.mockResolvedValue({ claude: null, codex: null });
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(getDefaultProvider('claude-3.5-sonnet')).rejects.toThrow(
        /No production provider available/
      );
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
    }
  });

  it('DREAMPIA_TEST still forces deterministic MockProvider', async () => {
    process.env.DREAMPIA_TEST = '1';
    const result = await getDefaultProvider('gpt-5.5');
    expect(result.source).toBe('mock');
    expect(result.provider).toBeInstanceOf(MockProvider);
    expect(mockDetect).not.toHaveBeenCalled();
  });

  it('both installed: claude model uses claude-cli, codex model uses codex-cli', async () => {
    mockDetect.mockResolvedValue({
      claude: { path: '/fake/claude', version: '1.0.0' },
      codex: { path: '/fake/codex', version: '0.5.0' },
    });
    const a = await getDefaultProvider('claude-3.5-sonnet');
    const b = await getDefaultProvider('gpt-4');
    expect(a.source).toBe('claude-cli');
    expect(b.source).toBe('codex-cli');
  });

  it('passes signal to CliProvider for abort propagation', async () => {
    mockDetect.mockResolvedValue({
      claude: { path: '/fake/claude', version: '1.0.0' },
      codex: null,
    });
    const ctrl = new AbortController();
    const result = await getDefaultProvider('claude-3.5-sonnet', ctrl.signal);
    expect(result.provider).toBeInstanceOf(CliProvider);
    // 내부 옵션은 private — 행동(abort propagation) 검증은 CliProvider 단위
    // 테스트가 담당. 여기서는 signal 받은 instance 가 만들어지는지만 확인.
  });

  it('returns full detection result for ChatHeader display', async () => {
    mockDetect.mockResolvedValue({
      claude: { path: '/p/claude', version: '1.2.3' },
      codex: { path: '/p/codex', version: '0.5.0' },
    });
    const result = await getDefaultProvider('claude-3.5-sonnet');
    expect(result.detected.claude).toEqual({ path: '/p/claude', version: '1.2.3' });
    expect(result.detected.codex).toEqual({ path: '/p/codex', version: '0.5.0' });
  });
});
