/**
 * drive_mcp_manifest_reject — MCP plugin manifest 거부 시나리오 (v2.1.0 C5 stub).
 *
 * Spec: docs/v2.x-roadmap.md (Phase C C5 — e2e regression sweep).
 * Status: STUB — 시나리오 정의 + skip annotation. 실제 implementation 은
 * v2.1.x 후속 슬롯.
 *
 * 목적
 * ────────────
 * MCP server / Plugin 의 manifest 가 invalid (schema 위반, capability 미정의,
 * version mismatch, signature invalid 등) 시 사용자에게 명확한 거부 메시지
 * 표시 + 그 manifest 가 절대 로드 안 되는지 (fail-closed) 회귀 lock.
 *
 * 시나리오 (구현 시 활성):
 *   - DMR-1: MCP server manifest 의 required field 누락 → 사용자 toast +
 *            mcpManager.list() 에 안 보임
 *   - DMR-2: Plugin manifest 의 capability 가 ALL_CAPABILITIES 외 → 거부
 *   - DMR-3: Plugin signature invalid (v2.0.0+ B5 옵션) → 거부
 *   - DMR-4: 거부된 manifest 가 settings UI 의 plugin 리스트에 안 나타남
 *   - DMR-5: 같은 manifest 를 두 번 install 시도 → 두 번째도 동일하게 거부
 *
 * 인프라 요구사항:
 *   - tests/fixtures/mcp/invalid-X.json 시나리오 fixture
 *   - tests/fixtures/plugins/invalid-X/ malformed manifest dir
 *   - PluginManager / McpManager 의 audit emit 검증 (audit_log 'rejected' event)
 */

import { test } from './fixtures';

test.describe.skip('drive_mcp_manifest_reject — MCP / Plugin manifest 거부 시나리오 (v2.1.0 C5 stub)', () => {
  test('DMR-1 — MCP server manifest required field 누락 → 거부 + 사용자 toast', async () => {
    // TODO (v2.1.x): malformed mcp manifest fixture + UI assertion
  });

  test('DMR-2 — Plugin manifest capability 미정의 → 거부', async () => {
    // TODO: malformed plugin manifest + PluginManager.scan 결과 검증
  });

  test('DMR-3 — Plugin signature invalid (v2.0.0+ B5) → 거부', async () => {
    // TODO: B5 signed manifest 검증 옵션 land 후 활성
  });

  test('DMR-4 — 거부된 manifest 가 settings UI 에 안 나타남', async () => {
    // TODO: PluginsModal / McpSettings 의 list 검증
  });

  test('DMR-5 — 동일 invalid manifest 두 번째 install 도 거부', async () => {
    // TODO: idempotent rejection 검증
  });
});
