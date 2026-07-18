export type ColorMode = 'light' | 'dark';

export const COLOR_MODE_STORAGE_KEY = 'wiki-parchino-color-mode';

const themeColors: Record<ColorMode, string> = {
  light: '#1f7a4d',
  dark: '#15191d',
};

export function getStoredColorMode(): ColorMode | null {
  try {
    const stored = window.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

export function getSystemColorMode(): ColorMode {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getPreferredColorMode(): ColorMode {
  return getStoredColorMode() ?? getSystemColorMode();
}

export function applyColorMode(mode: ColorMode): void {
  document.documentElement.setAttribute('data-bs-theme', mode);
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', themeColors[mode]);
}

export function storeColorMode(mode: ColorMode): void {
  try {
    window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
  } catch {
    // The current page can still change theme when storage is unavailable.
  }
}

export function subscribeToSystemColorMode(listener: (mode: ColorMode) => void): () => void {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!media?.addEventListener) return () => undefined;
  const handleChange = (event: MediaQueryListEvent) => listener(event.matches ? 'dark' : 'light');
  media.addEventListener('change', handleChange);
  return () => media.removeEventListener('change', handleChange);
}
