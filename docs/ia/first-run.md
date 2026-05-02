---
title: IA — Workspace First Run
parent: ./_index.md
related:
  - onboarding.md
status: draft
last_updated: 2026-05-02
---

# Workspace First Run

> **한 줄 요약**: 새 workspace 진입 시 자동 분석 + 추천.

---

## 흐름

```
사용자: 새 workspace 선택 (또는 enter)
  ↓
1. 자동 분석
2. 인덱싱 (백그라운드)
3. 추천 prompts 생성
4. 빈 채팅 + Welcome
```

---

## 1. 자동 분석 (Background)

```typescript
async function analyzeWorkspace(path: string): Promise<WorkspaceAnalysis> {
  return {
    // Git
    is_git_repo: await fs.exists(path.join(path, '.git')),
    branch: await git.getCurrentBranch(),
    
    // Project type
    has_package_json: await fs.exists(path.join(path, 'package.json')),
    framework: await detectFramework(),    // react, vue, next, nuxt, ...
    language: await detectMainLanguage(),  // typescript, python, go, ...
    
    // Build / test
    has_test_setup: await checkTestSetup(),
    has_lint: await checkLintSetup(),
    
    // 크기
    file_count: await countFiles(),
    has_node_modules: await fs.exists(path.join(path, 'node_modules')),
    
    // 보안 검사
    has_env_file: await fs.exists(path.join(path, '.env')),
  };
}
```

---

## 2. 인덱싱 (Background)

```
시작:
  사이드바 하단: "🔍 인덱싱 중... (1247 파일)"
  
중간:
  진행 표시 (옵션)

완료:
  사이드바 하단: "✓ 인덱싱 완료 (1247 파일)"
  검색 가능 (Ctrl+P, Ctrl+Shift+F)
```

```typescript
async function indexWorkspace(workspace: Workspace) {
  const status = createIndexingStatus(workspace.id);
  
  status.update({ status: 'indexing', progress: 0 });
  
  // ripgrep 으로 파일 목록
  const files = await ripgrepFiles(workspace.root);
  
  // SQLite FTS5 에 인덱스
  await indexFiles(files, (current, total) => {
    status.update({ progress: current / total });
  });
  
  status.update({ status: 'ready', file_count: files.length });
}
```

---

## 3. 추천 prompts 생성

```typescript
function generateInitialPrompts(analysis: WorkspaceAnalysis): string[] {
  const prompts: string[] = [];
  
  // Git 기반
  if (analysis.is_git_repo) {
    prompts.push('최근 변경 사항 리뷰');
    prompts.push('이번 브랜치의 PR 작성 도와줘');
  }
  
  // Project type 기반
  if (analysis.framework === 'next') {
    prompts.push('Next.js 페이지 추가하기');
  } else if (analysis.framework === 'react') {
    prompts.push('React 컴포넌트 만들기');
  }
  
  // Test 기반
  if (analysis.has_test_setup) {
    prompts.push('테스트 통과시키기');
    prompts.push('새 기능에 테스트 추가');
  }
  
  // 일반
  prompts.push('이 프로젝트 구조 분석해줘');
  prompts.push('README 업데이트');
  
  // 활성 plugin 의 defaultPrompt
  for (const plugin of activePlugins) {
    prompts.push(...(plugin.manifest.interface.defaultPrompt ?? []));
  }
  
  return prompts.slice(0, 6);
}
```

---

## 4. Welcome 화면

```
┌──────────────────────────────────────────────┐
│                                              │
│              👋 환영합니다                    │
│                                              │
│   pyeongtaek-portal 작업 시작                │
│                                              │
│   📊 프로젝트 정보:                           │
│   • TypeScript / Next.js 13                  │
│   • Git: main branch                         │
│   • 1247 파일                                │
│   • Vitest 테스트 설정됨                      │
│                                              │
│   추천 prompts:                              │
│   • 이 프로젝트 구조 분석해줘                │
│   • 최근 변경 사항 리뷰                      │
│   • 테스트 통과시키기                        │
│   • Next.js 페이지 추가하기                  │
│                                              │
│   ┌────────────────────────────────────┐     │
│   │ 또는 직접 입력...                  │     │
│   └────────────────────────────────────┘     │
│                                              │
└──────────────────────────────────────────────┘
```

---

## 보안 검사 알림 (.env 발견 시)

```
⚠ 알림:
  .env 파일이 발견됐어요 (민감 정보 가능성).
  AI 가 읽지 않도록 설정할까요?
  
  [✓] .env 파일 자동 제외 (권장)
  [ ] .env 파일 읽기 허용 (조심)
  
  [확인]
```

→ 자동 .gitignore + .codexignore 추가.

---

## .codexignore 자동 생성

```
사용자 명시 거부 X 면 자동:

.env
.env.local
.env.production
*.pem
*.key
.ssh/
.aws/
.gcp/
node_modules/
.git/
dist/
build/
.next/
```

→ AI 가 default 로 안 봄. 사용자 명시 grant 필요.

---

## 임시 vs 영구 workspace

```
영구 workspace:
  - 사용자가 "workspace 추가" 명시
  - 사이드바 프로젝트 목록에 표시
  - 데이터 영구 (chats, indexing)

임시 workspace (옵션):
  - 사용자가 한 번 폴더 열기
  - 세션 종료 시 자동 정리
  - 인덱싱 X (가벼움)
```

---

## Multi-workspace

```
한 시점에 여러 workspace 활성:
  
사이드바:
  📁 pyeongtaek-portal     (현재)
  📁 my-app
  📁 client-project
  
탭 별 workspace 다를 수 있음 (옵션):
  채팅 1: pyeongtaek-portal
  채팅 2: my-app
```

---

## 관련

- [onboarding.md](./onboarding.md) — 첫 사용자 onboarding
- [../session/workspace.md](../session/workspace.md) — Workspace 데이터
- [empty-app-state.md](./empty-app-state.md)
