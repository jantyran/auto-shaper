import { useEffect, useState } from 'react';
import { useStore, type Step } from './state/store';
import { FileDrop } from './components/FileDrop';
import { TargetSelector } from './components/TargetSelector';
import { MappingEditor } from './components/MappingEditor';
import { ResultView } from './components/ResultView';
import { SchemaAdmin } from './components/SchemaAdmin';
import { SettingsPage } from './components/Settings';
import { TextShaper } from './components/TextShaper';
import { AuthBadge } from './components/AuthBadge';
import { FormulaReference } from './components/FormulaReference';
import { GuidedTour } from './components/GuidedTour';
import { EntranceScreen } from './components/EntranceScreen';
import { LanguagePicker } from './components/LanguagePicker';
import { createTranslator } from './core/i18n';
import { syncDocumentLocale } from './core/documentLocale';
import { hasSavedLocale, type Locale } from './core/settings';

export function App() {
  const entranceActive = useStore((s) => s.entranceActive);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const step = useStore((s) => s.step);
  const error = useStore((s) => s.error);
  const sizeWarning = useStore((s) => s.sizeWarning);
  const refreshSchemas = useStore((s) => s.refreshSchemas);
  const refreshRecipes = useStore((s) => s.refreshRecipes);
  const refreshLearning = useStore((s) => s.refreshLearning);
  const refreshAuth = useStore((s) => s.refreshAuth);
  const startTour = useStore((s) => s.startTour);
  const demoActive = useStore((s) => s.demoActive);
  const reset = useStore((s) => s.reset);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const [showLanguagePicker, setShowLanguagePicker] = useState(
    () => !hasSavedLocale(),
  );
  const t = createTranslator(settings.locale);
  const appAccessibilityProps = showLanguagePicker
    ? { inert: '', 'aria-hidden': true }
    : {};
  const steps: { id: Step; label: string }[] = [
    { id: 'source', label: t('step.source') },
    { id: 'target', label: t('step.target') },
    { id: 'mapping', label: t('step.mapping') },
    { id: 'result', label: t('step.result') },
  ];

  const selectLocale = (locale: Locale) => {
    updateSettings({ ...settings, locale });
    setShowLanguagePicker(false);
  };

  // 起動時: 先に認証状態を復元してから、保存先を判定してテンプレート/レシピ/学習辞書を同期
  useEffect(() => {
    void (async () => {
      await refreshAuth();
      await refreshSchemas();
      await refreshRecipes();
      refreshLearning();
    })();
  }, [refreshAuth, refreshSchemas, refreshRecipes, refreshLearning]);

  useEffect(() => {
    syncDocumentLocale(settings.locale);
  }, [settings.locale]);

  return (
    <div className="app-shell">
      {showLanguagePicker && <LanguagePicker onSelect={selectLocale} />}
      <div className="app" {...appAccessibilityProps}>
        {entranceActive && <EntranceScreen />}
        <div className="app-header">
          <div className="app-header-top">
            <div className="app-brand">
              <h1>Auto Shaper</h1>
              <span className="tag">{t('app.tag')}</span>
            </div>
            <AuthBadge />
          </div>
          <nav className="topnav">
            <button
              className={view === 'app' ? 'navbtn active' : 'navbtn'}
              onClick={() => setView('app')}
            >
              {t('nav.table')}
            </button>
            <button
              className={view === 'text' ? 'navbtn active' : 'navbtn'}
              data-tour="tour-nav-text"
              onClick={() => setView('text')}
            >
              {t('nav.text')}
            </button>
            <button
              className={view === 'admin' ? 'navbtn active' : 'navbtn'}
              data-tour="tour-nav-admin"
              onClick={() => setView('admin')}
            >
              {t('nav.templates')}
            </button>
            <button
              className={view === 'formula' ? 'navbtn active' : 'navbtn'}
              data-tour="tour-nav-formula"
              onClick={() => setView('formula')}
            >
              {t('nav.formulas')}
            </button>
            <button
              className={view === 'settings' ? 'navbtn active' : 'navbtn'}
              onClick={() => setView('settings')}
            >
              {t('nav.settings')}
            </button>
            <button className="navbtn" onClick={() => startTour()}>
              {t('nav.tour')}
            </button>
          </nav>
        </div>
        <GuidedTour />
        {demoActive && (
          <div className="demo-banner">
            <span>{t('demo.banner')}</span>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                reset();
                setView('app');
              }}
            >
              {t('demo.startOwn')}
            </button>
          </div>
        )}
        <p className="subtitle">
          {view === 'app'
            ? t('view.app.description')
            : view === 'text'
              ? t('view.text.description')
              : view === 'admin'
                ? t('view.admin.description')
                : view === 'formula'
                  ? t('view.formula.description')
                  : t('view.settings.description')}
        </p>

        {error && <div className="alert error">{error}</div>}
        {sizeWarning && <div className="alert warn">{sizeWarning}</div>}

        {view === 'text' ? (
          <TextShaper />
        ) : view === 'admin' ? (
          <SchemaAdmin />
        ) : view === 'formula' ? (
          <FormulaReference />
        ) : view === 'settings' ? (
          <SettingsPage />
        ) : (
          <>
            <Stepper current={step} steps={steps} />
            {step === 'source' && <SourceStep />}
            {step === 'target' && <TargetSelector />}
            {step === 'mapping' && <MappingStep />}
            {step === 'result' && <ResultStep />}
          </>
        )}

        <footer className="app-footer">
          <span>{t('footer.by')}</span>
          <span aria-hidden="true">/</span>
          <a
            href="https://github.com/jantyran/auto-shaper"
            target="_blank"
            rel="noreferrer"
          >
            {t('footer.license')}
          </a>
        </footer>
      </div>
    </div>
  );
}

function Stepper({
  current,
  steps,
}: {
  current: Step;
  steps: { id: Step; label: string }[];
}) {
  const currentIdx = steps.findIndex((s) => s.id === current);
  return (
    <div className="stepper">
      {steps.map((s, i) => (
        <div
          key={s.id}
          className={`step${s.id === current ? ' active' : ''}${
            i < currentIdx ? ' done' : ''
          }`}
        >
          <span className="num">{i < currentIdx ? '✓' : i + 1}</span>
          {s.label}
        </div>
      ))}
    </div>
  );
}

function SourceStep() {
  const loadSource = useStore((s) => s.loadSource);
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);
  return (
    <div className="panel">
      <h2>{t('source.heading')}</h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        {t('source.description')}
      </p>
      <div data-tour="tour-source-upload">
        <FileDrop
          title={t('source.dropTitle')}
          hint={t('source.dropHint')}
          multiple
          onFiles={(files) => void loadSource(files)}
        />
      </div>
      <div className="security-note">{t('source.security')}</div>
    </div>
  );
}

function MappingStep() {
  const goTo = useStore((s) => s.goTo);
  const target = useStore((s) => s.target);
  const mapping = useStore((s) => s.mapping);
  const source = useStore((s) => s.source);
  const recipesEnabled = useStore((s) => s.settings.features.recipes);
  const locale = useStore((s) => s.settings.locale);
  const saveCurrentAsRecipe = useStore((s) => s.saveCurrentAsRecipe);
  const t = createTranslator(locale);

  const requiredUnmet =
    target && mapping
      ? target.fields.some((f) => {
          if (!f.required) return false;
          const m = mapping.fields.find((x) => x.targetKey === f.key);
          return !m || m.transform.kind === 'empty';
        })
      : false;

  const handleSaveRecipe = () => {
    const suggested = `${source?.fileName ?? t('mapping.recipe.defaultName')} → ${target?.name ?? ''}`;
    const name = prompt(t('mapping.recipe.prompt'), suggested);
    if (name && name.trim()) void saveCurrentAsRecipe(name.trim());
  };

  return (
    <>
      <MappingEditor />
      <div className="btn-row">
        <button className="ghost" onClick={() => goTo('target')}>
          {t('mapping.backToTarget')}
        </button>
        {recipesEnabled && (
          <button className="ghost" onClick={handleSaveRecipe}>
            {t('mapping.saveRecipe')}
          </button>
        )}
        <div className="spacer" />
        <button
          className="primary"
          data-tour="tour-mapping-convert"
          disabled={requiredUnmet}
          title={requiredUnmet ? t('mapping.requiredHint') : ''}
          onClick={() => goTo('result')}
        >
          {t('mapping.convert')}
        </button>
      </div>
    </>
  );
}

function ResultStep() {
  const goTo = useStore((s) => s.goTo);
  const reset = useStore((s) => s.reset);
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);
  return (
    <>
      <ResultView />
      <div className="btn-row">
        <button className="ghost" onClick={() => goTo('mapping')}>
          {t('result.backToMapping')}
        </button>
        <div className="spacer" />
        <button className="ghost" onClick={reset}>
          {t('result.reset')}
        </button>
      </div>
    </>
  );
}
