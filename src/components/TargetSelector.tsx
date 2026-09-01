import { useMemo } from 'react';
import { useStore } from '../state/store';
import {
  PRESET_SCHEMAS,
  SCHEMA_CATEGORY_LABELS,
  SCHEMA_CATEGORY_ORDER,
} from '../core/targetSchemas';
import { sortCustomSchemas } from '../core/schemaStore';
import { findMatchingRecipes } from '../core/recipes';
import { FileDrop } from './FileDrop';
import { SourceReadOptions } from './SourceReadOptions';
import { LookupPanel } from './LookupPanel';
import type { SchemaCategory, TargetSchema } from '../types';

/** ステップ2: インポート先フォーマット(ターゲットスキーマ)の選択 */
export function TargetSelector() {
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
      <h2>2. インポート先フォーマットを選ぶ</h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        整形後のデータをどのフォーマットに合わせるかを指定します。
      </p>

      {/* 読み込んだファイル・シートの一覧と件数は SourceReadOptions が出す */}
      {source && <SourceReadOptions />}
      {source && <LookupPanel />}

      {matchingRecipes.length > 0 && (
        <>
          <h3>💡 この列構成に合うレシピが見つかりました</h3>
          <p className="subtitle" style={{ marginBottom: 10 }}>
            過去に保存したマッピングを、そのまま再適用できます。
          </p>
          <div className="card-grid">
            {matchingRecipes.map((r) => (
              <button
                key={r.id}
                className="select-card"
                style={{ borderColor: 'var(--green)' }}
                onClick={() => applyRecipe(r)}
              >
                <span className="name">🔁 {r.name}</span>
                <span className="meta">
                  {r.mapping.fields.length} 項目・レシピ適用
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {isSuggesting && (
        <div className="alert info">AIがマッピングを推論しています…</div>
      )}

      {sortedCustomSchemas.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h3 style={{ flex: 1 }}>あなたのテンプレート</h3>
            <button
              className="ghost"
              style={{ padding: '4px 12px' }}
              onClick={() => setView('admin')}
            >
              管理ページで編集
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
                  {schema.isDefault ? '（既定）' : ''}
                </span>
                <span className="meta">
                  {schema.fields.length} フィールド・ユーザー定義
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <h3>プリセットから選ぶ</h3>
      {presetGroups.length === 0 ? (
        <div className="alert info">
          表示するプリセットのカテゴリが選ばれていません。「設定 →
          テンプレートのカテゴリ」で使いたいカテゴリをONにしてください。
        </div>
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
        他の業務（会計・配送・広告レポートなど）のプリセットも用意しています。「設定
        → テンプレートのカテゴリ」から追加で表示できます。
      </p>

      <h3>独自フォーマットをアップロード</h3>
      <p className="subtitle" style={{ marginBottom: 10 }}>
        インポート用シート（見出し行のあるもの）をアップロードすると、その列構成を
        ターゲットとして使います。繰り返し使うなら
        <button
          className="ghost"
          style={{ padding: '2px 8px', margin: '0 2px' }}
          onClick={() => setView('admin')}
        >
          テンプレート管理
        </button>
        で保存しておくと便利です。
      </p>
      <FileDrop
        title="インポート用シートをドロップ"
        hint="CSV / Excel（ヘッダー行のみでもOK）"
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
  const { title, desc } = SCHEMA_CATEGORY_LABELS[category];
  return (
    <section style={{ marginBottom: 14 }}>
      <div className="preset-group-head">
        <span className="preset-group-title">{title}</span>
        <span className="preset-group-desc">{desc}</span>
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
            <span className="meta">{schema.fields.length} フィールド</span>
          </button>
        ))}
      </div>
    </section>
  );
}
