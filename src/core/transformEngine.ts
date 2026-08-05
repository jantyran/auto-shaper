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
  TargetField,
  Transform,
} from '../types';
import { applyNormalizers } from './normalize';
import { renderAutoFillTemplate } from './autoFillRules';
import { evaluateAutoFillExpression } from './autoFillExpression';

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
export function evalTransform(
  row: Row,
  transform: Transform,
  context: Row = {},
): string {
  const rowWithContext = { ...context, ...row };
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

    case 'template': {
      const fields: TargetField[] = Object.entries(
        transform.fieldLabels ?? {},
      ).map(([key, label]) => ({
        key,
        label,
        required: false,
        type: 'string',
        aliases: [],
      }));
      if (transform.expression?.trim()) {
        return evaluateAutoFillExpression(
          transform.expression,
          rowWithContext,
          fields,
        );
      }
      return renderAutoFillTemplate(transform.template, rowWithContext, fields);
    }

    case 'empty':
      return '';

    default:
      return '';
  }
}

/** 1フィールド分のマッピングを適用(Transform → 正規化) */
export function applyFieldMapping(
  row: Row,
  mapping: FieldMapping,
  context: Row = {},
): string {
  const raw = evalTransform(row, mapping.transform, context);
  return applyNormalizers(raw, mapping.normalizers);
}

function fieldLabelsFromTemplateMappings(config: MappingConfig): TargetField[] {
  const labels: Record<string, string> = {};
  for (const mapping of config.fields) {
    if (mapping.transform.kind === 'template') {
      Object.assign(labels, mapping.transform.fieldLabels ?? {});
    }
  }
  return Object.entries(labels).map(([key, label]) => ({
    key,
    label,
    required: false,
    type: 'string',
    aliases: [],
  }));
}

function evalTemplateMapping(
  out: Row,
  mapping: FieldMapping,
  fields: TargetField[],
  context: Row = {},
): string {
  const outWithContext = { ...context, ...out };
  const transform = mapping.transform;
  if (transform.kind !== 'template') return '';
  if (transform.expression?.trim()) {
    return evaluateAutoFillExpression(
      transform.expression,
      outWithContext,
      fields,
    );
  }
  const cases = transform.cases ?? [];
  for (const c of cases) {
    if (
      evalCondition(get(outWithContext, c.sourceFieldKey), {
        op: c.op,
        value: c.value,
        then: c.template,
      })
    ) {
      return renderAutoFillTemplate(c.template, outWithContext, fields);
    }
  }
  return renderAutoFillTemplate(transform.template, outWithContext, fields);
}

/** 1行を変換してターゲット行を作る */
export function transformRow(
  row: Row,
  config: MappingConfig,
  context: Row = {},
): Row {
  const out: Row = {};
  const templateMappings: FieldMapping[] = [];
  for (const mapping of config.fields) {
    if (mapping.transform.kind === 'template') {
      templateMappings.push(mapping);
      continue;
    }
    out[mapping.targetKey] = applyFieldMapping(row, mapping, context);
  }

  const fields = fieldLabelsFromTemplateMappings(config);
  for (const mapping of templateMappings) {
    const transform = mapping.transform;
    if (transform.kind !== 'template') continue;
    if (!transform.overwrite && get(out, mapping.targetKey).trim() !== '') {
      continue;
    }
    out[mapping.targetKey] = applyNormalizers(
      evalTemplateMapping(out, mapping, fields, context),
      mapping.normalizers,
    );
  }
  return out;
}

/** 全行を変換 */
export function transformAll(
  rows: Row[],
  config: MappingConfig,
  context: Row = {},
): Row[] {
  return rows.map((r) => transformRow(r, config, context));
}
