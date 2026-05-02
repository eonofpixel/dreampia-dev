/**
 * Provider 어댑터 registry — Provider enum → ProviderAdapter 인스턴스 팩토리.
 *
 * Spec: docs/session/cross-ai-sync.md (호출 라우팅)
 *
 * 매번 새 인스턴스 — 어댑터는 무상태(stateless) 이므로 cost 무시 가능.
 * 필요시 메모이즈 가능하나 현재는 단순함 우선.
 */

import type { Provider } from '@/types';
import { ClaudeAdapter } from './ClaudeAdapter';
import { CodexAdapter } from './CodexAdapter';
import type { ProviderAdapter } from './types';

/**
 * Provider 에 해당하는 어댑터 반환.
 *
 * Switch 는 exhaustive — 새 provider 추가 시 컴파일 에러로 강제 알림.
 */
export function getAdapter(provider: Provider): ProviderAdapter {
  switch (provider) {
    case 'claude':
      return new ClaudeAdapter();
    case 'codex':
      return new CodexAdapter();
  }
}
