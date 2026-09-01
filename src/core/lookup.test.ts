import { describe, it, expect } from 'vitest';
import {
  activeColumns,
  activeKeys,
  applyLookup,
  buildLookupIndex,
  createLookupTable,
  MATCH_LABEL,
  UNMATCH_LABEL,
} from './lookup';
import type { LookupTable } from '../types';

const rows = [
  { 社員番号: '1001', 氏名: '山田', 部署コード: 'D01' },
  { 社員番号: '1002', 氏名: '鈴木', 部署コード: 'D02' },
  { 社員番号: '1003', 氏名: '佐藤', 部署コード: 'D99' },
];

const master = [
  { 部署コード: 'D01', 部署名: '営業部', 予算: '5000' },
  { 部署コード: 'D02', 部署名: '開発部', 予算: '8000' },
  { 部署コード: 'D03', 部署名: '総務部', 予算: '2000' },
];

const table = (patch: Partial<LookupTable> = {}): LookupTable => ({
  ...createLookupTable('L1', 0, 'Sheet1'),
  keys: [{ sourceColumn: '部署コード', lookupColumn: '部署コード' }],
  columns: [{ from: '部署名', as: '部署名' }],
  ...patch,
});

describe('applyLookup', () => {
  it('キーが一致した行から列を持ってくる', () => {
    const out = applyLookup(rows, master, table());
    expect(out.rows.map((r) => r.部署名)).toEqual(['営業部', '開発部', '']);
  });

  it('行数は絶対に変わらない(JOINのように増えない)', () => {
    const dupMaster = [...master, { 部署コード: 'D01', 部署名: '第二営業部' }];
    const out = applyLookup(rows, dupMaster, table());
    expect(out.rows.length).toBe(rows.length);
  });

  it('複数一致は既定で最初の1件を採る', () => {
    const dupMaster = [...master, { 部署コード: 'D01', 部署名: '第二営業部' }];
    const out = applyLookup(rows, dupMaster, table());
    expect(out.rows[0].部署名).toBe('営業部');
    expect(out.stats.multiple).toBe(1);
  });

  it('複数一致で最後・すべて連結も選べる', () => {
    const dupMaster = [...master, { 部署コード: 'D01', 部署名: '第二営業部' }];
    expect(
      applyLookup(rows, dupMaster, table({ multiple: 'last' })).rows[0].部署名,
    ).toBe('第二営業部');
    expect(
      applyLookup(rows, dupMaster, table({ multiple: 'joinAll' })).rows[0]
        .部署名,
    ).toBe('営業部 / 第二営業部');
  });

  it('見つからないときの値を指定できる', () => {
    const out = applyLookup(rows, master, table({ notFound: '不明' }));
    expect(out.rows[2].部署名).toBe('不明');
  });

  it('緩い照合では空白・全角半角・大小の違いを吸収する', () => {
    const messy = [{ 部署コード: ' ｄ０１ ', 部署名: '営業部' }];
    expect(applyLookup(rows, messy, table()).rows[0].部署名).toBe('営業部');
    expect(
      applyLookup(rows, messy, table({ loose: false })).rows[0].部署名,
    ).toBe('');
  });

  it('複数キーはすべて一致した行だけを採る', () => {
    const src = [
      { 支店: 'T', 商品: 'A' },
      { 支店: 'T', 商品: 'B' },
    ];
    const ref = [
      { 支店: 'T', 商品: 'A', 在庫: '10' },
      { 支店: 'O', 商品: 'B', 在庫: '20' },
    ];
    const out = applyLookup(
      src,
      ref,
      table({
        keys: [
          { sourceColumn: '支店', lookupColumn: '支店' },
          { sourceColumn: '商品', lookupColumn: '商品' },
        ],
        columns: [{ from: '在庫', as: '在庫' }],
      }),
    );
    expect(out.rows.map((r) => r.在庫)).toEqual(['10', '']);
  });

  it('一致件数を返す', () => {
    const out = applyLookup(rows, master, table());
    expect(out.stats.matched).toBe(2);
    expect(out.stats.unmatched).toBe(1);
  });

  it('一致状況を列として残せる', () => {
    const out = applyLookup(rows, master, table({ statusColumn: '参照結果' }));
    expect(out.rows.map((r) => r.参照結果)).toEqual([
      MATCH_LABEL,
      MATCH_LABEL,
      UNMATCH_LABEL,
    ]);
  });

  it('一致した行を除ける(差分抽出: 未登録だけを残す)', () => {
    const out = applyLookup(
      rows,
      master,
      table({ matchAction: 'excludeMatched', columns: [] }),
    );
    expect(out.rows.map((r) => r.社員番号)).toEqual(['1003']);
    // 除外しても件数の集計は全行ぶん残す
    expect(out.stats.matched).toBe(2);
  });

  it('一致した行だけ残せる(既存の更新用リスト)', () => {
    const out = applyLookup(
      rows,
      master,
      table({ matchAction: 'keepMatched', columns: [] }),
    );
    expect(out.rows.map((r) => r.社員番号)).toEqual(['1001', '1002']);
  });

  it('キーが未設定なら何もせず素通しする', () => {
    const out = applyLookup(
      rows,
      master,
      table({ keys: [{ sourceColumn: '', lookupColumn: '' }] }),
    );
    expect(out.rows).toBe(rows);
  });

  it('キーが空の行は突き合わせない', () => {
    const withBlank = [
      ...rows,
      { 社員番号: '1004', 氏名: '空', 部署コード: '' },
    ];
    const blankMaster = [...master, { 部署コード: '', 部署名: '未所属' }];
    const out = applyLookup(withBlank, blankMaster, table());
    expect(out.rows[3].部署名).toBe('');
  });

  it('元データに無い列名で足せる(名前を変えて取り込む)', () => {
    const out = applyLookup(
      rows,
      master,
      table({ columns: [{ from: '部署名', as: '所属' }] }),
    );
    expect(out.rows[0].所属).toBe('営業部');
    expect(out.rows[0].部署名).toBeUndefined();
  });
});

describe('buildLookupIndex', () => {
  it('同じキーの行をまとめて引ける', () => {
    const index = buildLookupIndex(
      [
        { k: 'a', v: '1' },
        { k: 'a', v: '2' },
        { k: 'b', v: '3' },
      ],
      ['k'],
      true,
    );
    expect(index.get('a')?.length).toBe(2);
    expect(index.get('b')?.length).toBe(1);
  });
});

describe('activeKeys / activeColumns', () => {
  it('片側だけ選ばれたキーは効かないものとして扱う', () => {
    expect(
      activeKeys(table({ keys: [{ sourceColumn: 'a', lookupColumn: '' }] })),
    ).toEqual([]);
  });

  it('列名が空の設定は足す対象にしない', () => {
    expect(activeColumns(table({ columns: [{ from: '', as: 'x' }] }))).toEqual(
      [],
    );
  });
});
