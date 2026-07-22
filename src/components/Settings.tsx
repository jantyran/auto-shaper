import { useStore } from '../state/store';
import type { FeatureFlags, LlmProvider, Settings } from '../core/settings';

const FEATURE_LABELS: Record<keyof FeatureFlags, { title: string; desc: string }> = {
  masking: {
    title: 'マスキング',
    desc: 'AIに渡す前に個人情報・機微情報を伏字にする（推奨: ON）',
  },
  llm: {
    title: 'LLM推論',
    desc: 'カラム名＋匿名化サンプルからLLMでマッピングを推論（要APIキー）',
  },
  learningDictionary: {
    title: '学習辞書',
    desc: 'あなたの修正履歴を蓄積し、次回以降のサジェスト精度を上げる',
  },
  recipes: {
    title: 'マッピングの記憶（レシピ）',
    desc: '確定したマッピングを保存し、同じ列構成のファイルに再適用する',
  },
  duplicateDetection: {
    title: '重複検出・名寄せ',
    desc: '変換後にメールや会社名+姓で重複の可能性がある行を検出する',
  },
};

/** 設定ページ: 機能ON/OFF・AI接続・マスキング */
export function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const refreshRecipes = useStore((s) => s.refreshRecipes);

  const set = (patch: Partial<Settings>) => update({ ...settings, ...patch });
  const setFeature = (key: keyof FeatureFlags, value: boolean) => {
    update({ ...settings, features: { ...settings.features, [key]: value } });
    if (key === 'recipes') void refreshRecipes();
  };
  const setLlm = (patch: Partial<Settings['llm']>) =>
    set({ llm: { ...settings.llm, ...patch } });
  const setMasking = (patch: Partial<Settings['masking']>) =>
    set({ masking: { ...settings.masking, ...patch } });

  return (
    <>
      <div className="panel">
        <h2>機能のON/OFF</h2>
        <p className="subtitle">使う機能だけを有効化できます。</p>
        {(Object.keys(FEATURE_LABELS) as (keyof FeatureFlags)[]).map((key) => (
          <ToggleRow
            key={key}
            title={FEATURE_LABELS[key].title}
            desc={FEATURE_LABELS[key].desc}
            checked={settings.features[key]}
            onChange={(v) => setFeature(key, v)}
          />
        ))}
      </div>

      <div className="panel">
        <h2>AI（LLM）接続</h2>
        <p className="subtitle">
          LLM推論を使う場合の接続設定です。APIキーは<b>このブラウザにのみ保存</b>され、
          推論時は自前のバックエンド経由でプロバイダに送られます（送るのは
          <b>マスキング済みのカラム名とサンプルのみ</b>で、実データは送りません）。
        </p>
        <div className="settings-grid">
          <label className="field-label">
            プロバイダ
            <select
              value={settings.llm.provider}
              onChange={(e) => setLlm({ provider: e.target.value as LlmProvider })}
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI</option>
            </select>
          </label>
          <label className="field-label">
            モデル
            <input
              type="text"
              value={settings.llm.model}
              placeholder={
                settings.llm.provider === 'anthropic' ? 'claude-opus-4-8' : 'gpt-4o'
              }
              onChange={(e) => setLlm({ model: e.target.value })}
            />
          </label>
          <label className="field-label" style={{ gridColumn: '1 / -1' }}>
            APIキー
            <input
              type="password"
              value={settings.llm.apiKey}
              placeholder="sk-..."
              autoComplete="off"
              onChange={(e) => setLlm({ apiKey: e.target.value })}
            />
          </label>
        </div>
        {settings.features.llm && !settings.llm.apiKey.trim() && (
          <div className="alert info" style={{ marginTop: 12 }}>
            LLM推論がONですがAPIキーが未入力です。キーが無い間はローカル推論で動作します。
          </div>
        )}
      </div>

      <div className="panel">
        <h2>マスキング</h2>
        <p className="subtitle">
          AIに渡すサンプルの伏字ルールです。個人情報の列は自動で伏字にし、必要に応じて
          追加の列を指定できます。
        </p>
        <ToggleRow
          title="個人情報の列を自動マスク"
          desc="氏名・会社名・メール・電話・住所などの列を自動判定して伏字にする"
          checked={settings.masking.maskPersonalInfo}
          onChange={(v) => setMasking({ maskPersonalInfo: v })}
        />
        <ToggleRow
          title="メールアドレスをマスク"
          desc="値の中のメール形式を user@example.com に置換"
          checked={settings.masking.maskEmails}
          onChange={(v) => setMasking({ maskEmails: v })}
        />
        <ToggleRow
          title="電話番号をマスク"
          desc="電話番号らしき数字列を 0 で置換"
          checked={settings.masking.maskPhones}
          onChange={(v) => setMasking({ maskPhones: v })}
        />
        <ToggleRow
          title="長い数字列をマスク"
          desc="5桁以上の連続数字（ID・口座番号など）を 0 で置換"
          checked={settings.masking.maskLongNumbers}
          onChange={(v) => setMasking({ maskLongNumbers: v })}
        />
        <ToggleRow
          title="サンプル値を一切送らない"
          desc="最も安全。列名と型だけをAIに渡す（サジェスト精度は下がる場合あり）"
          checked={!settings.masking.sendSampleValues}
          onChange={(v) => setMasking({ sendSampleValues: !v })}
        />

        <h3>追加でマスクする列</h3>
        <p className="subtitle" style={{ marginBottom: 8 }}>
          自動判定に加えて、完全に伏字にしたい列名をカンマ区切りで指定します。
        </p>
        <input
          type="text"
          style={{ width: '100%', maxWidth: 480 }}
          value={settings.masking.sensitiveColumns.join(', ')}
          placeholder="例: 備考, 社内メモ, 顧客ID"
          onChange={(e) =>
            setMasking({
              sensitiveColumns: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s !== ''),
            })
          }
        />
      </div>
    </>
  );
}

function ToggleRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="toggle-row">
      <div>
        <div className="toggle-title">{title}</div>
        <div className="toggle-desc">{desc}</div>
      </div>
      <button
        className={`switch${checked ? ' on' : ''}`}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span className="knob" />
      </button>
    </div>
  );
}
