import { describe, it, expect } from 'vitest';
import {
  createEmptySchema,
  duplicateSchema,
  findSchemaById,
  getAllSchemas,
} from './schemaStore';
import { PRESET_SCHEMAS } from './targetSchemas';
import type { TargetSchema } from '../types';

describe('schemaStore (pure helpers)', () => {
  it('createEmptySchema は custom 由来で項目を1つ持つ', () => {
    const s = createEmptySchema('自社CRM');
    expect(s.origin).toBe('custom');
    expect(s.name).toBe('自社CRM');
    expect(s.fields.length).toBe(1);
    expect(s.id).toMatch(/^custom-/);
  });

  it('duplicateSchema はプリセットを編集可能なコピーにする(別ID・別配列)', () => {
    const src = PRESET_SCHEMAS[0];
    const copy = duplicateSchema(src);
    expect(copy.id).not.toBe(src.id);
    expect(copy.origin).toBe('custom');
    expect(copy.fields).toEqual(src.fields);
    expect(copy.fields).not.toBe(src.fields);
    // 深いコピー: aliases 配列も共有していない
    expect(copy.fields[0].aliases).not.toBe(src.fields[0].aliases);
  });

  it('getAllSchemas はプリセット+ユーザー定義を結合する', () => {
    const custom: TargetSchema[] = [createEmptySchema('X')];
    const all = getAllSchemas(custom);
    expect(all.length).toBe(PRESET_SCHEMAS.length + 1);
  });

  it('findSchemaById はプリセットとユーザー定義の両方から解決する', () => {
    const mine = createEmptySchema('Mine');
    expect(findSchemaById('salesforce-lead', [mine])?.name).toContain('Salesforce');
    expect(findSchemaById(mine.id, [mine])?.name).toBe('Mine');
    expect(findSchemaById('does-not-exist', [mine])).toBeUndefined();
  });
});
