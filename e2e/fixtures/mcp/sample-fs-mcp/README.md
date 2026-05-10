# sample-fs-mcp — Sigstore install e2e fixture

Spec: `.omc/plans/v2.3.0-plugin-ga.md` §4 Phase 2.5 (US-204), gates G2/G3.
Test: [`e2e/mcp-install-signed.spec.ts`](../../../mcp-install-signed.spec.ts).

This directory holds the fixture artifact + manifest for the Sigstore install
e2e test. The `*.sigstore` bundle (keyless-OIDC attestation) is **not committed**
because it requires a GitHub Actions OIDC token to produce; CI regenerates it
per release. Locally you can fetch a previously-attested bundle from a tagged
GitHub Release and place it at `bundle.sigstore`.

## Files

| File              | Committed? | Purpose                                                    |
| ----------------- | :--------: | ---------------------------------------------------------- |
| `index.js`        | yes        | MCP entrypoint (the bytes whose sha256 the manifest binds) |
| `manifest.json`   | yes        | Declarative manifest (schema_version 1)                    |
| `bundle.sigstore` | no         | Keyless-OIDC attestation bundle (`gh attestation download`) |
| `unsigned.json`   | no         | Manifest variant with no bundle (for `warn`/`strict` mode tests) |

## Regenerate

When the fixture entrypoint or manifest changes:

```bash
node scripts/gen-mcp-fixtures.cjs
```

This recomputes `manifest.json` `entrypoint.artifact_digest` + `artifact_size_bytes`
to match the current `index.js` bytes. The script never touches `bundle.sigstore`.

## Re-attest (CI / publishers)

1. Create a release tag in `eonofpixel/sample-fs-mcp` (or analogous test repo).
2. In a GitHub Actions workflow with `id-token: write`, run
   `gh attestation build --predicate-type … --subject-path index.js` against
   the artifact. Upload the resulting bundle as a release asset.
3. Locally fetch with `gh attestation download --owner eonofpixel sample-fs-mcp`
   and place the JSON at `e2e/fixtures/mcp/sample-fs-mcp/bundle.sigstore`.

The fixture's `manifest.signing.identity.subject_pattern` already targets
`refs/tags/v*` so any tagged release attestation will match — no manifest
change needed when re-tagging.

## Why the bundle is gitignored

Sigstore bundles are time-bounded (cert validity ≈ 10 min) but the inclusion
proof remains valid indefinitely. Even so, committing the bundle to a public
repo is discouraged: it leaks the tag SHA + workflow run id and re-uploading
is cheap. For local development, the e2e test `test.skip()`s when no bundle is
present.
