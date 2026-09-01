/**
 * 値の置換表エディタ。
 *
 * 取り込み先の選択肢は値が完全一致しないと弾かれるため、
 * 「東京都 → 13」「済 → TRUE」のような対応をここで表として持てるようにする。
 * 元データに実際に出てくる値から候補を起こせるので、値を目視で拾う手間が要らない。
 */
import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import type { FieldMapping, TargetField, ValueMapEntry } from '../types';
import { applyNormalizers } from '../core/normalize';
import { evalTransform } from '../core/transformEngine';
import { compactValueMap, draftValueMap } from '../core/valueMap';
import { importContextToRow } from '../core/importContext';
import { fieldOptionItems } from '../core/fieldMeta';

/** 表にない値の扱い */
type FallbackMode = 'keep' | 'empty' | 'constant';

function fallbackMode(fallback: string | undefined): FallbackMode {
  if (fallback == null) return 'keep';
  return fallback === '' ? 'empty' : 'constant';
}

export function ValueMapEditor({
  field,
  mapping,
  onChange,
}: {
  field: TargetField;
  mapping: FieldMapping;
  onChange: (m: FieldMapping) => void;
}) {
  const source = useStore((s) => s.source);
  const importContext = useStore((s) => s.importContext);
  const entries = mapping.valueMap ?? [];
  const [open, setOpen] = useState(entries.length > 0);

  const options = fieldOptionItems(field);
  const datalistId = `vm-opts-${field.key}`;

  // 置換前(Transform + 正規化まで)の値。候補の下書きに使う。
  const sourceValues = useMemo(() => {
    if (!source) return [];
    const context = importContextToRow(importContext);
    return source.rows.map((row) =>
      applyNormalizers(
        evalTransform(row, mapping.transform, context),
        mapping.normalizers,
      ),
    );
  }, [source, importContext, mapping.transform, mapping.normalizers]);

  const update = (next: ValueMapEntry[]) =>
    onChange({ ...mapping, valueMap: next, confidence: 1 });

  const setFallback = (mode: FallbackMode, value = '') => {
    const valueMapFallback =
      mode === 'keep' ? undefined : mode === 'empty' ? '' : value;
    onChange({ ...mapping, valueMapFallback, confidence: 1 });
  };

  const mode = fallbackMode(mapping.valueMapFallback);
  const active = compactValueMap(entries).length;

  if (!open) {
    return (
      <div className="value-map-toggle">
        <button type="button" className="ghost" onClick={() => setOpen(true)}>
          値の対応表を作る
        </button>
        <span className="subtitle" style={{ margin: 0 }}>
          「東京都 → 13」のように、値そのものを別の値へ置き換えます。
        </span>
      </div>
    );
  }

  return (
    <div className="value-map">
      <div className="value-map-head">
        <span className="value-map-title">値の対応表</span>
        {active > 0 && <span className="value-map-count">{active} 件</span>}
        <div className="spacer" />
        <button
          type="button"
          className="ghost"
          onClick={() => update(draftValueMap(sourceValues))}
          disabled={sourceValues.length === 0}
          title="元データに出てくる値を重複なく並べます"
        >
          元データから候補を入れる
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            onChange({
              ...mapping,
              valueMap: undefined,
              valueMapFallback: undefined,
              confidence: 1,
            });
            setOpen(false);
          }}
        >
          対応表をやめる
        </button>
      </div>

      {options.length > 0 && (
        <datalist id={datalistId}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </datalist>
      )}

      <table className="value-map-table">
        <thead>
          <tr>
            <th>元の値</th>
            <th aria-hidden="true" />
            <th>置き換え後</th>
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => (
            <tr key={i}>
              <td>
                <input
                  type="text"
                  value={entry.from}
                  placeholder="元データの値"
                  onChange={(e) =>
                    update(
                      entries.map((x, j) =>
                        j === i ? { ...x, from: e.target.value } : x,
                      ),
                    )
                  }
                />
              </td>
              <td className="value-map-arrow">→</td>
              <td>
                <input
                  type="text"
                  value={entry.to}
                  placeholder="取り込み先の値"
                  list={options.length > 0 ? datalistId : undefined}
                  onChange={(e) =>
                    update(
                      entries.map((x, j) =>
                        j === i ? { ...x, to: e.target.value } : x,
                      ),
                    )
                  }
                />
              </td>
              <td>
                <button
                  type="button"
                  className="ghost"
                  aria-label={`${i + 1}行目を削除`}
                  onClick={() => update(entries.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="value-map-foot">
        <button
          type="button"
          className="ghost"
          onClick={() => update([...entries, { from: '', to: '' }])}
        >
          + 行を追加
        </button>
        <div className="spacer" />
        <label className="read-options-inline">
          表にない値は
          <select
            value={mode}
            onChange={(e) => setFallback(e.target.value as FallbackMode)}
          >
            <option value="keep">そのまま通す</option>
            <option value="empty">空にする</option>
            <option value="constant">決めた値にする</option>
          </select>
        </label>
        {mode === 'constant' && (
          <input
            type="text"
            style={{ maxWidth: 160 }}
            value={mapping.valueMapFallback ?? ''}
            placeholder="例: その他"
            list={options.length > 0 ? datalistId : undefined}
            onChange={(e) => setFallback('constant', e.target.value)}
          />
        )}
      </div>
      <p className="subtitle" style={{ margin: '6px 0 0' }}>
        照合は前後の空白・全角半角・英字の大小を無視します（
        <code>ＡＢＣ</code> と <code>abc</code> は同じ値として扱われます）。
        空欄の行は置き換えの対象外です。
      </p>
    </div>
  );
}
