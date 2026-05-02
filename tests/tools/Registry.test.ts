/**
 * ToolRegistry — register / get / has / list / unregister + invariants.
 *
 * Spec: docs/tools/_index.md (TO-3), docs/tools/interface.md (INV-1)
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../../src/tools/Registry';
import type { Tool } from '../../src/tools/types';
import type { Capability } from '../../src/permission';

// ────────────────────────────────────────────────────────────
// Helper: minimal tool factory
// ────────────────────────────────────────────────────────────

function makeTool(id: string): Tool<{ x: number }, { y: number }> {
  return {
    id,
    version: '1.0.0',
    source: 'builtin',
    input_schema: z.object({ x: z.number() }),
    output_schema: z.object({ y: z.number() }),
    required_capabilities: (): Capability[] => ['LOCAL_READ'],
    execute: async (input) => ({ y: input.x * 2 }),
    display: {
      name: 'Test Tool',
      summary: (i) => `x=${i.x}`,
      summary_result: (o) => `y=${o.y}`,
    },
  };
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe('ToolRegistry — basic register/get/has/list/unregister', () => {
  it('registers and retrieves a tool by id', () => {
    const reg = new ToolRegistry();
    const tool = makeTool('test.echo');
    reg.register(tool);
    expect(reg.get('test.echo')).toBe(tool);
    expect(reg.has('test.echo')).toBe(true);
  });

  it('list returns all registered tools', () => {
    const reg = new ToolRegistry();
    const t1 = makeTool('a.one');
    const t2 = makeTool('b.two');
    reg.register(t1);
    reg.register(t2);
    const all = reg.list();
    expect(all).toHaveLength(2);
    expect(all).toContain(t1);
    expect(all).toContain(t2);
  });

  it('unregister removes a tool', () => {
    const reg = new ToolRegistry();
    const tool = makeTool('test.remove');
    reg.register(tool);
    expect(reg.has('test.remove')).toBe(true);
    reg.unregister('test.remove');
    expect(reg.has('test.remove')).toBe(false);
    expect(reg.get('test.remove')).toBeUndefined();
  });

  it('unregister of non-existent id is no-op', () => {
    const reg = new ToolRegistry();
    expect(() => reg.unregister('nonexistent.id')).not.toThrow();
  });

  it('size reports current count', () => {
    const reg = new ToolRegistry();
    expect(reg.size).toBe(0);
    reg.register(makeTool('one.x'));
    expect(reg.size).toBe(1);
    reg.register(makeTool('two.x'));
    expect(reg.size).toBe(2);
    reg.unregister('one.x');
    expect(reg.size).toBe(1);
  });
});

describe('ToolRegistry — invariants', () => {
  it('throws on duplicate id', () => {
    const reg = new ToolRegistry();
    reg.register(makeTool('dup.id'));
    expect(() => reg.register(makeTool('dup.id'))).toThrow(/already registered/);
  });

  it('throws when id has no dot (INV-1: category.action format)', () => {
    const reg = new ToolRegistry();
    expect(() => reg.register(makeTool('nodot'))).toThrow(/must contain a dot/);
  });

  it('accepts ids with multiple dots', () => {
    const reg = new ToolRegistry();
    expect(() => reg.register(makeTool('a.b.c'))).not.toThrow();
    expect(reg.has('a.b.c')).toBe(true);
  });
});
