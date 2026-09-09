/**
 * テンプレートのエクスポート / インポートのダイアログ。
 *
 * どちらも「対象を選んでから実行する」形にしている。
 *  - エクスポート: 全件ではなく、選んだテンプレートだけを1つのJSONに書き出す。
 *  - インポート: ファイルの中身を一覧で見せてから、選んだものだけを **追加** する。
 *    既存テンプレートを置き換えることはない(IDは必ず振り直し、名前が衝突したら
 *    `名前 (2)` のように付け替える)。
 */
import { useMemo, useState } from 'react';
import { createTranslator } from '../core/i18n';
import { useStore } from '../state/store';
import type { TargetSchema } from '../types';
import { schemaFromImport, uniqueSchemaName } from '../core/schemaStore';

/** ダウンロードファイル名に使えない文字を落とす */
function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'template';
}

function ItemRow({
  schema,
  checked,
  note,
  onToggle,
}: {
  schema: TargetSchema;
  checked: boolean;
  note?: string;
  onToggle: () => void;
}) {
  const locale = useStore((state) => state.settings.locale);
  const t = createTranslator(locale);
  return (
    <label className="tpl-pick">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span className="tpl-pick-body">
        <span className="tpl-pick-name">{schema.name}</span>
        <span className="tpl-pick-meta">
          {t('template.fields', { count: schema.fields.length })}
          {note && <span className="tpl-pick-note">{note}</span>}
        </span>
      </span>
    </label>
  );
}

function PickerActions({
  count,
  total,
  onAll,
  onNone,
}: {
  count: number;
  total: number;
  onAll: () => void;
  onNone: () => void;
}) {
  const locale = useStore((state) => state.settings.locale);
  const t = createTranslator(locale);
  return (
    <div className="tpl-pick-actions">
      <span className="subtitle" style={{ margin: 0 }}>
        {t('template.selected', { count, total })}
      </span>
      <div className="spacer" />
      <button type="button" className="ghost" onClick={onAll}>
        {t('template.selectAll')}
      </button>
      <button type="button" className="ghost" onClick={onNone}>
        {t('template.clearSelection')}
      </button>
    </div>
  );
}

export function TemplateExportDialog({
  schemas,
  onClose,
}: {
  schemas: TargetSchema[];
  onClose: () => void;
}) {
  const locale = useStore((state) => state.settings.locale);
  const t = createTranslator(locale);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(schemas.map((s) => s.id)),
  );

  const chosen = schemas.filter((s) => selected.has(s.id));

  const download = () => {
    // 旧バージョンでも読めるよう、素の配列のまま書き出す
    const blob = new Blob([JSON.stringify(chosen, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      chosen.length === 1
        ? `auto-shaper-template-${safeFileName(chosen[0].name)}.json`
        : `auto-shaper-templates-${chosen.length}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    onClose();
  };

  return (
    <div className="tpl-overlay" role="dialog" aria-modal="true">
      <div className="tpl-card">
        <h3 style={{ marginTop: 0 }}>{t('template.exportTitle')}</h3>
        <p className="subtitle">
          {t('template.exportDescription')}
        </p>
        <PickerActions
          count={chosen.length}
          total={schemas.length}
          onAll={() => setSelected(new Set(schemas.map((s) => s.id)))}
          onNone={() => setSelected(new Set())}
        />
        <div className="tpl-pick-list">
          {schemas.map((s) => (
            <ItemRow
              key={s.id}
              schema={s}
              checked={selected.has(s.id)}
              onToggle={() =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(s.id)) next.delete(s.id);
                  else next.add(s.id);
                  return next;
                })
              }
            />
          ))}
        </div>
        <div className="btn-row">
          <button className="ghost" onClick={onClose}>
            {t('template.cancel')}
          </button>
          <div className="spacer" />
          <button
            className="primary"
            disabled={chosen.length === 0}
            onClick={download}
          >
            {t('template.export', { count: chosen.length })}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TemplateImportDialog({
  fileName,
  candidates,
  existingNames,
  onCancel,
  onConfirm,
}: {
  fileName: string;
  /** ファイルから読み取った、まだIDを振り直していない生のテンプレート */
  candidates: TargetSchema[];
  /** すでにあるテンプレートの名前(重複表示と改名に使う) */
  existingNames: string[];
  onCancel: () => void;
  onConfirm: (schemas: TargetSchema[]) => void;
}) {
  const locale = useStore((state) => state.settings.locale);
  const t = createTranslator(locale);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(candidates.map((_, i) => i)),
  );
  const existing = useMemo(() => new Set(existingNames), [existingNames]);

  const chosenIndexes = candidates
    .map((_, i) => i)
    .filter((i) => selected.has(i));

  const confirm = () => {
    // 選ばれたものだけを、既存 + 同時追加分と重ならない名前で確定する
    const taken = new Set(existingNames);
    const out = chosenIndexes.map((i) => {
      const schema = schemaFromImport(candidates[i], taken);
      taken.add(schema.name);
      return schema;
    });
    onConfirm(out);
  };

  return (
    <div className="tpl-overlay" role="dialog" aria-modal="true">
      <div className="tpl-card">
        <h3 style={{ marginTop: 0 }}>{t('template.importTitle')}</h3>
        <p className="subtitle">
          <b>{fileName}</b> に {candidates.length}{' '}
          件のテンプレートが入っています。追加するものを選んでください。
          <b>{t('template.importNoReplace')}</b>
          {t('template.importAsNew')}
        </p>
        <PickerActions
          count={chosenIndexes.length}
          total={candidates.length}
          onAll={() => setSelected(new Set(candidates.map((_, i) => i)))}
          onNone={() => setSelected(new Set())}
        />
        <div className="tpl-pick-list">
          {candidates.map((s, i) => {
            const collides = existing.has(s.name.trim());
            return (
              <ItemRow
                key={i}
                schema={s}
                checked={selected.has(i)}
                note={
                  collides
                    ? t('template.duplicateName', { name: uniqueSchemaName(s.name, existing) })
                    : undefined
                }
                onToggle={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })
                }
              />
            );
          })}
        </div>
        <div className="btn-row">
          <button className="ghost" onClick={onCancel}>
            キャンセル
          </button>
          <div className="spacer" />
          <button
            className="primary"
            disabled={chosenIndexes.length === 0}
            onClick={confirm}
          >
            {t('template.add', { count: chosenIndexes.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
