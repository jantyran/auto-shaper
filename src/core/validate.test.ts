import { describe, it, expect } from 'vitest';
import { validateRows } from './validate';
import type { TargetSchema } from '../types';

const target: TargetSchema = {
  id: 't',
  name: 'T',
  origin: 'preset',
  fields: [
    {
      key: 'Company',
      label: '会社名',
      required: true,
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
  ],
};

describe('validateRows', () => {
  it('必須項目の空・メール/電話の形式不正を検出する', () => {
    const rows = [
      { Company: '株式会社A', Email: 'a@example.com', Phone: '0312345678' }, // OK
      { Company: '', Email: 'not-an-email', Phone: '123' }, // 3件の問題
    ];
    const r = validateRows(rows, target);
    expect(r.counts.required).toBe(1);
    expect(r.counts.email).toBe(1);
    expect(r.counts.phone).toBe(1);
    expect(r.issues.length).toBe(3);
    expect(r.invalidRows.has(0)).toBe(false);
    expect(r.invalidRows.has(1)).toBe(true);
  });

  it('問題がなければ issues は空', () => {
    const rows = [{ Company: 'X', Email: '', Phone: '' }];
    const r = validateRows(rows, target);
    expect(r.issues.length).toBe(0);
    expect(r.invalidRows.size).toBe(0);
  });

  it('数値・URL・選択肢の型を検証する', () => {
    const t: TargetSchema = {
      id: 't2',
      name: 'T2',
      origin: 'preset',
      fields: [
        {
          key: 'Emp',
          label: '従業員数',
          required: false,
          type: 'number',
          aliases: [],
        },
        {
          key: 'Web',
          label: 'サイト',
          required: false,
          type: 'url',
          aliases: [],
        },
        {
          key: 'Rank',
          label: 'ランク',
          required: false,
          type: 'string',
          aliases: [],
          options: ['A', 'B', 'C'],
        },
      ],
    };
    const rows = [
      { Emp: '1,200', Web: 'https://a.example', Rank: 'A' }, // OK (カンマ数値・URL・選択肢内)
      { Emp: '約100名', Web: 'example.com', Rank: 'Z' }, // 3件の問題
    ];
    const r = validateRows(rows, t);
    expect(r.counts.number).toBe(1);
    expect(r.counts.url).toBe(1);
    expect(r.counts.option).toBe(1);
    expect(r.invalidRows.has(0)).toBe(false);
    expect(r.invalidRows.has(1)).toBe(true);
  });
});

describe('文字数上限(maxLength)', () => {
  const schema: TargetSchema = {
    id: 's',
    name: '上限つき',
    origin: 'custom',
    fields: [
      {
        key: 'Company',
        label: '会社名',
        required: false,
        type: 'string' as const,
        aliases: [],
        maxLength: 5,
      },
    ],
  };

  it('上限を超えた行を検出する', () => {
    const r = validateRows([{ Company: 'あいうえおか' }], schema);
    expect(r.counts.maxLength).toBe(1);
    expect(r.invalidRows.has(0)).toBe(true);
    expect(r.issues[0].kind).toBe('maxLength');
  });

  it('ちょうど上限なら通す', () => {
    const r = validateRows([{ Company: 'あいうえお' }], schema);
    expect(r.counts.maxLength).toBe(0);
  });

  it('上限が未設定なら何文字でも通す', () => {
    const noLimit = {
      ...schema,
      fields: [{ ...schema.fields[0], maxLength: undefined }],
    };
    const r = validateRows([{ Company: 'あ'.repeat(500) }], noLimit);
    expect(r.counts.maxLength).toBe(0);
  });

  it('空欄は上限超過にしない', () => {
    const r = validateRows([{ Company: '' }], schema);
    expect(r.counts.maxLength).toBe(0);
  });
});
