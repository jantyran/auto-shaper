import { useStore } from '../state/store';
import {
  defaultModelFor,
  type Locale,
  type FeatureFlags,
  type LlmProvider,
  type Settings,
} from '../core/settings';
import { createTranslator, type TranslationKey } from '../core/i18n';
import { PRESET_SCHEMAS, SCHEMA_CATEGORY_ORDER } from '../core/targetSchemas';
import { THEMES, type ThemeId } from '../core/theme';
import { AccountPanel } from './AccountPanel';

const FEATURE_LABELS: Record<
  keyof FeatureFlags,
  { title: TranslationKey; desc: TranslationKey }
> = {
  masking: {
    title: 'settings.feature.masking.title',
    desc: 'settings.feature.masking.description',
  },
  llm: {
    title: 'settings.feature.llm.title',
    desc: 'settings.feature.llm.description',
  },
  learningDictionary: {
    title: 'settings.feature.learningDictionary.title',
    desc: 'settings.feature.learningDictionary.description',
  },
  recipes: {
    title: 'settings.feature.recipes.title',
    desc: 'settings.feature.recipes.description',
  },
  duplicateDetection: {
    title: 'settings.feature.duplicateDetection.title',
    desc: 'settings.feature.duplicateDetection.description',
  },
};

/** 設定ページ: 機能ON/OFF・AI接続・マスキング */
export function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const user = useStore((s) => s.user);
  const update = useStore((s) => s.updateSettings);
  const refreshRecipes = useStore((s) => s.refreshRecipes);
  const recipes = useStore((s) => s.recipes);
  const renameRecipe = useStore((s) => s.renameRecipe);
  const removeRecipe = useStore((s) => s.removeRecipe);
  const learnedEntries = useStore((s) => s.learnedEntries);
  const clearLearning = useStore((s) => s.clearLearning);
  const t = createTranslator(settings.locale);

  const set = (patch: Partial<Settings>) => update({ ...settings, ...patch });
  const setFeature = (key: keyof FeatureFlags, value: boolean) => {
    update({ ...settings, features: { ...settings.features, [key]: value } });
    if (key === 'recipes') void refreshRecipes();
  };
  const setLlm = (patch: Partial<Settings['llm']>) =>
    set({ llm: { ...settings.llm, ...patch } });
  const toggleCategory = (category: string, on: boolean) => {
    const next = on
      ? [...settings.schemaCategories, category]
      : settings.schemaCategories.filter((c) => c !== category);
    set({ schemaCategories: next });
  };
  const setMasking = (patch: Partial<Settings['masking']>) =>
    set({ masking: { ...settings.masking, ...patch } });

  return (
    <>
      <AccountPanel />

      <div className="panel">
        <h2>{t('settings.language.title')}</h2>
        <p className="subtitle">{t('settings.language.description')}</p>
        <label className="field-label language-select">
          {t('language.label')}
          <select
            value={settings.locale}
            onChange={(e) => set({ locale: e.target.value as Locale })}
          >
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </label>
      </div>

      <div className="panel">
        <h2>{t('settings.features.title')}</h2>
        <p className="subtitle">{t('settings.features.description')}</p>
        {(Object.keys(FEATURE_LABELS) as (keyof FeatureFlags)[]).map((key) => (
          <ToggleRow
            key={key}
            title={t(FEATURE_LABELS[key].title)}
            desc={t(FEATURE_LABELS[key].desc)}
            checked={settings.features[key]}
            onChange={(v) => setFeature(key, v)}
          />
        ))}
      </div>

      <div className="panel">
        <h2>{t('settings.theme.title')}</h2>
        <p className="subtitle">{t('settings.theme.description')}</p>
        {(['light', 'dark'] as const).map((mode) => (
          <div key={mode} style={{ marginBottom: 14 }}>
            <div className="theme-group-label">
              {t(`settings.theme.${mode}`)}
            </div>
            <div className="theme-grid">
              {THEMES.filter((theme) => theme.mode === mode).map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={`theme-card${settings.theme === theme.id ? ' active' : ''}`}
                  aria-pressed={settings.theme === theme.id}
                  onClick={() => set({ theme: theme.id as ThemeId })}
                >
                  <span className="theme-swatch" aria-hidden="true">
                    {theme.preview.map((c) => (
                      <span key={c} style={{ background: c }} />
                    ))}
                  </span>
                  <span className="theme-name">
                    {t(`settings.theme.${theme.id}.name`)}
                  </span>
                  <span className="theme-desc">
                    {t(`settings.theme.${theme.id}.description`)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>{t('settings.schemaCategories.title')}</h2>
        <p className="subtitle">{t('settings.schemaCategories.description')}</p>
        {SCHEMA_CATEGORY_ORDER.map((category) => {
          const count = PRESET_SCHEMAS.filter(
            (s) => s.category === category,
          ).length;
          return (
            <ToggleRow
              key={category}
              title={t('settings.schemaCategories.itemTitle', {
                title: t(`category.${category}.title`),
                count: t('settings.schemaCategories.count', {
                  count: count.toLocaleString(settings.locale),
                }),
              })}
              desc={t(`category.${category}.description`)}
              checked={settings.schemaCategories.includes(category)}
              onChange={(v) => toggleCategory(category, v)}
            />
          );
        })}
      </div>

      <div className="panel">
        <h2>{t('settings.llm.title')}</h2>
        <p className="subtitle">{t('settings.llm.description')}</p>
        <div className="settings-grid">
          <label className="field-label">
            {t('settings.llm.provider')}
            <select
              value={settings.llm.provider}
              onChange={(e) => {
                const provider = e.target.value as LlmProvider;
                // プロバイダを変えたらモデルも既定値へ切り替える
                setLlm({ provider, model: defaultModelFor(provider) });
              }}
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Google (Gemini)</option>
            </select>
          </label>
          <label className="field-label">
            {t('settings.llm.model')}
            <input
              type="text"
              value={settings.llm.model}
              placeholder={defaultModelFor(settings.llm.provider)}
              onChange={(e) => setLlm({ model: e.target.value })}
            />
          </label>
          <label className="field-label" style={{ gridColumn: '1 / -1' }}>
            {t('settings.llm.apiKey')}
            <input
              type="password"
              value={settings.llm.apiKey}
              placeholder={
                settings.llm.provider === 'gemini'
                  ? 'AIza...'
                  : settings.llm.provider === 'openai'
                    ? 'sk-...'
                    : 'sk-ant-...'
              }
              autoComplete="off"
              onChange={(e) => setLlm({ apiKey: e.target.value })}
            />
          </label>
        </div>
        {settings.features.llm && !settings.llm.apiKey.trim() && (
          <div className="alert info" style={{ marginTop: 12 }}>
            {t('settings.llm.missingApiKey')}
          </div>
        )}
        {settings.features.llm && settings.llm.apiKey.trim() && !user && (
          <div className="alert info" style={{ marginTop: 12 }}>
            {t('settings.llm.signInRequired')}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>{t('settings.masking.title')}</h2>
        <p className="subtitle">{t('settings.masking.description')}</p>
        <ToggleRow
          title={t('settings.masking.personalInfo.title')}
          desc={t('settings.masking.personalInfo.description')}
          checked={settings.masking.maskPersonalInfo}
          onChange={(v) => setMasking({ maskPersonalInfo: v })}
        />
        <ToggleRow
          title={t('settings.masking.emails.title')}
          desc={t('settings.masking.emails.description')}
          checked={settings.masking.maskEmails}
          onChange={(v) => setMasking({ maskEmails: v })}
        />
        <ToggleRow
          title={t('settings.masking.phones.title')}
          desc={t('settings.masking.phones.description')}
          checked={settings.masking.maskPhones}
          onChange={(v) => setMasking({ maskPhones: v })}
        />
        <ToggleRow
          title={t('settings.masking.longNumbers.title')}
          desc={t('settings.masking.longNumbers.description')}
          checked={settings.masking.maskLongNumbers}
          onChange={(v) => setMasking({ maskLongNumbers: v })}
        />
        <ToggleRow
          title={t('settings.masking.noSamples.title')}
          desc={t('settings.masking.noSamples.description')}
          checked={!settings.masking.sendSampleValues}
          onChange={(v) => setMasking({ sendSampleValues: !v })}
        />

        <h3>{t('settings.masking.additional.title')}</h3>
        <p className="subtitle" style={{ marginBottom: 8 }}>
          {t('settings.masking.additional.description')}
        </p>
        <input
          type="text"
          style={{ width: '100%', maxWidth: 480 }}
          value={settings.masking.sensitiveColumns.join(', ')}
          placeholder={t('settings.masking.additional.placeholder')}
          onChange={(e) =>
            setMasking({
              sensitiveColumns: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s !== ''),
            })
          }
        />
      </div>

      {settings.features.recipes && (
        <div className="panel">
          <h2>{t('settings.recipes.title')}</h2>
          <p className="subtitle">{t('settings.recipes.description')}</p>
          {recipes.length === 0 ? (
            <div className="alert info">{t('settings.recipes.empty')}</div>
          ) : (
            recipes.map((r) => (
              <div key={r.id} className="toggle-row">
                <div>
                  <div className="toggle-title">{r.name}</div>
                  <div className="toggle-desc">
                    {t('settings.recipes.summary', {
                      fields: r.mapping.fields.length.toLocaleString(
                        settings.locale,
                      ),
                      columns: r.sourceColumns.length.toLocaleString(
                        settings.locale,
                      ),
                      date: new Date(r.updatedAt).toLocaleDateString(
                        settings.locale,
                      ),
                    })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => {
                      const name = prompt(
                        t('settings.recipes.renamePrompt'),
                        r.name,
                      );
                      if (name && name.trim())
                        void renameRecipe(r.id, name.trim());
                    }}
                  >
                    {t('settings.recipes.rename')}
                  </button>
                  <button
                    className="ghost"
                    onClick={() => {
                      if (
                        confirm(
                          t('settings.recipes.confirmDelete', { name: r.name }),
                        )
                      )
                        void removeRecipe(r.id);
                    }}
                  >
                    {t('settings.recipes.delete')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {settings.features.learningDictionary && (
        <div className="panel">
          <h2>{t('settings.learning.title')}</h2>
          <p className="subtitle">{t('settings.learning.description')}</p>
          <div className="stat-row" style={{ marginBottom: 12 }}>
            <div className="stat">
              <span className="val">{learnedEntries.length}</span>
              <span className="lbl">{t('settings.learning.entryCount')}</span>
            </div>
          </div>
          {learnedEntries.length > 0 && (
            <>
              <div className="table-wrap" style={{ marginBottom: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('settings.learning.sourceHeader')}</th>
                      <th>{t('settings.learning.destination')}</th>
                      <th>{t('settings.learning.count')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {learnedEntries
                      .slice()
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 20)
                      .map((e, i) => (
                        <tr key={i}>
                          <td>{e.header}</td>
                          <td>{e.targetKey}</td>
                          <td>{e.count}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <button
                className="ghost"
                onClick={() => {
                  if (confirm(t('settings.learning.confirmClear')))
                    clearLearning();
                }}
              >
                {t('settings.learning.clear')}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function ToggleRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="toggle-row">
      <div>
        <div className="toggle-title">{title}</div>
        <div className="toggle-desc">{desc}</div>
      </div>
      <button
        className={`switch${checked ? ' on' : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
      >
        <span className="knob" />
      </button>
    </div>
  );
}
