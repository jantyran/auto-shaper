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

export type Step = 'source' | 'target' | 'mapping' | 'result';
export type View = 'app' | 'admin';

interface AppState {
  view: View;
  step: Step;
  source?: SourceDataset;
  target?: TargetSchema;
  mapping?: MappingConfig;
  transformedRows?: Record<string, string>[];
  /** ユーザーが管理ページで作成したテンプレート */
  customSchemas: TargetSchema[];
  /** テンプレートの保存先(SQLite API / ブラウザのlocalStorage) */
  storageMode: StorageMode | 'unknown';
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
}

export const useStore = create<AppState>((set, get) => ({
  view: 'app',
  step: 'source',
  // まず localStorage から即時に読み込み(初回描画を待たせない)、後で refreshSchemas で同期
  customSchemas: loadCustomSchemas(),
  storageMode: 'unknown',
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

  loadSource: (fileName, data) => {
    try {
      const source = parseWorkbook(fileName, data);
      if (source.columns.length === 0) {
        set({ error: 'カラムを検出できませんでした。ヘッダー行があるか確認してください。' });
        return;
      }
      set({ source, step: 'target', error: undefined });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'ファイルの読み込みに失敗しました。' });
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
      const parsed = parseWorkbook(fileName, data);
      const target = schemaFromUploadedHeader(parsed);
      await runSuggestion(set, get, target);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'ターゲットの読み込みに失敗しました。' });
    }
  },

  updateFieldMapping: (targetKey, mapping) => {
    const { mapping: config } = get();
    if (!config) return;
    const fields = config.fields.map((f) =>
      f.targetKey === targetKey ? mapping : f,
    );
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
}));

/** ターゲット確定 → 匿名化 → サジェスト実行 → マッピング画面へ */
async function runSuggestion(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  target: TargetSchema,
) {
  const source = get().source;
  if (!source) return;
  set({ isSuggesting: true, target, error: undefined });
  try {
    // 実データは渡さず、匿名化済みコンテキストのみを推論器に渡す
    const ctx = buildSuggestContext(source.columns, target);
    const mapping = await heuristicSuggester.suggest(ctx);
    set({ mapping, step: 'mapping', isSuggesting: false });
  } catch (e) {
    set({
      isSuggesting: false,
      error: e instanceof Error ? e.message : 'サジェストに失敗しました。',
    });
  }
}
