/**
 * アプリ全体の状態管理(zustand)。
 * ステップ: 1.ソース投入 → 2.ターゲット選択 → 3.マッピング確認/修正 → 4.実行/出力
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
import {
  getPresetById,
  schemaFromUploadedHeader,
} from '../core/targetSchemas';

export type Step = 'source' | 'target' | 'mapping' | 'result';

interface AppState {
  step: Step;
  source?: SourceDataset;
  target?: TargetSchema;
  mapping?: MappingConfig;
  transformedRows?: Record<string, string>[];
  isSuggesting: boolean;
  isTransforming: boolean;
  transformProgress: number; // 0-1
  error?: string;

  // actions
  loadSource: (fileName: string, data: ArrayBuffer) => void;
  selectPreset: (id: string) => Promise<void>;
  loadUploadedTarget: (fileName: string, data: ArrayBuffer) => Promise<void>;
  updateFieldMapping: (targetKey: string, mapping: FieldMapping) => void;
  setTransformState: (
    partial: Partial<
      Pick<AppState, 'isTransforming' | 'transformProgress' | 'transformedRows' | 'step'>
    >,
  ) => void;
  goTo: (step: Step) => void;
  reset: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  step: 'source',
  isSuggesting: false,
  isTransforming: false,
  transformProgress: 0,

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

  selectPreset: async (id) => {
    const target = getPresetById(id);
    if (!target) return;
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

  goTo: (step) => set({ step }),

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
