/**
 * ユーザー設定。管理エリアの「設定」ページから変更する。
 * 機能のON/OFF、AI(LLM)接続、マスキングの各設定を保持し localStorage に永続化する。
 *
 * APIキーなどの機微情報を含むため、設定はサーバー(SQLite)には送らず
 * このブラウザ内(localStorage)にのみ保存する。
 */
import { DEFAULT_THEME, normalizeTheme, type ThemeId } from './theme';

export interface FeatureFlags {
  /** マッピングのレシピ保存・再適用 */
  recipes: boolean;
  /** 修正履歴から学習してサジェスト精度を上げる */
  learningDictionary: boolean;
  /** 重複行の検出・名寄せ */
  duplicateDetection: boolean;
  /** LLM によるマッピング推論 */
  llm: boolean;
  /** AI に渡す前のマスキング */
  masking: boolean;
}

export type LlmProvider = 'anthropic' | 'openai' | 'gemini';

export interface LlmSettings {
  provider: LlmProvider;
  /** APIキー(このブラウザにのみ保存) */
  apiKey: string;
  model: string;
}

/** プロバイダごとの既定モデル(プロバイダ切替時の初期値・プレースホルダに使う) */
export function defaultModelFor(provider: LlmProvider): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4o';
    case 'gemini':
      return 'gemini-2.5-flash';
    default:
      return 'claude-sonnet-5';
  }
}

export interface MaskingSettings {
  /**
   * 個人情報に分類される列(氏名・会社名・メール・電話・住所など)を
   * 自動判定して伏字にする。既定でON。
   */
  maskPersonalInfo: boolean;
  /** メールアドレスをマスク(パターン検出) */
  maskEmails: boolean;
  /** 電話番号をマスク(パターン検出) */
  maskPhones: boolean;
  /** 5桁以上の連続数字(ID/口座等)をマスク */
  maskLongNumbers: boolean;
  /** サンプル値を一切送らず、列名と型だけを AI に渡す(最も安全) */
  sendSampleValues: boolean;
  /** ユーザーが追加で完全伏字にする列名 */
  sensitiveColumns: string[];
}

export interface Settings {
  features: FeatureFlags;
  llm: LlmSettings;
  masking: MaskingSettings;
  /**
   * インポート先選択画面に出す内蔵プリセットのカテゴリ(`SchemaCategory`)。
   * 既定は CRM と MA のみ。設定でONにしたカテゴリだけを追加で表示する
   * (最初から全部見せると選択肢が多すぎるため)。
   */
  schemaCategories: string[];
  /** 配色テーマ(`core/theme.ts` の ThemeId) */
  theme: ThemeId;
}

export const DEFAULT_SETTINGS: Settings = {
  features: {
    recipes: true,
    learningDictionary: true,
    duplicateDetection: true,
    llm: false,
    masking: true,
  },
  schemaCategories: ['crm', 'ma'],
  theme: DEFAULT_THEME,
  llm: {
    provider: 'anthropic',
    apiKey: '',
    model: 'claude-sonnet-5',
  },
  masking: {
    maskPersonalInfo: true,
    maskEmails: true,
    maskPhones: true,
    maskLongNumbers: true,
    sendSampleValues: true,
    sensitiveColumns: [],
  },
};

const STORAGE_KEY = 'auto-shaper.settings.v1';

/** 保存済み設定を読み込む(欠損はデフォルトで補完) */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return mergeSettings(parsed);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

/** 設定を保存 */
export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* 保存失敗は握りつぶす */
  }
}

/** デフォルトに保存値を重ねて前方互換を保つ */
export function mergeSettings(partial: Partial<Settings>): Settings {
  return {
    features: { ...DEFAULT_SETTINGS.features, ...(partial.features ?? {}) },
    llm: { ...DEFAULT_SETTINGS.llm, ...(partial.llm ?? {}) },
    masking: {
      ...DEFAULT_SETTINGS.masking,
      ...(partial.masking ?? {}),
      sensitiveColumns: Array.isArray(partial.masking?.sensitiveColumns)
        ? partial.masking!.sensitiveColumns.map(String)
        : [],
    },
    schemaCategories: Array.isArray(partial.schemaCategories)
      ? partial.schemaCategories.map(String)
      : structuredClone(DEFAULT_SETTINGS.schemaCategories),
    theme: normalizeTheme(partial.theme),
  };
}
