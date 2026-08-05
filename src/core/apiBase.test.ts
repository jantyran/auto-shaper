import { describe, it, expect, beforeEach } from 'vitest';
import { getApiBase, setApiBase, apiUrl } from './apiBase';

// vitest(node環境)には localStorage が無いので簡易モックを差す
const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

describe('apiBase', () => {
  it('未設定なら相対パスのまま', () => {
    expect(getApiBase()).toBe('');
    expect(apiUrl('/api/auth/login')).toBe('/api/auth/login');
  });

  it('設定すると絶対URLを前置し、末尾スラッシュは除去する', () => {
    setApiBase('http://localhost:8787/');
    expect(getApiBase()).toBe('http://localhost:8787');
    expect(apiUrl('/api/auth/login')).toBe('http://localhost:8787/api/auth/login');
  });

  it('空文字で解除すると相対パスへ戻る', () => {
    setApiBase('http://example:1234');
    setApiBase('');
    expect(getApiBase()).toBe('');
    expect(apiUrl('/api/schemas')).toBe('/api/schemas');
  });
});
