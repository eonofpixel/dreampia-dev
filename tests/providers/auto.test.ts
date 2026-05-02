/**
 * getDefaultProvider — model + 설치 상태에 따른 provider 선택 검증.
 *
 * detectCli 를 mock 으로 대체. 실제 spawn 호출은 발생하지 않음.
 *
 * Phase 3 audit (HIGH) — production fail-closed 는 NODE_ENV 가 아닌
 * `app.isPackaged` 로 결정. packaged Electron 은 NODE_ENV 가 비어있을 수
 * 있기 때문 (Codex 발견). 따라서 electron 모듈을 mock 하여 isPackaged 를
 * 테스트별로 토글한다.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.hoisted — vi.mock 안에서 testIsPackaged 를 lazy 하게 읽는다.
const electronRef = vi.hoisted(() => ({ isPackaged: false }));

vi.mock('electron', () => ({
  app: {
    get isPackaged(): boolean {
      return electronRef.isPackaged;
    },
  },
}));

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
  // 기본은 unpackaged (dev/test) — mock fallback 허용. 개별 test 가 필요시 toggle.
  electronRef.isPackaged = false;
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

  it('packaged build without a matching CLI fails closed instead of using MockProvider', async () => {
    mockDetect.mockResolvedValue({ claude: null, codex: null });
    electronRef.isPackaged = true;
    await expect(getDefaultProvider('claude-3.5-sonnet')).rejects.toThrow(
      /No production provider available/
    );
  });

  it('unpackaged build (dev/e2e) falls back to MockProvider when no CLI', async () => {
    mockDetect.mockResolvedValue({ claude: null, codex: null });
    electronRef.isPackaged = false;
    const result = await getDefaultProvider('claude-3.5-sonnet');
    expect(result.source).toBe('mock');
    expect(result.provider).toBeInstanceOf(MockProvider);
  });

  it('packaged build still allows mock when DREAMPIA_ALLOW_MOCK_PROVIDER=1 (preview debug)', async () => {
    mockDetect.mockResolvedValue({ claude: null, codex: null });
    electronRef.isPackaged = true;
    process.env.DREAMPIA_ALLOW_MOCK_PROVIDER = '1';
    const result = await getDefaultProvider('claude-3.5-sonnet');
    expect(result.source).toBe('mock');
    expect(result.provider).toBeInstanceOf(MockProvider);
  });

  it('NODE_ENV=production alone does NOT trigger fail-closed (packaged is the marker)', async () => {
    // Codex 발견의 핵심 회귀 검증: NODE_ENV 가 비어있거나 production 이라도
    // app.isPackaged=false 면 mock fallback 허용. 반대로 NODE_ENV=development
    // 이라도 isPackaged=true 면 fail-closed.
    mockDetect.mockResolvedValue({ claude: null, codex: null });
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    electronRef.isPackaged = false;
    try {
      const result = await getDefaultProvider('claude-3.5-sonnet');
      expect(result.source).toBe('mock');
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

  it('propagates permissionLevel into CliProvider opts', async () => {
    mockDetect.mockResolvedValue({
      claude: null,
      codex: { path: '/fake/codex', version: '0.5.0' },
    });
    // Codex 패밀리 모델 + permissionLevel 'read_only' → CliProvider 가 만들어진 뒤
    // buildArgs 호출 시 --sandbox read-only 가 들어와야 한다.
    const result = await getDefaultProvider('gpt-5.5', undefined, undefined, 'read_only');
    expect(result.source).toBe('codex-cli');
    expect(result.provider).toBeInstanceOf(CliProvider);
    // private field 접근은 금지 — 행동 검증은 CliProvider 단위 테스트에서.
    // 여기서는 instance 가 만들어졌고 source 가 codex-cli 인 것만 확인.
    // 추가 확인: stream() 호출 시 spawn 의 args 검증 — 단위 테스트가 이미 cover.
  });

  it('falls back to no permissionLevel arg without crashing', async () => {
    mockDetect.mockResolvedValue({
      claude: { path: '/fake/claude', version: '1.0.0' },
      codex: null,
    });
    const result = await getDefaultProvider('claude-3.5-sonnet');
    expect(result.source).toBe('claude-cli');
    expect(result.provider).toBeInstanceOf(CliProvider);
  });
});
