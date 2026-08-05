import type { FieldInputKind, TargetField } from '../types';

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
