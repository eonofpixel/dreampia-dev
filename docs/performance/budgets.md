---
title: Performance — Budgets
parent: ./_index.md
related:
  - targets.md
status: draft
last_updated: 2026-05-02
---

# Performance Budgets

> **한 줄 요약**: CI 에서 자동 검증. Regression 시 PR block.

---

## Bundle Budget

```yaml
# performance-budget.yml
budgets:
  # JS
  - resource: 'main.js'
    type: 'maxSize'
    value: '300KB'
    
  - resource: '*.js'
    type: 'maxSize'
    value: '200KB'    # any chunk
  
  # CSS
  - resource: 'main.css'
    type: 'maxSize'
    value: '50KB'
  
  # Total
  - resource: '*'
    type: 'maxSize'
    value: '5MB'
```

---

## Time Budget

```yaml
budgets:
  # Startup
  - metric: 'TTI'
    value: 1500    # ms
  
  - metric: 'FCP'
    value: 500
  
  - metric: 'LCP'
    value: 1500
  
  # Interaction
  - metric: 'INP'
    value: 100
  
  # Custom
  - metric: 'chat-switch'
    value: 200
  
  - metric: 'ai-ttft'
    value: 1000
```

---

## Memory Budget

```yaml
budgets:
  - metric: 'heap-startup'
    value: 150    # MB
  
  - metric: 'heap-active'
    value: 500
  
  - metric: 'heap-leak-100-iterations'
    value: 10     # 10MB 이상 증가 X
```

---

## CI 적용

```yaml
# .github/workflows/perf.yml
jobs:
  perf:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Bundle size check
        run: |
          npm run check:bundle-size
      
      - name: Lighthouse CI
        run: |
          npx lhci autorun \
            --collect.numberOfRuns=3 \
            --assert.preset=lighthouse:recommended \
            --assert.assertions.categories:performance.minScore=0.9
      
      - name: Memory leak test
        run: |
          npm run test:memory
      
      - name: Custom perf tests
        run: |
          npm run test:perf
```

---

## Regression Detection

```typescript
// scripts/check-perf-regression.ts
async function check() {
  const baseline = JSON.parse(fs.readFileSync('perf-baseline.json'));
  const current = await measureCurrent();
  
  const issues = [];
  
  for (const [metric, target] of Object.entries(BUDGETS)) {
    const baseValue = baseline[metric];
    const currValue = current[metric];
    
    // 5% 이상 회귀 시 fail
    if (currValue > baseValue * 1.05) {
      issues.push(`${metric}: ${baseValue} → ${currValue} (+${((currValue/baseValue-1)*100).toFixed(1)}%)`);
    }
  }
  
  if (issues.length > 0) {
    console.error('Performance regression:', issues);
    process.exit(1);
  }
}
```

---

## 시각화

```
GitHub PR 에 자동 코멘트:

┌──────────────────────────────────────────┐
│ 📊 Performance Report                    │
├──────────────────────────────────────────┤
│ Bundle:                                   │
│   main.js:   245KB → 248KB (+1.2%) ✓     │
│   total:     1.2MB → 1.3MB  (+8.3%) ⚠   │
│                                          │
│ Lighthouse:                              │
│   Performance: 95 → 92 (-3) ⚠           │
│   FCP:        420ms → 450ms ✓            │
│                                          │
│ ⚠ Total bundle 8.3% 증가                 │
└──────────────────────────────────────────┘
```

---

## 관련

- [targets.md](./targets.md)
- [profiling.md](./profiling.md)
