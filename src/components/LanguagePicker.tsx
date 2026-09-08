import type { Locale } from '../core/settings';
import { createTranslator } from '../core/i18n';

interface LanguagePickerProps {
  onSelect: (locale: Locale) => void;
}

/** 保存済みの表示言語がない初回訪問者にだけ表示する選択画面。 */
export function LanguagePicker({ onSelect }: LanguagePickerProps) {
  const t = createTranslator('en');
  return (
    <div
      className="language-picker-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="language-picker-title"
    >
      <div className="language-picker-card">
        <span className="entrance-mark" aria-hidden="true">
          🌐
        </span>
        <h1 id="language-picker-title">{t('language.choose')}</h1>
        <p>{t('language.description')}</p>
        <div className="language-picker-actions">
          <button
            type="button"
            className="primary"
            autoFocus
            onClick={() => onSelect('en')}
          >
            {t('language.english')}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => onSelect('ja')}
          >
            {t('language.japanese')}
          </button>
        </div>
      </div>
    </div>
  );
}
