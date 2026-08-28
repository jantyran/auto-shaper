import { describe, it, expect } from 'vitest';
import { detectHeaderRow, buildColumnNames, mergeDatasets } from './parse';

describe('detectHeaderRow', () => {
  it('通常どおり1行目が見出しなら1を返す', () => {
    const m = [
      ['会社名', '担当者', 'メール'],
      ['A社', '山田', 'a@example.com'],
      ['B社', '鈴木', 'b@example.com'],
    ];
    expect(detectHeaderRow(m)).toBe(1);
  });

  it('タイトル行と空行を飛ばして見出し行を見つける', () => {
    const m = [
      ['2026年度 顧客リスト', '', ''],
      ['', '', ''],
      ['会社名', '担当者', 'メール'],
      ['A社', '山田', 'a@example.com'],
      ['B社', '鈴木', 'b@example.com'],
    ];
    expect(detectHeaderRow(m)).toBe(3);
  });

  it('注記が複数行あっても見出し行を選ぶ', () => {
    const m = [
      ['社外秘', '', '', ''],
      ['作成日', '2026/04/01', '', ''],
      ['', '', '', ''],
      ['ID', '会社名', '電話番号', '住所'],
      ['1', 'A社', '03-1234-5678', '東京都港区'],
      ['2', 'B社', '06-1234-5678', '大阪市北区'],
    ];
    expect(detectHeaderRow(m)).toBe(4);
  });

  it('データ行しか無い(見出しが数値だけ)場合も落ちない', () => {
    const m = [
      ['1', '2', '3'],
      ['4', '5', '6'],
    ];
    expect(detectHeaderRow(m)).toBe(1);
  });

  it('空のシートは1を返す', () => {
    expect(detectHeaderRow([])).toBe(1);
    expect(detectHeaderRow([['', '']])).toBe(1);
  });

  it('見出しの下にデータが無い行は選ばない', () => {
    const m = [
      ['会社名', '担当者'],
      ['A社', '山田'],
      ['合計', '1件'],
    ];
    expect(detectHeaderRow(m)).toBe(1);
  });
});

describe('buildColumnNames', () => {
  it('空欄には位置に基づく仮の名前を付ける', () => {
    expect(buildColumnNames(['会社名', '', ' ', 'メール'])).toEqual([
      '会社名',
      '列2',
      '列3',
      'メール',
    ]);
  });

  it('重複した見出しは連番で区別する', () => {
    expect(buildColumnNames(['電話', '電話', '電話'])).toEqual([
      '電話',
      '電話 (2)',
      '電話 (3)',
    ]);
  });

  it('前後の空白は落とす', () => {
    expect(buildColumnNames(['  会社名  '])).toEqual(['会社名']);
  });
});

describe('mergeDatasets', () => {
  const ds = (
    fileName: string,
    columns: string[],
    rows: Record<string, string>[],
    sheet?: string,
  ) => ({
    fileName,
    activeSheet: sheet,
    headerRow: 1,
    columns: columns.map((name) => ({
      name,
      inferredType: 'string' as const,
      sampleValues: [],
      fillRate: 1,
    })),
    rows,
  });

  it('同じ列構成なら行をそのまま縦につなぐ', () => {
    const out = mergeDatasets([
      ds('1月.csv', ['会社名'], [{ 会社名: 'A社' }]),
      ds('2月.csv', ['会社名'], [{ 会社名: 'B社' }]),
    ]);
    expect(out.rows).toEqual([{ 会社名: 'A社' }, { 会社名: 'B社' }]);
    expect(out.columns.map((c) => c.name)).toEqual(['会社名']);
  });

  it('列が違う場合は和集合にして、無い列は空欄にする', () => {
    const out = mergeDatasets([
      ds('a.csv', ['会社名'], [{ 会社名: 'A社' }]),
      ds('b.csv', ['会社名', 'メール'], [{ 会社名: 'B社', メール: 'b@x.jp' }]),
    ]);
    expect(out.columns.map((c) => c.name)).toEqual(['会社名', 'メール']);
    expect(out.rows).toEqual([
      { 会社名: 'A社', メール: '' },
      { 会社名: 'B社', メール: 'b@x.jp' },
    ]);
  });

  it('取込元の列を足せる(ファイル名 / シート名)', () => {
    const out = mergeDatasets(
      [
        ds('売上.xlsx', ['額'], [{ 額: '10' }], '1月'),
        ds('売上.xlsx', ['額'], [{ 額: '20' }], '2月'),
      ],
      '取込元',
    );
    expect(out.rows).toEqual([
      { 額: '10', 取込元: '売上.xlsx / 1月' },
      { 額: '20', 取込元: '売上.xlsx / 2月' },
    ]);
  });

  it('内訳(parts)に取込元ごとの行数を残す', () => {
    const out = mergeDatasets([
      ds('a.csv', ['x'], [{ x: '1' }, { x: '2' }]),
      ds('b.csv', ['x'], [{ x: '3' }]),
    ]);
    expect(out.parts?.map((p) => [p.fileName, p.rowCount])).toEqual([
      ['a.csv', 2],
      ['b.csv', 1],
    ]);
  });

  it('1件だけなら元のデータセットをそのまま返す', () => {
    const only = ds('a.csv', ['x'], [{ x: '1' }]);
    expect(mergeDatasets([only])).toBe(only);
  });

  it('結合対象が無ければエラーにする', () => {
    expect(() => mergeDatasets([])).toThrow();
  });

  it('表示名は複数ファイルなら「ほかN件」でまとめる', () => {
    const out = mergeDatasets([
      ds('a.csv', ['x'], [{ x: '1' }]),
      ds('b.csv', ['x'], [{ x: '2' }]),
    ]);
    expect(out.fileName).toBe('a.csv ほか1件');
  });
});
