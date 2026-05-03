/**
 * ToolRegistry — Tool 등록 / 조회 / 목록 관리.
 *
 * Spec: docs/tools/_index.md (TO-3), docs/tools/interface.md (INV-1)
 *
 * INV-1: Tool.id 는 'category.action' 형식 (반드시 dot 포함).
 * 중복 id 등록 시 throw — 실수 방지.
 *
 * Phase 1 P0:
 *  - 단순 Map 기반 storage
 *  - 충돌 해결 (TO-15) 없음
 *  - source 별 priority 등 미구현
 */

import type { Tool, ToolId } from './types';

export class ToolRegistry {
  private readonly tools = new Map<ToolId, Tool>();

  /**
   * Tool 등록.
   * @throws id 가 'category.action' 형식 아니거나 이미 등록된 경우.
   */
  register(tool: Tool): void {
    if (!tool.id.includes('.')) {
      throw new Error(`Tool id must contain a dot (category.action): got '${tool.id}'`);
    }
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool already registered: ${tool.id}`);
    }
    this.tools.set(tool.id, tool);
  }

  /** 등록 해제. 미등록이면 no-op. */
  unregister(id: ToolId): void {
    this.tools.delete(id);
  }

  /** id 로 조회. 없으면 undefined. */
  get(id: ToolId): Tool | undefined {
    return this.tools.get(id);
  }

  /** 등록 여부 검사. */
  has(id: ToolId): boolean {
    return this.tools.has(id);
  }

  /** 모든 등록된 tool 배열 반환 (순서: 등록 순). */
  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  /** 등록된 tool 개수. */
  get size(): number {
    return this.tools.size;
  }
}
