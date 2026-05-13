import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readLocalStorage,
  readLocalStorageJson,
  removeLocalStorage,
  writeLocalStorage,
} from '../../src/renderer/utils/safeStorage';

describe('safeStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reads, writes, removes string values', () => {
    expect(writeLocalStorage('k', 'v')).toBe(true);
    expect(readLocalStorage('k')).toBe('v');
    expect(removeLocalStorage('k')).toBe(true);
    expect(readLocalStorage('k')).toBeNull();
  });

  it('parses JSON and returns null for missing or corrupt values', () => {
    expect(readLocalStorageJson('missing')).toBeNull();
    writeLocalStorage('json', JSON.stringify({ ok: true }));
    expect(readLocalStorageJson('json')).toEqual({ ok: true });
    writeLocalStorage('bad-json', '{bad');
    expect(readLocalStorageJson('bad-json')).toBeNull();
  });

  it('converts storage exceptions to null or false', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readLocalStorage('k')).toBeNull();
    expect(readLocalStorageJson('k')).toBeNull();
    expect(writeLocalStorage('k', 'v')).toBe(false);
    expect(removeLocalStorage('k')).toBe(false);
  });
});
