/**
 * Renderer localStorage helpers.
 *
 * localStorage is an optional UI preference cache in this app. Browser privacy
 * modes, quota limits, or isolated test environments can throw on access, so
 * callers should get an explicit null/false result instead of repeating
 * try/catch blocks at each preference boundary.
 */

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readLocalStorage(key: string): string | null {
  const storage = getLocalStorage();
  if (storage === null) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocalStorage(key: string, value: string): boolean {
  const storage = getLocalStorage();
  if (storage === null) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeLocalStorage(key: string): boolean {
  const storage = getLocalStorage();
  if (storage === null) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function readLocalStorageJson(key: string): unknown | null {
  const raw = readLocalStorage(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
