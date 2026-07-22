import { describe, it, expect } from 'vitest';
import {
  normalizeCompany,
  normalizePhone,
  toHalfWidth,
  applyNormalizers,
} from './normalize';
import { transformRow, evalTransform } from './transformEngine';
import { heuristicSuggester } from './inference/heuristic';
import { buildSuggestContext } from './anonymize';
import { anonymizeValue } from './anonymize';
import type { MappingConfig, SourceColumn, TargetSchema } from '../types';

describe('normalize', () => {
  it('全角英数を半角化する', () => {
    expect(toHalfWidth('ＡＢＣ１２３')).toBe('ABC123');
  });

  it('(株)を株式会社に展開する', () => {
    expect(normalizeCompany('(株)サンプル商事')).toBe('株式会社サンプル商事');
    expect(normalizeCompany('（株）テスト　')).toBe('株式会社テスト');
  });

  it('電話番号を数字に正規化する', () => {
    expect(normalizePhone('０３-１２３４-５６７８')).toBe('0312345678');
    expect(normalizePhone('(03) 1234 5678')).toBe('0312345678');
  });

  it('正規化子を順番に適用する', () => {
    expect(applyNormalizers('  ＡＢＣ ', ['trim', 'toHalfWidth', 'lowerCase'])).toBe(
      'abc',
    );
  });
});

describe('transformEngine', () => {
  const row = { 姓: '山田', 名: '太郎', 会社: '(株)テスト', 氏名: '佐藤 花子' };

  it('direct: 1列をそのまま取り出す', () => {
    expect(evalTransform(row, { kind: 'direct', source: '姓' })).toBe('山田');
  });

  it('concat: 複数列を結合する', () => {
    expect(
      evalTransform(row, { kind: 'concat', sources: ['姓', '名'], separator: '' }),
    ).toBe('山田太郎');
  });

  it('split: 1列を分割して取り出す', () => {
    expect(
      evalTransform(row, { kind: 'split', source: '氏名', delimiter: ' ', index: 1 }),
    ).toBe('花子');
  });

  it('split: 空白区切りは半角/全角スペース混在に対応する', () => {
    expect(
      evalTransform({ 氏名: '佐藤　花子' }, { kind: 'split', source: '氏名', delimiter: ' ', index: 0 }),
    ).toBe('佐藤');
    expect(
      evalTransform({ 氏名: '佐藤　花子' }, { kind: 'split', source: '氏名', delimiter: ' ', index: 1 }),
    ).toBe('花子');
  });

  it('conditional: 条件分岐で値を出す', () => {
    expect(
      evalTransform(
        { 役職: '営業部長' },
        {
          kind: 'conditional',
          source: '役職',
          cases: [{ op: 'contains', value: '部長', then: 'マネージャー' }],
          fallback: 'その他',
        },
      ),
    ).toBe('マネージャー');
  });

  it('transformRow: 設定に従って行全体を変換する', () => {
    const config: MappingConfig = {
      targetSchemaId: 't',
      fields: [
        {
          targetKey: 'Company',
          transform: { kind: 'direct', source: '会社' },
          normalizers: ['normalizeCompany'],
          confidence: 1,
        },
        {
          targetKey: 'FullName',
          transform: { kind: 'concat', sources: ['姓', '名'], separator: ' ' },
          normalizers: [],
          confidence: 1,
        },
      ],
    };
    expect(transformRow(row, config)).toEqual({
      Company: '株式会社テスト',
      FullName: '山田 太郎',
    });
  });
});

describe('anonymize', () => {
  it('メール・電話をマスクする', () => {
    expect(anonymizeValue('taro@company.co.jp')).toBe('user@example.com');
    expect(anonymizeValue('090-1234-5678')).toBe('000-0000-0000');
  });
});

describe('heuristicSuggester', () => {
  it('カラム名からマッピングを提案する', async () => {
    const columns: SourceColumn[] = [
      { name: '会社名', inferredType: 'string', sampleValues: ['(株)A'], fillRate: 1 },
      { name: 'メールアドレス', inferredType: 'email', sampleValues: ['a@b.com'], fillRate: 1 },
      { name: '電話', inferredType: 'phone', sampleValues: ['03-1111-2222'], fillRate: 1 },
    ];
    const target: TargetSchema = {
      id: 'sf',
      name: 'SF',
      origin: 'preset',
      fields: [
        { key: 'Company', label: '会社名', required: true, type: 'string', aliases: ['会社名', '企業名'] },
        { key: 'Email', label: 'メール', required: false, type: 'email', aliases: ['メール', 'メールアドレス', 'email'] },
        { key: 'Phone', label: '電話番号', required: false, type: 'phone', aliases: ['電話', '電話番号', 'tel'] },
      ],
    };
    const ctx = buildSuggestContext(columns, target);
    const mapping = await heuristicSuggester.suggest(ctx);

    const company = mapping.fields.find((f) => f.targetKey === 'Company');
    expect(company?.transform).toEqual({ kind: 'direct', source: '会社名' });

    const email = mapping.fields.find((f) => f.targetKey === 'Email');
    expect(email?.transform).toEqual({ kind: 'direct', source: 'メールアドレス' });
  });

  it('氏名の結合列しか無いとき姓/名へ分割を提案する', async () => {
    const columns: SourceColumn[] = [
      { name: '氏名', inferredType: 'string', sampleValues: ['山田 太郎'], fillRate: 1 },
    ];
    const target: TargetSchema = {
      id: 'sf',
      name: 'SF',
      origin: 'preset',
      fields: [
        { key: 'LastName', label: '姓', required: true, type: 'string', aliases: ['姓', '苗字'] },
        { key: 'FirstName', label: '名', required: false, type: 'string', aliases: ['名'] },
      ],
    };
    const ctx = buildSuggestContext(columns, target);
    const mapping = await heuristicSuggester.suggest(ctx);
    const last = mapping.fields.find((f) => f.targetKey === 'LastName');
    expect(last?.transform.kind).toBe('split');
  });
});
