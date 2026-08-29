import { describe, it, expect } from 'vitest';
import {
  checkColumnCount,
  checkDatasetSize,
  checkRowCount,
  COLUMN_HARD_LIMIT,
  ROW_HARD_LIMIT,
  ROW_WARN_THRESHOLD,
} from './limits';

describe('checkRowCount', () => {
  it('目安の範囲内なら何も言わない', () => {
    expect(checkRowCount(1000, 'x').level).toBe('ok');
    expect(checkRowCount(ROW_WARN_THRESHOLD, 'x').level).toBe('ok');
  });

  it('目安を超えたら警告するが処理は止めない', () => {
    const r = checkRowCount(ROW_WARN_THRESHOLD + 1, 'テスト.csv');
    expect(r.level).toBe('warn');
    expect(r.message).toContain('テスト.csv');
  });

  it('上限を超えたら受け付けない', () => {
    const r = checkRowCount(ROW_HARD_LIMIT + 1, 'テスト.csv');
    expect(r.level).toBe('over');
    expect(r.message).toContain('上限');
  });

  it('ちょうど上限なら通す', () => {
    expect(checkRowCount(ROW_HARD_LIMIT, 'x').level).toBe('warn');
  });
});

describe('checkColumnCount', () => {
  it('上限内なら通す', () => {
    expect(checkColumnCount(COLUMN_HARD_LIMIT, 'x').level).toBe('ok');
  });

  it('上限を超えたら受け付けない', () => {
    expect(checkColumnCount(COLUMN_HARD_LIMIT + 1, 'x').level).toBe('over');
  });
});

describe('checkDatasetSize', () => {
  it('列数の超過を行数より優先して伝える', () => {
    const r = checkDatasetSize(10, COLUMN_HARD_LIMIT + 1, 'x');
    expect(r.level).toBe('over');
    expect(r.message).toContain('列');
  });

  it('列が問題なければ行数の判定を返す', () => {
    expect(checkDatasetSize(10, 10, 'x').level).toBe('ok');
    expect(checkDatasetSize(ROW_HARD_LIMIT + 1, 10, 'x').level).toBe('over');
  });
});
