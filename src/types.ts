/**
 * Auto Shaper — 中核となる型定義
 *
 * 設計方針:
 *  - 実データ(行の中身)はブラウザ内に留め、AI(推論器)にはカラム名と
 *    「匿名化されたサンプル」のみを渡す。
 *  - AIが生成/提案するのは MappingConfig(JSONルール)のみ。
 *  - 実データの全件変換は、この MappingConfig を解釈する
 *    ローカルの変換エンジン(core/transformEngine.ts)が行う。
 */

/** パース結果の1カラム分のメタ情報 */
export interface SourceColumn {
  /** 元ファイルのカラム名(見出し) */
  name: string;
  /** 推定データ型 */
  inferredType: DataType;
  /** 先頭数行のサンプル値(生データ。画面表示用でありAIには送らない) */
  sampleValues: string[];
  /** 空でないセルの割合(0-1) */
  fillRate: number;
}

export type DataType =
  | 'string'
  | 'number'
  | 'date'
  | 'email'
  | 'phone'
  | 'url'
  | 'boolean'
  | 'empty';

/** パース済みのソースデータ全体 */
export interface SourceDataset {
  fileName: string;
  columns: SourceColumn[];
  /** 全行。key = カラム名, value = セルの文字列表現 */
  rows: Record<string, string>[];
}

/** インポート先(整形後)の1フィールド定義 */
export interface TargetField {
  /** システム上のキー(例: Company, LastName) */
  key: string;
  /** 画面表示名(例: 会社名) */
  label: string;
  /** 必須項目か */
  required: boolean;
  /** 期待するデータ型(サジェスト精度向上に使用) */
  type: DataType;
  /** このフィールドを説明する別名・キーワード(サジェスト用) */
  aliases: string[];
  /** 選択肢(将来のバリデーション用。任意) */
  options?: string[];
}

/** インポート先スキーマ(プリセット or アップロード) */
export interface TargetSchema {
  id: string;
  name: string;
  /** 出所: 内蔵プリセット / アップロード / ユーザーが管理ページで作成 */
  origin: 'preset' | 'uploaded' | 'custom';
  fields: TargetField[];
}

// ─────────────────────────────────────────────────────────────
// 変換ルール(JSONルールエンジン)
// ─────────────────────────────────────────────────────────────

/** セルの値を取り出す方法 */
export type Transform =
  /** 1つのソース列をそのまま使う */
  | { kind: 'direct'; source: string }
  /** 複数のソース列を区切り文字で結合する(姓+名→氏名 など) */
  | { kind: 'concat'; sources: string[]; separator: string }
  /** 1つのソース列を区切りで分割し、指定インデックスを使う(氏名→姓 など) */
  | { kind: 'split'; source: string; delimiter: string; index: number }
  /** 全行に同じ固定値を入れる */
  | { kind: 'constant'; value: string }
  /** 条件分岐(if-then)。source の値を評価してマッピングする */
  | {
      kind: 'conditional';
      source: string;
      cases: ConditionalCase[];
      /** どのケースにも当てはまらないときの値(省略時は元の値) */
      fallback?: string;
    }
  /** どのソースにも紐付けない(空欄のまま) */
  | { kind: 'empty' };

export interface ConditionalCase {
  op: ConditionOp;
  /** 比較対象の値 */
  value: string;
  /** 条件に合致したとき出力する値 */
  then: string;
}

export type ConditionOp =
  | 'contains'
  | 'equals'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'notEmpty';

/** 値を取り出した後に適用する正規化処理。適用順に配列で保持 */
export type Normalizer =
  | 'trim'
  | 'toHalfWidth'
  | 'toFullWidth'
  | 'normalizeCompany' // (株)→株式会社 など
  | 'normalizePhone' // ハイフン等の統一
  | 'normalizeEmail' // trim + 小文字化
  | 'upperCase'
  | 'lowerCase'
  | 'removeSpaces';

/** ターゲット1フィールドへのマッピング定義 */
export interface FieldMapping {
  targetKey: string;
  transform: Transform;
  normalizers: Normalizer[];
  /** サジェスト時の確信度(0-1)。人手で確定したら 1 */
  confidence: number;
  /** サジェスト根拠の説明(UI表示用) */
  rationale?: string;
}

/** 変換設定全体。これがAIの出力物であり、変換エンジンの入力 */
export interface MappingConfig {
  targetSchemaId: string;
  fields: FieldMapping[];
}

// ─────────────────────────────────────────────────────────────
// 推論器(サジェスト)インターフェース — ローカル/LLMを差し替え可能に
// ─────────────────────────────────────────────────────────────

/** AIに渡す安全なコンテキスト(実データは含めない) */
export interface SuggestContext {
  /** ソースのカラム名と型のみ */
  columns: Pick<SourceColumn, 'name' | 'inferredType' | 'fillRate'>[];
  /** 匿名化された先頭数行サンプル(key=カラム名) */
  anonymizedSamples: Record<string, string>[];
  target: TargetSchema;
}

export interface MappingSuggester {
  readonly id: string;
  readonly label: string;
  suggest(ctx: SuggestContext): Promise<MappingConfig>;
}
