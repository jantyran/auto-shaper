import { describe, it, expect } from 'vitest';
import { detectHeaderRow, buildColumnNames } from './parse';

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
