/**
 * アプリ全体の状態管理(zustand)。
 * ビュー: 'app'(整形プロセス) / 'admin'(テンプレート管理)。
 * 整形プロセスのステップ: 1.ソース投入 → 2.ターゲット選択 → 3.マッピング確認/修正 → 4.実行/出力
 */
import { create } from 'zustand';
import type {
  FieldMapping,
  MappingConfig,
  SourceDataset,
  TargetSchema,
} from '../types';
import { parseWorkbook } from '../core/parse';
import { buildSuggestContext } from '../core/anonymize';
import { heuristicSuggester } from '../core/inference/heuristic';
import { schemaFromUploadedHeader } from '../core/targetSchemas';
import { getAllSchemas, loadCustomSchemas } from '../core/schemaStore';
import {
  detectStorageMode,
  listSchemas,
  persistSchema,
  removeSchemaFromRepo,
  type StorageMode,
} from '../core/schemaRepository';
import { loadSettings, saveSettings, type Settings } from '../core/settings';
import { llmSuggester } from '../core/inference/llm';
import {
  clearLearned,
  loadLearned,
  recordAssociation,
  type LearnedEntry,
} from '../core/learning';
import {
  createRecipe,
  deleteRecipe,
  listRecipes,
  saveRecipe as persistRecipe,
  type Recipe,
} from '../core/recipes';
import { findSchemaById } from '../core/schemaStore';

export type Step = 'source' | 'target' | 'mapping' | 'result';
export type View = 'app' | 'text' | 'admin' | 'settings';

interface AppState {
  view: View;
  step: Step;
  source?: SourceDataset;
  /** シート切替のためにアップロード生データを保持 */
  sourceRaw?: { fileName: string; data: ArrayBuffer };
  target?: TargetSchema;
  mapping?: MappingConfig;
  transformedRows?: Record<string, string>[];
  /** ユーザーが管理ページで作成したテンプレート */
  customSchemas: TargetSchema[];
  /** テンプレートの保存先(SQLite API / ブラウザのlocalStorage) */
  storageMode: StorageMode | 'unknown';
  /** ユーザー設定(機能ON/OFF・AI・マスキング) */
  settings: Settings;
  /** 保存済みマッピングレシピ */
  recipes: Recipe[];
  /** 学習辞書のエントリ(件数表示・管理用) */
  learnedEntries: LearnedEntry[];
  isSuggesting: boolean;
  isTransforming: boolean;
  transformProgress: number; // 0-1
  error?: string;

  // navigation
  setView: (view: View) => void;
  goTo: (step: Step) => void;

  /** 起動時: 保存先を判定してテンプレート一覧を読み込む */
  refreshSchemas: () => Promise<void>;

  // formatting process
  loadSource: (fileName: string, data: ArrayBuffer) => void;
  selectSheet: (sheetName: string) => void;
  selectSchema: (id: string) => Promise<void>;
  loadUploadedTarget: (fileName: string, data: ArrayBuffer) => Promise<void>;
  updateFieldMapping: (targetKey: string, mapping: FieldMapping) => void;
  setTransformState: (
    partial: Partial<
      Pick<AppState, 'isTransforming' | 'transformProgress' | 'transformedRows' | 'step'>
    >,
  ) => void;
  reset: () => void;

  // template management (admin)
  saveSchema: (schema: TargetSchema) => Promise<void>;
  removeSchema: (id: string) => Promise<void>;

  // settings
  updateSettings: (settings: Settings) => void;

  // recipes (mapping memory)
  refreshRecipes: () => Promise<void>;
  saveCurrentAsRecipe: (name: string) => Promise<void>;
  removeRecipe: (id: string) => Promise<void>;
  renameRecipe: (id: string, name: string) => Promise<void>;
  applyRecipe: (recipe: Recipe) => void;

  // learning dictionary
  refreshLearning: () => void;
  clearLearning: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  view: 'app',
  step: 'source',
  // まず localStorage から即時に読み込み(初回描画を待たせない)、後で refreshSchemas で同期
  customSchemas: loadCustomSchemas(),
  storageMode: 'unknown',
  settings: loadSettings(),
  recipes: [],
  learnedEntries: [],
  isSuggesting: false,
  isTransforming: false,
  transformProgress: 0,

  setView: (view) => set({ view, error: undefined }),
  goTo: (step) => set({ step }),

  refreshSchemas: async () => {
    const [mode, customSchemas] = await Promise.all([
      detectStorageMode(),
      listSchemas(),
    ]);
    set({ storageMode: mode, customSchemas });
  },

  loadSource: async (fileName, data) => {
    try {
      const source = await parseWorkbook(fileName, data);
      if (source.columns.length === 0) {
        set({ error: 'カラムを検出できませんでした。ヘッダー行があるか確認してください。' });
        return;
      }
      set({ source, sourceRaw: { fileName, data }, step: 'target', error: undefined });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'ファイルの読み込みに失敗しました。' });
    }
  },

  selectSheet: async (sheetName) => {
    const raw = get().sourceRaw;
    if (!raw) return;
    try {
      const source = await parseWorkbook(raw.fileName, raw.data, sheetName);
      // シートが変わると列構成も変わるため、下流(ターゲット/マッピング/結果)をリセット
      set({
        source,
        target: undefined,
        mapping: undefined,
        transformedRows: undefined,
        step: 'target',
        error: undefined,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'シートの読み込みに失敗しました。' });
    }
  },

  selectSchema: async (id) => {
    const target = getAllSchemas(get().customSchemas).find((s) => s.id === id);
    if (!target) {
      set({ error: 'テンプレートが見つかりませんでした。' });
      return;
    }
    if (target.fields.length === 0) {
      set({ error: 'このテンプレートには項目がありません。管理ページで項目を追加してください。' });
      return;
    }
    await runSuggestion(set, get, target);
  },

  loadUploadedTarget: async (fileName, data) => {
    try {
      const parsed = await parseWorkbook(fileName, data);
      const target = schemaFromUploadedHeader(parsed);
      await runSuggestion(set, get, target);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'ターゲットの読み込みに失敗しました。' });
    }
  },

  updateFieldMapping: (targetKey, mapping) => {
    const { mapping: config, settings } = get();
    if (!config) return;
    const fields = config.fields.map((f) =>
      f.targetKey === targetKey ? mapping : f,
    );
    // 学習: ユーザーが1列を直接割り当てたら「列名→ターゲット」を記録する
    if (
      settings.features.learningDictionary &&
      mapping.transform.kind === 'direct'
    ) {
      const learnedEntries = recordAssociation(mapping.transform.source, targetKey);
      set({ learnedEntries });
    }
    // マッピングを変えたら既存の変換結果は無効化し、再実行させる
    set({
      mapping: { ...config, fields },
      transformedRows: undefined,
      transformProgress: 0,
    });
  },

  setTransformState: (partial) => set(partial),

  reset: () =>
    set({
      step: 'source',
      source: undefined,
      target: undefined,
      mapping: undefined,
      transformedRows: undefined,
      transformProgress: 0,
      isTransforming: false,
      isSuggesting: false,
      error: undefined,
    }),

  saveSchema: async (schema) => {
    const customSchemas = await persistSchema(schema);
    set({ customSchemas });
  },

  removeSchema: async (id) => {
    const customSchemas = await removeSchemaFromRepo(id);
    set({ customSchemas });
  },

  updateSettings: (settings) => {
    saveSettings(settings);
    set({ settings });
  },

  refreshLearning: () => set({ learnedEntries: loadLearned() }),

  clearLearning: () => {
    clearLearned();
    set({ learnedEntries: [] });
  },

  refreshRecipes: async () => {
    if (!get().settings.features.recipes) {
      set({ recipes: [] });
      return;
    }
    set({ recipes: await listRecipes() });
  },

  saveCurrentAsRecipe: async (name) => {
    const { source, mapping } = get();
    if (!source || !mapping) return;
    const recipes = await persistRecipe(createRecipe(name, source, mapping));
    set({ recipes });
  },

  removeRecipe: async (id) => {
    set({ recipes: await deleteRecipe(id) });
  },

  renameRecipe: async (id, name) => {
    const recipe = get().recipes.find((r) => r.id === id);
    if (!recipe) return;
    const recipes = await persistRecipe({ ...recipe, name, updatedAt: Date.now() });
    set({ recipes });
  },

  applyRecipe: (recipe) => {
    const { customSchemas } = get();
    const target = findSchemaById(recipe.targetSchemaId, customSchemas);
    // レシピのマッピングをそのまま適用(確定済みなので確信度は1扱い)
    set({
      target,
      mapping: recipe.mapping,
      step: 'mapping',
      transformedRows: undefined,
      transformProgress: 0,
      error: target
        ? undefined
        : '元のテンプレートが見つかりません。マッピングだけ適用しました。',
    });
  },
}));

/** ターゲット確定 → マスキング → サジェスト実行 → マッピング画面へ */
async function runSuggestion(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  target: TargetSchema,
) {
  const { source, settings } = get();
  if (!source) return;
  set({ isSuggesting: true, target, error: undefined });
  try {
    // 実データは渡さず、設定に従ってマスキングしたコンテキストのみを推論器に渡す
    const ctx = buildSuggestContext(
      source.columns,
      target,
      settings.masking,
      settings.features.masking,
    );
    const learned = settings.features.learningDictionary ? loadLearned() : [];

    let mapping;
    let warning: string | undefined;
    if (settings.features.llm && settings.llm.apiKey.trim()) {
      try {
        mapping = await llmSuggester.suggest(ctx, settings.llm);
      } catch (e) {
        // LLM が失敗したらローカル推論にフォールバック
        mapping = await heuristicSuggester.suggest(ctx, learned);
        warning = `LLM推論に失敗したためローカル推論に切り替えました（${
          e instanceof Error ? e.message : ''
        }）`;
      }
    } else {
      mapping = await heuristicSuggester.suggest(ctx, learned);
    }
    set({ mapping, step: 'mapping', isSuggesting: false, error: warning });
  } catch (e) {
    set({
      isSuggesting: false,
      error: e instanceof Error ? e.message : 'サジェストに失敗しました。',
    });
  }
}
