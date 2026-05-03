/**
 * MCP module — public surface.
 *
 * Spec: docs/tools/mcp-bridge.md (Issue #5)
 */

export { McpClient, type McpClientOptions, type SpawnFn } from './McpClient';
export {
  McpManager,
  type McpManagerOptions,
  type McpManagerSettingsAdapter,
} from './McpManager';
export { createSettingsAdapter } from './settingsAdapter';
