/**
 * LanguageSettings (v0.11.0 B2 English i18n) — Settings 모달 [언어] 탭.
 *
 * 검증:
 *  - 한국어 default 라벨 + 영어 옵션 모두 표시
 *  - 라디오 변경 → IPC setLanguage 호출 + module-level setLocale
 *  - 선택 후 즉시 새 locale 라벨이 반영됨 (re-render reactive)
 *  - IPC 응답 받을 때까지 loading 텍스트 표시 가능 (한 번 fetch 후 사라짐)
 *
 * Spec: ROADMAP.md (v0.11.0 B2)
 */

import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageSettings } from '../../src/renderer/components/settings/LanguageSettings';
import { __mockStore } from '../setup';
import { getLocale, setLocale } from '../../src/renderer/i18n';

describe('LanguageSettings (v0.11.0)', () => {
  it('renders Korean and English options with default ko selected', async () => {
    render(<LanguageSettings />);

    // 한국어 옵션은 즉시 보임 (한국어 default 라벨).
    await waitFor(() => {
      expect(screen.getByTestId('settings-language-ko')).toBeInTheDocument();
      expect(screen.getByTestId('settings-language-en')).toBeInTheDocument();
    });

    // ko radio 가 선택돼 있음.
    const koRadio = screen
      .getByTestId('settings-language-ko')
      .querySelector('input[type="radio"]') as HTMLInputElement;
    expect(koRadio.checked).toBe(true);
  });

  it('switching to English calls setLanguage IPC + setLocale', async () => {
    const user = userEvent.setup();
    render(<LanguageSettings />);

    // 초기 로딩 끝날 때까지 대기.
    await waitFor(() => {
      expect(screen.getByTestId('settings-language-en')).toBeInTheDocument();
    });

    const enRadio = screen
      .getByTestId('settings-language-en')
      .querySelector('input[type="radio"]') as HTMLInputElement;

    await user.click(enRadio);

    // 1) IPC persist 가 호출되어 mockStore 가 갱신됐어야 함.
    await waitFor(() => {
      expect(__mockStore.language).toBe('en');
    });
    // 2) module-level locale 도 갱신.
    expect(getLocale()).toBe('en');
  });

  it('after switching to English, panel re-renders with English labels', async () => {
    const user = userEvent.setup();
    render(<LanguageSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('settings-language-en')).toBeInTheDocument();
    });

    const enRadio = screen
      .getByTestId('settings-language-en')
      .querySelector('input[type="radio"]') as HTMLInputElement;

    await user.click(enRadio);

    // 패널 헤더가 영어로 바뀌어야 함 (settings.language.title → "Language").
    await waitFor(() => {
      expect(screen.getByText('Language')).toBeInTheDocument();
    });
  });

  it('initial value comes from IPC mockStore.language', async () => {
    __mockStore.language = 'en';
    render(<LanguageSettings />);

    await waitFor(() => {
      const enRadio = screen
        .getByTestId('settings-language-en')
        .querySelector('input[type="radio"]') as HTMLInputElement;
      expect(enRadio.checked).toBe(true);
    });
    // module locale 도 영어로 sync.
    await waitFor(() => {
      expect(getLocale()).toBe('en');
    });
  });

  it('switching back to Korean restores Korean labels', async () => {
    const user = userEvent.setup();
    setLocale('en');
    __mockStore.language = 'en';
    render(<LanguageSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('settings-language-ko')).toBeInTheDocument();
    });

    const koRadio = screen
      .getByTestId('settings-language-ko')
      .querySelector('input[type="radio"]') as HTMLInputElement;

    await user.click(koRadio);

    await waitFor(() => {
      expect(__mockStore.language).toBe('ko');
    });
    expect(getLocale()).toBe('ko');
  });

  it('panel has stable test id even after locale switch', async () => {
    const user = userEvent.setup();
    render(<LanguageSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('settings-language-panel')).toBeInTheDocument();
    });

    const enRadio = screen
      .getByTestId('settings-language-en')
      .querySelector('input[type="radio"]') as HTMLInputElement;

    await user.click(enRadio);

    // testid 는 라벨이 바뀌어도 유지.
    expect(screen.getByTestId('settings-language-panel')).toBeInTheDocument();
  });
});
