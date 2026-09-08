import { describe, expect, test } from 'vitest';
import { createTranslator } from './i18n';

describe('createTranslator', () => {
  test('returns English translations for application navigation', () => {
    const t = createTranslator('en');

    expect(t('nav.table')).toBe('Data shaping');
    expect(t('language.choose')).toBe('Choose your language');
  });

  test('returns Japanese translations for application navigation', () => {
    const t = createTranslator('ja');

    expect(t('nav.table')).toBe('表の整形');
    expect(t('language.choose')).toBe('言語を選択');
  });
});
