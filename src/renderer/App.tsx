/**
 * App.tsx — Main React component
 *
 * Day 1 (얇게): "Hello World" + 기본 layout 윤곽.
 * Day 2+: SS-1 TypeScript types 적용 시작.
 */

export function App(): React.JSX.Element {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-bg-primary text-text-primary">
      <div className="text-6xl">👋</div>

      <h1 className="mt-4 text-3xl font-bold">Dreampia-Dev</h1>

      <p className="mt-2 text-text-secondary">
        Claude Code + Codex 통합 GUI · 오픈소스 · 한국어 우선
      </p>

      <p className="mt-6 text-sm text-text-tertiary">
        Day 1: scaffold 작동 중 ✓
      </p>

      <div className="mt-8 flex flex-col gap-2 text-sm text-text-tertiary">
        <span>다음:</span>
        <ul className="list-inside list-disc">
          <li>Day 2-3: TypeScript types (SS-1)</li>
          <li>Day 4-5: Contract tests</li>
          <li>Day 6: 3-패널 layout</li>
          <li>Day 7: 추적표</li>
        </ul>
      </div>
    </div>
  );
}
