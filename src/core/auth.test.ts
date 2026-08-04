import { describe, it, expect } from 'vitest';
import { isValidEmail } from './auth';
import { defaultModelFor } from './settings';

describe('isValidEmail', () => {
  it('妥当なメールを受け入れる', () => {
    expect(isValidEmail('you@example.com')).toBe(true);
    expect(isValidEmail('a.b+c@sub.example.co.jp')).toBe(true);
  });
  it('不正なメールを弾く', () => {
    expect(isValidEmail('no-at-mark')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@example.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('defaultModelFor', () => {
  it('プロバイダごとの既定モデルを返す', () => {
    expect(defaultModelFor('anthropic')).toBe('claude-sonnet-5');
    expect(defaultModelFor('openai')).toBe('gpt-4o');
    expect(defaultModelFor('gemini')).toBe('gemini-2.5-flash');
  });
});
