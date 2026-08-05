import { describe, expect, it } from 'vitest';
import {
  evaluateAutoFillExpression,
  validateAutoFillExpression,
} from './autoFillExpression';
import type { TargetField } from '../types';

const fields: TargetField[] = [
  {
    key: 'Company',
    label: '会社名',
    required: false,
    type: 'string',
    aliases: [],
  },
  {
    key: 'LeadSource',
    label: 'リードソース',
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
  },
];

describe('evaluateAutoFillExpression', () => {
  it('if とフィールド参照で条件分岐する', () => {
    expect(
      evaluateAutoFillExpression(
        'if({LeadSource} = "Web", "Webリード: {Company}", "会社名: {Company}")',
        { Company: 'A社', LeadSource: 'Web' },
        fields,
      ),
    ).toBe('Webリード: A社');
  });

  it('LeadSource が一致すれば会社名が空でも該当分岐を使う', () => {
    const leadFields: TargetField[] = [
      {
        key: 'leadsource',
        label: 'リードソース',
        required: false,
        type: 'string',
        aliases: ['LeadSource'],
      },
      {
        key: 'CompanyName',
        label: 'Company Name',
        required: false,
        type: 'string',
        aliases: [],
      },
    ];
    expect(
      evaluateAutoFillExpression(
        'case({LeadSource} = "Alfa Laval website", "Website: " & {Company Name}, "Other: " & {Company Name})',
        { leadsource: ' Alfa Laval website ', CompanyName: '' },
        leadFields,
      ),
    ).toBe('Website: ');
  });

  it('表示名のフィールド参照と文字列結合を使える', () => {
    expect(
      evaluateAutoFillExpression(
        '"会社名: " & {会社名}',
        { Company: 'A社' },
        fields,
      ),
    ).toBe('会社名: A社');
  });

  it('value/label/key の属性付きフィールド参照を使える', () => {
    expect(
      evaluateAutoFillExpression(
        '"{Company.label}: " & {Company.value} & " / " & {Company.key}',
        { Company: 'A社' },
        fields,
      ),
    ).toBe('会社名: A社 / Company');
    expect(
      evaluateAutoFillExpression('{Company.labal}', { Company: 'A社' }, fields),
    ).toBe('会社名');
    expect(
      evaluateAutoFillExpression(
        '"{Company}.label: " & {Company}.value',
        { Company: 'A社' },
        fields,
      ),
    ).toBe('会社名: A社');
  });

  it('case で複数分岐を書ける', () => {
    expect(
      evaluateAutoFillExpression(
        'case({LeadSource} = "Web", "Web", {LeadSource} = "展示会", "Event", "Other")',
        { LeadSource: '展示会' },
        fields,
      ),
    ).toBe('Event');
  });

  it('coalesce で最初の非空値を使える', () => {
    expect(
      evaluateAutoFillExpression(
        'coalesce({Topic}, {Company}, "不明")',
        { Company: 'A社', Topic: '' },
        fields,
      ),
    ).toBe('A社');
  });

  it('contains と empty を使える', () => {
    expect(
      evaluateAutoFillExpression(
        'if(contains({LeadSource}, "展示"), "展示会", "その他")',
        { LeadSource: '春の展示会' },
        fields,
      ),
    ).toBe('展示会');
    expect(evaluateAutoFillExpression('empty({Topic})', {}, fields)).toBe(
      'true',
    );
  });

  it('validateAutoFillExpression は式エラーを返す', () => {
    expect(
      validateAutoFillExpression('{Company}.value', fields),
    ).toBeUndefined();
    expect(validateAutoFillExpression('"x" : {Company}', fields)).toContain(
      '未対応の文字です: :',
    );
  });
});
