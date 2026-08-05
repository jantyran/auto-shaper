import type {
  AutoFillCase,
  FieldAutoFillRule,
  TargetField,
  TargetSchema,
} from '../types';
import { fieldDisplayName } from './fieldMeta';
import { evaluateAutoFillExpression } from './autoFillExpression';

type Row = Record<string, string>;

function valueOf(row: Row, key: string): string {
  const value = row[key];
  return value == null ? '' : String(value);
}

function matches(value: string, c: AutoFillCase): boolean {
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

function splitFieldRef(rawName: string): { name: string; attr: string } {
  const raw = rawName.trim();
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return { name: raw, attr: 'value' };
  const attr = raw.slice(dot + 1).trim();
  if (!['value', 'label', 'labal', 'key'].includes(attr)) {
    return { name: raw, attr: 'value' };
  }
  return { name: raw.slice(0, dot).trim(), attr };
}

function fieldLookup(fields: TargetField[]): Map<string, TargetField> {
  const lookup = new Map<string, TargetField>();
  for (const field of fields) {
    lookup.set(field.key, field);
    const display = fieldDisplayName(field);
    if (display) lookup.set(display, field);
    if (field.label.trim()) lookup.set(field.label.trim(), field);
  }
  return lookup;
}

export function renderAutoFillTemplate(
  template: string,
  row: Row,
  fields: TargetField[],
): string {
  const lookup = fieldLookup(fields);
  return template.replace(/{([^{}]+)}/g, (_, rawName: string) => {
    const { name, attr } = splitFieldRef(rawName);
    if (!name) return '';
    const field = lookup.get(name);
    if (attr === 'key') return field?.key ?? name;
    if (attr === 'label' || attr === 'labal')
      return field ? fieldDisplayName(field) : name;
    return valueOf(row, field?.key ?? name);
  });
}

export function resolveAutoFillTemplate(
  rule: FieldAutoFillRule,
  row: Row,
  fields: TargetField[],
): string {
  if (rule.expression?.trim()) {
    return evaluateAutoFillExpression(rule.expression, row, fields);
  }
  const cases = rule.cases ?? [];
  for (const c of cases) {
    if (!c.sourceFieldKey || !c.template) continue;
    if (matches(valueOf(row, c.sourceFieldKey), c)) {
      return renderAutoFillTemplate(c.template, row, fields);
    }
  }
  return renderAutoFillTemplate(rule.template, row, fields);
}

export function applyAutoFillRules(record: Row, target: TargetSchema): Row {
  const out = { ...record };
  for (const field of target.fields) {
    const rule = field.autoFill;
    if (
      !rule ||
      (!rule.expression && !rule.template && (rule.cases ?? []).length === 0)
    ) {
      continue;
    }
    if (!rule.overwrite && valueOf(out, field.key).trim() !== '') continue;
    const next = resolveAutoFillTemplate(rule, out, target.fields);
    if (next !== '' || rule.overwrite) out[field.key] = next;
  }
  return out;
}
