/**
 * ユーザー定義のインポート先テンプレート(ターゲットスキーマ)の永続化。
 *
 * 整形プロセスとは独立した「テンプレート管理」機能。
 * ブラウザ完結の方針に合わせ、localStorage に保存する(サーバー不要)。
 * プリセット(PRESET_SCHEMAS)は読み取り専用で、ここでは編集しない。
 */
import type {
  DataType,
  FieldInputKind,
  TargetField,
  TargetSchema,
} from '../types';
import { PRESET_SCHEMAS } from './targetSchemas';

const STORAGE_KEY = 'auto-shaper.customSchemas.v1';

/** localStorage からユーザー定義スキーマを読み込む(壊れていたら空配列) */
export function loadCustomSchemas(): TargetSchema[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TargetSchema[];
    if (!Array.isArray(parsed)) return [];
    return normalizeCustomSchemas(parsed);
  } catch {
    return [];
  }
}

/** ユーザー定義スキーマを保存 */
export function saveCustomSchemas(schemas: TargetSchema[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(normalizeCustomSchemas(schemas)),
    );
  } catch {
    // 保存失敗(容量超過等)は握りつぶす。呼び出し側は state を真とする。
  }
}

/** 1件を追加/更新して保存後、最新の一覧を返す */
export function upsertCustomSchema(schema: TargetSchema): TargetSchema[] {
  const list = loadCustomSchemas();
  const idx = list.findIndex((s) => s.id === schema.id);
  const next = sanitizeSchema({
    ...schema,
    origin: 'custom',
    sortOrder:
      schema.sortOrder ??
      (idx >= 0 ? list[idx]?.sortOrder : nextSortOrder(list)),
  });
  if (next.isDefault) {
    for (const item of list) item.isDefault = item.id === next.id;
  }
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  const normalized = normalizeCustomSchemas(list);
  saveCustomSchemas(normalized);
  return normalized;
}

/** 1件を削除して保存後、最新の一覧を返す */
export function deleteCustomSchema(id: string): TargetSchema[] {
  const list = loadCustomSchemas().filter((s) => s.id !== id);
  const normalized = normalizeCustomSchemas(list);
  saveCustomSchemas(normalized);
  return normalized;
}

/** プリセット + ユーザー定義 の全スキーマ */
export function getAllSchemas(custom: TargetSchema[]): TargetSchema[] {
  return [...sortCustomSchemas(custom), ...PRESET_SCHEMAS];
}

/** ユーザー定義テンプレートの選択表示順 */
export function sortCustomSchemas(custom: TargetSchema[]): TargetSchema[] {
  return [...custom].sort((a, b) => {
    const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name, 'ja');
  });
}

/** 既定テンプレート。未設定なら表示順の先頭を返す。 */
export function getDefaultSchema(
  custom: TargetSchema[],
): TargetSchema | undefined {
  const sorted = sortCustomSchemas(custom);
  return sorted.find((s) => s.isDefault) ?? sorted[0] ?? PRESET_SCHEMAS[0];
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
  return {
    key: '',
    label: '',
    required: false,
    type: 'string',
    inputKind: 'text',
    aliases: [],
  };
}

/** インポートしたJSONを、新しいIDを振った安全なテンプレートに変換する */
export function schemaFromImport(raw: unknown): TargetSchema {
  const s = sanitizeSchema((raw ?? {}) as TargetSchema);
  return { ...s, id: genId(), isDefault: false, sortOrder: undefined };
}

/** プリセットを複製して編集可能なユーザーテンプレートにする */
export function duplicateSchema(src: TargetSchema): TargetSchema {
  return {
    id: genId(),
    name: `${src.name} のコピー`,
    origin: 'custom',
    sortOrder: undefined,
    isDefault: false,
    fields: src.fields.map((f) => ({
      ...f,
      aliases: [...f.aliases],
      options: f.options ? [...f.options] : undefined,
      optionLabels: f.optionLabels ? { ...f.optionLabels } : undefined,
    })),
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

const VALID_INPUT_KINDS: FieldInputKind[] = ['text', 'textarea', 'select'];

function sanitizeInputKind(raw: unknown, options?: string[]): FieldInputKind {
  if (VALID_INPUT_KINDS.includes(raw as FieldInputKind)) {
    return raw as FieldInputKind;
  }
  return options && options.length > 0 ? 'select' : 'text';
}

function sanitizeOptionLabels(
  raw: unknown,
  options?: string[],
): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || !options || options.length === 0) {
    return undefined;
  }
  const allowed = new Set(options);
  const out: Record<string, string> = {};
  for (const [value, label] of Object.entries(raw as Record<string, unknown>)) {
    const normalizedValue = String(value);
    const normalizedLabel = String(label ?? '').trim();
    if (
      allowed.has(normalizedValue) &&
      normalizedLabel &&
      normalizedLabel !== normalizedValue
    ) {
      out[normalizedValue] = normalizedLabel;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function nextSortOrder(list: TargetSchema[]): number {
  return (
    list.reduce((max, s, i) => {
      const order = Number.isFinite(s.sortOrder) ? Number(s.sortOrder) : i;
      return Math.max(max, order);
    }, -1) + 1
  );
}

export function normalizeCustomSchemas(
  schemas: TargetSchema[],
): TargetSchema[] {
  let defaultSeen = false;
  return schemas
    .map((schema, index) =>
      sanitizeSchema({
        ...schema,
        sortOrder: Number.isFinite(schema.sortOrder)
          ? Number(schema.sortOrder)
          : index,
      }),
    )
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((schema, index) => {
      const isDefault = Boolean(schema.isDefault && !defaultSeen);
      if (isDefault) defaultSeen = true;
      return { ...schema, sortOrder: index, isDefault };
    });
}

/** 読み込んだデータの形を最低限整える(型安全化) */
function sanitizeSchema(s: TargetSchema): TargetSchema {
  return {
    id: String(s.id ?? genId()),
    name: String(s.name ?? '(無題)'),
    origin: 'custom',
    sortOrder: Number.isFinite(s.sortOrder) ? Number(s.sortOrder) : undefined,
    isDefault: Boolean(s.isDefault),
    fields: Array.isArray(s.fields)
      ? s.fields.map((f) => {
          const options = Array.isArray(f.options)
            ? f.options.map(String).filter((o) => o.trim() !== '')
            : undefined;
          return {
            key: String(f.key ?? ''),
            label: String(f.label ?? ''),
            required: Boolean(f.required),
            type: VALID_TYPES.includes(f.type) ? f.type : 'string',
            inputKind: sanitizeInputKind(f.inputKind, options),
            aliases: Array.isArray(f.aliases) ? f.aliases.map(String) : [],
            options,
            optionLabels: sanitizeOptionLabels(f.optionLabels, options),
            defaultValue:
              f.defaultValue != null && f.defaultValue !== ''
                ? String(f.defaultValue)
                : undefined,
          };
        })
      : [],
  };
}
