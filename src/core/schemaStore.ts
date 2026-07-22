/**
 * ユーザー定義のインポート先テンプレート(ターゲットスキーマ)の永続化。
 *
 * 整形プロセスとは独立した「テンプレート管理」機能。
 * ブラウザ完結の方針に合わせ、localStorage に保存する(サーバー不要)。
 * プリセット(PRESET_SCHEMAS)は読み取り専用で、ここでは編集しない。
 */
import type { DataType, TargetField, TargetSchema } from '../types';
import { PRESET_SCHEMAS } from './targetSchemas';

const STORAGE_KEY = 'auto-shaper.customSchemas.v1';

/** localStorage からユーザー定義スキーマを読み込む(壊れていたら空配列) */
export function loadCustomSchemas(): TargetSchema[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TargetSchema[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeSchema);
  } catch {
    return [];
  }
}

/** ユーザー定義スキーマを保存 */
export function saveCustomSchemas(schemas: TargetSchema[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schemas));
  } catch {
    // 保存失敗(容量超過等)は握りつぶす。呼び出し側は state を真とする。
  }
}

/** 1件を追加/更新して保存後、最新の一覧を返す */
export function upsertCustomSchema(schema: TargetSchema): TargetSchema[] {
  const list = loadCustomSchemas();
  const idx = list.findIndex((s) => s.id === schema.id);
  const next = sanitizeSchema({ ...schema, origin: 'custom' });
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  saveCustomSchemas(list);
  return list;
}

/** 1件を削除して保存後、最新の一覧を返す */
export function deleteCustomSchema(id: string): TargetSchema[] {
  const list = loadCustomSchemas().filter((s) => s.id !== id);
  saveCustomSchemas(list);
  return list;
}

/** プリセット + ユーザー定義 の全スキーマ */
export function getAllSchemas(custom: TargetSchema[]): TargetSchema[] {
  return [...PRESET_SCHEMAS, ...custom];
}

/** id からスキーマを解決(プリセット/ユーザー定義の両方を探索) */
export function findSchemaById(
  id: string,
  custom: TargetSchema[],
): TargetSchema | undefined {
  return getAllSchemas(custom).find((s) => s.id === id);
}

/** 一意なID */
function genId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 新規の空テンプレートを作る(1フィールドだけ用意) */
export function createEmptySchema(name = '新しいテンプレート'): TargetSchema {
  return {
    id: genId(),
    name,
    origin: 'custom',
    fields: [createEmptyField()],
  };
}

/** 新規の空フィールド */
export function createEmptyField(): TargetField {
  return { key: '', label: '', required: false, type: 'string', aliases: [] };
}

/** インポートしたJSONを、新しいIDを振った安全なテンプレートに変換する */
export function schemaFromImport(raw: unknown): TargetSchema {
  const s = sanitizeSchema((raw ?? {}) as TargetSchema);
  return { ...s, id: genId() };
}

/** プリセットを複製して編集可能なユーザーテンプレートにする */
export function duplicateSchema(src: TargetSchema): TargetSchema {
  return {
    id: genId(),
    name: `${src.name} のコピー`,
    origin: 'custom',
    fields: src.fields.map((f) => ({ ...f, aliases: [...f.aliases] })),
  };
}

const VALID_TYPES: DataType[] = [
  'string',
  'number',
  'date',
  'email',
  'phone',
  'url',
  'boolean',
  'empty',
];

/** 読み込んだデータの形を最低限整える(型安全化) */
function sanitizeSchema(s: TargetSchema): TargetSchema {
  return {
    id: String(s.id ?? genId()),
    name: String(s.name ?? '(無題)'),
    origin: 'custom',
    fields: Array.isArray(s.fields)
      ? s.fields.map((f) => ({
          key: String(f.key ?? ''),
          label: String(f.label ?? ''),
          required: Boolean(f.required),
          type: VALID_TYPES.includes(f.type) ? f.type : 'string',
          aliases: Array.isArray(f.aliases) ? f.aliases.map(String) : [],
          options: Array.isArray(f.options) ? f.options.map(String) : undefined,
        }))
      : [],
  };
}
