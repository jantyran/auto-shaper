import { describe, it, expect } from 'vitest';
import {
  PRESET_SCHEMAS,
  SCHEMA_CATEGORY_LABELS,
  SCHEMA_CATEGORY_ORDER,
  getPresetById,
} from './targetSchemas';
import { DEFAULT_SETTINGS, mergeSettings } from './settings';

describe('プリセットのカテゴリ', () => {
  it('すべての内蔵プリセットにカテゴリが付いている', () => {
    for (const schema of PRESET_SCHEMAS) {
      expect(schema.category, `${schema.id} にカテゴリが無い`).toBeDefined();
      expect(SCHEMA_CATEGORY_ORDER).toContain(schema.category);
    }
  });

  it('列挙するカテゴリすべてに表示ラベルとプリセットがある', () => {
    for (const category of SCHEMA_CATEGORY_ORDER) {
      expect(SCHEMA_CATEGORY_LABELS[category]).toBeDefined();
      const inCategory = PRESET_SCHEMAS.filter((s) => s.category === category);
      expect(
        inCategory.length,
        `${category} のプリセットが0件`,
      ).toBeGreaterThan(0);
    }
  });

  it('プリセットのIDが重複していない', () => {
    const ids = PRESET_SCHEMAS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('各プリセットに必須項目が1つ以上ある', () => {
    for (const schema of PRESET_SCHEMAS) {
      const required = schema.fields.filter((f) => f.required);
      expect(required.length, `${schema.id} に必須項目が無い`).toBeGreaterThan(
        0,
      );
    }
  });

  it('defaultValue は options に含まれる値になっている', () => {
    for (const schema of PRESET_SCHEMAS) {
      for (const field of schema.fields) {
        if (field.defaultValue && field.options) {
          expect(
            field.options,
            `${schema.id}.${field.key} の既定値が選択肢に無い`,
          ).toContain(field.defaultValue);
        }
      }
    }
  });

  it('maxLength を持つ項目は正の整数になっている', () => {
    for (const schema of PRESET_SCHEMAS) {
      for (const field of schema.fields) {
        if (field.maxLength === undefined) continue;
        expect(
          field.maxLength,
          `${schema.id}.${field.key} の maxLength が不正`,
        ).toBeGreaterThan(0);
        expect(Number.isInteger(field.maxLength)).toBe(true);
      }
    }
  });

  it('getPresetById で新しいカテゴリのプリセットも引ける', () => {
    expect(getPresetById('shipping-label')?.category).toBe('logistics');
    expect(getPresetById('ad-report')?.category).toBe('ads');
    expect(getPresetById('存在しないID')).toBeUndefined();
  });
});

describe('表示カテゴリの設定', () => {
  it('既定では CRM と MA だけが有効', () => {
    expect(DEFAULT_SETTINGS.schemaCategories).toEqual(['crm', 'ma']);
  });

  it('カテゴリ設定が無い古い保存データには既定値を補完する', () => {
    const merged = mergeSettings({ features: DEFAULT_SETTINGS.features });
    expect(merged.schemaCategories).toEqual(['crm', 'ma']);
  });

  it('保存済みのカテゴリ設定はそのまま復元する(空選択も尊重する)', () => {
    expect(
      mergeSettings({ schemaCategories: ['hr'] }).schemaCategories,
    ).toEqual(['hr']);
    expect(mergeSettings({ schemaCategories: [] }).schemaCategories).toEqual(
      [],
    );
  });

  it('補完した既定値は共有されず、変更しても DEFAULT_SETTINGS に影響しない', () => {
    const merged = mergeSettings({});
    merged.schemaCategories.push('hr');
    expect(DEFAULT_SETTINGS.schemaCategories).toEqual(['crm', 'ma']);
  });
});

describe('Marketo Engage プリセット', () => {
  const marketo = getPresetById('marketo-lead');

  it('MAカテゴリに登録されている', () => {
    expect(marketo?.category).toBe('ma');
  });

  it('必須は email(重複判定キー)だけ', () => {
    const required = marketo?.fields
      .filter((f) => f.required)
      .map((f) => f.key);
    expect(required).toEqual(['email']);
  });

  it('キーが Marketo の REST API 名になっている', () => {
    const keys = marketo?.fields.map((f) => f.key) ?? [];
    // リスト取り込みのCSVヘッダーにそのまま使うため、表示名ではなくAPI名。
    expect(keys).toContain('mobilePhone');
    expect(keys).toContain('postalCode');
    expect(keys).toContain('numberOfEmployees');
    expect(keys).toContain('leadSource');
    expect(keys).toContain('unsubscribed');
    // スネークケース/キャメルケースの取り違えが無いこと
    expect(keys.some((k) => k.includes('_'))).toBe(false);
  });

  it('配信停止に既定値を持たせない(既存のオプトアウトを上書きしないため)', () => {
    const unsubscribed = marketo?.fields.find((f) => f.key === 'unsubscribed');
    expect(unsubscribed?.defaultValue).toBeUndefined();
    expect(unsubscribed?.options).toEqual(['false', 'true']);
  });
});

describe('CRM プリセットの必須項目', () => {
  it('HubSpot コンタクトの必須は email だけ(姓名は任意)', () => {
    const required = getPresetById('hubspot-contact')
      ?.fields.filter((f) => f.required)
      .map((f) => f.key);
    expect(required).toEqual(['email']);
  });

  it('Salesforce リードに住所一式が揃っている', () => {
    const keys = getPresetById('salesforce-lead')?.fields.map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'Street',
        'City',
        'State',
        'PostalCode',
        'Country',
      ]),
    );
  });

  it('Salesforce リードの主要項目に文字数上限が入っている', () => {
    const fields = getPresetById('salesforce-lead')?.fields ?? [];
    const max = (key: string) => fields.find((f) => f.key === key)?.maxLength;
    expect(max('LastName')).toBe(80);
    expect(max('FirstName')).toBe(40);
    expect(max('Email')).toBe(80);
    expect(max('City')).toBe(40);
    expect(max('PostalCode')).toBe(20);
  });
});
