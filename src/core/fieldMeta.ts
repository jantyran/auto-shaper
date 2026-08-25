import type { FieldInputKind, FieldMapping, TargetField } from '../types';

export interface FieldOptionItem {
  value: string;
  label: string;
}

export function fieldDisplayName(field: TargetField): string {
  const label = field.label.trim();
  return label || field.key;
}

export function fieldInputKind(field: TargetField): FieldInputKind {
  return (
    field.inputKind ??
    (field.options && field.options.length > 0 ? 'select' : 'text')
  );
}

export function fieldOptionItems(field: TargetField): FieldOptionItem[] {
  const labels = field.optionLabels ?? {};
  return (field.options ?? []).map((value) => ({
    value,
    label: labels[value]?.trim() || value,
  }));
}

export function fieldOptionLabel(field: TargetField, value: string): string {
  return field.optionLabels?.[value]?.trim() || value;
}

/**
 * 出力に含める項目を絞り込む。dropEmpty が true のときは、
 * 変換方法が「空（未割当）」の項目(未割当・マッピング無し含む)を除外する。
 */
export function visibleTargetFields(
  fields: TargetField[],
  mappingFields: FieldMapping[],
  dropEmpty: boolean,
): TargetField[] {
  if (!dropEmpty) return fields;
  return fields.filter((f) => {
    const m = mappingFields.find((x) => x.targetKey === f.key);
    return !!m && m.transform.kind !== 'empty';
  });
}
