/**
 * AboutPanel (v1.0.0) — Settings 모달 [정보] 탭.
 *
 * 검증:
 *  - 정상 렌더 → 환경/배포/정체성 3 섹션 모두 표시
 *  - 앱 이름 + 버전 + 라이선스 표시
 *  - GitHub repo link 가 외부 주소 (target=_blank rel=noopener)
 *  - 코드 서명 status default = 'unsigned'
 *  - 자동 업데이트 status = 'enabled'
 *  - 한국어 → 영어 i18n 토글 시 라벨 변경
 *  - panel testid 안정성 (loading 중에도 / 에러시에도)
 *  - 빌드 일자 항목 존재
 */

import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AboutPanel } from '../../src/renderer/components/settings/AboutPanel';
import { setLocale } from '../../src/renderer/i18n';

describe('AboutPanel (v1.0.0)', () => {
  it('renders identity, distribution, and environment sections', async () => {
    render(<AboutPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-about-data')).toBeInTheDocument();
    });
    // App identity 섹션 핵심 필드.
    expect(screen.getByTestId('settings-about-app_name')).toBeInTheDocument();
    expect(screen.getByTestId('settings-about-version')).toBeInTheDocument();
    expect(screen.getByTestId('settings-about-license')).toBeInTheDocument();
    expect(screen.getByTestId('settings-about-repository')).toBeInTheDocument();
    // Distribution 섹션 핵심 필드.
    expect(screen.getByTestId('settings-about-signing')).toBeInTheDocument();
    expect(screen.getByTestId('settings-about-auto_update')).toBeInTheDocument();
    expect(screen.getByTestId('settings-about-build_date')).toBeInTheDocument();
    // Environment 섹션 핵심 필드.
    expect(screen.getByTestId('settings-about-platform')).toBeInTheDocument();
    expect(screen.getByTestId('settings-about-node_version')).toBeInTheDocument();
    expect(screen.getByTestId('settings-about-electron_version')).toBeInTheDocument();
  });

  it('shows app name and version', async () => {
    render(<AboutPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-about-data')).toBeInTheDocument();
    });
    expect(screen.getByTestId('settings-about-app_name')).toHaveTextContent('Dreampia-Dev');
    // mock app_version is '0.14.0-test' from tests/setup.ts diagnose mock.
    expect(screen.getByTestId('settings-about-version').textContent).not.toBe('');
  });

  it('renders Apache 2.0 license link', async () => {
    render(<AboutPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-about-license')).toBeInTheDocument();
    });
    const licenseCell = screen.getByTestId('settings-about-license');
    expect(licenseCell).toHaveTextContent('Apache 2.0');
    const anchor = licenseCell.querySelector('a');
    expect(anchor).not.toBeNull();
    // License URL points at OSI canonical Apache 2.0 page.
    expect(anchor?.getAttribute('href')).toContain('Apache-2.0');
    expect(anchor?.getAttribute('target')).toBe('_blank');
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders GitHub repository link with safe rel', async () => {
    render(<AboutPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-about-repository')).toBeInTheDocument();
    });
    const repoCell = screen.getByTestId('settings-about-repository');
    const anchor = repoCell.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toContain('github.com/eonofpixel/dreampia-dev');
    expect(anchor?.getAttribute('target')).toBe('_blank');
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('shows signing status as unsigned with hint', async () => {
    render(<AboutPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-about-signing')).toBeInTheDocument();
    });
    // ko default — '서명 안 됨'.
    expect(screen.getByTestId('settings-about-signing')).toHaveTextContent('서명 안 됨');
    expect(screen.getByTestId('settings-about-signing-hint')).toBeInTheDocument();
  });

  it('shows auto-update enabled', async () => {
    render(<AboutPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-about-auto_update')).toBeInTheDocument();
    });
    expect(screen.getByTestId('settings-about-auto_update')).toHaveTextContent('활성화됨');
    expect(screen.getByTestId('settings-about-auto_update-hint')).toBeInTheDocument();
  });

  it('switches labels to English when locale=en', async () => {
    setLocale('en');
    render(<AboutPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-about-data')).toBeInTheDocument();
    });
    expect(screen.getByTestId('settings-about-signing')).toHaveTextContent('Unsigned');
    expect(screen.getByTestId('settings-about-auto_update')).toHaveTextContent('Enabled');
  });

  it('panel has stable test id', async () => {
    render(<AboutPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-about-panel')).toBeInTheDocument();
    });
  });

  it('build date is formatted as YYYY-MM-DD', async () => {
    render(<AboutPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-about-build_date')).toBeInTheDocument();
    });
    const text = screen.getByTestId('settings-about-build_date').textContent ?? '';
    // YYYY-MM-DD pattern.
    expect(text).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
