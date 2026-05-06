/**
 * domDump utility unit tests (v1.2.5).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  countDumpNodes,
  dumpElement,
  dumpToBlock,
  summarizeDump,
  type DomDumpNode,
} from '../../src/renderer/utils/domDump';
import { ContentBlockSchema } from '../../src/types/conversation';

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('v1.2.5 — domDump', () => {
  it('단일 element — tag + id + classes + attrs', () => {
    document.body.innerHTML =
      '<div id="root" class="a b" data-x="1" data-y="long-attr">hello</div>';
    const el = document.getElementById('root');
    if (el === null) throw new Error('not found');
    const dump = dumpElement(el);
    expect(dump.tag).toBe('div');
    expect(dump.id).toBe('root');
    expect(dump.classes).toEqual(['a', 'b']);
    expect(dump.attrs).toMatchObject({ 'data-x': '1', 'data-y': 'long-attr' });
    expect(dump.text).toBe('hello');
  });

  it('children 깊이 cap', () => {
    document.body.innerHTML = `
      <div id="d1">
        <div>
          <div>
            <div>deep</div>
          </div>
        </div>
      </div>
    `;
    const el = document.getElementById('d1');
    if (el === null) throw new Error('not found');
    const dump = dumpElement(el, { maxDepth: 1 });
    // depth 0 → root, depth 1 → first child. depth 2 (자식의 자식) 은 truncated.
    expect(dump.children?.length).toBe(1);
    expect(dump.children?.[0]?.truncated).toBe(true);
  });

  it('text 길이 cap', () => {
    document.body.innerHTML = '<p id="p">' + 'x'.repeat(500) + '</p>';
    const el = document.getElementById('p');
    if (el === null) throw new Error('not found');
    const dump = dumpElement(el, { maxText: 50 });
    if (typeof dump.text !== 'string') throw new Error('no text');
    expect(dump.text.length).toBeLessThanOrEqual(51); // 50 + ellipsis
    expect(dump.text.endsWith('…')).toBe(true);
  });

  it('자식 element 의 text 는 부모 text 에 포함 X', () => {
    document.body.innerHTML = '<div id="d2">parent <span>child</span> tail</div>';
    const el = document.getElementById('d2');
    if (el === null) throw new Error('not found');
    const dump = dumpElement(el);
    expect(dump.text).toBe('parent  tail');
    expect(dump.children?.[0]?.text).toBe('child');
  });

  it('id / class 가 attrs 에 중복 X', () => {
    document.body.innerHTML = '<div id="d3" class="x" data-y="1"></div>';
    const el = document.getElementById('d3');
    if (el === null) throw new Error('not found');
    const dump = dumpElement(el);
    expect(dump.attrs).toEqual({ 'data-y': '1' });
  });

  it('긴 attr 값은 100자에서 truncate', () => {
    const longVal = 'a'.repeat(150);
    const el = document.createElement('div');
    el.setAttribute('data-x', longVal);
    document.body.appendChild(el);
    const dump = dumpElement(el);
    if (dump.attrs?.['data-x'] === undefined) throw new Error('no attr');
    expect(dump.attrs['data-x'].length).toBe(101); // 100 + ellipsis
  });

  it('빈 element — children/attrs/text 미포함', () => {
    document.body.innerHTML = '<br id="b" />';
    const el = document.getElementById('b');
    if (el === null) throw new Error('not found');
    const dump = dumpElement(el);
    expect(dump.tag).toBe('br');
    expect(dump.children).toBeUndefined();
    expect(dump.text).toBeUndefined();
  });
});

describe('v1.6.2 — DomDumpBlock conversion', () => {
  it('countDumpNodes — single node = 1', () => {
    const node: DomDumpNode = { tag: 'div' };
    expect(countDumpNodes(node)).toBe(1);
  });

  it('countDumpNodes — nested children counted', () => {
    const node: DomDumpNode = {
      tag: 'div',
      children: [
        { tag: 'span' },
        { tag: 'p', children: [{ tag: 'b' }, { tag: 'i' }] },
      ],
    };
    // div + span + p + b + i = 5
    expect(countDumpNodes(node)).toBe(5);
  });

  it('summarizeDump — tag + id + classes + child counts', () => {
    const node: DomDumpNode = {
      tag: 'div',
      id: 'root',
      classes: ['a', 'b'],
      children: [{ tag: 'span' }, { tag: 'p' }],
    };
    expect(summarizeDump(node)).toBe('div#root.a.b > 2 children, 3 nodes');
  });

  it('summarizeDump — class overflow shows +N', () => {
    const node: DomDumpNode = {
      tag: 'div',
      classes: ['a', 'b', 'c', 'd', 'e'],
    };
    // .a.b+3
    expect(summarizeDump(node)).toContain('.a.b+3');
  });

  it('dumpToBlock — produces a valid dom_dump ContentBlock', () => {
    const node: DomDumpNode = {
      tag: 'div',
      id: 'root',
      children: [{ tag: 'span', text: 'hi' }],
    };
    const block = dumpToBlock(node, 'https://example.com/page');
    expect(block.type).toBe('dom_dump');
    expect(block.url).toBe('https://example.com/page');
    expect(block.node_count).toBe(2);
    expect(block.summary).toContain('div#root');
    expect(block.dump_json).toContain('"span"');
    expect(block.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Schema validation — 새 block 이 discriminated union 의 일원으로 인정되는지.
    const result = ContentBlockSchema.safeParse(block);
    expect(result.success).toBe(true);
  });

  it("dumpToBlock — selector option preserved", () => {
    const node: DomDumpNode = { tag: 'main' };
    const block = dumpToBlock(node, 'https://x', { selector: 'main#m' });
    expect(block.selector).toBe('main#m');
  });

  it("dumpToBlock — empty selector is omitted (not a stored '')", () => {
    const node: DomDumpNode = { tag: 'body' };
    const block = dumpToBlock(node, 'https://x', { selector: '' });
    expect(block.selector).toBeUndefined();
  });

  it('dumpToBlock — capturedAt option overrides default', () => {
    const node: DomDumpNode = { tag: 'div' };
    const block = dumpToBlock(node, 'u', { capturedAt: '2026-05-06T00:00:00Z' });
    expect(block.captured_at).toBe('2026-05-06T00:00:00Z');
  });

  it('dumpElement → dumpToBlock 라운드트립 — schema valid', () => {
    document.body.innerHTML =
      '<section id="s"><h1>제목</h1><p class="x y">본문</p></section>';
    const el = document.getElementById('s');
    if (el === null) throw new Error('not found');
    const dump = dumpElement(el);
    const block = dumpToBlock(dump, 'https://test.local/');
    const parsed = ContentBlockSchema.safeParse(block);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe('dom_dump');
    }
    expect(block.node_count).toBeGreaterThanOrEqual(3); // section, h1, p
  });
});
