import { describe, it, expect } from 'vitest';
import { DEFAULT_THEME, THEMES, normalizeTheme } from './theme';
import { DEFAULT_SETTINGS, mergeSettings } from './settings';

describe('配色テーマ', () => {
  it('既定は Ledger Light', () => {
    expect(DEFAULT_THEME).toBe('ledger-light');
    expect(DEFAULT_SETTINGS.theme).toBe('ledger-light');
  });

  it('明るい配色・暗い配色がそれぞれ用意されている', () => {
    expect(THEMES.filter((t) => t.mode === 'light').length).toBeGreaterThan(0);
    expect(THEMES.filter((t) => t.mode === 'dark').length).toBeGreaterThan(0);
  });

  it('テーマIDが重複していない', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('既知のテーマはそのまま通す', () => {
    for (const t of THEMES) expect(normalizeTheme(t.id)).toBe(t.id);
  });

  it('未知の値・壊れた値は既定へ落とす', () => {
    // 保存データが古い/壊れていても画面が真っ白にならないことを保証する
    expect(normalizeTheme('存在しないテーマ')).toBe(DEFAULT_THEME);
    expect(normalizeTheme(undefined)).toBe(DEFAULT_THEME);
    expect(normalizeTheme(null)).toBe(DEFAULT_THEME);
    expect(normalizeTheme(42)).toBe(DEFAULT_THEME);
  });

  it('テーマ設定が無い古い保存データには既定を補完する', () => {
    expect(mergeSettings({}).theme).toBe(DEFAULT_THEME);
  });

  it('保存済みのテーマは復元する', () => {
    expect(mergeSettings({ theme: 'orchid' }).theme).toBe('orchid');
  });
});
