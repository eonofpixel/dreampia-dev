/**
 * settingsAdapter — McpManager 가 settings.json 을 read/write 하기 위한 어댑터.
 *
 * 분리 이유:
 *  - McpManager 자체는 settings 모듈에 직접 의존하지 않게 (테스트가 in-memory
 *    객체로 대체할 수 있도록).
 *  - main/settings.ts 는 electron 의 app.getPath 을 사용하므로 main 에서만
 *    import 가능. McpManager 도 main 한정이라 의존성은 자연스럽지만, 인터페이스
 *    분리로 단위 테스트 친화적.
 */

import type { McpServerConfig } from '@/types';
import { readSettings, writeSettings } from '../settings';
import type { McpManagerSettingsAdapter } from './McpManager';

export function createSettingsAdapter(): McpManagerSettingsAdapter {
  return {
    read: (): McpServerConfig[] => {
      const settings = readSettings();
      return settings.mcp_servers ?? [];
    },
    write: (configs: McpServerConfig[]): void => {
      writeSettings({ mcp_servers: configs });
    },
  };
}
