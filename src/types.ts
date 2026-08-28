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

export type FieldInputKind = 'text' | 'textarea' | 'select';

/** インポート/整形の実行ごとにユーザーが補足する一時値 */
export interface ImportContextEntry {
  id: string;
  key: string;
  label: string;
  value: string;
}

export interface AutoFillCase {
  /** 条件判定に使う出力フィールドのキー */
  sourceFieldKey: string;
  op: ConditionOp;
  value: string;
  /** 条件に合致したときに入れるテンプレート文字列 */
  template: string;
}

export interface FieldAutoFillRule {
  /** if(...), contains(...) などを使う安全なミニ式。指定時は template/cases より優先する。 */
  expression?: string;
  /** 条件に合わない時、または条件が無い時に入れるテンプレート文字列 */
  template: string;
  /** 条件付きの自動記入。上から順に最初に合ったものを使う。 */
  cases?: AutoFillCase[];
  /** すでに値が入っている時も上書きするか */
  overwrite?: boolean;
}

/** パース済みのソースデータ全体 */
export interface SourceDataset {
  fileName: string;
  columns: SourceColumn[];
  /** 全行。key = カラム名, value = セルの文字列表現 */
  rows: Record<string, string>[];
  /** Excel の全シート名(複数シート時のシート選択に使う) */
  sheetNames?: string[];
  /** 現在読み込んでいるシート名 */
  activeSheet?: string;
  /** ヘッダーとして解釈した行(1始まり)。上のタイトル行や空行を飛ばした位置。 */
  headerRow?: number;
  /** ヘッダー行を自動判定したか(false ならユーザーが明示指定した) */
  headerRowAuto?: boolean;
  /** ヘッダー行を選び直すUI用の、シート先頭の生データ */
  previewRows?: string[][];
  /** シートの総行数(ヘッダー行の指定範囲の上限に使う) */
  sheetRowCount?: number;
}

/** インポート先(整形後)の1フィールド定義 */
export interface TargetField {
  /** システム上のキー(例: Company, LastName) */
  key: string;
  /** 画面表示名(例: 会社名)。空なら画面上は key を表示する。 */
  label: string;
  /** 必須項目か */
  required: boolean;
  /** 期待するデータ型(サジェスト精度向上に使用) */
  type: DataType;
  /** 入力UIの種類。未指定の旧データは options があれば select、なければ text として扱う。 */
  inputKind?: FieldInputKind;
  /** このフィールドを説明する別名・キーワード(サジェスト用) */
  aliases: string[];
  /**
   * 選択可能な固定値の候補。指定すると、マッピング画面の「固定値」で
   * プルダウンから選べる(自由入力での上書きも可能)。
   */
  options?: string[];
  /** 選択肢の表示ラベル。key は options の値、value は画面表示名。 */
  optionLabels?: Record<string, string>;
  /**
   * 既定の固定値。元データに対応する列が無い(未割当)場合、この値が
   * 自動で入る。ユーザーはマッピング画面で選択変更・上書きできる。
   */
  defaultValue?: string;
  /**
   * 取り込み先が受け付ける最大文字数。超えた行は検証で警告する。
   * (Salesforce 等は項目ごとに上限があり、1件でも超えるとインポートが失敗する)
   */
  maxLength?: number;
  /** 他の出力項目を参照して自動記入するルール。 */
  autoFill?: FieldAutoFillRule;
}

/**
 * 内蔵プリセットの分類。設定で表示するカテゴリを絞れるようにするためのもの。
 * ユーザー定義テンプレート(origin: 'custom' / 'uploaded')には付かない。
 */
export type SchemaCategory =
  'crm' | 'ma' | 'card' | 'recruit' | 'accounting' | 'logistics' | 'ads' | 'hr';

/** インポート先スキーマ(プリセット or アップロード) */
export interface TargetSchema {
  id: string;
  name: string;
  /** 出所: 内蔵プリセット / アップロード / ユーザーが管理ページで作成 */
  origin: 'preset' | 'uploaded' | 'custom';
  /** プリセットの分類(内蔵プリセットのみ)。設定で表示/非表示を切り替える単位。 */
  category?: SchemaCategory;
  /** 当てはめ先テンプレート選択時の表示順。未指定の旧データは読み込み時に補完する。 */
  sortOrder?: number;
  /** 当てはめ先テンプレート選択時に最初に選ぶテンプレート。ユーザー定義内で1件だけ有効。 */
  isDefault?: boolean;
  fields: TargetField[];
}

// ─────────────────────────────────────────────────────────────
// 変換ルール(JSONルールエンジン)
// ─────────────────────────────────────────────────────────────

/** セルの値を取り出す方法 */
export type Transform =
  /** 1つのソース列をそのまま使う */
  | { kind: 'direct'; source: string }
  /**
   * 複数のソース列を1つの項目にまとめる。
   *  - 単純結合(姓+名→氏名)
   *  - 改行区切り(separator に "\n")
   *  - 「項目名: 値」のラベル付き結合(withLabels)
   * CRM側に無い情報を備考等へまとめる用途にも使える。
   */
  | {
      kind: 'concat';
      sources: string[];
      /** 各値の区切り(改行 "\n" も可) */
      separator: string;
      /** 各値の前に元の項目名を付ける(例: "役職: 部長") */
      withLabels?: boolean;
      /** 項目名と値の区切り(既定 ": ")。withLabels 時のみ有効 */
      labelSeparator?: string;
      /** 項目名の表示ラベル上書き(キー=ソース列名)。未指定なら列名をそのまま使う */
      labels?: Record<string, string>;
    }
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
  /** 変換済みの出力行を参照してテンプレート文字列を組み立てる */
  | {
      kind: 'template';
      expression?: string;
      template: string;
      cases?: AutoFillCase[];
      overwrite?: boolean;
      fieldLabels?: Record<string, string>;
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
  'contains' | 'equals' | 'startsWith' | 'endsWith' | 'isEmpty' | 'notEmpty';

/** 値を取り出した後に適用する正規化処理。適用順に配列で保持 */
export type Normalizer =
  | 'trim'
  | 'toHalfWidth'
  | 'toFullWidth'
  | 'normalizeCompany' // (株)→株式会社 など
  | 'normalizePhone' // ハイフン等の統一
  | 'normalizeEmail' // trim + 小文字化
  | 'normalizeDate' // 2024/1/5・令和6年1月5日 → 2024-01-05
  | 'normalizeNumber' // ¥1,000・１０００ → 1000
  | 'upperCase'
  | 'lowerCase'
  | 'removeSpaces';

/** ターゲット1フィールドへのマッピング定義 */
/** 値の置換表の1行(`東京都` → `13` のような対応) */
export interface ValueMapEntry {
  /** 元データに現れる値。空白・全角半角・英字の大小は無視して照合する。 */
  from: string;
  /** 置き換え後の値 */
  to: string;
}

export interface FieldMapping {
  targetKey: string;
  transform: Transform;
  normalizers: Normalizer[];
  /** 値の置換表。Transform と正規化のあとに適用する。 */
  valueMap?: ValueMapEntry[];
  /**
   * 置換表のどれにも一致しなかった、空でない値の扱い。
   * 未指定なら元の値をそのまま通す。空文字を指定すると空欄にする。
   */
  valueMapFallback?: string;
  /** サジェスト時の確信度(0-1)。人手で確定したら 1 */
  confidence: number;
  /** サジェスト根拠の説明(UI表示用) */
  rationale?: string;
}

/** 変換設定全体。これがAIの出力物であり、変換エンジンの入力 */
/** 行の絞り込み条件1件分 */
export interface RowFilterRule {
  /** 判定に使う元データの列名 */
  column: string;
  op: ConditionOp;
  value: string;
}

/** 変換にかける行を絞り込む設定 */
export interface RowFilter {
  /** 条件に合う行を残すか、除くか */
  mode: 'include' | 'exclude';
  /** 条件が複数あるときの結合方法 */
  match: 'all' | 'any';
  rules: RowFilterRule[];
}

export interface MappingConfig {
  targetSchemaId: string;
  fields: FieldMapping[];
  /** 変換対象の行を絞り込む。未設定なら全行が対象。 */
  rowFilter?: RowFilter;
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
