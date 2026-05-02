/**
 * Contract tests — Dangerous pattern detection + secret scanning.
 *
 * Spec: docs/permission/danger-patterns.md
 */

import { describe, it, expect } from 'vitest';
import {
  checkDangerousPattern,
  checkUserInputForSecrets,
  maskSecret,
} from '../../src/permission/DangerCheck';

// ────────────────────────────────────────────────────────────
// LOCAL_EXECUTE 위험 명령
// ────────────────────────────────────────────────────────────

describe('checkDangerousPattern — LOCAL_EXECUTE deny_silent', () => {
  it('blocks rm -rf /', () => {
    const result = checkDangerousPattern('LOCAL_EXECUTE', 'rm -rf /');
    expect(result?.action).toBe('deny_silent');
  });

  it('blocks format c:', () => {
    const result = checkDangerousPattern('LOCAL_EXECUTE', 'format c:');
    expect(result?.action).toBe('deny_silent');
  });

  it('blocks dd if=/dev/zero of=/dev/sda', () => {
    const result = checkDangerousPattern(
      'LOCAL_EXECUTE',
      'dd if=/dev/zero of=/dev/sda'
    );
    expect(result?.action).toBe('deny_silent');
  });
});

describe('checkDangerousPattern — LOCAL_EXECUTE require_modal', () => {
  it('requires modal for sudo apt install', () => {
    const result = checkDangerousPattern('LOCAL_EXECUTE', 'sudo apt install');
    expect(result?.action).toBe('require_modal');
  });

  it('requires modal for runas', () => {
    const result = checkDangerousPattern('LOCAL_EXECUTE', 'runas /user:Administrator cmd');
    expect(result?.action).toBe('require_modal');
  });

  it('requires modal for regedit', () => {
    const result = checkDangerousPattern('LOCAL_EXECUTE', 'regedit');
    expect(result?.action).toBe('require_modal');
  });

  it('requires modal for reg delete', () => {
    const result = checkDangerousPattern(
      'LOCAL_EXECUTE',
      'reg delete HKLM\\Software\\Test'
    );
    expect(result?.action).toBe('require_modal');
  });
});

describe('checkDangerousPattern — safe LOCAL_EXECUTE inputs', () => {
  it('returns null for npm install', () => {
    expect(checkDangerousPattern('LOCAL_EXECUTE', 'npm install')).toBeNull();
  });

  it('returns null for git status', () => {
    expect(checkDangerousPattern('LOCAL_EXECUTE', 'git status')).toBeNull();
  });

  it('returns null for node script.js', () => {
    expect(checkDangerousPattern('LOCAL_EXECUTE', 'node script.js')).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// LOCAL_WRITE 시스템 파일
// ────────────────────────────────────────────────────────────

describe('checkDangerousPattern — LOCAL_WRITE system files', () => {
  it('blocks System32 writes silently', () => {
    const result = checkDangerousPattern(
      'LOCAL_WRITE',
      'C:\\Windows\\System32\\drivers\\hosts'
    );
    expect(result?.action).toBe('deny_silent');
  });

  it('requires modal for ProgramData writes', () => {
    const result = checkDangerousPattern(
      'LOCAL_WRITE',
      'C:\\ProgramData\\Microsoft\\test'
    );
    expect(result?.action).toBe('require_modal');
  });

  it('blocks /etc/passwd writes silently', () => {
    const result = checkDangerousPattern('LOCAL_WRITE', '/etc/passwd');
    expect(result?.action).toBe('deny_silent');
  });

  it('blocks /etc/shadow writes silently', () => {
    const result = checkDangerousPattern('LOCAL_WRITE', '/etc/shadow');
    expect(result?.action).toBe('deny_silent');
  });
});

// ────────────────────────────────────────────────────────────
// LOCAL_READ — secret 파일
// ────────────────────────────────────────────────────────────

describe('checkDangerousPattern — LOCAL_READ secrets', () => {
  it('warns on .env file read', () => {
    const result = checkDangerousPattern('LOCAL_READ', 'C:\\Dev\\foo\\.env');
    expect(result?.action).toBe('warn');
  });

  it('requires modal for ~/.ssh/id_rsa', () => {
    const result = checkDangerousPattern('LOCAL_READ', '/home/user/.ssh/id_rsa');
    expect(result?.action).toBe('require_modal');
  });

  it('requires modal for .ssh/id_ed25519', () => {
    const result = checkDangerousPattern('LOCAL_READ', '/home/user/.ssh/id_ed25519');
    expect(result?.action).toBe('require_modal');
  });

  it('requires modal for .aws/credentials', () => {
    const result = checkDangerousPattern('LOCAL_READ', '/home/user/.aws/credentials');
    expect(result?.action).toBe('require_modal');
  });

  it('warns on .pem file', () => {
    const result = checkDangerousPattern('LOCAL_READ', 'C:\\keys\\server.pem');
    expect(result?.action).toBe('warn');
  });

  it('warns on .key file', () => {
    const result = checkDangerousPattern('LOCAL_READ', 'C:\\keys\\server.key');
    expect(result?.action).toBe('warn');
  });
});

// ────────────────────────────────────────────────────────────
// BROWSER_NAVIGATE
// ────────────────────────────────────────────────────────────

describe('checkDangerousPattern — BROWSER_NAVIGATE', () => {
  it('blocks javascript: URLs', () => {
    const result = checkDangerousPattern('BROWSER_NAVIGATE', 'javascript:alert(1)');
    expect(result?.action).toBe('deny_silent');
  });
});

// ────────────────────────────────────────────────────────────
// NETWORK_REMOTE.upload
// ────────────────────────────────────────────────────────────

describe('checkDangerousPattern — NETWORK_REMOTE.upload', () => {
  it('requires modal for pastebin.com', () => {
    const result = checkDangerousPattern(
      'NETWORK_REMOTE.upload',
      'https://pastebin.com/abc'
    );
    expect(result?.action).toBe('require_modal');
  });

  it('requires modal for gist.github.com', () => {
    const result = checkDangerousPattern(
      'NETWORK_REMOTE.upload',
      'https://gist.github.com/foo'
    );
    expect(result?.action).toBe('require_modal');
  });
});

// ────────────────────────────────────────────────────────────
// Capability 매칭 정확성 — capability 다르면 매칭 X
// ────────────────────────────────────────────────────────────

describe('checkDangerousPattern — capability isolation', () => {
  it('rm -rf / under LOCAL_READ does not match (different capability)', () => {
    expect(checkDangerousPattern('LOCAL_READ', 'rm -rf /')).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// Secret 검출
// ────────────────────────────────────────────────────────────

describe('checkUserInputForSecrets', () => {
  it('detects OpenAI API key', () => {
    const matches = checkUserInputForSecrets(
      'My key: sk-Proj-abc123def456ghi789jkl012mno345pqr678'
    );
    expect(matches.some((m) => m.pattern_name === 'OpenAI API Key')).toBe(true);
  });

  it('detects GitHub PAT (ghp_)', () => {
    const matches = checkUserInputForSecrets(
      'token: ghp_abcdefghijklmnopqrstuvwxyz0123456789'
    );
    expect(matches.some((m) => m.pattern_name === 'GitHub PAT')).toBe(true);
  });

  it('detects 주민번호', () => {
    const matches = checkUserInputForSecrets('주민번호: 901010-1234567');
    expect(matches.some((m) => m.pattern_name === '주민번호')).toBe(true);
  });

  it('detects 한국 휴대전화', () => {
    const matches = checkUserInputForSecrets('연락처: 010-1234-5678');
    expect(matches.some((m) => m.pattern_name === '한국 휴대전화')).toBe(true);
  });

  it('detects Anthropic API key', () => {
    const matches = checkUserInputForSecrets(
      'key: sk-ant-abcdefghijklmnopqrstuvwxyz0123456789'
    );
    expect(matches.some((m) => m.pattern_name === 'Anthropic API Key')).toBe(true);
  });

  it('detects AWS Access Key', () => {
    const matches = checkUserInputForSecrets('AWS: AKIAIOSFODNN7EXAMPLE');
    expect(matches.some((m) => m.pattern_name === 'AWS Access Key')).toBe(true);
  });

  it('detects Visa card number', () => {
    const matches = checkUserInputForSecrets('Card: 4123-4567-8901-2345');
    expect(matches.some((m) => m.pattern_name === 'Visa')).toBe(true);
  });

  it('returns empty for benign text', () => {
    const matches = checkUserInputForSecrets('Hello world! This is a normal message.');
    expect(matches.length).toBe(0);
  });

  it('AWS Secret requires aws context keyword', () => {
    // Without "aws" keyword: should not match
    const noContext = checkUserInputForSecrets(
      'random base64: ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab/+'
    );
    expect(noContext.some((m) => m.pattern_name === 'AWS Secret')).toBe(false);
  });

  it('low confidence on password candidate', () => {
    const matches = checkUserInputForSecrets("password: 'mySecret123'");
    const pw = matches.find((m) => m.pattern_name === '비밀번호 후보');
    expect(pw).toBeDefined();
    expect(pw?.confidence).toBe('low');
  });

  it('matched_text is masked', () => {
    const matches = checkUserInputForSecrets(
      'My key: sk-Proj-abc123def456ghi789jkl012mno345pqr678'
    );
    const openai = matches.find((m) => m.pattern_name === 'OpenAI API Key');
    expect(openai).toBeDefined();
    expect(openai?.matched_text).not.toContain('abc123def456');
    expect(openai?.matched_text).toMatch(/\*+/);
  });
});

// ────────────────────────────────────────────────────────────
// maskSecret
// ────────────────────────────────────────────────────────────

describe('maskSecret', () => {
  it('returns **** for short strings (<=8 chars)', () => {
    expect(maskSecret('abc')).toBe('****');
    expect(maskSecret('12345678')).toBe('****');
  });

  it('keeps first 4 + last 4 for longer strings', () => {
    expect(maskSecret('sk-Proj-abcd1234XYZW')).toBe('sk-P****XYZW');
    expect(maskSecret('123456789012')).toBe('1234****9012');
  });
});
