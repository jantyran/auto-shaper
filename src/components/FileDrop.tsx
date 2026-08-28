import { useCallback, useRef, useState } from 'react';

interface Props {
  /** 単一ファイル用。`multiple` を付けない呼び出し側はこちらを使う。 */
  onFile?: (fileName: string, data: ArrayBuffer) => void;
  /** 複数ファイル用。`multiple` を付けたときはこちらが呼ばれる。 */
  onFiles?: (files: { fileName: string; data: ArrayBuffer }[]) => void;
  /** 複数ファイルの同時投入を許可するか */
  multiple?: boolean;
  title: string;
  hint: string;
}

/** ドラッグ&ドロップ / クリックでファイルを受け取り、ArrayBufferを返す */
export function FileDrop({ onFile, onFiles, multiple, title, hint }: Props) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    async (list: FileList | null) => {
      if (!list || list.length === 0) return;
      const picked = multiple ? Array.from(list) : [list[0]];
      const read = await Promise.all(
        picked.map(async (f) => ({
          fileName: f.name,
          data: await f.arrayBuffer(),
        })),
      );
      if (onFiles) onFiles(read);
      else onFile?.(read[0].fileName, read[0].data);
    },
    [multiple, onFile, onFiles],
  );

  return (
    <div
      className={`dropzone${drag ? ' drag' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void handle(e.dataTransfer.files);
      }}
    >
      <div className="big">{title}</div>
      <div className="hint">{hint}</div>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept=".csv,.xlsx,.xls,.tsv"
        style={{ display: 'none' }}
        onChange={(e) => {
          void handle(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
