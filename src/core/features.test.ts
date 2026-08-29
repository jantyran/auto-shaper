import { describe, it, expect } from 'vitest';
import { defaultDedupeConfig, findDuplicates } from './dedupe';
import {
  sourceSignature,
  findMatchingRecipes,
  createRecipe,
  type Recipe,
} from './recipes';
import { learnedBoost } from './learning';
import { isPersonalColumn, buildSuggestContext } from './anonymize';
import { DEFAULT_SETTINGS } from './settings';
import type {
  SourceColumn,
  SourceDataset,
  TargetSchema,
  MappingConfig,
} from '../types';

const target: TargetSchema = {
  id: 'sf',
  name: 'SF',
  origin: 'preset',
  fields: [
    {
      key: 'Company',
      label: '会社名',
      required: true,
      type: 'string',
      aliases: [],
    },
    {
      key: 'LastName',
      label: '姓',
      required: true,
      type: 'string',
      aliases: [],
    },
    {
      key: 'Email',
      label: 'メール',
      required: false,
      type: 'email',
      aliases: [],
    },
  ],
};

describe('dedupe', () => {
  it('メールで重複行を検出する', () => {
    const rows = [
      { Company: 'A社', LastName: '山田', Email: 'a@x.com' },
      { Company: 'B社', LastName: '佐藤', Email: 'b@x.com' },
      { Company: 'A社', LastName: '山田', Email: 'A@X.com' }, // 大小・全半角違いでも同一
    ];
    const r = findDuplicates(rows, defaultDedupeConfig(target));
    expect(r.keyFields).toEqual(['Email']);
    expect(r.groups.length).toBe(1);
    expect(r.duplicateRows.has(0)).toBe(true);
    expect(r.duplicateRows.has(2)).toBe(true);
    expect(r.duplicateRows.has(1)).toBe(false);
  });

  it('メール列が無ければ会社名+姓で照合する', () => {
    const noEmail: TargetSchema = {
      ...target,
      fields: target.fields.filter((f) => f.type !== 'email'),
    };
    const rows = [
      { Company: '(株)A', LastName: '山田' },
      { Company: '株式会社A', LastName: '山田' }, // 正規化後は同じになりうるが列値そのまま比較
    ];
    const r = findDuplicates(rows, defaultDedupeConfig(noEmail));
    expect(r.keyFields).toEqual(['Company', 'LastName']);
  });
});

describe('recipes', () => {
  const cols = (names: string[]): SourceColumn[] =>
    names.map((name) => ({
      name,
      inferredType: 'string',
      sampleValues: [],
      fillRate: 1,
    }));
  const ds = (names: string[]): SourceDataset => ({
    fileName: 'f.csv',
    columns: cols(names),
    rows: [],
  });
  const mapping: MappingConfig = { targetSchemaId: 'sf', fields: [] };

  it('列構成のシグネチャは順不同・表記ゆれを吸収する', () => {
    expect(sourceSignature(cols(['会社名', 'メール']))).toBe(
      sourceSignature(cols(['メール', '会社名'])),
    );
  });

  it('同じ列構成のレシピを一致として返す', () => {
    const recipe: Recipe = createRecipe(
      '月次代理店',
      ds(['氏名', '御社名', 'TEL']),
      mapping,
    );
    const matches = findMatchingRecipes(
      [recipe],
      ds(['TEL', '御社名', '氏名']),
    );
    expect(matches.length).toBe(1);
    expect(matches[0].name).toBe('月次代理店');
  });

  it('列構成が大きく異なれば一致しない', () => {
    const recipe: Recipe = createRecipe('X', ds(['a', 'b', 'c']), mapping);
    const matches = findMatchingRecipes([recipe], ds(['x', 'y', 'z']));
    expect(matches.length).toBe(0);
  });
});

describe('learning', () => {
  it('学習済みの対応にはボーナスが付く', () => {
    const entries = [
      {
        header: '御社名'.normalize('NFKC').toLowerCase(),
        targetKey: 'Company',
        count: 2,
      },
    ];
    expect(learnedBoost('御社名', 'Company', entries)).toBeGreaterThan(0);
    expect(learnedBoost('御社名', 'Email', entries)).toBe(0);
  });
});

describe('masking (個人情報の自動判定)', () => {
  it('氏名・会社名・メール列を個人情報と判定する', () => {
    expect(isPersonalColumn('氏名', 'string')).toBe(true);
    expect(isPersonalColumn('御社名', 'string')).toBe(true);
    expect(isPersonalColumn('ﾒｰﾙ', 'email')).toBe(true);
    expect(isPersonalColumn('売上金額', 'number')).toBe(false);
    expect(isPersonalColumn('獲得経路', 'string')).toBe(false);
  });

  it('個人情報の列サンプルは伏字にし、非個人情報はそのまま送る', () => {
    const columns: SourceColumn[] = [
      {
        name: '氏名',
        inferredType: 'string',
        sampleValues: ['山田太郎'],
        fillRate: 1,
      },
      {
        name: '獲得経路',
        inferredType: 'string',
        sampleValues: ['展示会'],
        fillRate: 1,
      },
    ];
    const ctx = buildSuggestContext(
      columns,
      target,
      DEFAULT_SETTINGS.masking,
      true,
    );
    const row = ctx.anonymizedSamples[0];
    expect(row['氏名']).not.toContain('山田'); // 伏字
    expect(row['獲得経路']).toBe('展示会'); // そのまま
  });

  it('サンプルを送らないモードでは anonymizedSamples が空', () => {
    const columns: SourceColumn[] = [
      {
        name: '氏名',
        inferredType: 'string',
        sampleValues: ['山田太郎'],
        fillRate: 1,
      },
    ];
    const masking = { ...DEFAULT_SETTINGS.masking, sendSampleValues: false };
    const ctx = buildSuggestContext(columns, target, masking, true);
    expect(ctx.anonymizedSamples.length).toBe(0);
    expect(ctx.columns.length).toBe(1);
  });
});

describe('レシピが参照テーブルの設定を覚える', () => {
  const lookupTable = {
    id: 'L1',
    fileIndex: 0,
    sheet: 'Sheet1',
    keys: [{ sourceColumn: '部署コード', lookupColumn: '部署コード' }],
    columns: [{ from: '部署名', as: '部署名' }],
    multiple: 'first' as const,
    notFound: '',
    loose: true,
    matchAction: 'none' as const,
  };

  const withLookupColumn = (): SourceDataset => ({
    fileName: 'x.csv',
    columns: ['会社名', '部署コード', '部署名'].map((name) => ({
      name,
      inferredType: 'string' as const,
      sampleValues: [],
      fillRate: 1,
    })),
    rows: [],
  });

  const mapping: MappingConfig = { targetSchemaId: 't', fields: [] };

  it('参照テーブルの設定を保存する(ファイルの中身は持たない)', () => {
    const r = createRecipe('月次', withLookupColumn(), mapping, {
      lookups: [{ fileName: 'dept.csv', table: lookupTable }],
    });
    expect(r.lookups?.length).toBe(1);
    expect(r.lookups?.[0].fileName).toBe('dept.csv');
    expect(JSON.stringify(r)).not.toContain('ArrayBuffer');
  });

  it('参照テーブルが足した列はシグネチャから除く', () => {
    const r = createRecipe('月次', withLookupColumn(), mapping, {
      lookups: [{ fileName: 'dept.csv', table: lookupTable }],
    });
    // 「部署名」は参照テーブルが足した列なので、素のファイルの構成に含めない
    expect(r.sourceColumns).toEqual(['会社名', '部署コード']);
  });

  it('参照テーブル適用後のソースからでも、素のファイルにレシピが一致する', () => {
    const r = createRecipe('月次', withLookupColumn(), mapping, {
      lookups: [{ fileName: 'dept.csv', table: lookupTable }],
    });
    const plain: SourceDataset = {
      fileName: 'y.csv',
      columns: ['会社名', '部署コード'].map((name) => ({
        name,
        inferredType: 'string' as const,
        sampleValues: [],
        fillRate: 1,
      })),
      rows: [],
    };
    expect(findMatchingRecipes([r], plain).length).toBe(1);
  });

  it('一致状況の列もシグネチャから除く', () => {
    const r = createRecipe('月次', withLookupColumn(), mapping, {
      lookups: [
        {
          fileName: 'crm.csv',
          table: { ...lookupTable, columns: [], statusColumn: '部署名' },
        },
      ],
    });
    expect(r.sourceColumns).toEqual(['会社名', '部署コード']);
  });

  it('参照テーブルが無ければ lookups は持たない', () => {
    const r = createRecipe('月次', withLookupColumn(), mapping, {
      lookups: [],
    });
    expect(r.lookups).toBeUndefined();
  });
});
