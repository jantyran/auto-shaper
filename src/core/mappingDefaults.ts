/**
 * テンプレートの既定値(defaultValue)の自動適用。
 *
 * 元データに対応する列が無い(未割当 = empty)フィールドに対して、
 * テンプレートで設定された既定の固定値を自動で入れる。
 * すでに列が割り当てられているフィールドは変更しない。
 *
 * 出力はターゲットの全項目を対象順に持つ(1項目=1マッピングの不変条件を保つ)。
 * ユーザーはこの後、マッピング画面で選択変更・自由入力での上書きができる。
 */
import type { FieldMapping, MappingConfig, TargetSchema } from '../types';

export function applyFieldDefaults(
  mapping: MappingConfig,
  target: TargetSchema,
): MappingConfig {
  const byKey = new Map(mapping.fields.map((m) => [m.targetKey, m]));

  const fields: FieldMapping[] = target.fields.map((f) => {
    const current: FieldMapping =
      byKey.get(f.key) ?? {
        targetKey: f.key,
        transform: { kind: 'empty' },
        normalizers: [],
        confidence: 0,
      };

    // 割当済みならそのまま
    if (current.transform.kind !== 'empty') return current;
    // 既定値が無ければ空のまま
    if (f.defaultValue == null || f.defaultValue === '') return current;

    return {
      ...current,
      transform: { kind: 'constant', value: f.defaultValue },
      confidence: Math.max(current.confidence, 0.6),
      rationale: 'テンプレートの既定値を自動設定',
    };
  });

  return { ...mapping, fields };
}
