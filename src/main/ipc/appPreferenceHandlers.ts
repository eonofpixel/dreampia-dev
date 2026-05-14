import { ipcMain } from 'electron';
import { z } from 'zod';
import { LEVEL_CAPABILITIES } from '@/permission';
import { PermissionLevelSchema, type PermissionLevel } from '@/types';
import {
  LANGUAGE_VALUES,
  THEME_VALUES,
  readSettings,
  writeSettings,
  type DefaultProviderChoice,
  type LanguageChoice,
  type ThemeChoice,
} from '../settings';
import type { Result } from '../types';

function toErrorMessage(err: unknown): string {
  if (err instanceof z.ZodError) {
    return `Validation error: ${err.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ')}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

function fail(err: unknown): { ok: false; error: string } {
  return { ok: false, error: toErrorMessage(err) };
}

export function registerAppPreferenceHandlers(): void {
  ipcMain.handle('app:get-default-provider', (): Result<DefaultProviderChoice> => {
    try {
      const settings = readSettings();
      return ok(settings.default_provider ?? 'auto');
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('app:set-default-provider', (_evt, raw: unknown): Result<void> => {
    try {
      if (raw !== 'auto' && raw !== 'claude' && raw !== 'codex' && raw !== 'mock') {
        throw new Error('default_provider must be one of: auto, claude, codex, mock');
      }
      writeSettings({ default_provider: raw });
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('app:get-default-permission-level', (): Result<PermissionLevel> => {
    try {
      const settings = readSettings();
      return ok(settings.default_permission_level ?? 'workspace_write');
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('app:set-default-permission-level', (_evt, raw: unknown): Result<void> => {
    try {
      const validated = PermissionLevelSchema.parse(raw);
      writeSettings({ default_permission_level: validated });
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('app:get-theme', (): Result<ThemeChoice> => {
    try {
      const settings = readSettings();
      return ok(settings.theme ?? 'system');
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('app:set-theme', (_evt, raw: unknown): Result<void> => {
    try {
      if (typeof raw !== 'string' || !(THEME_VALUES as readonly string[]).includes(raw)) {
        throw new Error(`theme must be one of: ${THEME_VALUES.join(', ')}`);
      }
      writeSettings({ theme: raw as ThemeChoice });
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    'app:get-plugin-security',
    (): Result<{
      mcpVerificationMode: 'strict' | 'warn' | 'off';
      pluginIsolationMode: 'utility_process' | 'in_process' | 'auto';
      mcpRevocationFeedPublisher: { issuer: string; subject_pattern: string } | null;
    }> => {
      try {
        const s = readSettings();
        return ok({
          mcpVerificationMode: s.mcpVerificationMode ?? 'strict',
          pluginIsolationMode: s.pluginIsolationMode ?? 'utility_process',
          mcpRevocationFeedPublisher: s.mcpRevocationFeedPublisher ?? null,
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle('app:set-mcp-verification-mode', (_evt, raw: unknown): Result<void> => {
    try {
      if (raw !== 'strict' && raw !== 'warn' && raw !== 'off') {
        throw new Error("mcpVerificationMode must be one of: 'strict', 'warn', 'off'");
      }
      writeSettings({ mcpVerificationMode: raw });
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('app:set-plugin-isolation-mode', (_evt, raw: unknown): Result<void> => {
    try {
      if (raw !== 'utility_process' && raw !== 'in_process' && raw !== 'auto') {
        throw new Error(
          "pluginIsolationMode must be one of: 'utility_process', 'in_process', 'auto'"
        );
      }
      writeSettings({ pluginIsolationMode: raw });
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('app:set-mcp-revocation-feed-publisher', (_evt, raw: unknown): Result<void> => {
    try {
      if (raw === null || raw === undefined) {
        writeSettings({ mcpRevocationFeedPublisher: undefined });
        return ok(undefined);
      }
      if (typeof raw !== 'object') {
        throw new Error('mcpRevocationFeedPublisher must be { issuer, subject_pattern } or null');
      }
      const obj = raw as Record<string, unknown>;
      if (typeof obj['issuer'] !== 'string' || obj['issuer'].length === 0) {
        throw new Error("'issuer' must be non-empty URL string");
      }
      if (typeof obj['subject_pattern'] !== 'string' || obj['subject_pattern'].length === 0) {
        throw new Error("'subject_pattern' must be non-empty string");
      }
      new URL(obj['issuer']);
      writeSettings({
        mcpRevocationFeedPublisher: {
          issuer: obj['issuer'],
          subject_pattern: obj['subject_pattern'],
        },
      });
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('app:get-language', (): Result<LanguageChoice> => {
    try {
      const settings = readSettings();
      return ok(settings.language ?? 'ko');
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('app:set-language', (_evt, raw: unknown): Result<void> => {
    try {
      if (typeof raw !== 'string' || !(LANGUAGE_VALUES as readonly string[]).includes(raw)) {
        throw new Error(`language must be one of: ${LANGUAGE_VALUES.join(', ')}`);
      }
      writeSettings({ language: raw as LanguageChoice });
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    'app:get-permission-capabilities',
    (): Result<Record<PermissionLevel, string[]>> => {
      try {
        const out: Record<PermissionLevel, string[]> = {
          read_only: Array.from(LEVEL_CAPABILITIES.read_only),
          workspace_write: Array.from(LEVEL_CAPABILITIES.workspace_write),
          full_access: Array.from(LEVEL_CAPABILITIES.full_access),
          custom: Array.from(LEVEL_CAPABILITIES.custom),
        };
        return ok(out);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    'app:get-direct-api-keys',
    (): Result<{
      anthropic: { present: boolean; preview: string | null };
      openai: { present: boolean; preview: string | null };
    }> => {
      try {
        const settings = readSettings();
        const previewOf = (key: string | undefined): string | null => {
          if (typeof key !== 'string' || key.length === 0) return null;
          if (key.length <= 4) return '****';
          return key.slice(-4);
        };
        return ok({
          anthropic: {
            present:
              typeof settings.api_key_anthropic === 'string' &&
              settings.api_key_anthropic.length > 0,
            preview: previewOf(settings.api_key_anthropic),
          },
          openai: {
            present:
              typeof settings.api_key_openai === 'string' && settings.api_key_openai.length > 0,
            preview: previewOf(settings.api_key_openai),
          },
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    'app:set-direct-api-key',
    (_evt, rawProvider: unknown, rawKey: unknown): Result<void> => {
      try {
        if (rawProvider !== 'anthropic' && rawProvider !== 'openai') {
          throw new Error("provider must be 'anthropic' or 'openai'");
        }
        if (typeof rawKey !== 'string') {
          throw new Error('key must be a string (empty string clears)');
        }
        if (rawKey.length > 1024) {
          throw new Error('key too long (max 1024 chars)');
        }
        const trimmed = rawKey.trim();
        if (rawProvider === 'anthropic') {
          writeSettings({ api_key_anthropic: trimmed.length === 0 ? undefined : trimmed });
        } else {
          writeSettings({ api_key_openai: trimmed.length === 0 ? undefined : trimmed });
        }
        return ok(undefined);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle('app:get-keyboard-shortcuts', (): Result<Record<string, string>> => {
    try {
      const settings = readSettings();
      return ok(settings.keyboard_shortcut_overrides ?? {});
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('app:set-keyboard-shortcuts', (_evt, raw: unknown): Result<void> => {
    try {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('keyboard_shortcut_overrides must be a plain object');
      }
      const obj = raw as Record<string, unknown>;
      const validated: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (typeof k !== 'string' || k.length === 0) continue;
        if (typeof v !== 'string' || v.length === 0) continue;
        if (k.length > 64) continue;
        if (v.length > 64) continue;
        validated[k] = v;
      }
      writeSettings({ keyboard_shortcut_overrides: validated });
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });
}
