import { createTranslator } from '../core/i18n';
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
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);

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
          {t('valueMap.create')}
        </button>
        <span className="subtitle" style={{ margin: 0 }}>
          {t('valueMap.description')}
        </span>
      </div>
    );
  }

  return (
    <div className="value-map">
      <div className="value-map-head">
        <span className="value-map-title">{t('valueMap.heading')}</span>
        {active > 0 && (
          <span className="value-map-count">
            {t('valueMap.count', { count: active })}
          </span>
        )}
        <div className="spacer" />
        <button
          type="button"
          className="ghost"
          onClick={() => update(draftValueMap(sourceValues))}
          disabled={sourceValues.length === 0}
          title={t('valueMap.draftTitle')}
        >
          {t('valueMap.draft')}
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
          {t('valueMap.remove')}
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
            <th>{t('valueMap.from')}</th>
            <th aria-hidden="true" />
            <th>{t('valueMap.to')}</th>
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
                  placeholder={t('valueMap.sourcePlaceholder')}
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
                  placeholder={t('valueMap.targetPlaceholder')}
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
                  aria-label={t('valueMap.deleteRow', { count: i + 1 })}
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
          {t('valueMap.add')}
        </button>
        <div className="spacer" />
        <label className="read-options-inline">
          {t('valueMap.fallback')}
          <select
            value={mode}
            onChange={(e) => setFallback(e.target.value as FallbackMode)}
          >
            <option value="keep">{t('valueMap.keep')}</option>
            <option value="empty">{t('valueMap.empty')}</option>
            <option value="constant">{t('valueMap.constant')}</option>
          </select>
        </label>
        {mode === 'constant' && (
          <input
            type="text"
            style={{ maxWidth: 160 }}
            value={mapping.valueMapFallback ?? ''}
            placeholder={t('valueMap.otherPlaceholder')}
            list={options.length > 0 ? datalistId : undefined}
            onChange={(e) => setFallback('constant', e.target.value)}
          />
        )}
      </div>
      <p className="subtitle" style={{ margin: '6px 0 0' }}>
        {t('valueMap.matchHint')}
      </p>
    </div>
  );
}
