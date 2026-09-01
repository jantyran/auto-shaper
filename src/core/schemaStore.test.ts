import { describe, it, expect } from 'vitest';
import {
  createEmptySchema,
  duplicateSchema,
  findSchemaById,
  getAllSchemas,
  getDefaultSchema,
  normalizeCustomSchemas,
  schemaFromImport,
  sortCustomSchemas,
  uniqueSchemaName,
} from './schemaStore';
import { PRESET_SCHEMAS } from './targetSchemas';
import type { TargetSchema } from '../types';

describe('schemaStore (pure helpers)', () => {
  it('createEmptySchema は custom 由来で項目を1つ持つ', () => {
    const s = createEmptySchema('自社CRM');
    expect(s.origin).toBe('custom');
    expect(s.name).toBe('自社CRM');
    expect(s.fields.length).toBe(1);
    expect(s.fields[0].inputKind).toBe('text');
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

  it('normalizeCustomSchemas は表示順と既定テンプレートを補正する', () => {
    const a = {
      ...createEmptySchema('A'),
      id: 'a',
      sortOrder: 2,
      isDefault: true,
    };
    const b = {
      ...createEmptySchema('B'),
      id: 'b',
      sortOrder: 1,
      isDefault: true,
    };
    const c = { ...createEmptySchema('C'), id: 'c' };

    const normalized = normalizeCustomSchemas([a, b, c]);

    expect(normalized.map((s) => s.id)).toEqual(['b', 'a', 'c']);
    expect(normalized.map((s) => s.sortOrder)).toEqual([0, 1, 2]);
    expect(normalized.filter((s) => s.isDefault).map((s) => s.id)).toEqual([
      'b',
    ]);
  });

  it('sortCustomSchemas と getDefaultSchema は当てはめ先選択順に従う', () => {
    const a = { ...createEmptySchema('A'), id: 'a', sortOrder: 1 };
    const b = {
      ...createEmptySchema('B'),
      id: 'b',
      sortOrder: 0,
      isDefault: true,
    };

    expect(sortCustomSchemas([a, b]).map((s) => s.id)).toEqual(['b', 'a']);
    expect(getDefaultSchema([a, b])?.id).toBe('b');
  });

  it('findSchemaById はプリセットとユーザー定義の両方から解決する', () => {
    const mine = createEmptySchema('Mine');
    expect(findSchemaById('salesforce-lead', [mine])?.name).toContain(
      'Salesforce',
    );
    expect(findSchemaById(mine.id, [mine])?.name).toBe('Mine');
    expect(findSchemaById('does-not-exist', [mine])).toBeUndefined();
  });
});

it('旧形式のoptions付きフィールドは選択式として読み込む', () => {
  const s = schemaFromImport({
    id: 'legacy',
    name: 'Legacy',
    fields: [
      {
        key: 'Status',
        label: 'ステータス',
        required: false,
        type: 'string',
        aliases: [],
        options: ['A, Bを含む候補', 'C'],
      },
      {
        key: 'Memo',
        label: 'メモ',
        required: false,
        type: 'string',
        aliases: [],
        inputKind: 'textarea',
      },
    ],
  });

  expect(s.fields[0].inputKind).toBe('select');
  expect(s.fields[0].options).toEqual(['A, Bを含む候補', 'C']);
  expect(s.fields[1].inputKind).toBe('textarea');
});

describe('uniqueSchemaName', () => {
  it('重複が無ければそのまま返す', () => {
    expect(uniqueSchemaName('顧客マスタ', ['取引先'])).toBe('顧客マスタ');
  });

  it('重複したら連番を付ける', () => {
    expect(uniqueSchemaName('顧客マスタ', ['顧客マスタ'])).toBe(
      '顧客マスタ (2)',
    );
  });

  it('連番が埋まっていれば空いている番号まで進める', () => {
    expect(
      uniqueSchemaName('顧客マスタ', [
        '顧客マスタ',
        '顧客マスタ (2)',
        '顧客マスタ (3)',
      ]),
    ).toBe('顧客マスタ (4)');
  });

  it('すでに連番付きの名前は番号を進める(入れ子にしない)', () => {
    expect(uniqueSchemaName('顧客マスタ (2)', ['顧客マスタ (2)'])).toBe(
      '顧客マスタ (3)',
    );
  });

  it('空名は (無題) として扱う', () => {
    expect(uniqueSchemaName('   ', [])).toBe('(無題)');
  });
});

describe('schemaFromImport は上書きせず追加する', () => {
  const src = { id: 'fixed-id', name: '顧客マスタ', fields: [] } as unknown;

  it('元のIDを引き継がない(既存を置き換えない)', () => {
    const a = schemaFromImport(src);
    expect(a.id).not.toBe('fixed-id');
    expect(a.id).toMatch(/^custom-/);
  });

  it('同じ入力を2回取り込んでも別テンプレートになる', () => {
    const a = schemaFromImport(src);
    const b = schemaFromImport(src);
    expect(a.id).not.toBe(b.id);
  });

  it('既存名を渡すと重複しない名前に付け替える', () => {
    const a = schemaFromImport(src, ['顧客マスタ']);
    expect(a.name).toBe('顧客マスタ (2)');
  });

  it('既定テンプレート指定は引き継がない', () => {
    const a = schemaFromImport({ ...(src as object), isDefault: true });
    expect(a.isDefault).toBe(false);
  });
});
