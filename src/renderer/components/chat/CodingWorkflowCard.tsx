import {
  ClipboardCheck,
  FileCode2,
  GitCompareArrows,
  ListChecks,
  PlayCircle,
  ShieldAlert,
  Route,
} from 'lucide-react';
import { useMemo } from 'react';

import { useT } from '../../i18n';

export type CodingWorkflowSectionId =
  | 'plan'
  | 'files'
  | 'diff'
  | 'tests'
  | 'result'
  | 'risk'
  | 'next';

export interface CodingWorkflowSection {
  id: CodingWorkflowSectionId;
  content: string;
}

const SECTION_ORDER: ReadonlyArray<CodingWorkflowSectionId> = [
  'plan',
  'files',
  'diff',
  'tests',
  'result',
  'risk',
  'next',
];

const SECTION_KEYWORDS: Record<CodingWorkflowSectionId, ReadonlyArray<string>> = {
  plan: ['작업 계획', '실행 계획', '계획', 'plan', 'implementation plan'],
  files: ['변경 후보', '변경 파일', '파일 후보', 'candidate files', 'changed files', 'files'],
  diff: ['diff', 'review', '리뷰', '변경 검토', 'diff / review'],
  tests: ['테스트 명령', '테스트', 'tests', 'test commands'],
  result: ['실행 결과', '테스트 결과', 'result', 'run result'],
  risk: ['위험', '권한', 'risk', 'safety', 'permission'],
  next: ['다음 행동', '다음 단계', 'next action', 'next steps'],
};

const SECTION_ICONS: Record<CodingWorkflowSectionId, React.ReactNode> = {
  plan: <ListChecks aria-hidden="true" className="h-3.5 w-3.5" />,
  files: <FileCode2 aria-hidden="true" className="h-3.5 w-3.5" />,
  diff: <GitCompareArrows aria-hidden="true" className="h-3.5 w-3.5" />,
  tests: <PlayCircle aria-hidden="true" className="h-3.5 w-3.5" />,
  result: <ClipboardCheck aria-hidden="true" className="h-3.5 w-3.5" />,
  risk: <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5" />,
  next: <Route aria-hidden="true" className="h-3.5 w-3.5" />,
};

function normalizeHeading(raw: string): string {
  return raw
    .replace(/^\s{0,3}#{1,6}\s*/, '')
    .replace(/[:：]\s*$/, '')
    .trim()
    .toLowerCase();
}

function matchSectionId(raw: string): CodingWorkflowSectionId | null {
  if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(raw)) return null;
  const heading = normalizeHeading(raw);
  if (heading.length === 0 || heading.length > 48) return null;
  for (const id of SECTION_ORDER) {
    if (SECTION_KEYWORDS[id].some((keyword) => heading === keyword || heading.includes(keyword))) {
      return id;
    }
  }
  return null;
}

function compactContent(lines: string[]): string {
  const withoutOuterBlank = lines.join('\n').trim();
  if (withoutOuterBlank.length <= 360) return withoutOuterBlank;
  return withoutOuterBlank.slice(0, 357).trimEnd() + '...';
}

export function extractCodingWorkflow(text: string): ReadonlyArray<CodingWorkflowSection> {
  const buckets = new Map<CodingWorkflowSectionId, string[]>();
  let currentId: CodingWorkflowSectionId | null = null;
  let inFence = false;

  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const sectionId = matchSectionId(line);
    if (sectionId !== null) {
      currentId = sectionId;
      if (!buckets.has(sectionId)) buckets.set(sectionId, []);
      continue;
    }

    if (currentId !== null) {
      buckets.get(currentId)?.push(line);
    }
  }

  return SECTION_ORDER.flatMap((id) => {
    const content = compactContent(buckets.get(id) ?? []);
    return content.length > 0 ? [{ id, content }] : [];
  });
}

export function CodingWorkflowCard({ text }: { text: string }): React.JSX.Element | null {
  const t = useT();
  const sections = useMemo(() => extractCodingWorkflow(text), [text]);

  if (sections.length < 2) return null;

  return (
    <section
      className="mb-sm rounded-lg border border-accent/30 bg-accent-soft/60 p-sm text-text-primary"
      aria-label={t('chat.workflow.aria_label')}
      data-testid="coding-workflow-card"
    >
      <div className="mb-xs">
        <p className="text-caption-uppercase uppercase text-accent">{t('chat.workflow.title')}</p>
        <p className="mt-xxs text-body-sm text-text-secondary">{t('chat.workflow.subtitle')}</p>
      </div>
      <div className="grid gap-xs md:grid-cols-2">
        {sections.map((section) => (
          <article
            key={section.id}
            className="min-w-0 rounded-md border border-hairline bg-surface-card p-xs"
            data-testid={`coding-workflow-section-${section.id}`}
          >
            <h3 className="flex items-center gap-xxs text-caption-uppercase uppercase text-text-tertiary">
              {SECTION_ICONS[section.id]}
              {t(`chat.workflow.section.${section.id}`)}
            </h3>
            <p className="mt-xxs whitespace-pre-wrap break-words text-body-sm text-text-primary">
              {section.content}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
