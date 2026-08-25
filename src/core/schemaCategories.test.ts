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
      expect(inCategory.length, `${category} のプリセットが0件`).toBeGreaterThan(
        0,
      );
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
    expect(mergeSettings({ schemaCategories: ['hr'] }).schemaCategories).toEqual(
      ['hr'],
    );
    expect(mergeSettings({ schemaCategories: [] }).schemaCategories).toEqual([]);
  });

  it('補完した既定値は共有されず、変更しても DEFAULT_SETTINGS に影響しない', () => {
    const merged = mergeSettings({});
    merged.schemaCategories.push('hr');
    expect(DEFAULT_SETTINGS.schemaCategories).toEqual(['crm', 'ma']);
  });
});
