import { useEffect } from 'react';
import { useStore, type Step } from './state/store';
import { FileDrop } from './components/FileDrop';
import { TargetSelector } from './components/TargetSelector';
import { MappingEditor } from './components/MappingEditor';
import { ResultView } from './components/ResultView';
import { SchemaAdmin } from './components/SchemaAdmin';
import { SettingsPage } from './components/Settings';
import { TextShaper } from './components/TextShaper';
import { AuthBadge } from './components/AuthBadge';
import { FormulaReference } from './components/FormulaReference';
import { GuidedTour } from './components/GuidedTour';
import { EntranceScreen } from './components/EntranceScreen';

const STEPS: { id: Step; label: string }[] = [
  { id: 'source', label: 'ソース投入' },
  { id: 'target', label: 'インポート先選択' },
  { id: 'mapping', label: 'マッピング確認' },
  { id: 'result', label: '変換・出力' },
];

export function App() {
  const entranceActive = useStore((s) => s.entranceActive);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const step = useStore((s) => s.step);
  const error = useStore((s) => s.error);
  const sizeWarning = useStore((s) => s.sizeWarning);
  const refreshSchemas = useStore((s) => s.refreshSchemas);
  const refreshRecipes = useStore((s) => s.refreshRecipes);
  const refreshLearning = useStore((s) => s.refreshLearning);
  const refreshAuth = useStore((s) => s.refreshAuth);
  const startTour = useStore((s) => s.startTour);
  const demoActive = useStore((s) => s.demoActive);
  const reset = useStore((s) => s.reset);

  // 起動時: 先に認証状態を復元してから、保存先を判定してテンプレート/レシピ/学習辞書を同期
  useEffect(() => {
    void (async () => {
      await refreshAuth();
      await refreshSchemas();
      await refreshRecipes();
      refreshLearning();
    })();
  }, [refreshAuth, refreshSchemas, refreshRecipes, refreshLearning]);

  return (
    <div className="app">
      {entranceActive && <EntranceScreen />}
      <div className="app-header">
        <div className="app-header-top">
          <div className="app-brand">
            <h1>Auto Shaper</h1>
            <span className="tag">ブラウザ完結・実データは外部に出ません</span>
          </div>
          <AuthBadge />
        </div>
        <nav className="topnav">
          <button
            className={view === 'app' ? 'navbtn active' : 'navbtn'}
            onClick={() => setView('app')}
          >
            表の整形
          </button>
          <button
            className={view === 'text' ? 'navbtn active' : 'navbtn'}
            data-tour="tour-nav-text"
            onClick={() => setView('text')}
          >
            テキスト整形
          </button>
          <button
            className={view === 'admin' ? 'navbtn active' : 'navbtn'}
            data-tour="tour-nav-admin"
            onClick={() => setView('admin')}
          >
            テンプレート管理
          </button>
          <button
            className={view === 'formula' ? 'navbtn active' : 'navbtn'}
            data-tour="tour-nav-formula"
            onClick={() => setView('formula')}
          >
            式リファレンス
          </button>
          <button
            className={view === 'settings' ? 'navbtn active' : 'navbtn'}
            onClick={() => setView('settings')}
          >
            設定
          </button>
          <button className="navbtn" onClick={() => startTour()}>
            使い方
          </button>
        </nav>
      </div>
      <GuidedTour />
      {demoActive && (
        <div className="demo-banner">
          <span>🧪 デモデータで操作を体験中です（実データではありません）</span>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              reset();
              setView('app');
            }}
          >
            自分のデータで始める
          </button>
        </div>
      )}
      <p className="subtitle">
        {view === 'app'
          ? '毎回フォーマットが違うExcel/CSVを、取り込み先の形式に合わせて整形します。表記ゆれの統一・姓名の分割・重複チェックまで。'
          : view === 'text'
            ? '問合せメールなどの文章を貼り付けると、テンプレートの項目へ振り分けて表形式に整理します。'
            : view === 'admin'
              ? 'インポート先（整形後）のフォーマットを自由に追加・編集できます。'
              : view === 'formula'
                ? '自動記入ルールで使える式、分岐、フィールド参照の書き方を確認できます。'
                : '機能のON/OFF、AI(LLM)接続、マスキングをここで管理します。'}
      </p>

      {error && <div className="alert error">{error}</div>}
      {sizeWarning && <div className="alert warn">{sizeWarning}</div>}

      {view === 'text' ? (
        <TextShaper />
      ) : view === 'admin' ? (
        <SchemaAdmin />
      ) : view === 'formula' ? (
        <FormulaReference />
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

      <footer className="app-footer">
        <span>Shaped by Shotaroh Horiguchi</span>
        <span aria-hidden="true">/</span>
        <a
          href="https://github.com/jantyran/auto-shaper"
          target="_blank"
          rel="noreferrer"
        >
          MIT License
        </a>
      </footer>
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
        代理店リスト、アンケート結果など、フォーマットがバラバラなファイルをそのまま投入してください。月次で分かれたファイルや、支店ごとのシートは、まとめて投入すると1つの表として整形します。
      </p>
      <div data-tour="tour-source-upload">
        <FileDrop
          title="ここにファイルをドロップ、またはクリックして選択"
          hint="CSV / Excel (.xlsx, .xls) / TSV — 同じ形のファイルは複数まとめて投入できます。見出し行は自動で判定します（上にタイトル行があってもOK）"
          multiple
          onFiles={(files) => void loadSource(files)}
        />
      </div>
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
          data-tour="tour-mapping-convert"
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
