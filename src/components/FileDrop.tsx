import { useCallback, useRef, useState } from 'react';

interface Props {
  onFile: (fileName: string, data: ArrayBuffer) => void;
  title: string;
  hint: string;
}

/** ドラッグ&ドロップ / クリックでファイルを受け取り、ArrayBufferを返す */
export function FileDrop({ onFile, title, hint }: Props) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    async (file: File) => {
      const buf = await file.arrayBuffer();
      onFile(file.name, buf);
    },
    [onFile],
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
        const file = e.dataTransfer.files[0];
        if (file) void handle(file);
      }}
    >
      <div className="big">{title}</div>
      <div className="hint">{hint}</div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.tsv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handle(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
