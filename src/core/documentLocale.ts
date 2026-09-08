import type { Locale } from './settings';
import { createTranslator } from './i18n';

export function syncDocumentLocale(locale: Locale): void {
  const t = createTranslator(locale);
  document.documentElement.lang = locale;
  document.title = t('document.title');
}
