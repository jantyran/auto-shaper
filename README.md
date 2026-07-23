# Auto Shaper

雑多な Excel/CSV を、AI がカラムを読み取って **インポート用フォーマットへ自動整形**するブラウザ完結型ツール。

CRM(Salesforce / HubSpot 等)への取り込み前に発生する、代理店リストやアンケート結果の
「毎回フォーマットが微妙に違う」データクレンジング作業（XLOOKUP 職人芸）を置き換えることを狙っています。

## コンセプト

- **ブラウザ完結**: 実データはあなたのブラウザから外に出ません。パースも変換も CSV 出力もすべてローカル。
- **AI にはルールだけを推論させる**: AI に渡すのは「カラム名」と「匿名化した数行サンプル」のみ。
  AI が作るのは変換ルール(JSON)だけで、実データの全件変換はローカルの変換エンジンが実行します。
- **Human-in-the-loop**: AI の提案は確信度つきで表示し、変換前後をプレビュー。人が確認・修正してから実行します。
- **堅牢な JSON ルールエンジン**: `eval` などの動的コード実行は使わず、表現力を
  「1対1 / 結合 / 分割 / 固定値 / 条件分岐 + 正規化」に限定してデータ破損リスクを排除しています。

## 主な機能

すべて「設定」ページで個別にON/OFFできます。

- **マスキング**: AIに渡す前に、氏名・会社名・メール・電話・住所など**個人情報の列を自動判定して伏字化**。
  追加でマスクしたい列も指定できます。「サンプル値を一切送らず列名だけ」の最強モードも選べます。
- **LLM推論**: 設定でAPIキー(Anthropic / OpenAI)を入れると、ローカル推論の代わりにLLMでマッピングを推論。
  送るのは**マスキング済みのカラム名とサンプルのみ**で、自前バックエンド経由。失敗時はローカル推論に自動フォールバック。
- **学習辞書**: あなたがマッピングを直した履歴(列名→項目)を蓄積し、次回以降のサジェスト精度を上げます。
- **マッピングの記憶(レシピ)**: 確定したマッピングを保存し、同じ列構成のファイルが来たら**ワンクリックで再適用**。
  毎月届く同じ代理店フォーマットの取り込みを一撃で終わらせます。
- **取り込み前の検証**: 変換後に必須欠落・メール/電話の形式不正を検出し、該当行をハイライト。
- **重複検出・名寄せ**: メール(なければ会社名+姓)で重複候補の行を検出。

## 使い方(操作フロー)

1. **ソース投入** — 整形前の CSV/Excel をドロップ
2. **インポート先選択** — プリセット(Salesforce Lead / HubSpot Contact)、または独自の
   インポート用シート(ヘッダー行)をアップロード
3. **マッピング確認** — AI の提案を確認し、確信度が低い箇所だけ修正。プレビューで整形結果を確認
4. **変換・出力** — 全件をブラウザ内で変換し、整形済み CSV をダウンロード

`samples/messy-leads.csv` を投入 → Salesforce リードを選ぶと動作を試せます。
（全角電話番号の半角化、`(株)`→`株式会社`、`氏名`→姓/名の分割 などが自動提案されます）

## セットアップ / 開発

前提: Node.js 22 以上。

```bash
git clone https://github.com/jantyran/auto-shaper.git
cd auto-shaper
npm install

npm run dev          # フロント開発サーバー(Vite)  → http://localhost:5173
npm run server       # テンプレート保存用 SQLite API (任意・別ターミナル)
```

`npm run server` を起動しておくと、テンプレート/レシピは SQLite に保存され複数端末・
チームで共有できます。起動しない場合はフロントが自動的に localStorage 保存へ
フォールバックするため、`npm run dev` だけでもそのまま使えます。

### スクリプト

```bash
npm run typecheck     # 型チェック(tsc)
npm run lint          # ESLint
npm run test          # 変換エンジン/推論/検証のユニットテスト(vitest)
npm run build         # 本番ビルド
npm run format        # Prettier で整形
```

CI(GitHub Actions, `.github/workflows/ci.yml`)で push/PR ごとに
typecheck・lint・test・build を自動実行します。

## OSS として使う

MIT ライセンスの個人利用向け OSS です。各自が自分の環境で clone して動かす
想定で、認証やマルチテナントは持ちません（＝自分専用ツールとして使う）。
LLM を使う場合の API キーは各自がブラウザの設定画面で入力し、そのブラウザ内
にのみ保存されます。改善提案・PR 歓迎です。

## テンプレートの保存(SQLite / localStorage)

インポート先テンプレートは「ローカルファースト + サーバー同期」で永続化します。

| 状態 | 保存先 | 用途 |
| --- | --- | --- |
| `npm run server` 起動あり | **SQLite**(`server/data/auto-shaper.db`) | 複数端末・チーム共有、キャッシュ削除に強い |
| サーバーなし | ブラウザの **localStorage** | ゼロ設定・オフラインで即利用 |

- API: `GET /api/health`・`GET /api/schemas`・`PUT /api/schemas/:id`・`DELETE /api/schemas/:id`
- フロントは `src/core/schemaRepository.ts` で両者を抽象化し、起動時に保存先を自動判定します。
- 保存されるのは**テンプレート定義(列名・型・別名)のみ**。顧客の実データは
  サーバーに送られず、ブラウザ内から出ません(アプリの中核方針を維持)。
- 管理ページから全テンプレートを **JSON でエクスポート/インポート**できます。

## アーキテクチャ

| レイヤ | ファイル | 役割 |
| --- | --- | --- |
| パース | `src/core/parse.ts` | SheetJS で CSV/Excel を読み、カラム/型/サンプルを抽出 |
| 匿名化 | `src/core/anonymize.ts` | AI に渡す前にメール/電話/長い数字列をマスク |
| 推論(サジェスト) | `src/core/inference/heuristic.ts` | 辞書＋類似度＋データパターンでマッピングを提案 |
| 正規化 | `src/core/normalize.ts` | 全角半角/会社名略記/電話番号などのクレンジング |
| 変換エンジン | `src/core/transformEngine.ts` | JSON ルールを解釈して行を変換(純粋関数) |
| 変換(全件) | `src/worker/transform.worker.ts` | Web Worker で数万行を UI を止めずに処理 |
| 検証 | `src/core/validate.ts` | 必須欠落・メール/電話の形式不正をインポート前に検出 |
| 出力 | `src/core/exportCsv.ts` | UTF-8 BOM 付き CSV / Excel(.xlsx) をブラウザから直接ダウンロード |
| テンプレート保存 | `src/core/schemaRepository.ts`, `server/` | SQLite API + localStorage フォールバック |

### LLM への差し替え

推論器は `MappingSuggester` インターフェース(`src/types.ts`)に統一されています。
既定では `HeuristicSuggester`(ローカル推論)を使用します。設定でLLMをONにしてAPIキーを
入れると、`src/core/inference/llm.ts` がバックエンド `/api/suggest`(`server/suggest.mjs`)経由で
プロバイダを呼びます。送るのはマスキング済みの `SuggestContext` のみで、実データは送信しません。
LLM応答は必ず `MappingConfig` にサニタイズしてから使い、失敗時はローカル推論へ自動フォールバックします。

## 機能別のモジュール

| 機能 | ファイル |
| --- | --- |
| 設定(機能ON/OFF・AI・マスキング) | `src/core/settings.ts`, `src/components/Settings.tsx` |
| マスキング(個人情報の自動判定) | `src/core/anonymize.ts` (`isPersonalColumn`) |
| LLM推論 | `src/core/inference/llm.ts`, `server/suggest.mjs` |
| 学習辞書 | `src/core/learning.ts` |
| レシピ(マッピングの記憶) | `src/core/recipes.ts`, `src/core/collectionRepository.ts` |
| 重複検出・名寄せ | `src/core/dedupe.ts` |

## 今後の拡張余地

- メールドメインからの企業名補完
- CRM API への直接連携(ブラウザから直接 POST)
- レシピ/学習辞書のチーム共有(SQLite に保存済みのため拡張が容易)
