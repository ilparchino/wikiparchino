const ACCESS_TOKEN_KEY = 'wiki-parchino-access-token';

let memoryToken: string | null = null;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readStoredToken(): string | null {
  try {
    return storage()?.getItem(ACCESS_TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return readStoredToken() || memoryToken;
}

export function setAccessToken(token: string): void {
  memoryToken = token;
  try {
    storage()?.setItem(ACCESS_TOKEN_KEY, token);
  } catch {
    // The in-memory token still supports browsers that block web storage.
  }
}

export function clearAccessToken(): void {
  const hadToken = getAccessToken() !== null;
  memoryToken = null;
  try {
    storage()?.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // There is no stored token to clear when storage is unavailable.
  }
  if (hadToken) listeners.forEach((listener) => listener());
}

export function subscribeToSessionLoss(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
