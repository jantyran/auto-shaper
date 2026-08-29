import { describe, it, expect } from 'vitest';
import {
  applyDedupe,
  defaultDedupeConfig,
  findDuplicates,
  mergeRows,
  suggestDedupeKeys,
  type DedupeConfig,
} from './dedupe';
import type { TargetSchema } from '../types';

const target: TargetSchema = {
  id: 't',
  name: 'T',
  origin: 'preset',
  fields: [
    {
      key: 'Company',
      label: '会社名',
      required: false,
      type: 'string',
      aliases: [],
    },
    {
      key: 'LastName',
      label: '姓',
      required: false,
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
    {
      key: 'Phone',
      label: '電話',
      required: false,
      type: 'phone',
      aliases: [],
    },
    {
      key: 'Title',
      label: '役職',
      required: false,
      type: 'string',
      aliases: [],
    },
  ],
};

const cfg = (patch: Partial<DedupeConfig> = {}): DedupeConfig => ({
  ...defaultDedupeConfig(target),
  ...patch,
});

const rows = [
  {
    Company: 'ABC商事',
    LastName: '山田',
    Email: 'a@x.jp',
    Phone: '',
    Title: '',
  },
  {
    Company: 'B社',
    LastName: '佐藤',
    Email: 'b@x.jp',
    Phone: '03-1',
    Title: '',
  },
  {
    Company: 'ABC商事',
    LastName: '山田',
    Email: 'A@X.JP',
    Phone: '03-9',
    Title: '',
  },
  {
    Company: 'ABC商事',
    LastName: '山田',
    Email: 'a@x.jp',
    Phone: '',
    Title: '部長',
  },
];

describe('suggestDedupeKeys', () => {
  it('メール項目があればそれを使う', () => {
    expect(suggestDedupeKeys(target)).toEqual(['Email']);
  });

  it('メールが無ければ会社名+姓を使う', () => {
    const noEmail = {
      ...target,
      fields: target.fields.filter((f) => f.type !== 'email'),
    };
    expect(suggestDedupeKeys(noEmail)).toEqual(['Company', 'LastName']);
  });

  it('既定は「検出のみ」で従来どおりの動作にする', () => {
    expect(defaultDedupeConfig(target).action).toBe('report');
  });
});

describe('findDuplicates', () => {
  it('緩い照合では大小・全角半角の違いを同一視する', () => {
    const r = findDuplicates(rows, cfg());
    expect(r.groups.length).toBe(1);
    expect(r.groups[0].rows).toEqual([0, 2, 3]);
  });

  it('厳密照合では文字が違えば別物として扱う', () => {
    const r = findDuplicates(rows, cfg({ loose: false }));
    expect(r.groups[0].rows).toEqual([0, 3]);
  });

  it('複数キーはすべて一致した場合だけ重複とみなす', () => {
    const two = [
      { Company: 'A社', LastName: '山田' },
      { Company: 'A社', LastName: '鈴木' },
      { Company: 'A社', LastName: '山田' },
    ];
    const r = findDuplicates(two, cfg({ keyFields: ['Company', 'LastName'] }));
    expect(r.groups.length).toBe(1);
    expect(r.groups[0].rows).toEqual([0, 2]);
  });

  it('キーが空の行同士は同一視しない', () => {
    const blanks = [{ Email: '' }, { Email: '' }];
    expect(findDuplicates(blanks, cfg()).groups.length).toBe(0);
  });

  it('キーを1つも選ばなければ判定しない', () => {
    expect(findDuplicates(rows, cfg({ keyFields: [] })).groups.length).toBe(0);
  });
});

describe('mergeRows', () => {
  it('項目ごとに空でない最初の値を拾う', () => {
    expect(mergeRows(rows, [0, 2, 3], 'firstNonEmpty')).toEqual({
      Company: 'ABC商事',
      LastName: '山田',
      Email: 'a@x.jp',
      Phone: '03-9',
      Title: '部長',
    });
  });

  it('最後の値を優先すると、後の行の値が勝つ', () => {
    const m = mergeRows(rows, [0, 2, 3], 'lastNonEmpty');
    expect(m.Email).toBe('a@x.jp');
    expect(m.Title).toBe('部長');
    expect(m.Phone).toBe('03-9');
  });

  it('どの行にも値が無い項目でも列は残る', () => {
    const m = mergeRows(
      [
        { A: '', B: 'x' },
        { A: '', B: '' },
      ],
      [0, 1],
    );
    expect(m).toEqual({ A: '', B: 'x' });
  });
});

describe('applyDedupe', () => {
  it('report では行を減らさない', () => {
    const r = applyDedupe(rows, cfg({ action: 'report' }));
    expect(r.rows.length).toBe(4);
    expect(r.removed).toBe(0);
  });

  it('keepFirst はグループの先頭だけ残す', () => {
    const r = applyDedupe(rows, cfg({ action: 'keepFirst' }));
    expect(r.rows.length).toBe(2);
    expect(r.rows[0].Phone).toBe('');
    expect(r.removed).toBe(2);
  });

  it('keepLast はグループの末尾だけ残す', () => {
    const r = applyDedupe(rows, cfg({ action: 'keepLast' }));
    expect(r.rows.length).toBe(2);
    expect(r.rows.find((x) => x.Company === 'ABC商事')?.Title).toBe('部長');
  });

  it('merge は1行にまとめ、散らばった値を集める', () => {
    const r = applyDedupe(rows, cfg({ action: 'merge' }));
    expect(r.rows.length).toBe(2);
    const merged = r.rows.find((x) => x.Company === 'ABC商事');
    expect(merged).toEqual({
      Company: 'ABC商事',
      LastName: '山田',
      Email: 'a@x.jp',
      Phone: '03-9',
      Title: '部長',
    });
  });

  it('統合後も元の並び順を保つ', () => {
    const r = applyDedupe(rows, cfg({ action: 'merge' }));
    expect(r.rows.map((x) => x.Company)).toEqual(['ABC商事', 'B社']);
  });

  it('重複が無ければ入力をそのまま返す', () => {
    const uniq = [{ Email: 'a@x.jp' }, { Email: 'b@x.jp' }];
    const r = applyDedupe(uniq, cfg({ action: 'merge' }));
    expect(r.rows).toBe(uniq);
    expect(r.removed).toBe(0);
  });
});
