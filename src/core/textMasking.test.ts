import { describe, it, expect } from 'vitest';
import {
  autoMaskText,
  manualMaskSelection,
  unmaskText,
  unmaskRecord,
  splitByTokens,
  type MaskDictionary,
} from './textMasking';

const empty = (): MaskDictionary => new Map();

describe('autoMaskText', () => {
  it('メール・電話をトークン化し、辞書に元の値を保持する', () => {
    const src = 'ご連絡先は yamada@example.co.jp、電話 03-1234-5678 です。';
    const { maskedText, dictionary } = autoMaskText(src, empty());

    expect(maskedText).not.toContain('yamada@example.co.jp');
    expect(maskedText).not.toContain('03-1234-5678');
    expect(maskedText).toContain('[EMAIL_1]');
    expect(maskedText).toContain('[PHONE_1]');

    // 復元すると元に戻る
    expect(unmaskText(maskedText, dictionary)).toBe(src);
  });

  it('同じ値は同じトークンに寄せる', () => {
    const src = 'a@x.com に送付、控えも a@x.com へ。';
    const { maskedText, dictionary } = autoMaskText(src, empty());
    const emailTokens = [...dictionary.values()].filter((t) => t.category === 'EMAIL');
    expect(emailTokens.length).toBe(1);
    expect(maskedText.match(/\[EMAIL_1\]/g)?.length).toBe(2);
  });

  it('短い数字（年号・金額）は電話として誤検出しない', () => {
    const src = '2024年の売上は500万円でした。';
    const { maskedText } = autoMaskText(src, empty());
    expect(maskedText).not.toContain('[PHONE_1]');
  });

  it('5桁以上の連続数字は番号としてマスクする', () => {
    const src = '注文番号 987654 を確認しました。';
    const { maskedText, dictionary } = autoMaskText(src, empty());
    expect(maskedText).toContain('[NUM_1]');
    expect(unmaskText(maskedText, dictionary)).toBe(src);
  });

  it('既存辞書を保持したまま追記する（インデックスが衝突しない）', () => {
    const first = autoMaskText('a@x.com', empty());
    const second = autoMaskText('b@y.com', first.dictionary);
    const displays = [...second.dictionary.values()].map((t) => t.display);
    expect(displays).toContain('[EMAIL_1]');
    expect(displays).toContain('[EMAIL_2]');
  });
});

describe('manualMaskSelection', () => {
  it('選択範囲を指定カテゴリでマスクし、同一文字列を全置換する', () => {
    const src = '株式会社サンプルの件、サンプル担当者より連絡します。（株式会社サンプル）';
    const start = src.indexOf('株式会社サンプル');
    const end = start + '株式会社サンプル'.length;
    const res = manualMaskSelection(src, start, end, 'COMPANY', empty());
    expect(res).not.toBeNull();
    expect(res!.maskedText.match(/\[COMPANY_1\]/g)?.length).toBe(2);
    expect(res!.maskedText).not.toContain('株式会社サンプル');
    expect(unmaskText(res!.maskedText, res!.dictionary)).toBe(src);
  });

  it('選択が空なら null を返す', () => {
    expect(manualMaskSelection('abc', 1, 1, 'NAME', empty())).toBeNull();
  });
});

describe('unmaskRecord / splitByTokens', () => {
  it('レコードの各値を復元する', () => {
    const { dictionary } = autoMaskText('a@x.com', empty());
    const restored = unmaskRecord({ Email: '[EMAIL_1]', Name: '山田' }, dictionary);
    expect(restored.Email).toBe('a@x.com');
    expect(restored.Name).toBe('山田');
  });

  it('トークン境界で分割する', () => {
    expect(splitByTokens('前[EMAIL_1]後')).toEqual(['前', '[EMAIL_1]', '後']);
  });
});
