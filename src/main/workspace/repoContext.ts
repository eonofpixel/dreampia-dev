import { execFile as execFileCallback } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import type {
  CommandRunResult,
  FileEntry,
  RepoContextFile,
  RepoContextSummary,
  RepoGitSummary,
  RepoScriptSummary,
} from '@/types/workspace';

export const FILE_LIST_DEFAULT_MAX_FILES = 5000;
export const FILE_LIST_HARD_MAX_FILES = 10000;
const FILE_LIST_MAX_DEPTH = 16;

const execFile = promisify(execFileCallback);

const WorkspaceInspectArgsSchema = z
  .object({
    workspace_root: z.string().min(1),
    ignore_patterns: z.array(z.string()).optional(),
    max_files: z.number().int().positive().max(FILE_LIST_HARD_MAX_FILES).optional(),
  })
  .strict();

const SAFE_WORKSPACE_COMMANDS = {
  'npm run typecheck': ['run', 'typecheck'],
  'npm run lint': ['run', 'lint'],
  'npm test': ['test'],
} as const;

const RunSafeCommandArgsSchema = z
  .object({
    workspace_root: z.string().min(1),
    command: z.enum(['npm run typecheck', 'npm run lint', 'npm test']),
  })
  .strict();

const DEFAULT_REPO_IGNORE_PATTERNS = [
  '.git/**',
  'node_modules/**',
  'dist/**',
  'build/**',
  'out/**',
  'coverage/**',
  'playwright-report/**',
  'test-results/**',
  '.omx/**',
];

function toErrorMessage(err: unknown): string {
  if (err instanceof z.ZodError) {
    return `Validation error: ${err.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ')}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * 단일 glob -> RegExp. 의존성 없이 minimatch 의 가장 흔한 케이스만 지원:
 * - `*`  : 한 path segment 안의 임의 문자 (`/` 제외) 0개 이상
 * - `**` : path segment 들 0개 이상 포함 임의 문자
 * - `?`  : 한 글자 (`/` 제외)
 */
function compileGlob(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i += 1;
        if (pattern[i + 1] === '/') {
          re += '(?:/|$)';
          i += 1;
        }
        continue;
      }
      re += '[^/]*';
      continue;
    }
    if (ch === '?') {
      re += '[^/]';
      continue;
    }
    if (
      ch === '.' ||
      ch === '+' ||
      ch === '(' ||
      ch === ')' ||
      ch === '|' ||
      ch === '^' ||
      ch === '$' ||
      ch === '{' ||
      ch === '}' ||
      ch === '[' ||
      ch === ']' ||
      ch === '\\'
    ) {
      re += '\\' + ch;
      continue;
    }
    re += ch ?? '';
  }
  return new RegExp(re);
}

function isIgnored(relPath: string, compiledPatterns: ReadonlyArray<RegExp>): boolean {
  for (const re of compiledPatterns) {
    if (re.test(relPath)) return true;
  }
  return false;
}

async function readGitignorePatterns(root: string): Promise<string[]> {
  const gitignorePath = path.join(root, '.gitignore');
  const content = await fsp.readFile(gitignorePath, 'utf8').catch(() => '');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => (line.endsWith('/') ? `${line}**` : line));
}

export async function enumerateWorkspaceFiles(
  root: string,
  ignorePatterns: ReadonlyArray<string>,
  cap: number
): Promise<{ files: FileEntry[]; truncated: boolean }> {
  const compiled = ignorePatterns.map(compileGlob);
  const out: FileEntry[] = [];
  let truncated = false;
  const stack: Array<{ abs: string; rel: string; depth: number }> = [
    { abs: root, rel: '', depth: 0 },
  ];
  while (stack.length > 0) {
    if (out.length >= cap) {
      truncated = true;
      break;
    }
    const top = stack.pop();
    if (top === undefined) break;
    if (top.depth > FILE_LIST_MAX_DEPTH) continue;
    let entries: import('node:fs').Dirent[] = [];
    try {
      entries = await fsp.readdir(top.abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (out.length >= cap) {
        truncated = true;
        break;
      }
      const childRel = top.rel.length === 0 ? ent.name : `${top.rel}/${ent.name}`;
      const relForMatch = childRel.split(path.sep).join('/');
      if (isIgnored(relForMatch, compiled)) continue;
      const childAbs = path.join(top.abs, ent.name);
      if (ent.isDirectory()) {
        stack.push({ abs: childAbs, rel: relForMatch, depth: top.depth + 1 });
        continue;
      }
      if (!ent.isFile()) continue;
      try {
        const fileStat = await fsp.stat(childAbs);
        out.push({
          path: relForMatch,
          size_bytes: fileStat.size,
          mtime: fileStat.mtime.toISOString(),
        });
      } catch {
        continue;
      }
    }
  }
  return { files: out, truncated };
}

function languageForPath(relPath: string): string {
  const ext = path.extname(relPath).toLowerCase();
  const byExt: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript React',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript React',
    '.json': 'JSON',
    '.md': 'Markdown',
    '.css': 'CSS',
    '.html': 'HTML',
    '.py': 'Python',
    '.go': 'Go',
    '.rs': 'Rust',
    '.java': 'Java',
    '.kt': 'Kotlin',
    '.swift': 'Swift',
    '.yml': 'YAML',
    '.yaml': 'YAML',
  };
  return byExt[ext] ?? (ext.length > 0 ? ext.slice(1).toUpperCase() : 'Other');
}

function contextReasonForPath(relPath: string): string | null {
  const name = path.basename(relPath).toLowerCase();
  if (name === 'package.json') return 'package scripts and dependency surface';
  if (name === 'readme.md') return 'first-run user documentation';
  if (name === 'agents.md') return 'repo agent instructions';
  if (relPath.startsWith('src/main/')) return 'Electron main-process behavior';
  if (relPath.startsWith('src/renderer/')) return 'renderer UI and local coding loop';
  if (relPath.startsWith('src/providers/')) return 'AI provider and CLI adapter behavior';
  if (relPath.startsWith('src/types/')) return 'shared contract and typed workflow state';
  if (relPath.startsWith('e2e/')) return 'end-to-end product workflow coverage';
  if (relPath.startsWith('tests/')) return 'unit and integration coverage';
  return null;
}

function isTestPath(relPath: string): boolean {
  const lower = relPath.toLowerCase();
  return (
    lower.includes('/__tests__/') ||
    lower.includes('/tests/') ||
    lower.startsWith('tests/') ||
    lower.startsWith('e2e/') ||
    /\.test\.[tj]sx?$/.test(lower) ||
    /\.spec\.[tj]sx?$/.test(lower)
  );
}

async function readPackageScripts(root: string): Promise<RepoScriptSummary[]> {
  const pkgPath = path.join(root, 'package.json');
  const content = await fsp.readFile(pkgPath, 'utf8').catch(() => '');
  if (content.length === 0) return [];
  try {
    const parsed = JSON.parse(content) as { scripts?: Record<string, unknown> };
    return Object.entries(parsed.scripts ?? {})
      .filter(([, value]) => typeof value === 'string')
      .map(([name, value]) => ({ name, command: `npm run ${name}`, raw: value as string }))
      .map(({ name, command }) => ({ name, command }));
  } catch {
    return [];
  }
}

function safeCommandsFromScripts(scripts: ReadonlyArray<RepoScriptSummary>): RepoScriptSummary[] {
  const names = new Set(scripts.map((script) => script.name));
  const out: RepoScriptSummary[] = [];
  if (names.has('typecheck')) out.push({ name: 'typecheck', command: 'npm run typecheck' });
  if (names.has('lint')) out.push({ name: 'lint', command: 'npm run lint' });
  if (names.has('test')) out.push({ name: 'test', command: 'npm test' });
  return out;
}

function parseGitStatusLines(stdout: string): RepoGitSummary {
  const lines = stdout.split(/\r?\n/).filter((line) => line.length > 0);
  const branchLine = lines.find((line) => line.startsWith('## '));
  const branch =
    branchLine === undefined
      ? null
      : branchLine
          .slice(3)
          .replace(/\s+\[.*\]$/, '')
          .split('...')[0]
          ?.trim() || null;
  const files = lines
    .filter((line) => !line.startsWith('## '))
    .map((line) => {
      const status = line.slice(0, 2);
      const rawPath = line.slice(3).trim();
      const normalizedPath = rawPath.includes(' -> ')
        ? (rawPath.split(' -> ').pop() ?? rawPath)
        : rawPath;
      const staged = status[0] !== ' ' && status[0] !== '?';
      const worktree = status[1] !== ' ' && status[1] !== '?';
      return {
        path: normalizedPath,
        status,
        staged,
        worktree,
      };
    });
  return {
    is_repo: true,
    branch,
    dirty_count: files.length,
    staged_count: files.filter((file) => file.staged).length,
    unstaged_count: files.filter((file) => file.worktree).length,
    untracked_count: files.filter((file) => file.status === '??').length,
    files: files.slice(0, 25),
  };
}

async function summarizeGit(root: string): Promise<RepoGitSummary> {
  try {
    const status = await execFile('git', ['status', '--short', '--branch'], {
      cwd: root,
      timeout: 5000,
      maxBuffer: 256 * 1024,
      windowsHide: true,
    });
    const summary = parseGitStatusLines(status.stdout);
    try {
      const log = await execFile('git', ['log', '-1', '--pretty=%H%x00%s'], {
        cwd: root,
        timeout: 5000,
        maxBuffer: 64 * 1024,
        windowsHide: true,
      });
      const [sha, subject] = log.stdout.trim().split('\0');
      if (sha !== undefined && sha.length > 0) {
        summary.last_commit = { sha: sha.slice(0, 12), subject: subject ?? '' };
      }
    } catch {
      // Repos without commits still have useful status output.
    }
    return summary;
  } catch (err) {
    const message = toErrorMessage(err);
    return {
      is_repo: false,
      branch: null,
      dirty_count: 0,
      staged_count: 0,
      unstaged_count: 0,
      untracked_count: 0,
      files: [],
      error: message,
    };
  }
}

export async function inspectWorkspaceContext(raw: unknown): Promise<RepoContextSummary> {
  const args = WorkspaceInspectArgsSchema.parse(raw);
  const root = path.resolve(args.workspace_root);
  const stat = await fsp.stat(root).catch(() => null);
  if (stat === null || !stat.isDirectory()) {
    throw new Error('workspace_root must be an existing directory');
  }
  const gitignorePatterns = await readGitignorePatterns(root);
  const ignoredPatterns = Array.from(
    new Set([
      ...DEFAULT_REPO_IGNORE_PATTERNS,
      ...gitignorePatterns,
      ...(args.ignore_patterns ?? []),
    ])
  );
  const cap = args.max_files ?? FILE_LIST_DEFAULT_MAX_FILES;
  const { files, truncated } = await enumerateWorkspaceFiles(root, ignoredPatterns, cap);
  const languageMap = new Map<string, { files: number; bytes: number }>();
  for (const file of files) {
    const language = languageForPath(file.path);
    const current = languageMap.get(language) ?? { files: 0, bytes: 0 };
    current.files += 1;
    current.bytes += file.size_bytes;
    languageMap.set(language, current);
  }
  const languages = [...languageMap.entries()]
    .map(([language, value]) => ({ language, files: value.files, bytes: value.bytes }))
    .sort((a, b) => b.files - a.files)
    .slice(0, 8);
  const keyFiles: RepoContextFile[] = files
    .map((file) => {
      const reason = contextReasonForPath(file.path);
      return reason === null ? null : { path: file.path, reason };
    })
    .filter((file): file is RepoContextFile => file !== null)
    .slice(0, 12);
  const testFiles: RepoContextFile[] = files
    .filter((file) => isTestPath(file.path))
    .slice(0, 12)
    .map((file) => ({ path: file.path, reason: 'validation coverage candidate' }));
  const sourceRoots = Array.from(
    new Set(
      files
        .map((file) => file.path.split('/').slice(0, 2).join('/'))
        .filter(
          (prefix) => prefix.startsWith('src/') || prefix.startsWith('tests/') || prefix === 'e2e'
        )
    )
  ).slice(0, 10);
  const scripts = await readPackageScripts(root);
  const safeCommands = safeCommandsFromScripts(scripts);
  const git = await summarizeGit(root);
  const warnings: string[] = [];
  if (truncated) warnings.push(`file list capped at ${cap}; context is partial`);
  if (!git.is_repo) warnings.push('git status unavailable; commit handoff will be advisory only');
  if (safeCommands.length === 0) warnings.push('no typecheck/lint/test package scripts detected');
  return {
    root,
    generated_at: new Date().toISOString(),
    status: warnings.length > 0 ? 'partial' : 'ready',
    file_count: files.length,
    indexed_count: files.length,
    truncated,
    ignored_patterns: ignoredPatterns.slice(0, 20),
    languages,
    key_files: keyFiles,
    test_files: testFiles,
    source_roots: sourceRoots,
    scripts: scripts.slice(0, 20),
    safe_commands: safeCommands,
    git,
    warnings,
  };
}

function tailText(text: string | undefined, limit = 6000): string {
  if (text === undefined || text.length <= limit) return text ?? '';
  return text.slice(text.length - limit);
}

function summarizeCommandResult(command: string, exitCode: number | null, output: string): string {
  if (exitCode === 0) return `${command} completed successfully.`;
  if (/error TS\d+/i.test(output))
    return 'TypeScript errors detected; open the referenced files first.';
  if (/eslint|lint/i.test(output))
    return 'Lint errors detected; review the listed rules and file paths.';
  if (/FAIL|failed|AssertionError|expected/i.test(output)) {
    return 'Test failures detected; inspect the first failing spec and rerun after fixing.';
  }
  return 'Command failed; inspect stdout/stderr tail and rerun after the next change.';
}

export async function runSafeWorkspaceCommand(raw: unknown): Promise<CommandRunResult> {
  const args = RunSafeCommandArgsSchema.parse(raw);
  const root = path.resolve(args.workspace_root);
  const stat = await fsp.stat(root).catch(() => null);
  if (stat === null || !stat.isDirectory()) {
    throw new Error('workspace_root must be an existing directory');
  }
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const npmArgs = SAFE_WORKSPACE_COMMANDS[args.command];
  const startedAt = new Date().toISOString();
  try {
    const result = await execFile(npm, npmArgs, {
      cwd: root,
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    const endedAt = new Date().toISOString();
    const stdoutTail = tailText(result.stdout);
    const stderrTail = tailText(result.stderr);
    return {
      command: args.command,
      cwd: root,
      status: 'completed',
      exit_code: 0,
      stdout_tail: stdoutTail,
      stderr_tail: stderrTail,
      started_at: startedAt,
      ended_at: endedAt,
      summary: summarizeCommandResult(args.command, 0, `${stdoutTail}\n${stderrTail}`),
    };
  } catch (err) {
    const endedAt = new Date().toISOString();
    const e = err as {
      code?: number | string;
      killed?: boolean;
      signal?: string;
      stdout?: string;
      stderr?: string;
    };
    const stdoutTail = tailText(e.stdout);
    const stderrTail = tailText(e.stderr ?? toErrorMessage(err));
    const timedOut = e.killed === true || e.signal === 'SIGTERM';
    const exitCode = typeof e.code === 'number' ? e.code : null;
    return {
      command: args.command,
      cwd: root,
      status: timedOut ? 'timed_out' : 'failed',
      exit_code: exitCode,
      stdout_tail: stdoutTail,
      stderr_tail: stderrTail,
      started_at: startedAt,
      ended_at: endedAt,
      summary: timedOut
        ? 'Command timed out after 120s; rerun a narrower command or inspect the terminal output.'
        : summarizeCommandResult(args.command, exitCode, `${stdoutTail}\n${stderrTail}`),
    };
  }
}
