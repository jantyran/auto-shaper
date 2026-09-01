import { describe, it, expect } from 'vitest';
import { applyValueMap, compactValueMap, draftValueMap } from './valueMap';

const MAP = [
  { from: '東京都', to: '13' },
  { from: '大阪府', to: '27' },
];

describe('applyValueMap', () => {
  it('一致した値を置き換える', () => {
    expect(applyValueMap('東京都', MAP)).toBe('13');
    expect(applyValueMap('大阪府', MAP)).toBe('27');
  });

  it('前後の空白・全角半角・英字の大小を無視して照合する', () => {
    expect(applyValueMap('  東京都 ', MAP)).toBe('13');
    expect(applyValueMap('ＡＢＣ', [{ from: 'abc', to: 'OK' }])).toBe('OK');
    expect(applyValueMap('Yes', [{ from: 'YES', to: 'TRUE' }])).toBe('TRUE');
  });

  it('表が空なら何もしない', () => {
    expect(applyValueMap('東京都', [])).toBe('東京都');
    expect(applyValueMap('東京都', undefined)).toBe('東京都');
  });

  it('未指定なら一致しない値はそのまま通す', () => {
    expect(applyValueMap('北海道', MAP)).toBe('北海道');
  });

  it('fallback を指定すると一致しない値をそれに置き換える', () => {
    expect(applyValueMap('北海道', MAP, 'その他')).toBe('その他');
    expect(applyValueMap('北海道', MAP, '')).toBe('');
  });

  it('空欄には fallback を当てない(空欄が一律に埋まる事故を防ぐ)', () => {
    expect(applyValueMap('', MAP, 'その他')).toBe('');
    expect(applyValueMap('   ', MAP, 'その他')).toBe('   ');
  });

  it('空欄を明示的に置き換えたい場合は from を空にすれば効く', () => {
    expect(applyValueMap('', [{ from: '', to: '未設定' }])).toBe('未設定');
  });

  it('先に書いた行が優先される', () => {
    const dup = [
      { from: '済', to: 'TRUE' },
      { from: '済', to: 'DONE' },
    ];
    expect(applyValueMap('済', dup)).toBe('TRUE');
  });
});

describe('compactValueMap', () => {
  it('元の値が空の行は効かないので落とす', () => {
    expect(
      compactValueMap([
        { from: '済', to: 'TRUE' },
        { from: '  ', to: 'X' },
      ]),
    ).toEqual([{ from: '済', to: 'TRUE' }]);
  });
});

describe('draftValueMap', () => {
  it('出現した値を重複なく並べ、変換先には同じ値を入れる(下書きは無変更)', () => {
    expect(draftValueMap(['済', '未', '済', '', '  '])).toEqual([
      { from: '済', to: '済' },
      { from: '未', to: '未' },
    ]);
  });

  it('照合と同じ基準で重複を判定する', () => {
    expect(draftValueMap(['ABC', 'ａｂｃ'])).toEqual([
      { from: 'ABC', to: 'ABC' },
    ]);
  });

  it('件数の上限で打ち切る', () => {
    const many = Array.from({ length: 50 }, (_, i) => `v${i}`);
    expect(draftValueMap(many, 5).length).toBe(5);
  });
});

describe('applyFieldMapping との統合', () => {
  it('正規化のあとに置換表を当てる(表記ゆれを潰してから照合できる)', async () => {
    const { applyFieldMapping } = await import('./transformEngine');
    const out = applyFieldMapping(
      { 状態: '　済　' },
      {
        targetKey: 'Done',
        transform: { kind: 'direct', source: '状態' },
        normalizers: ['trim'],
        valueMap: [{ from: '済', to: 'TRUE' }],
        confidence: 1,
      },
    );
    expect(out).toBe('TRUE');
  });

  it('fallback を空にすると、表にない値は空欄になる', async () => {
    const { applyFieldMapping } = await import('./transformEngine');
    const out = applyFieldMapping(
      { 状態: '保留' },
      {
        targetKey: 'Done',
        transform: { kind: 'direct', source: '状態' },
        normalizers: [],
        valueMap: [{ from: '済', to: 'TRUE' }],
        valueMapFallback: '',
        confidence: 1,
      },
    );
    expect(out).toBe('');
  });
});
