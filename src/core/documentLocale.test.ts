import { afterEach, describe, expect, test } from 'vitest';
import { syncDocumentLocale } from './documentLocale';

const originalDocument = globalThis.document;

afterEach(() => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: originalDocument,
  });
});

describe('syncDocumentLocale', () => {
  test('sets document language and title', () => {
    const documentElement = { lang: '' };
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { documentElement, title: '' },
    });

    syncDocumentLocale('en');

    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('Auto Shaper — Data shaping');
  });
});
