import { useEffect } from 'react';
import { useStore, type Step } from './state/store';
import { FileDrop } from './components/FileDrop';
import { TargetSelector } from './components/TargetSelector';
import { MappingEditor } from './components/MappingEditor';
import { ResultView } from './components/ResultView';
import { SchemaAdmin } from './components/SchemaAdmin';
import { SettingsPage } from './components/Settings';

const STEPS: { id: Step; label: string }[] = [
  { id: 'source', label: 'ソース投入' },
  { id: 'target', label: 'インポート先選択' },
  { id: 'mapping', label: 'マッピング確認' },
  { id: 'result', label: '変換・出力' },
];

export function App() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const step = useStore((s) => s.step);
  const error = useStore((s) => s.error);
  const refreshSchemas = useStore((s) => s.refreshSchemas);
  const refreshRecipes = useStore((s) => s.refreshRecipes);
  const refreshLearning = useStore((s) => s.refreshLearning);

  // 起動時に保存先を判定してテンプレート/レシピ/学習辞書を同期
  useEffect(() => {
    void refreshSchemas();
    void refreshRecipes();
    refreshLearning();
  }, [refreshSchemas, refreshRecipes, refreshLearning]);

  return (
    <div className="app">
      <div className="app-header">
        <h1>Auto Shaper</h1>
        <span className="tag">ブラウザ完結・データは外部に出ません</span>
        <nav className="topnav">
          <button
            className={view === 'app' ? 'navbtn active' : 'navbtn'}
            onClick={() => setView('app')}
          >
            整形
          </button>
          <button
            className={view === 'admin' ? 'navbtn active' : 'navbtn'}
            onClick={() => setView('admin')}
          >
            テンプレート管理
          </button>
          <button
            className={view === 'settings' ? 'navbtn active' : 'navbtn'}
            onClick={() => setView('settings')}
          >
            設定
          </button>
        </nav>
      </div>
      <p className="subtitle">
        {view === 'app'
          ? '雑多なExcel/CSVを、AIがカラムを読み取ってインポート用フォーマットへ自動整形します。'
          : view === 'admin'
            ? 'インポート先（整形後）のフォーマットを自由に追加・編集できます。'
            : '機能のON/OFF、AI(LLM)接続、マスキングをここで管理します。'}
      </p>

      {error && <div className="alert error">{error}</div>}

      {view === 'admin' ? (
        <SchemaAdmin />
      ) : view === 'settings' ? (
        <SettingsPage />
      ) : (
        <>
          <Stepper current={step} />
          {step === 'source' && <SourceStep />}
          {step === 'target' && <TargetSelector />}
          {step === 'mapping' && <MappingStep />}
          {step === 'result' && <ResultStep />}
        </>
      )}
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const currentIdx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="stepper">
      {STEPS.map((s, i) => (
        <div
          key={s.id}
          className={`step${s.id === current ? ' active' : ''}${
            i < currentIdx ? ' done' : ''
          }`}
        >
          <span className="num">{i < currentIdx ? '✓' : i + 1}</span>
          {s.label}
        </div>
      ))}
    </div>
  );
}

function SourceStep() {
  const loadSource = useStore((s) => s.loadSource);
  return (
    <div className="panel">
      <h2>1. 整形前のデータをアップロード</h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        代理店リスト、アンケート結果など、フォーマットがバラバラなファイルをそのまま投入してください。
      </p>
      <FileDrop
        title="ここにファイルをドロップ、またはクリックして選択"
        hint="CSV / Excel (.xlsx, .xls) / TSV — 1行目をヘッダーとして読み取ります"
        onFile={(name, data) => loadSource(name, data)}
      />
      <div className="security-note">
        アップロードしたファイルはブラウザ内でのみ処理されます。サーバーやAIへ実データを送信しません。
      </div>
    </div>
  );
}

function MappingStep() {
  const goTo = useStore((s) => s.goTo);
  const target = useStore((s) => s.target);
  const mapping = useStore((s) => s.mapping);
  const source = useStore((s) => s.source);
  const recipesEnabled = useStore((s) => s.settings.features.recipes);
  const saveCurrentAsRecipe = useStore((s) => s.saveCurrentAsRecipe);

  const requiredUnmet =
    target && mapping
      ? target.fields.some((f) => {
          if (!f.required) return false;
          const m = mapping.fields.find((x) => x.targetKey === f.key);
          return !m || m.transform.kind === 'empty';
        })
      : false;

  const handleSaveRecipe = () => {
    const suggested = `${source?.fileName ?? 'レシピ'} → ${target?.name ?? ''}`;
    const name = prompt('レシピ名を入力してください', suggested);
    if (name && name.trim()) void saveCurrentAsRecipe(name.trim());
  };

  return (
    <>
      <MappingEditor />
      <div className="btn-row">
        <button className="ghost" onClick={() => goTo('target')}>
          ← インポート先を選び直す
        </button>
        {recipesEnabled && (
          <button className="ghost" onClick={handleSaveRecipe}>
            🔁 レシピとして保存
          </button>
        )}
        <div className="spacer" />
        <button
          className="primary"
          disabled={requiredUnmet}
          title={requiredUnmet ? '必須項目を割り当ててください' : ''}
          onClick={() => goTo('result')}
        >
          この内容で変換する →
        </button>
      </div>
    </>
  );
}

function ResultStep() {
  const goTo = useStore((s) => s.goTo);
  const reset = useStore((s) => s.reset);
  return (
    <>
      <ResultView />
      <div className="btn-row">
        <button className="ghost" onClick={() => goTo('mapping')}>
          ← マッピングを修正
        </button>
        <div className="spacer" />
        <button className="ghost" onClick={reset}>
          最初からやり直す
        </button>
      </div>
    </>
  );
}
