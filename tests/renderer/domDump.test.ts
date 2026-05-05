/**
 * domDump utility unit tests (v1.2.5).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { dumpElement } from '../../src/renderer/utils/domDump';

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
