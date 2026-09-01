import { describe, it, expect } from 'vitest';
import {
  activeRules,
  applyRowFilter,
  countRowFilter,
  rowMatchesFilter,
} from './rowFilter';
import type { RowFilter } from '../types';

const rows = [
  { 会社名: 'A社', 状態: '有効' },
  { 会社名: 'B社', 状態: '解約' },
  { 会社名: 'テスト', 状態: '有効' },
  { 会社名: 'C社', 状態: '' },
];

const exclude = (rules: RowFilter['rules']): RowFilter => ({
  mode: 'exclude',
  match: 'any',
  rules,
});

describe('applyRowFilter', () => {
  it('条件に合う行を除外する', () => {
    const out = applyRowFilter(
      rows,
      exclude([{ column: '状態', op: 'equals', value: '解約' }]),
    );
    expect(out.map((r) => r.会社名)).toEqual(['A社', 'テスト', 'C社']);
  });

  it('条件に合う行だけ残す', () => {
    const out = applyRowFilter(rows, {
      mode: 'include',
      match: 'any',
      rules: [{ column: '状態', op: 'equals', value: '有効' }],
    });
    expect(out.map((r) => r.会社名)).toEqual(['A社', 'テスト']);
  });

  it('複数条件は any でどれか1つ、all ですべてを見る', () => {
    const rules = [
      { column: '状態', op: 'equals' as const, value: '解約' },
      { column: '会社名', op: 'contains' as const, value: 'テスト' },
    ];
    expect(
      applyRowFilter(rows, { mode: 'exclude', match: 'any', rules }).map(
        (r) => r.会社名,
      ),
    ).toEqual(['A社', 'C社']);
    // all はどちらも満たす行が無いので1行も落ちない
    expect(
      applyRowFilter(rows, { mode: 'exclude', match: 'all', rules }).length,
    ).toBe(4);
  });

  it('空欄の条件を扱える', () => {
    expect(
      applyRowFilter(
        rows,
        exclude([{ column: '状態', op: 'isEmpty', value: '' }]),
      ).length,
    ).toBe(3);
    expect(
      applyRowFilter(
        rows,
        exclude([{ column: '状態', op: 'notEmpty', value: '' }]),
      ).map((r) => r.会社名),
    ).toEqual(['C社']);
  });

  it('条件が未設定なら全行を通す', () => {
    expect(applyRowFilter(rows, undefined)).toBe(rows);
    expect(applyRowFilter(rows, exclude([]))).toBe(rows);
  });

  it('列名が空の条件は無視する(設定途中で全行消えない)', () => {
    const half = exclude([
      { column: '', op: 'equals', value: '解約' },
      { column: '状態', op: 'equals', value: '解約' },
    ]);
    expect(activeRules(half).length).toBe(1);
    expect(applyRowFilter(rows, half).length).toBe(3);
  });

  it('存在しない列を指定しても落ちない(空文字として判定)', () => {
    const out = applyRowFilter(
      rows,
      exclude([{ column: '無い列', op: 'isEmpty', value: '' }]),
    );
    expect(out.length).toBe(0);
  });
});

describe('countRowFilter', () => {
  it('残る行数と除外した行数を返す', () => {
    expect(
      countRowFilter(
        rows,
        exclude([{ column: '状態', op: 'equals', value: '解約' }]),
      ),
    ).toEqual({ kept: 3, removed: 1 });
  });
});

describe('rowMatchesFilter', () => {
  it('exclude では条件に合った行が false になる', () => {
    const f = exclude([{ column: '状態', op: 'equals', value: '解約' }]);
    expect(rowMatchesFilter(rows[0], f)).toBe(true);
    expect(rowMatchesFilter(rows[1], f)).toBe(false);
  });
});
