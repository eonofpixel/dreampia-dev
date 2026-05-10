/**
 * sample-fs-mcp — minimal MCP server entrypoint for e2e fixture (v2.3.0 US-204).
 *
 * Spec: e2e/fixtures/mcp/sample-fs-mcp/README.md
 *
 * 본 파일은 e2e Sigstore install path 의 fixture artifact 다. 실제 MCP 동작은
 * 검증하지 않고, install path 가 manifest verify + record put 을 올바르게
 * 수행하는지만 확인한다.
 */

/* global process */

'use strict';

// stdout 으로 MCP-shaped initialize 응답을 한 번 보내고 stdin 닫힐 때까지 idle.
// 실제 MCP server 가 아니므로 tools/list 등은 응답하지 않음 — install path 만 검증.
process.stdout.write(
  JSON.stringify({
    jsonrpc: '2.0',
    id: 0,
    result: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      serverInfo: { name: 'sample-fs-mcp', version: '1.0.0' },
    },
  }) + '\n'
);

process.stdin.on('end', () => {
  process.exit(0);
});
process.stdin.resume();
