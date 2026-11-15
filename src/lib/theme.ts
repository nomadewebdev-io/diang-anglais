import { ThemePreference } from './types';

export const THEME_COLOR_LIGHT = '#0F4C3A';
export const THEME_COLOR_DARK = '#141817';

export function isValidThemePreference(val: unknown): val is ThemePreference {
  return val === 'light' || val === 'dark' || val === 'system';
}

export function getSystemPrefersDark(): boolean {
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  } catch {
    // Fallback if matchMedia is unavailable
  }
  return false;
}

export function resolveEffectiveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean = getSystemPrefersDark()
): 'light' | 'dark' {
  if (preference === 'dark') {
    return 'dark';
  }
  if (preference === 'light') {
    return 'light';
  }
  return systemPrefersDark ? 'dark' : 'light';
}

export function applyThemeToDocument(
  preference: ThemePreference,
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined,
  systemPrefersDark?: boolean
): 'light' | 'dark' {
  const effective = resolveEffectiveTheme(preference, systemPrefersDark);
  if (!doc) {
    return effective;
  }

  try {
    const root = doc.documentElement;
    if (effective === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.style.colorScheme = effective;

    const metaTheme = doc.querySelector('meta[name="theme-color"]');
    const targetColor = effective === 'dark' ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;
    if (metaTheme) {
      metaTheme.setAttribute('content', targetColor);
    }
  } catch {
    // Ignore DOM access errors in headless test environments
  }

  return effective;
}

export function subscribeToSystemThemeChanges(
  onSystemChange: (prefersDark: boolean) => void
): () => void {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return () => {};
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => {
      onSystemChange(Boolean(event.matches));
    };
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  } catch {
    // Ignore errors
  }
  return () => {};
}
