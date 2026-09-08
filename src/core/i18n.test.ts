import { describe, expect, test } from 'vitest';
import { createTranslator, messages } from './i18n';

test('has identical English and Japanese keys', () => {
  expect(Object.keys(messages.en).sort()).toEqual(
    Object.keys(messages.ja).sort(),
  );
});

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

  test('interpolates typed values into translated messages', () => {
    expect(createTranslator('en')('status.rows', { count: 3 })).toBe(
      '3 rows processed',
    );
    expect(createTranslator('ja')('status.rows', { count: 3 })).toBe(
      '3行を処理しました',
    );
  });
});
