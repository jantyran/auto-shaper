import { useRef, type KeyboardEvent } from 'react';
import { Globe } from 'lucide-react';
import type { Locale } from '../core/settings';
import { createTranslator } from '../core/i18n';

interface LanguagePickerProps {
  onSelect: (locale: Locale) => void;
}

/** 保存済みの表示言語がない初回訪問者にだけ表示する選択画面。 */
export function LanguagePicker({ onSelect }: LanguagePickerProps) {
  const t = createTranslator('en');
  const englishButtonRef = useRef<HTMLButtonElement>(null);
  const japaneseButtonRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Tab') return;

    if (event.shiftKey && document.activeElement === englishButtonRef.current) {
      event.preventDefault();
      japaneseButtonRef.current?.focus();
    }

    if (
      !event.shiftKey &&
      document.activeElement === japaneseButtonRef.current
    ) {
      event.preventDefault();
      englishButtonRef.current?.focus();
    }
  };

  return (
    <div
      className="language-picker-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="language-picker-title"
    >
      <div className="language-picker-card">
        <span className="entrance-mark" aria-hidden="true">
          <Globe size={32} />
        </span>
        <h1 id="language-picker-title">{t('language.choose')}</h1>
        <p>{t('language.description')}</p>
        <div className="language-picker-actions">
          <button
            type="button"
            className="primary"
            autoFocus
            ref={englishButtonRef}
            onKeyDown={handleKeyDown}
            onClick={() => onSelect('en')}
          >
            {t('language.english')}
          </button>
          <button
            type="button"
            className="ghost"
            ref={japaneseButtonRef}
            onKeyDown={handleKeyDown}
            onClick={() => onSelect('ja')}
          >
            {t('language.japanese')}
          </button>
        </div>
      </div>
    </div>
  );
}
