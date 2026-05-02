---
title: Tool Orchestration — Plugin & Skill Loader
parent: ./_index.md
related:
  - ./categories.md
  - ./registry.md
status: draft
last_updated: 2026-05-02
---

# Plugin & Skill Loader

> **한 줄 요약**: Codex `.codex-plugin/plugin.json` + `SKILL.md` 호환 로더.

---

## Plugin 로드 흐름

```typescript
class PluginLoader {
  async load(pluginPath: AbsolutePath): Promise<Plugin> {
    // 1. plugin.json 읽기
    const manifest = await this.readManifest(pluginPath);
    this.validateManifest(manifest);
    
    // 2. Skills 디스커버리
    if (manifest.skills) {
      const skillsDir = path.join(pluginPath, manifest.skills);
      const skills = await this.discoverSkills(skillsDir);
      
      for (const skill of skills) {
        const tool = this.createSkillTool(manifest, skill);
        registry.register(tool);
      }
    }
    
    // 3. 의존성 체크
    if (manifest.dependencies) {
      // node_modules / plugins / 등 검증
    }
    
    // 4. Plugin 객체 반환
    return { manifest, path: pluginPath, skills };
  }
}
```

---

## plugin.json 검증

Codex 와 동일 schema 사용:

```typescript
const PluginManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    url: z.string().url().optional(),
  }),
  homepage: z.string().url().optional(),
  repository: z.string().optional(),
  license: z.string(),
  keywords: z.array(z.string()).optional(),
  skills: z.string().optional(),                     // ./skills/
  
  interface: z.object({
    displayName: z.string(),
    shortDescription: z.string(),
    longDescription: z.string().optional(),
    developerName: z.string(),
    category: z.string(),                            // "Engineering"
    capabilities: z.array(z.enum(['Read', 'Write', 'Interactive'])),
    websiteURL: z.string().url().optional(),
    privacyPolicyURL: z.string().url().optional(),
    termsOfServiceURL: z.string().url().optional(),
    defaultPrompt: z.array(z.string()).optional(),
    brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    composerIcon: z.string().optional(),             // ./assets/icon.png
    logo: z.string().optional(),
    screenshots: z.array(z.string()).optional(),
  }),
});
```

---

## Skills Discovery

```
plugin/
├── .codex-plugin/
│   └── plugin.json
├── skills/                          ← skills 폴더
│   ├── browser/                     ← 각 skill = 하위 폴더
│   │   ├── SKILL.md                 ← 메인 spec
│   │   ├── agents/
│   │   │   └── openai.yaml          ← 부가 메타
│   │   └── helpers.mjs
│   └── another-skill/
│       └── SKILL.md
├── scripts/
└── assets/
```

```typescript
async function discoverSkills(skillsDir: string): Promise<Skill[]> {
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const skills: Skill[] = [];
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const skillDir = path.join(skillsDir, entry.name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    
    if (await exists(skillMdPath)) {
      const skill = await parseSkillMd(skillMdPath);
      skills.push({ ...skill, path: skillDir });
    }
  }
  
  return skills;
}
```

---

## SKILL.md 파싱

```typescript
async function parseSkillMd(path: string): Promise<Skill> {
  const content = await fs.readFile(path, 'utf-8');
  
  // YAML frontmatter 분리
  const match = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`Invalid SKILL.md: missing frontmatter`);
  }
  
  const [, yamlPart, bodyPart] = match;
  const meta = yaml.parse(yamlPart);
  
  // 필수 필드 검증
  if (!meta.name || !meta.description) {
    throw new Error(`SKILL.md missing required fields (name, description)`);
  }
  
  return {
    name: meta.name,
    description: meta.description,
    full_md: content,                  // 전체 (AI 에 전달)
    body: bodyPart,                    // 본문만
    tools_referenced: extractToolReferences(bodyPart),
  };
}
```

---

## SkillTool 생성

```typescript
class SkillTool implements Tool {
  source = 'skill' as const;
  
  constructor(
    private plugin: Plugin,
    private skill: Skill
  ) {
    this.id = `skill.${plugin.manifest.name}.${skill.name}`;
    this.version = plugin.manifest.version;
    this.skill_md_path = path.join(plugin.path, plugin.manifest.skills!, skill.name, 'SKILL.md');
    
    // SKILL.md 의 description → output_schema 추정
    this.input_schema = { type: 'object', properties: { task: { type: 'string' } } };
    this.output_schema = { type: 'object' };
    
    this.display = {
      name: this.plugin.manifest.interface.displayName + ' / ' + skill.name,
      summary: (input) => input.task ?? skill.description.slice(0, 80),
      summary_result: () => '완료',
    };
  }
  
  required_capabilities(input: unknown): Capability[] {
    return this.plugin.manifest.interface.capabilities.flatMap(pluginCap => 
      pluginCapabilityToOurs(pluginCap)
    );
  }
  
  async execute(input: { task: string }, ctx: ExecutionContext) {
    // SKILL.md 전체 로드 (lazy)
    const skillMd = await fs.readFile(this.skill_md_path, 'utf-8');
    
    // AI sub-conversation 으로 실행
    const result = await runAIWithSkill({
      skill_md: skillMd,
      task: input.task,
      session_id: ctx.session_id,
      available_tools: this.skill.tools_referenced,
      signal: ctx.signal,
    });
    
    return result;
  }
}
```

---

## Lazy Loading

```
플러그인 활성화 != 즉시 로드.

설치 직후: manifest 만 읽음 (가벼움)
사용 시점: skills/scripts 로드 (필요할 때)

→ 시작 시간 단축
→ 메모리 절약
```

```typescript
// Lazy plugin
class LazyPlugin {
  manifest: PluginManifest;            // 항상 메모리
  
  // skills 는 사용 시점에 로드
  private _skills?: Skill[];
  
  async getSkills(): Promise<Skill[]> {
    if (!this._skills) {
      this._skills = await discoverSkills(path.join(this.path, this.manifest.skills!));
    }
    return this._skills;
  }
}
```

---

## 의존성 체크

```typescript
async function checkDependencies(manifest: PluginManifest): Promise<DepCheck> {
  const issues: string[] = [];
  
  // node 버전
  if (manifest.engines?.node) {
    const required = manifest.engines.node;
    const actual = process.version;
    if (!semver.satisfies(actual, required)) {
      issues.push(`Node ${required} 필요. 현재: ${actual}`);
    }
  }
  
  // 다른 플러그인 의존
  for (const dep of manifest.peerDependencies ?? []) {
    if (!registry.list({ source: 'plugin' }).find(p => p.id === dep)) {
      issues.push(`Plugin '${dep}' 가 먼저 설치되어야 합니다`);
    }
  }
  
  return { ok: issues.length === 0, issues };
}
```

---

## 설치 위치

```
플러그인 설치 경로:

%APPDATA%\Dreampia-Dev\plugins\
├── openai-bundled\           ← Codex 호환 (선택)
│   └── plugins\
│       ├── browser-use\
│       └── latex-tectonic\
├── user-plugins\             ← 사용자 설치
│   ├── my-custom-plugin\
│   └── another-plugin\
└── plugins.json              ← 설치 목록 + enabled 상태
```

### plugins.json

```json
{
  "version": 1,
  "plugins": [
    {
      "id": "browser-use",
      "path": "openai-bundled/plugins/browser-use",
      "enabled": true,
      "installed_at": "2026-05-02T01:00:00.000Z",
      "version": "0.1.0-alpha1"
    },
    {
      "id": "my-custom-plugin",
      "path": "user-plugins/my-custom-plugin",
      "enabled": false,
      "installed_at": "2026-05-02T01:30:00.000Z",
      "version": "1.0.0"
    }
  ]
}
```

---

## Marketplace (Phase 2+)

```
플러그인 마켓플레이스 (코덱스 패턴):
  설정 → 플러그인 → 마켓플레이스
  
  ┌────────────────────────────────────┐
  │ Browser Use         OpenAI         │
  │   In-app browser 자동화            │
  │   ★★★★★ 4.5  📥 12K              │
  │   [설치]                           │
  ├────────────────────────────────────┤
  │ Spreadsheets       OpenAI          │
  │   Excel/CSV 처리                   │
  │   ★★★★☆ 4.2  📥 8K               │
  │   [설치]                           │
  └────────────────────────────────────┘
```

각 플러그인 정보 = `interface.*` 필드에서 자동 생성.

---

## Plugin Creator (Phase 2+)

```
새 플러그인 만들기:
  설정 → 플러그인 → 새 플러그인

→ AI 채팅 시작 (Plugin 만들기 가이드)
→ AI 가 plugin.json + skills/ 자동 생성
→ 사용자가 review 후 install
```

상세는 별도 문서.

---

## 검증 (Invariants)

```
INV-1: plugin.json 은 PluginManifestSchema 통과 필수
INV-2: SKILL.md 는 frontmatter 의 name + description 필수
INV-3: enabled=false 면 tools 등록 X
INV-4: lazy load 시 SKILL.md 본문은 사용 직전에만 읽음
INV-5: 의존성 충족 안 되면 등록 X (오류 알림)
```

---

## 관련

- [categories.md](./categories.md) — Plugin / Skill 정의
- [registry.md](./registry.md) — 등록 메커니즘
- [conflict-resolution.md](./conflict-resolution.md) — 충돌 해결
- [DEEP_EXPLORATION_FINDINGS.md](../../DEEP_EXPLORATION_FINDINGS.md) — Codex plugin.json 발견
