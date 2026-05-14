import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  enumerateWorkspaceFiles,
  inspectWorkspaceContext,
} from '../../src/main/workspace/repoContext';

const roots: string[] = [];

async function makeWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dreampia-repo-context-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('repoContext workspace helpers', () => {
  it('enumerates files with ignore patterns and cap truncation', async () => {
    const root = await makeWorkspace();
    await mkdir(path.join(root, 'src'), { recursive: true });
    await mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
    await writeFile(path.join(root, 'src', 'main.ts'), 'export const ok = true;\n', 'utf8');
    await writeFile(path.join(root, 'README.md'), '# Test\n', 'utf8');
    await writeFile(
      path.join(root, 'node_modules', 'pkg', 'index.js'),
      'module.exports = {};\n',
      'utf8'
    );

    const listed = await enumerateWorkspaceFiles(root, ['node_modules/**'], 1);

    expect(listed.truncated).toBe(true);
    expect(listed.files).toHaveLength(1);
    expect(listed.files[0]?.path).not.toContain('node_modules');
  });

  it('summarizes scripts, key files, tests, and partial git state without mutating workspace', async () => {
    const root = await makeWorkspace();
    await mkdir(path.join(root, 'src', 'main'), { recursive: true });
    await mkdir(path.join(root, 'tests'), { recursive: true });
    await mkdir(path.join(root, 'dist'), { recursive: true });
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        scripts: {
          typecheck: 'tsc --noEmit',
          lint: 'eslint .',
          test: 'vitest run',
          build: 'vite build',
        },
      }),
      'utf8'
    );
    await writeFile(path.join(root, 'README.md'), '# Demo\n', 'utf8');
    await writeFile(path.join(root, 'src', 'main', 'ipc.ts'), 'export {};\n', 'utf8');
    await writeFile(path.join(root, 'tests', 'ipc.test.ts'), 'test("x", () => {});\n', 'utf8');
    await writeFile(path.join(root, 'dist', 'bundle.js'), 'ignored();\n', 'utf8');

    const summary = await inspectWorkspaceContext({ workspace_root: root });

    expect(summary.root).toBe(path.resolve(root));
    expect(summary.safe_commands.map((script) => script.command)).toEqual([
      'npm run typecheck',
      'npm run lint',
      'npm test',
    ]);
    expect(summary.scripts.some((script) => script.name === 'build')).toBe(true);
    expect(summary.key_files.some((file) => file.path === 'README.md')).toBe(true);
    expect(summary.key_files.some((file) => file.path === 'src/main/ipc.ts')).toBe(true);
    expect(summary.test_files.some((file) => file.path === 'tests/ipc.test.ts')).toBe(true);
    expect(summary.file_count).toBeGreaterThan(0);
    expect(summary.file_count).toBeLessThan(5);
  });
});
