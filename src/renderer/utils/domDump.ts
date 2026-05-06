/**
 * DOM dump utility — element 의 outline + meta 직렬화 (v1.2.5).
 *
 * Spec: docs/v1.x-roadmap.md (P2 v1.2.x PreviewPanel — Screenshot/DOM dump).
 *
 * 사용:
 *   const dump = dumpElement(el);
 *   // → { tag, id, classes, attrs, text, bounds, children: [...] }
 *
 * AI 가 페이지 구조를 이해하도록 단순화. 깊이 cap (default 3) — 너무 깊으면
 * "[...]" placeholder.
 */

export interface DomDumpNode {
  tag: string;
  id?: string;
  classes?: string[];
  attrs?: Record<string, string>;
  text?: string;
  bounds?: { x: number; y: number; w: number; h: number };
  children?: DomDumpNode[];
  truncated?: boolean;
}

export interface DumpOptions {
  /** 최대 depth (root = 0). default 3. */
  maxDepth?: number;
  /** 노드 1개의 텍스트 max 길이. default 200. */
  maxText?: number;
  /** bounds 포함 여부. default true. */
  includeBounds?: boolean;
}

/**
 * Element 를 DomDumpNode tree 로 직렬화.
 *
 * `Element` 가 아닌 입력 (Text node 등) → null.
 * Window/Document 미접근 환경 (vitest jsdom 환경 외) — caller 책임.
 */
export function dumpElement(
  el: Element,
  options: DumpOptions = {}
): DomDumpNode {
  const maxDepth = options.maxDepth ?? 3;
  const maxText = options.maxText ?? 200;
  const includeBounds = options.includeBounds ?? true;
  return dumpRec(el, 0, maxDepth, maxText, includeBounds);
}

function dumpRec(
  el: Element,
  depth: number,
  maxDepth: number,
  maxText: number,
  includeBounds: boolean
): DomDumpNode {
  const node: DomDumpNode = {
    tag: el.tagName.toLowerCase(),
  };
  if (el.id.length > 0) node.id = el.id;
  if (el.classList.length > 0) {
    node.classes = Array.from(el.classList);
  }
  // attrs (id/class 제외, 그 외 short list).
  const attrs: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) {
    if (a.name === 'id' || a.name === 'class') continue;
    if (a.name === 'style') continue; // style 은 dimensions 로 대체.
    if (a.value.length > 100) {
      attrs[a.name] = a.value.slice(0, 100) + '…';
    } else {
      attrs[a.name] = a.value;
    }
  }
  if (Object.keys(attrs).length > 0) node.attrs = attrs;
  // direct text only — 자식 element 의 text 제외.
  const directText = directTextOf(el).trim();
  if (directText.length > 0) {
    node.text = directText.length > maxText
      ? directText.slice(0, maxText) + '…'
      : directText;
  }
  // bounds.
  if (includeBounds && typeof el.getBoundingClientRect === 'function') {
    const r = el.getBoundingClientRect();
    node.bounds = {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  }
  // children (depth cap).
  if (depth < maxDepth) {
    const children: DomDumpNode[] = [];
    for (const child of Array.from(el.children)) {
      children.push(dumpRec(child, depth + 1, maxDepth, maxText, includeBounds));
    }
    if (children.length > 0) node.children = children;
  } else if (el.children.length > 0) {
    node.truncated = true;
  }
  return node;
}

function directTextOf(el: Element): string {
  let text = '';
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3 /* TEXT_NODE */) {
      text += child.nodeValue ?? '';
    }
  }
  return text;
}

// ────────────────────────────────────────────────────────────
// v1.6.2 — DomDumpNode → DomDumpBlock (typed conversation block) 변환
// ────────────────────────────────────────────────────────────

/**
 * Tree 안 element 노드 총 수. truncated 표시는 카운트 X (실제 dump 안 된 노드).
 */
export function countDumpNodes(node: DomDumpNode): number {
  let n = 1;
  if (node.children !== undefined) {
    for (const c of node.children) n += countDumpNodes(c);
  }
  return n;
}

/**
 * Chip footer 한 줄 요약 — `tag#id.class > N children, M nodes`.
 * id / class 가 없으면 생략. children 수는 직접 자식, nodes 수는 전체 tree.
 */
export function summarizeDump(node: DomDumpNode): string {
  let head = node.tag;
  if (node.id !== undefined && node.id.length > 0) head += `#${node.id}`;
  if (node.classes !== undefined && node.classes.length > 0) {
    head += `.${node.classes.slice(0, 2).join('.')}`;
    if (node.classes.length > 2) head += `+${node.classes.length - 2}`;
  }
  const childCount = node.children?.length ?? 0;
  const total = countDumpNodes(node);
  return `${head} > ${childCount} children, ${total} nodes`;
}

/**
 * Convert a DomDumpNode tree (renderer-side capture) to a `DomDumpBlock` ready
 * to prepend into a chat turn's content blocks. `url` 은 callers 가 결정 (webview
 * 의 src / location.href 등).
 */
export function dumpToBlock(
  node: DomDumpNode,
  url: string,
  options: { selector?: string; capturedAt?: string } = {}
): {
  type: 'dom_dump';
  url: string;
  selector?: string;
  dump_json: string;
  summary: string;
  node_count: number;
  captured_at: string;
} {
  const summary = summarizeDump(node);
  const node_count = countDumpNodes(node);
  const captured_at = options.capturedAt ?? new Date().toISOString();
  const block: {
    type: 'dom_dump';
    url: string;
    selector?: string;
    dump_json: string;
    summary: string;
    node_count: number;
    captured_at: string;
  } = {
    type: 'dom_dump',
    url,
    dump_json: JSON.stringify(node),
    summary,
    node_count,
    captured_at,
  };
  if (options.selector !== undefined && options.selector.length > 0) {
    block.selector = options.selector;
  }
  return block;
}
