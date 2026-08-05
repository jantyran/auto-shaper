import { describe, it, expect } from 'vitest';
import { applyFieldDefaults, applyRecordDefaults } from './mappingDefaults';
import type { MappingConfig, TargetSchema } from '../types';

const target: TargetSchema = {
  id: 't',
  name: 'T',
  origin: 'custom',
  fields: [
    {
      key: 'Company',
      label: '会社名',
      required: true,
      type: 'string',
      aliases: [],
    },
    {
      key: 'LeadSource',
      label: 'リードソース',
      required: false,
      type: 'string',
      aliases: [],
      options: ['Web', '展示会'],
      defaultValue: '外部リスト',
    },
    {
      key: 'Note',
      label: '備考',
      required: false,
      type: 'string',
      aliases: [],
    },
    {
      key: 'Topic',
      label: 'TOPIC名',
      required: false,
      type: 'string',
      aliases: [],
      autoFill: {
        template: '会社名: {Company}',
        cases: [
          {
            sourceFieldKey: 'LeadSource',
            op: 'equals',
            value: 'Web',
            template: 'Webリード: {会社名}',
          },
        ],
      },
    },
  ],
};

describe('applyFieldDefaults', () => {
  it('未割当かつ既定値ありのフィールドを固定値で埋める', () => {
    const mapping: MappingConfig = {
      targetSchemaId: 't',
      fields: [
        {
          targetKey: 'Company',
          transform: { kind: 'direct', source: '会社' },
          normalizers: [],
          confidence: 1,
        },
        {
          targetKey: 'LeadSource',
          transform: { kind: 'empty' },
          normalizers: [],
          confidence: 0,
        },
        {
          targetKey: 'Note',
          transform: { kind: 'empty' },
          normalizers: [],
          confidence: 0,
        },
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
    expect(out.fields.map((f) => f.targetKey)).toEqual([
      'Company',
      'LeadSource',
      'Note',
      'Topic',
    ]);
    const lead = out.fields.find((f) => f.targetKey === 'LeadSource')!;
    expect(lead.transform).toEqual({ kind: 'constant', value: '外部リスト' });
  });

  it('自動記入ルールを template transform として補う', () => {
    const mapping: MappingConfig = { targetSchemaId: 't', fields: [] };
    const out = applyFieldDefaults(mapping, target);
    const topic = out.fields.find((f) => f.targetKey === 'Topic')!;
    expect(topic.transform.kind).toBe('template');
    if (topic.transform.kind === 'template') {
      expect(topic.transform.template).toBe('会社名: {Company}');
      expect(topic.transform.cases?.[0].template).toBe('Webリード: {会社名}');
    }
  });
});

describe('applyRecordDefaults', () => {
  it('空の項目にだけ既定値を入れ、値がある項目は保持する', () => {
    const out = applyRecordDefaults({ Company: 'A社' }, target);
    expect(out.Company).toBe('A社'); // 既存値は維持
    expect(out.LeadSource).toBe('外部リスト'); // 既定値で補完
    expect('Note' in out).toBe(false); // 既定値の無い空項目は入れない
    expect(out.Topic).toBe('会社名: A社');
  });

  it('基本テンプレートでも label/value/key 属性を使える', () => {
    const withAttrs = {
      ...target,
      fields: target.fields.map((f) =>
        f.key === 'Topic'
          ? {
              ...f,
              autoFill: {
                template: '{Company.label}: {Company.value} ({Company.key})',
              },
            }
          : f,
      ),
    };
    const out = applyRecordDefaults({ Company: 'A社' }, withAttrs);
    expect(out.Topic).toBe('会社名: A社 (Company)');
  });

  it('既に値がある既定値項目は上書きしない', () => {
    const out = applyRecordDefaults({ LeadSource: 'Web' }, target);
    expect(out.LeadSource).toBe('Web');
  });

  it('条件付き自動記入ルールを適用し、表示名プレースホルダーを解決する', () => {
    const out = applyRecordDefaults(
      { Company: 'A社', LeadSource: 'Web' },
      target,
    );
    expect(out.Topic).toBe('Webリード: A社');
  });
});
