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

  test('localizes settings controls, counts, and destructive confirmations', () => {
    const english = createTranslator('en') as (
      key: string,
      values?: Record<string, string | number>,
    ) => string;
    const japanese = createTranslator('ja') as (
      key: string,
      values?: Record<string, string | number>,
    ) => string;

    expect(english('settings.features.title')).toBe('Features');
    expect(japanese('settings.features.title')).toBe('機能のON/OFF');
    expect(english('settings.schemaCategories.count', { count: 3 })).toBe(
      '3 templates',
    );
    expect(japanese('settings.schemaCategories.count', { count: 3 })).toBe(
      '3件',
    );
    expect(
      english('settings.recipes.confirmDelete', { name: 'Quarterly import' }),
    ).toBe('Delete “Quarterly import”?');
    expect(
      japanese('settings.recipes.confirmDelete', { name: 'Quarterly import' }),
    ).toBe('「Quarterly import」を削除しますか？');
  });

  test('localizes account authentication controls and connection settings', () => {
    const english = createTranslator('en') as (
      key: string,
      values?: Record<string, string | number>,
    ) => string;
    const japanese = createTranslator('ja') as (
      key: string,
      values?: Record<string, string | number>,
    ) => string;

    expect(english('account.heading')).toBe('Account');
    expect(japanese('account.heading')).toBe('アカウント');
    expect(english('account.signIn')).toBe('Sign in');
    expect(japanese('account.signUp')).toBe('新規登録');
    expect(english('account.passwordInvalid')).toBe(
      'Password must be at least 8 characters.',
    );
    expect(japanese('account.passwordInvalid')).toBe(
      'パスワードは8文字以上にしてください。',
    );
    expect(english('account.connectionDetails')).toBe('Connection details');
    expect(japanese('account.connectionDetails')).toBe('接続先の詳細設定');
    expect(english('authBadge.signedInTitle')).toBe('Go to account settings');
    expect(japanese('authBadge.local')).toBe('ローカル');
  });
});
