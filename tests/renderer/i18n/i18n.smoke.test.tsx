/**
 * Smoke test — v0.11.0 (B2) i18n 적용 확인.
 *
 * 영문화 범위 (chat / search / sidebar) 가 정상 적용됐는지 핵심 컴포넌트 별로
 * 한 번씩 확인. 한국어 default → 'en' 변경 후 동일 컴포넌트가 영문 표시되는지
 * 비교한다.
 *
 * Spec: ROADMAP.md (v0.11.0 B2 English i18n)
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '../../../src/renderer/components/sidebar/Sidebar';
import { ChatInput } from '../../../src/renderer/components/chat/ChatInput';
import { setLocale } from '../../../src/renderer/i18n';

describe('i18n smoke (v0.11.0 B2)', () => {
  describe('Sidebar', () => {
    it('renders Korean labels when locale=ko (default)', () => {
      render(
        <Sidebar
          sessions={[]}
          onSelectSession={() => {}}
          onNewChat={() => {}}
        />
      );
      expect(screen.getByText('새 채팅')).toBeInTheDocument();
      expect(screen.getByLabelText('설정 (Ctrl+,)')).toBeInTheDocument();
      expect(screen.getByText('채팅')).toBeInTheDocument();
    });

    it('renders English labels when locale=en', () => {
      setLocale('en');
      render(
        <Sidebar
          sessions={[]}
          onSelectSession={() => {}}
          onNewChat={() => {}}
        />
      );
      expect(screen.getByText('New chat')).toBeInTheDocument();
      expect(screen.getByLabelText('Settings (Ctrl+,)')).toBeInTheDocument();
      expect(screen.getByText('Chats')).toBeInTheDocument();
    });

    it('search placeholder follows locale', () => {
      setLocale('en');
      render(
        <Sidebar
          sessions={[]}
          onSelectSession={() => {}}
          onNewChat={() => {}}
        />
      );
      expect(screen.getByPlaceholderText('Search messages…')).toBeInTheDocument();
    });
  });

  describe('ChatInput', () => {
    it('uses Korean placeholder by default', () => {
      render(<ChatInput onSubmit={() => {}} />);
      expect(screen.getByPlaceholderText('메시지를 입력하세요')).toBeInTheDocument();
    });

    it('uses English placeholder when locale=en', () => {
      setLocale('en');
      render(<ChatInput onSubmit={() => {}} />);
      expect(screen.getByPlaceholderText('Type a message')).toBeInTheDocument();
    });

    it('explicit placeholder prop wins over locale default', () => {
      setLocale('en');
      render(<ChatInput onSubmit={() => {}} placeholder="Custom" />);
      expect(screen.getByPlaceholderText('Custom')).toBeInTheDocument();
    });

    it('Send button label flips between locales', () => {
      const { rerender } = render(<ChatInput onSubmit={() => {}} />);
      // ko: "전송"
      expect(screen.getAllByText('전송').length).toBeGreaterThan(0);

      setLocale('en');
      rerender(<ChatInput onSubmit={() => {}} />);
      // en: "Send"
      expect(screen.getAllByText('Send').length).toBeGreaterThan(0);
    });
  });
});
