import { describe, expect, test, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  hasSavedLocale,
  loadSettings,
  saveSettings,
  type Settings,
} from './settings';

describe('locale settings', () => {
  test('uses English for settings that predate locale support', () => {
    const getItem = vi.fn(() => JSON.stringify({ theme: 'ledger-light' }));
    vi.stubGlobal('localStorage', { getItem });

    expect(loadSettings().locale).toBe('en');
    expect(hasSavedLocale()).toBe(false);
  });

  test('persists a selected locale', () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });

    saveSettings({ ...DEFAULT_SETTINGS, locale: 'ja' } as Settings);

    expect(loadSettings().locale).toBe('ja');
    expect(hasSavedLocale()).toBe(true);
  });
});
