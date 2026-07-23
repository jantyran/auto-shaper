/**
 * 変換エンジン。
 * MappingConfig(JSONルール)を解釈して、ソース行 → ターゲット行へ変換する。
 * 純粋関数のみで構成し、プレビュー(メインスレッド)と全件処理(Web Worker)で共有する。
 *
 * 意図的に「eval / new Function による動的コード実行」は使わない。
 * 表現力は Transform 型で定義した範囲(結合/分割/固定値/条件分岐)に限定し、
 * データ破損・XSSリスクを排除する堅牢性を優先する。
 */
import type {
  ConditionalCase,
  FieldMapping,
  MappingConfig,
  Transform,
} from '../types';
import { applyNormalizers } from './normalize';

type Row = Record<string, string>;

function get(row: Row, key: string): string {
  const v = row[key];
  return v == null ? '' : String(v);
}

function evalCondition(value: string, c: ConditionalCase): boolean {
  const v = value ?? '';
  switch (c.op) {
    case 'contains':
      return v.includes(c.value);
    case 'equals':
      return v === c.value;
    case 'startsWith':
      return v.startsWith(c.value);
    case 'endsWith':
      return v.endsWith(c.value);
    case 'isEmpty':
      return v.trim() === '';
    case 'notEmpty':
      return v.trim() !== '';
    default:
      return false;
  }
}

/** 1フィールド分の Transform を評価して生の値を取り出す(正規化前) */
export function evalTransform(row: Row, transform: Transform): string {
  switch (transform.kind) {
    case 'direct':
      return get(row, transform.source);

    case 'concat': {
      const labelSep = transform.labelSeparator ?? ': ';
      const parts: string[] = [];
      for (const s of transform.sources) {
        const v = get(row, s).trim();
        if (v === '') continue; // 空の値はまとめない
        if (transform.withLabels) {
          const label = transform.labels?.[s] ?? s;
          parts.push(`${label}${labelSep}${v}`);
        } else {
          parts.push(v);
        }
      }
      return parts.join(transform.separator);
    }

    case 'split': {
      const value = get(row, transform.source);
      // 区切りが空白の場合は半角/全角スペースの混在に対応する(\sはU+3000も含む)
      const parts =
        transform.delimiter.trim() === ''
          ? value.trim().split(/\s+/)
          : value.split(transform.delimiter);
      return (parts[transform.index] ?? '').trim();
    }

    case 'constant':
      return transform.value;

    case 'conditional': {
      const src = get(row, transform.source);
      for (const c of transform.cases) {
        if (evalCondition(src, c)) return c.then;
      }
      return transform.fallback ?? src;
    }

    case 'empty':
      return '';

    default:
      return '';
  }
}

/** 1フィールド分のマッピングを適用(Transform → 正規化) */
export function applyFieldMapping(row: Row, mapping: FieldMapping): string {
  const raw = evalTransform(row, mapping.transform);
  return applyNormalizers(raw, mapping.normalizers);
}

/** 1行を変換してターゲット行を作る */
export function transformRow(row: Row, config: MappingConfig): Row {
  const out: Row = {};
  for (const mapping of config.fields) {
    out[mapping.targetKey] = applyFieldMapping(row, mapping);
  }
  return out;
}

/** 全行を変換 */
export function transformAll(rows: Row[], config: MappingConfig): Row[] {
  return rows.map((r) => transformRow(r, config));
}
