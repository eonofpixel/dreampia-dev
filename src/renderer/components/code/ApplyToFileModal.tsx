/**
 * ApplyToFileModal — chat 의 코드 블록을 현재 열린 파일에 적용하기 전 확인.
 *
 * v2.8.x (Builder UX, C 후속) — 사용자가 chat 의 "파일에 적용" 버튼 클릭
 * 시 App.tsx 가 본 모달을 mount. 사용자에게 대상 path + 줄 수 차이 + 새
 * 코드 read-only preview 를 보여주고 Accept 선택 시 부모가 workspace.writeFile.
 *
 * 디자인 결정:
 *   - 전체 inline diff (`@codemirror/merge`) 는 v0 에선 미포함 — modal 안에
 *     embedded 하면 jsdom test 가 매우 무거워지고 layout 도 200% 폭 필요.
 *     줄 수 delta + read-only preview 만 표시 — 사용자 panic-undo 시그널만
 *     명확하게. inline accept/reject 는 별도 PR (#C 의 3차)
 *   - cancel = 새 코드 폐기. accept = workspace.writeFile (atomic + expected_mtime)
 *   - Esc / overlay click 으로 cancel — 사용자가 실수로 적용하는 path 차단
 *
 * v2.10.0 (DESIGN.md v1.0) — Chrome 을 `ModalShell` + `Button` primitive 로
 * 마이그레이션. data-testid + 동작 (Esc / overlay click + saving disable)
 * 모두 보존.
 *
 * Refs: BUILDER_UX_ANALYSIS.md #C — Apply-to-file follow-up.
 *       .omc/DESIGN.md §Components.ModalShell.
 */

import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useT } from '../../i18n';
import { Button } from '../ui/Button';
import { ModalShell } from '../ui/ModalShell';

import { DiffViewer } from './DiffViewer';

export interface ApplyToFileModalProps {
  /** undefined / null 이면 모달 미노출 (App.tsx 의 state 가 null 일 때). */
  target: {
    path: string;
    mtime?: string;
    diskContent: string;
    newCode: string;
    language?: string;
  } | null;
  /**
   * v2.9.0 (C 4차) — final 인자는 사용자가 hunk reject 한 결과 반영된 최종
   * merged 코드. 사용자가 토글 안 했으면 target.newCode 와 동일.
   */
  onAccept: (final: string) => void;
  onCancel: () => void;
  /** Accept 진행 중 (writeFile in-flight) — 버튼 disable + 라벨 갱신. */
  saving?: boolean;
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  // CodeMirror 의 line model 과 동일 — 마지막 \n 다음 빈 라인을 count 하지
  // 않도록 trailing \n 1개만 strip.
  const stripped = text.endsWith('\n') ? text.slice(0, -1) : text;
  return stripped.split('\n').length;
}

export function ApplyToFileModal({
  target,
  onAccept,
  onCancel,
  saving = false,
}: ApplyToFileModalProps): React.JSX.Element | null {
  const t = useT();

  // v2.9.0 (C 4차) — 사용자가 hunk reject 한 결과 추적. 초기값 = target.newCode.
  // DiffViewer 의 onChange 가 view 의 doc 갱신마다 호출 → 항상 최신 merged
  // code 를 보유. Accept 시 이 값을 그대로 workspace.writeFile.
  const [mergedCode, setMergedCode] = useState<string>(target?.newCode ?? '');

  // target 변경 (사용자가 다른 코드 블록을 또 적용하려고 함) 시 reset.
  useEffect(() => {
    if (target !== null) setMergedCode(target.newCode);
  }, [target]);

  if (target === null) return null;

  const before = countLines(target.diskContent);
  const after = countLines(mergedCode);

  return (
    <ModalShell
      open={true}
      size="lg"
      title={t('code.apply.modal.title')}
      titleId="apply-to-file-title"
      onClose={onCancel}
      disableEscape={saving}
      disableOverlayClose={saving}
      hideCloseButton={true}
      data-testid="apply-to-file-modal"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={saving}
            leadingIcon={<X aria-hidden="true" className="h-3 w-3" />}
            data-testid="apply-to-file-cancel"
          >
            {t('code.apply.modal.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => onAccept(mergedCode)}
            disabled={saving}
            leadingIcon={<Check aria-hidden="true" className="h-3 w-3" />}
            data-testid="apply-to-file-accept"
          >
            {t('code.apply.modal.accept')}
          </Button>
        </>
      }
    >
      <div className="space-y-sm text-body-sm">
        <p className="text-text-secondary">{t('code.apply.modal.body')}</p>
        <div className="flex items-center gap-xs">
          <span className="text-text-tertiary">{t('code.apply.modal.target')}:</span>
          <span
            className="truncate font-mono text-text-primary"
            data-testid="apply-to-file-path"
            title={target.path}
          >
            {target.path}
          </span>
        </div>
        <div className="flex items-center gap-xs">
          <span className="text-text-tertiary">{t('code.apply.modal.diff_label')}:</span>
          <span data-testid="apply-to-file-lines-delta">
            {t('code.apply.modal.lines_delta', { before: String(before), after: String(after) })}
          </span>
        </div>
        <div
          className="h-[40vh] overflow-hidden rounded-md border border-hairline"
          aria-label={t('code.apply.modal.preview_aria')}
          data-testid="apply-to-file-preview"
        >
          {/* v2.9.0 (C 4차) — inline unified diff with hunk-level controls.
              disk = original, mergedCode = modified (사용자 reject 반영).
              mergeControls=true → 각 hunk 옆 accept/reject 버튼. onChange
              마다 setMergedCode 로 최신 merged 추적. language 는 syntax
              highlight 용도라 임의 prefix 'preview.<lang>' 으로 detect. */}
          <DiffViewer
            original={target.diskContent}
            modified={mergedCode}
            mergeControls={true}
            onChange={setMergedCode}
            {...(target.language !== undefined && { relPath: 'preview.' + target.language })}
          />
        </div>
      </div>
    </ModalShell>
  );
}
