import { createTranslator } from '../core/i18n';
import { useMemo } from 'react';
import { Lightbulb, Repeat } from 'lucide-react';
import { useStore } from '../state/store';
import { PRESET_SCHEMAS, SCHEMA_CATEGORY_ORDER } from '../core/targetSchemas';
import { sortCustomSchemas } from '../core/schemaStore';
import { findMatchingRecipes } from '../core/recipes';
import { FileDrop } from './FileDrop';
import { SourceReadOptions } from './SourceReadOptions';
import { LookupPanel } from './LookupPanel';
import type { SchemaCategory, TargetSchema } from '../types';

/** ステップ2: インポート先フォーマット(ターゲットスキーマ)の選択 */
export function TargetSelector() {
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);

  const selectSchema = useStore((s) => s.selectSchema);
  const loadUploadedTarget = useStore((s) => s.loadUploadedTarget);
  const isSuggesting = useStore((s) => s.isSuggesting);
  const source = useStore((s) => s.source);
  const customSchemas = useStore((s) => s.customSchemas);
  const setView = useStore((s) => s.setView);
  const recipes = useStore((s) => s.recipes);
  const applyRecipe = useStore((s) => s.applyRecipe);
  const recipesEnabled = useStore((s) => s.settings.features.recipes);
  const schemaCategories = useStore((s) => s.settings.schemaCategories);
  const sortedCustomSchemas = useMemo(
    () => sortCustomSchemas(customSchemas),
    [customSchemas],
  );

  // 設定でONにしたカテゴリのプリセットだけを、カテゴリ順にまとめて出す
  const presetGroups = useMemo(() => {
    const enabled = new Set(schemaCategories);
    return SCHEMA_CATEGORY_ORDER.filter((c) => enabled.has(c))
      .map((category) => ({
        category,
        schemas: PRESET_SCHEMAS.filter((s) => s.category === category),
      }))
      .filter((g) => g.schemas.length > 0);
  }, [schemaCategories]);

  const matchingRecipes = useMemo(
    () =>
      source && recipesEnabled ? findMatchingRecipes(recipes, source) : [],
    [source, recipes, recipesEnabled],
  );

  return (
    <div className="panel" data-tour="tour-target-panel">
      <h2>{t('target.heading')}</h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        {t('target.description')}
      </p>

      {/* 読み込んだファイル・シートの一覧と件数は SourceReadOptions が出す */}
      {source && <SourceReadOptions />}
      {source && <LookupPanel />}

      {matchingRecipes.length > 0 && (
        <>
          <h3
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Lightbulb size={18} aria-hidden="true" />
            {t('target.recipes')}
          </h3>
          <p className="subtitle" style={{ marginBottom: 10 }}>
            {t('target.recipesHint')}
          </p>
          <div className="card-grid">
            {matchingRecipes.map((r) => (
              <button
                key={r.id}
                className="select-card"
                style={{ borderColor: 'var(--green)' }}
                onClick={() => applyRecipe(r)}
              >
                <span
                  className="name"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Repeat size={14} aria-hidden="true" />
                  {r.name}
                </span>
                <span className="meta">
                  {t('target.recipeFields', { count: r.mapping.fields.length })}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {isSuggesting && (
        <div className="alert info">{t('target.suggesting')}</div>
      )}

      {sortedCustomSchemas.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h3 style={{ flex: 1 }}>{t('target.custom')}</h3>
            <button
              className="ghost"
              style={{ padding: '4px 12px' }}
              onClick={() => setView('admin')}
            >
              {t('target.manage')}
            </button>
          </div>
          <div className="card-grid">
            {sortedCustomSchemas.map((schema) => (
              <button
                key={schema.id}
                className="select-card"
                disabled={isSuggesting}
                onClick={() => void selectSchema(schema.id)}
              >
                <span className="name">
                  {schema.name}
                  {schema.isDefault ? t('target.default') : ''}
                </span>
                <span className="meta">
                  {t('target.customFields', { count: schema.fields.length })}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <h3>{t('target.presets')}</h3>
      {presetGroups.length === 0 ? (
        <div className="alert info">{t('target.noCategories')}</div>
      ) : (
        presetGroups.map(({ category, schemas }) => (
          <PresetGroup
            key={category}
            category={category}
            schemas={schemas}
            disabled={isSuggesting}
            onSelect={(id) => void selectSchema(id)}
          />
        ))
      )}
      <p className="subtitle" style={{ margin: '4px 0 10px' }}>
        {t('target.moreCategories')}
      </p>

      <h3>{t('target.upload')}</h3>
      <p className="subtitle" style={{ marginBottom: 10 }}>
        {t('target.uploadIntro')}{' '}
        <button
          className="ghost"
          style={{ padding: '2px 8px', margin: '0 2px' }}
          onClick={() => setView('admin')}
        >
          {t('target.templateManager')}
        </button>{' '}
        {t('target.uploadEnd')}
      </p>
      <FileDrop
        title={t('target.dropTitle')}
        hint={t('target.dropHint')}
        onFile={(name, data) => void loadUploadedTarget(name, data)}
      />
    </div>
  );
}

/** プリセットをカテゴリ単位で見出しつきに並べる */
function PresetGroup({
  category,
  schemas,
  disabled,
  onSelect,
}: {
  category: SchemaCategory;
  schemas: TargetSchema[];
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);

  return (
    <section style={{ marginBottom: 14 }}>
      <div className="preset-group-head">
        <span className="preset-group-title">
          {t(`category.${category}.title`)}
        </span>
        <span className="preset-group-desc">
          {t(`category.${category}.description`)}
        </span>
      </div>
      <div className="card-grid">
        {schemas.map((schema) => (
          <button
            key={schema.id}
            className="select-card"
            disabled={disabled}
            onClick={() => onSelect(schema.id)}
          >
            <span className="name">{schema.name}</span>
            <span className="meta">
              {t('target.fields', { count: schema.fields.length })}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
