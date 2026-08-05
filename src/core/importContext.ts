import type { ImportContextEntry } from '../types';

export type ImportContextRow = Record<string, string>;

export function importContextToRow(
  entries: ImportContextEntry[],
): ImportContextRow {
  const row: ImportContextRow = {};
  for (const entry of entries) {
    const key = entry.key.trim();
    if (!key) continue;
    row['Import.' + key] = entry.value;
  }
  return row;
}
