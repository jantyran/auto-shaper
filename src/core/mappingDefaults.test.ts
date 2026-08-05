import { describe, it, expect } from 'vitest';
import { applyFieldDefaults, applyRecordDefaults } from './mappingDefaults';
import type { MappingConfig, TargetSchema } from '../types';

const target: TargetSchema = {
  id: 't',
  name: 'T',
  origin: 'custom',
  fields: [
    { key: 'Company', label: '会社名', required: true, type: 'string', aliases: [] },
    {
      key: 'LeadSource',
      label: 'リードソース',
      required: false,
      type: 'string',
      aliases: [],
      options: ['Web', '展示会'],
      defaultValue: '外部リスト',
    },
    { key: 'Note', label: '備考', required: false, type: 'string', aliases: [] },
  ],
};

describe('applyFieldDefaults', () => {
  it('未割当かつ既定値ありのフィールドを固定値で埋める', () => {
    const mapping: MappingConfig = {
      targetSchemaId: 't',
      fields: [
        { targetKey: 'Company', transform: { kind: 'direct', source: '会社' }, normalizers: [], confidence: 1 },
        { targetKey: 'LeadSource', transform: { kind: 'empty' }, normalizers: [], confidence: 0 },
        { targetKey: 'Note', transform: { kind: 'empty' }, normalizers: [], confidence: 0 },
      ],
    };
    const out = applyFieldDefaults(mapping, target);
    const lead = out.fields.find((f) => f.targetKey === 'LeadSource')!;
    expect(lead.transform).toEqual({ kind: 'constant', value: '外部リスト' });

    // 既定値の無い未割当はそのまま空
    const note = out.fields.find((f) => f.targetKey === 'Note')!;
    expect(note.transform.kind).toBe('empty');

    // 割当済みは変更しない
    const company = out.fields.find((f) => f.targetKey === 'Company')!;
    expect(company.transform).toEqual({ kind: 'direct', source: '会社' });
  });

  it('マッピングに項目が欠けていてもターゲット全項目を補い、既定値を入れる', () => {
    const mapping: MappingConfig = { targetSchemaId: 't', fields: [] };
    const out = applyFieldDefaults(mapping, target);
    expect(out.fields.map((f) => f.targetKey)).toEqual(['Company', 'LeadSource', 'Note']);
    const lead = out.fields.find((f) => f.targetKey === 'LeadSource')!;
    expect(lead.transform).toEqual({ kind: 'constant', value: '外部リスト' });
  });
});

describe('applyRecordDefaults', () => {
  it('空の項目にだけ既定値を入れ、値がある項目は保持する', () => {
    const out = applyRecordDefaults({ Company: 'A社' }, target);
    expect(out.Company).toBe('A社'); // 既存値は維持
    expect(out.LeadSource).toBe('外部リスト'); // 既定値で補完
    expect('Note' in out).toBe(false); // 既定値の無い空項目は入れない
  });

  it('既に値がある既定値項目は上書きしない', () => {
    const out = applyRecordDefaults({ LeadSource: 'Web' }, target);
    expect(out.LeadSource).toBe('Web');
  });
});
