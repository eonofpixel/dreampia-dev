# Marketplace Schema

> Schema for `docs/marketplace/registry.json` and `docs/marketplace/trusted_identities.json`.
> Validated by `scripts/lint-registry.cjs` (run in CI on every PR via `.github/workflows/registry-lint.yml`).
> Spec: `.omc/plans/v2.3.0-plugin-ga.md` §4 Phase 3.3 (US-302) + 3.4 (US-303), gate G2.

## registry.json

Top-level shape:

```ts
{
  schema_version: 1,                   // currently 1
  generated_at: string,                // ISO 8601
  entries: RegistryEntry[]
}

interface RegistryEntry {
  package_id: string;                  // npm-style; matches McpManifestSchema PackageIdSchema
  name: string;                        // human-readable, max 128
  description: string;                 // max 1024
  manifest_url: string;                // https URL pointing to manifest.json
  homepage: string;                    // https URL
  publisher_id: string;                // matches `<issuer-host>:<sub-pattern>`
  categories: string[];                // e.g. ["filesystem", "audit"]
  added_at: string;                    // ISO 8601
}
```

## trusted_identities.json

Top-level shape:

```ts
{
  schema_version: 1,
  generated_at: string,
  publishers: Publisher[]
}

interface Publisher {
  publisher_id: string;                // canonical id (matches registry RegistryEntry.publisher_id)
  display_name: string;                // user-facing name in marketplace UI
  trusted_identities: Array<{
    issuer: string;                    // https URL (typically OIDC provider)
    subject_pattern: string;           // glob — matches Sigstore cert sub claim
  }>;
  added_at: string;
}
```

## Validation Rules (`scripts/lint-registry.cjs`)

1. **schema_version** must equal 1.
2. **generated_at / added_at** must be valid ISO 8601 (parse with `Date.parse` returns finite).
3. **package_id** must match `^(@[a-zA-Z0-9][a-zA-Z0-9_-]*\/)?[a-zA-Z0-9][a-zA-Z0-9_-]*$`.
4. **manifest_url / homepage / issuer** must be `https://` URLs (no `http://`, no `file://`).
5. **categories** array max length 16; each entry max 32 chars `[a-z0-9_-]+`.
6. **subject_pattern** must be non-empty, max 512.
7. **registry → trusted_identities cross-check**: every `RegistryEntry.publisher_id` must appear as a `Publisher.publisher_id` in `trusted_identities.json`.
8. **No duplicates** within either file (by `package_id` / `publisher_id`).

CI fails with non-zero exit on any violation.

## Adding new entries (PR workflow)

1. Open a PR adding entries to `registry.json` + `trusted_identities.json`.
2. CI runs `npx node scripts/lint-registry.cjs` — must pass.
3. Manual review by maintainer:
   - Confirm publisher controls the GitHub repo referenced by `subject_pattern`.
   - Spot-check the manifest_url loads a valid signed manifest.
   - Confirm no typo-squatting on `package_id`.
4. After merge, the registry is consumed by `signedRevocationFeed` (US-203) and the marketplace browse UI (US-300).

## Future expansion (out of v2.3.0 scope)

- Federated registries (multiple registry mirrors) — v2.4.0+.
- Marketplace search/discovery API — v2.4.0+.
- Per-publisher ratings / community signals — backlog.
