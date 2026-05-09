/**
 * McpManifest schema tests (v2.3.0 US-101).
 *
 * Validates: 1 valid fixture + 5 invalid fixtures rejected (US-101 AC).
 * Plus: manifestToRecordPartial projection.
 */

import { describe, it, expect } from 'vitest';
import {
  McpManifestSchema,
  manifestToRecordPartial,
  type ManifestVerificationResult,
} from '../../src/types/mcpManifest';

const validFixture = {
  schema_version: 1 as const,
  package_id: '@eonofpixel/sample-mcp',
  name: 'Sample MCP Server',
  version: '1.2.3',
  description: 'Example MCP server for v2.3.0 marketplace tests.',
  capabilities: ['host.fs.read', 'host.audit.write'],
  entrypoint: {
    file: 'dist/index.js',
    artifact_digest: 'a'.repeat(64),
    artifact_size_bytes: 1024,
  },
  signing: {
    method: 'sigstore-keyless-oidc' as const,
    identity: {
      issuer: 'https://token.actions.githubusercontent.com',
      subject_pattern: 'repo:eonofpixel/sample-mcp:ref:refs/tags/v*',
    },
  },
  runtime: {
    node: '^18.0.0 || ^20.0.0',
    requires_native_modules: false,
  },
};

describe('v2.3.0 US-101 — McpManifestSchema', () => {
  it('accepts a valid manifest', () => {
    const result = McpManifestSchema.safeParse(validFixture);
    expect(result.success).toBe(true);
  });

  it('rejects manifest with unknown top-level field (.strict)', () => {
    const broken = { ...validFixture, malicious_extra: 'sneaky' };
    const result = McpManifestSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });

  it('rejects manifest with non-semver version', () => {
    const broken = { ...validFixture, version: 'latest' };
    const result = McpManifestSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });

  it('rejects manifest with non-https issuer', () => {
    const broken = {
      ...validFixture,
      signing: {
        ...validFixture.signing,
        identity: {
          issuer: 'not-a-url',
          subject_pattern: validFixture.signing.identity.subject_pattern,
        },
      },
    };
    const result = McpManifestSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });

  it('rejects manifest with malformed sha256 (must be lowercase 64-char hex)', () => {
    const broken = {
      ...validFixture,
      entrypoint: { ...validFixture.entrypoint, artifact_digest: 'TOOSHORT' },
    };
    const result = McpManifestSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });

  it('rejects manifest with capability not matching dotted-snake pattern', () => {
    const broken = { ...validFixture, capabilities: ['HostFsRead'] };
    const result = McpManifestSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });
});

describe('v2.3.0 US-101 — manifestToRecordPartial', () => {
  const manifestDigest = 'b'.repeat(64);

  it('verified result → publisher_id from cert claims, last_verified_at set', () => {
    const result: ManifestVerificationResult = {
      kind: 'verified',
      evidence: {
        cert_issuer: 'https://token.actions.githubusercontent.com',
        cert_subject: 'repo:eonofpixel/sample-mcp:ref:refs/tags/v1.2.3',
        verified_at: '2026-05-09T12:00:00.000Z',
      },
    };
    const partial = manifestToRecordPartial(validFixture, manifestDigest, result);
    expect(partial.verification_status).toBe('verified');
    expect(partial.last_verified_at).toBe('2026-05-09T12:00:00.000Z');
    expect(partial.publisher_id).toBe(
      'token.actions.githubusercontent.com:repo:eonofpixel/sample-mcp:ref:refs/tags/v1.2.3',
    );
    expect(partial.package_id).toBe('@eonofpixel/sample-mcp');
    expect(partial.version).toBe('1.2.3');
    expect(partial.manifest_digest).toBe(manifestDigest);
  });

  it('identity_mismatch result → status mapped, publisher_id from manifest claim (not cert)', () => {
    const result: ManifestVerificationResult = {
      kind: 'identity_mismatch',
      evidence: {
        expected_issuer: 'https://token.actions.githubusercontent.com',
        actual_issuer: 'https://token.actions.githubusercontent.com',
        expected_subject_pattern: 'repo:eonofpixel/sample-mcp:ref:refs/tags/v*',
        actual_subject: 'repo:malicious/typosquat:ref:refs/heads/main',
      },
    };
    const partial = manifestToRecordPartial(validFixture, manifestDigest, result);
    expect(partial.verification_status).toBe('identity_mismatch');
    expect(partial.last_verified_at).toBeNull();
    expect(partial.publisher_id).toBe(
      'token.actions.githubusercontent.com:repo:eonofpixel/sample-mcp:ref:refs/tags/v*',
    );
  });

  it('signature_invalid result → status mapped, last_verified_at null', () => {
    const result: ManifestVerificationResult = {
      kind: 'signature_invalid',
      evidence: { reason: 'Sigstore bundle digest mismatch' },
    };
    const partial = manifestToRecordPartial(validFixture, manifestDigest, result);
    expect(partial.verification_status).toBe('signature_invalid');
    expect(partial.last_verified_at).toBeNull();
  });

  it('unsigned result → status=unverified, last_verified_at null', () => {
    const result: ManifestVerificationResult = {
      kind: 'unsigned',
      evidence: { reason: 'mode_off' },
    };
    const partial = manifestToRecordPartial(validFixture, manifestDigest, result);
    expect(partial.verification_status).toBe('unverified');
    expect(partial.last_verified_at).toBeNull();
  });
});
