import { describe, it, expect } from 'vitest';
import { normalizeDate, normalizeNumber } from './normalizeValue';

describe('normalizeDate', () => {
  it('区切り違いをすべて YYYY-MM-DD に揃える', () => {
    expect(normalizeDate('2024-01-05')).toBe('2024-01-05');
    expect(normalizeDate('2024/1/5')).toBe('2024-01-05');
    expect(normalizeDate('2024.1.5')).toBe('2024-01-05');
    expect(normalizeDate('2024年1月5日')).toBe('2024-01-05');
    expect(normalizeDate('20240105')).toBe('2024-01-05');
  });

  it('全角数字を受け付ける', () => {
    expect(normalizeDate('２０２４年１月５日')).toBe('2024-01-05');
  });

  it('時刻が付いていれば落とす', () => {
    expect(normalizeDate('2024/1/5 13:45')).toBe('2024-01-05');
    expect(normalizeDate('2024-01-05T09:00:00')).toBe('2024-01-05');
  });

  it('和暦を西暦にする', () => {
    expect(normalizeDate('令和6年1月5日')).toBe('2024-01-05');
    expect(normalizeDate('R6.1.5')).toBe('2024-01-05');
    expect(normalizeDate('平成31年4月30日')).toBe('2019-04-30');
    expect(normalizeDate('昭和64年1月7日')).toBe('1989-01-07');
  });

  it('元年を1年として扱う', () => {
    expect(normalizeDate('令和元年5月1日')).toBe('2019-05-01');
  });

  it('Excelのシリアル値を日付にする', () => {
    expect(normalizeDate('45296')).toBe('2024-01-05');
    expect(normalizeDate('25569')).toBe('1970-01-01');
  });

  it('小さい整数は日付に変えない(個数やIDを壊さない)', () => {
    expect(normalizeDate('1')).toBe('1');
    expect(normalizeDate('2024')).toBe('2024');
  });

  it('存在しない日付は変換せず元の値を残す', () => {
    expect(normalizeDate('2024/2/31')).toBe('2024/2/31');
    expect(normalizeDate('2024/13/1')).toBe('2024/13/1');
  });

  it('日付として読めない値はそのまま返す(空白だけ落とす)', () => {
    expect(normalizeDate('  未定  ')).toBe('未定');
    expect(normalizeDate('')).toBe('');
  });

  it('月日が先の表記は曖昧なので変換しない', () => {
    expect(normalizeDate('1/5/2024')).toBe('1/5/2024');
  });
});

describe('normalizeNumber', () => {
  it('桁区切りと通貨記号を落とす', () => {
    expect(normalizeNumber('1,000')).toBe('1000');
    expect(normalizeNumber('¥1,000')).toBe('1000');
    expect(normalizeNumber('1000円')).toBe('1000');
    expect(normalizeNumber('$1,234.56')).toBe('1234.56');
  });

  it('全角数字を半角にする', () => {
    expect(normalizeNumber('１２３')).toBe('123');
    expect(normalizeNumber('１，０００')).toBe('1000');
  });

  it('会計表記の丸括弧を負数として扱う', () => {
    expect(normalizeNumber('(1,000)')).toBe('-1000');
    expect(normalizeNumber('▲500')).toBe('-500');
    expect(normalizeNumber('-1,000')).toBe('-1000');
  });

  it('負のゼロを作らない', () => {
    expect(normalizeNumber('(0)')).toBe('0');
  });

  it('単位付きの件数を数値にする', () => {
    expect(normalizeNumber('12 件')).toBe('12');
    expect(normalizeNumber('50%')).toBe('50');
  });

  it('数値として読めない値はそのまま返す', () => {
    expect(normalizeNumber('未定')).toBe('未定');
    expect(normalizeNumber('1-2-3')).toBe('1-2-3');
    expect(normalizeNumber('')).toBe('');
  });
});
