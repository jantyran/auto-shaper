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
  return (
    <label className="tpl-pick">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span className="tpl-pick-body">
        <span className="tpl-pick-name">{schema.name}</span>
        <span className="tpl-pick-meta">
          {schema.fields.length} 項目
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
  return (
    <div className="tpl-pick-actions">
      <span className="subtitle" style={{ margin: 0 }}>
        {count} / {total} 件を選択中
      </span>
      <div className="spacer" />
      <button type="button" className="ghost" onClick={onAll}>
        すべて選択
      </button>
      <button type="button" className="ghost" onClick={onNone}>
        選択を解除
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
        <h3 style={{ marginTop: 0 }}>テンプレートをエクスポート</h3>
        <p className="subtitle">
          書き出すテンプレートを選んでください。選んだものだけが1つのJSONファイルになります。
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
            キャンセル
          </button>
          <div className="spacer" />
          <button
            className="primary"
            disabled={chosen.length === 0}
            onClick={download}
          >
            {chosen.length} 件をエクスポート
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
        <h3 style={{ marginTop: 0 }}>テンプレートをインポート</h3>
        <p className="subtitle">
          <b>{fileName}</b> に {candidates.length}{' '}
          件のテンプレートが入っています。追加するものを選んでください。
          <b>既存のテンプレートは置き換えられません</b>
          （すべて新規として追加されます）。
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
                    ? `同名があるため「${uniqueSchemaName(s.name, existing)}」として追加`
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
            {chosenIndexes.length} 件を追加
          </button>
        </div>
      </div>
    </div>
  );
}
