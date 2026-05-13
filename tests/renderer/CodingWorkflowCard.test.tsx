import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  CodingWorkflowCard,
  extractCodingWorkflow,
} from '../../src/renderer/components/chat/CodingWorkflowCard';

const WORKFLOW_TEXT = [
  '## 작업 계획',
  '- README 설치 안내를 정리합니다.',
  '## 변경 후보',
  '- README.md',
  '## Diff / Review',
  '- 적용 전 diff 확인',
  '## 테스트 명령',
  '- npm run typecheck',
  '## 위험/권한',
  '- 문서 변경만 수행',
  '## 다음 행동',
  '- 파일에 적용 버튼을 누릅니다.',
  '```md',
  '# README heading ignored inside code fence',
  '```',
].join('\n');

describe('CodingWorkflowCard', () => {
  it('extracts Korean-first coding loop sections while ignoring fenced code', () => {
    const sections = extractCodingWorkflow(WORKFLOW_TEXT);

    expect(sections.map((section) => section.id)).toEqual([
      'plan',
      'files',
      'diff',
      'tests',
      'risk',
      'next',
    ]);
    expect(sections.find((section) => section.id === 'plan')?.content).toContain('README');
    expect(sections.some((section) => section.content.includes('README heading ignored'))).toBe(
      false
    );
  });

  it('renders a structured task-loop card when at least two sections exist', () => {
    render(<CodingWorkflowCard text={WORKFLOW_TEXT} />);

    expect(screen.getByTestId('coding-workflow-card')).toBeInTheDocument();
    expect(screen.getByTestId('coding-workflow-section-plan')).toHaveTextContent('README');
    expect(screen.getByTestId('coding-workflow-section-tests')).toHaveTextContent(
      'npm run typecheck'
    );
  });

  it('does not render for ordinary prose', () => {
    const { container } = render(<CodingWorkflowCard text="일반 응답입니다." />);

    expect(container).toBeEmptyDOMElement();
  });
});
