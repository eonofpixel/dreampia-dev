/**
 * PluginCapabilityGate unit tests (v1.1.23).
 *
 * 검증:
 *  - confirmer 없으면 모두 거절 + audit 'cap_no_confirmer'.
 *  - 'once' / 'session' / 'always' 응답 → granted (in-memory cache).
 *  - 'deny' 응답 → false + 거절 set 에 추가 (재요청 X).
 *  - 같은 capability 두 번째 요청 → confirmer 재호출 X (캐시).
 *  - 다른 plugin 의 같은 capability 는 별도 요청.
 *  - confirmer throw → false + audit 'cap_denied'.
 *  - clearAll — 캐시 reset.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  PluginCapabilityGate,
  type PluginCapabilityAuditEvent,
} from '../../../src/main/plugins/PluginCapabilityGate';
import type {
  PermissionConfirmer,
  PermissionRequest,
  PermissionResponse,
} from '../../../src/tools';

function makeConfirmer(decisions: PermissionResponse['decision'][]): {
  confirmer: PermissionConfirmer;
  received: PermissionRequest[];
} {
  let i = 0;
  const received: PermissionRequest[] = [];
  return {
    received,
    confirmer: {
      confirm: async (req) => {
        received.push(req);
        const decision = decisions[i] ?? 'deny';
        i += 1;
        return { request_id: req.request_id, decision };
      },
    },
  };
}

describe('v1.1.23 — PluginCapabilityGate', () => {
  it('confirmer 없으면 모든 capability 거절', async () => {
    const audit: PluginCapabilityAuditEvent[] = [];
    const gate = new PluginCapabilityGate({
      auditSink: (e) => audit.push(e),
    });
    const result = await gate.ensureGranted('cost-limit', ['NETWORK_REMOTE']);
    expect(result).toBe(false);
    expect(audit.some((e) => e.event === 'plugin.cap_no_confirmer')).toBe(true);
  });

  it("'once' 응답 → granted + audit cap_granted", async () => {
    const { confirmer, received } = makeConfirmer(['once']);
    const audit: PluginCapabilityAuditEvent[] = [];
    const gate = new PluginCapabilityGate({
      confirmer,
      auditSink: (e) => audit.push(e),
    });
    expect(await gate.ensureGranted('p', ['CAP_A'])).toBe(true);
    expect(received.length).toBe(1);
    expect(gate.isGranted('p', 'CAP_A')).toBe(true);
    expect(audit.some((e) => e.event === 'plugin.cap_granted')).toBe(true);
  });

  it("'session' / 'always' 도 granted", async () => {
    const { confirmer } = makeConfirmer(['session', 'always']);
    const gate = new PluginCapabilityGate({ confirmer });
    expect(await gate.ensureGranted('p1', ['A'])).toBe(true);
    expect(await gate.ensureGranted('p2', ['B'])).toBe(true);
    expect(gate.isGranted('p1', 'A')).toBe(true);
    expect(gate.isGranted('p2', 'B')).toBe(true);
  });

  it("'deny' → false + 같은 cap 재요청 X (denied set)", async () => {
    const { confirmer, received } = makeConfirmer(['deny']);
    const gate = new PluginCapabilityGate({ confirmer });
    expect(await gate.ensureGranted('p', ['CAP_X'])).toBe(false);
    expect(await gate.ensureGranted('p', ['CAP_X'])).toBe(false);
    expect(received.length).toBe(1);
  });

  it('같은 plugin/cap 두 번째 요청 → confirmer 재호출 X (캐시)', async () => {
    const { confirmer, received } = makeConfirmer(['always']);
    const gate = new PluginCapabilityGate({ confirmer });
    await gate.ensureGranted('p', ['CAP_Y']);
    await gate.ensureGranted('p', ['CAP_Y']);
    expect(received.length).toBe(1);
  });

  it('다른 plugin 의 같은 cap 은 별도 요청', async () => {
    const { confirmer, received } = makeConfirmer(['once', 'once']);
    const gate = new PluginCapabilityGate({ confirmer });
    await gate.ensureGranted('plugA', ['CAP_Z']);
    await gate.ensureGranted('plugB', ['CAP_Z']);
    expect(received.length).toBe(2);
  });

  it('confirmer throw → false + audit cap_denied', async () => {
    const audit: PluginCapabilityAuditEvent[] = [];
    const confirmer: PermissionConfirmer = {
      confirm: async () => {
        throw new Error('IPC down');
      },
    };
    const gate = new PluginCapabilityGate({
      confirmer,
      auditSink: (e) => audit.push(e),
    });
    expect(await gate.ensureGranted('p', ['C'])).toBe(false);
    expect(audit.some((e) => e.event === 'plugin.cap_denied')).toBe(true);
  });

  it('여러 capability 중 하나라도 deny → 전체 false', async () => {
    const { confirmer } = makeConfirmer(['once', 'deny']);
    const gate = new PluginCapabilityGate({ confirmer });
    expect(await gate.ensureGranted('p', ['A', 'B'])).toBe(false);
    expect(gate.isGranted('p', 'A')).toBe(true);
    expect(gate.isGranted('p', 'B')).toBe(false);
  });

  it('clearAll — 캐시 reset', async () => {
    const { confirmer, received } = makeConfirmer(['once', 'once']);
    const gate = new PluginCapabilityGate({ confirmer });
    await gate.ensureGranted('p', ['A']);
    expect(received.length).toBe(1);
    gate.clearAll();
    await gate.ensureGranted('p', ['A']);
    expect(received.length).toBe(2);
  });
});

describe('v1.6.7 — PluginCapabilityGate 파일 영속', () => {
  let dir = '';

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dreampia-pcg-persist-'));
  });

  afterEach(() => {
    if (dir.length > 0 && existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("'always' 응답 → <storageDir>/<plugin>/.granted.json 에 영속", async () => {
    const { confirmer } = makeConfirmer(['always']);
    const gate = new PluginCapabilityGate({ confirmer, storageDir: dir });
    expect(await gate.ensureGranted('cost-limit', ['NETWORK_REMOTE'])).toBe(
      true
    );
    const file = join(dir, 'cost-limit', '.granted.json');
    expect(existsSync(file)).toBe(true);
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as {
      capabilities: string[];
    };
    expect(parsed.capabilities).toContain('NETWORK_REMOTE');
  });

  it("'session' / 'once' 응답 → 파일 영속 X", async () => {
    const { confirmer } = makeConfirmer(['session', 'once']);
    const gate = new PluginCapabilityGate({ confirmer, storageDir: dir });
    await gate.ensureGranted('p', ['SESSION_CAP']);
    await gate.ensureGranted('q', ['ONCE_CAP']);
    expect(existsSync(join(dir, 'p', '.granted.json'))).toBe(false);
    expect(existsSync(join(dir, 'q', '.granted.json'))).toBe(false);
  });

  it('새 인스턴스 생성 → 디스크에서 grant 자동 로드 + confirmer 재호출 X', async () => {
    // 1차: always 받아 파일 write.
    const first = makeConfirmer(['always']);
    const gate1 = new PluginCapabilityGate({
      confirmer: first.confirmer,
      storageDir: dir,
    });
    await gate1.ensureGranted('plug', ['CAP_PERSIST']);
    expect(first.received.length).toBe(1);

    // 2차: 새 인스턴스 → 기존 파일에서 로드. confirmer 호출 X.
    const second = makeConfirmer(['always']);
    const gate2 = new PluginCapabilityGate({
      confirmer: second.confirmer,
      storageDir: dir,
    });
    expect(gate2.isGranted('plug', 'CAP_PERSIST')).toBe(true);
    expect(await gate2.ensureGranted('plug', ['CAP_PERSIST'])).toBe(true);
    expect(second.received.length).toBe(0); // 캐시 hit
  });

  it('여러 plugin 의 grant 가 각자의 디렉터리에 영속', async () => {
    const { confirmer } = makeConfirmer(['always', 'always']);
    const gate = new PluginCapabilityGate({ confirmer, storageDir: dir });
    await gate.ensureGranted('plugA', ['A']);
    await gate.ensureGranted('plugB', ['B']);
    expect(existsSync(join(dir, 'plugA', '.granted.json'))).toBe(true);
    expect(existsSync(join(dir, 'plugB', '.granted.json'))).toBe(true);
  });

  it('같은 plugin 의 추가 always cap → 같은 파일에 누적', async () => {
    const { confirmer } = makeConfirmer(['always', 'always']);
    const gate = new PluginCapabilityGate({ confirmer, storageDir: dir });
    await gate.ensureGranted('p', ['A']);
    await gate.ensureGranted('p', ['B']);
    const parsed = JSON.parse(
      readFileSync(join(dir, 'p', '.granted.json'), 'utf-8')
    ) as { capabilities: string[] };
    expect(parsed.capabilities).toContain('A');
    expect(parsed.capabilities).toContain('B');
  });

  it('이미 영속된 cap 을 다시 always 로 받아도 idempotent (write 1회)', async () => {
    const { confirmer } = makeConfirmer(['always']);
    const gate1 = new PluginCapabilityGate({ confirmer, storageDir: dir });
    await gate1.ensureGranted('p', ['IDEM']);
    const file = join(dir, 'p', '.granted.json');
    const before = readFileSync(file, 'utf-8');

    // 새 인스턴스 + always 다시 — confirmer 호출 X (이미 캐시), 파일 unchanged.
    const second = makeConfirmer(['always']);
    const gate2 = new PluginCapabilityGate({
      confirmer: second.confirmer,
      storageDir: dir,
    });
    await gate2.ensureGranted('p', ['IDEM']);
    const after = readFileSync(file, 'utf-8');
    expect(after).toBe(before);
  });

  it('손상된 .granted.json → silent skip + 새 grant 가능', async () => {
    mkdirSync(join(dir, 'corrupt-plugin'), { recursive: true });
    writeFileSync(
      join(dir, 'corrupt-plugin', '.granted.json'),
      '{not valid json',
      'utf-8'
    );
    const { confirmer, received } = makeConfirmer(['always']);
    const gate = new PluginCapabilityGate({ confirmer, storageDir: dir });
    expect(gate.isGranted('corrupt-plugin', 'X')).toBe(false);
    await gate.ensureGranted('corrupt-plugin', ['NEW_CAP']);
    expect(received.length).toBe(1);
    // overwrite 됨.
    const parsed = JSON.parse(
      readFileSync(join(dir, 'corrupt-plugin', '.granted.json'), 'utf-8')
    ) as { capabilities: string[] };
    expect(parsed.capabilities).toContain('NEW_CAP');
  });

  it('storageDir 미지정 시 영속 X (기존 동작 유지)', async () => {
    const { confirmer } = makeConfirmer(['always']);
    const gate = new PluginCapabilityGate({ confirmer });
    await gate.ensureGranted('p', ['A']);
    expect(gate.isGranted('p', 'A')).toBe(true);
    // 어떤 파일도 만들어지지 않음 — dir 변수 그대로 비어있음.
  });

  it('storageDir 가 존재하지 않는 경로 → 새 인스턴스 안전 (load skip)', () => {
    const nonExist = join(dir, 'does-not-exist');
    const gate = new PluginCapabilityGate({ storageDir: nonExist });
    expect(gate.isGranted('any', 'cap')).toBe(false);
  });
});
