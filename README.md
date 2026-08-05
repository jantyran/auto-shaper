# Auto Shaper

雑多な Excel/CSV を、AI がカラムを読み取って **インポート用フォーマットへ自動整形**するブラウザ完結型ツール。

CRM(Salesforce / HubSpot 等)への取り込み前に発生する、代理店リストやアンケート結果の
「毎回フォーマットが微妙に違う」データクレンジング作業（XLOOKUP 職人芸）を置き換えることを狙っています。

2 つのモードがあります。

- **表の整形**: 雑多な Excel/CSV を、AI がカラムを読み取ってインポート用フォーマットへ自動整形。
- **テキスト整形**: 問合せメールなどの**雑多なテキストをコピペ**すると、AI が内容を読み取って
  選んだテンプレート形式へ**当てはめ・データ整理**。AI に見せたくない情報は、渡す前に**手動/自動でマスキング**できます。

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
- **LLM推論**: 設定でAPIキー(**Anthropic / OpenAI / Google Gemini**)を入れると、ローカル推論の代わりにLLMでマッピングを推論。
  送るのは**マスキング済みのカラム名とサンプルのみ**で、自前バックエンド経由。失敗時はローカル推論に自動フォールバック。
- **固定値・選択肢・既定値**: テンプレートの各項目に「選択可能な固定値の候補」と「既定値」を設定できます。
  元データに対応列が無い項目は**既定値が自動で入り**、マッピング画面でプルダウン選択や自由入力で上書きできます。
- **ログイン(任意)とDB保存**: ログインしなくても使えます。ログインすると、テンプレートとマッピング(レシピ)が
  **サーバー(DB)にユーザー単位で保存**され、複数端末で共有できます（未ログイン時はブラウザの localStorage）。
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

## テキスト整形モード（問合せメール等）

ヘッダー「テキスト整形」から使えます。表になっていない**フリーテキスト**を、テンプレート形式へ整理する用途です。

1. **貼り付け** — 問合せメールやメモの本文をテキストエリアにそのままコピペ
2. **マスキング（任意）** — AI に見せたくない箇所を保護します
   - **自動スキャン**: メール・電話・カード番号・長い数字列をパターン検出して `[EMAIL_1]` のような
     トークンへ一括置換
   - **選択範囲をマスク**: 氏名・会社名・住所など、選択したテキストを指定カテゴリでトークン化
     （同じ文字列はまとめて置換）
3. **テンプレート選択** — プリセット、または「テンプレート管理」で作った独自項目のテンプレートを選択
4. **整形** — AI（設定で LLM を有効化した場合）が各項目へ当てはめて 1 レコードに整理。未設定なら
   ラベル・パターンによる**ローカル抽出**で動作します
5. **確認・出力** — 各項目を編集し、テキスト/JSON でコピー、または CSV/Excel でダウンロード

**安全性**: AI へ送られるのは**マスク済みのテキストだけ**で、元の値はこのブラウザ内の辞書にのみ残ります。
AI の応答に含まれるトークンは、表示・出力の前に**ローカルで元の値へ復元**します（マスキングのロジックは
[Maskify](https://github.com/jantyran/Maskify-ai) を本リポジトリの方針に合わせて移植したものです）。

## セットアップ / 開発

前提: Node.js 22 以上。

```bash
git clone https://github.com/jantyran/auto-shaper.git
cd auto-shaper
npm install

npm run dev          # 開発サーバー(Vite) + API を同梱 → http://localhost:5173
npm run build        # 本番ビルド
npm run preview      # ビルド成果物 + API を同梱 → http://localhost:4173
npm run server       # API を単体で起動(別オリジン配信/本番用・任意) → :8787
```

**`npm run dev` / `npm run preview` は API を同一オリジンに同梱**しています（Vite に in-process で
マウント。`vite.config.ts` の `auto-shaper-inprocess-api` プラグイン）。そのため**これ単体で
ログインまで動きます** — 別プロセスや proxy、CORS 設定は不要です。設定ページの「アカウント」から
ログインすると、テンプレート/レシピが DB(既定は SQLite)に**ユーザー単位で保存**され複数端末で
共有できます。ログインしなければ localStorage 保存でそのまま使えます。

`npm run server` は、フロントを**別オリジン(Live Server 等)や別ホスト/本番**で配信する場合に、
API を単体で(:8787)立てるためのものです（この場合はアプリの「APIサーバーURL」設定が必要 →
下記）。DBを差し替える場合は `DB_DRIVER` 環境変数と `server/storage/` を参照。

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
想定です。**ログインは任意**で、しなくてもそのまま使えます（データはブラウザの
localStorage に保存）。ログインすると、テンプレートとマッピングを**サーバー(DB)に
ユーザー単位で保存**して複数端末で共有できます。LLM を使う場合の API キーは各自が
ブラウザの設定画面で入力し、そのブラウザ内にのみ保存されます。改善提案・PR 歓迎です。

## ログインとデータ保存(DB / localStorage)

テンプレートとマッピング(レシピ)の保存先は、ログイン状態で切り替わります。

| 状態 | 保存先 | 用途 |
| --- | --- | --- |
| **ログイン済み**（+ `npm run server` 起動） | **DB**（既定は SQLite / `server/data/auto-shaper.db`、ユーザー単位） | 複数端末で共有 |
| 未ログイン / サーバーなし | ブラウザの **localStorage** | ゼロ設定・オフラインで即利用 |

- **認証**: メール + パスワードの自前バックエンド認証。パスワードは `scrypt` でハッシュ化して
  保存し（平文は保持しない）、ログイン時にセッショントークンを発行して DB に保存します
  （`server/auth.mjs`）。外部サービスや追加依存は使いません。
- **DBの差し替え**: DBアクセスは `server/storage/` のドライバ層に集約しています。既定は
  SQLite（`server/storage/sqlite.mjs`）で、環境変数 `DB_DRIVER` で選択します。本番で別のDBを
  使う場合は、同じ「ストア契約」を満たすドライバを追加して `server/storage/index.mjs` の分岐へ
  接続するだけで差し替えられます。
- **API**: 認証 `POST /api/auth/{signup,login,logout}`・`GET /api/auth/me`、保存系
  `GET/PUT/DELETE /api/schemas`・`/api/collections/:name`（保存系は要ログイン）。
- 保存されるのは**テンプレート定義とマッピングのみ**。顧客の実データは
  サーバーに送られず、ブラウザ内から出ません(アプリの中核方針を維持)。
- 管理ページから全テンプレートを **JSON でエクスポート/インポート**できます。

### 別オリジン(Live Server 等)で使う場合

フロントを Vite 開発サーバー(`http://localhost:5173`)や、API と同一オリジンで配信する場合は
設定不要です（`/api` が相対パスで届きます）。一方、**Live Server(例 `http://localhost:5502`)など
別オリジン**でフロントを開くと `/api` が中継されず、ログイン等が「認証に失敗しました」になります。
その場合は以下のどちらかで、フロントから API サーバーへ直接届くようにします。

- **アプリ内で設定（推奨・再ビルド不要）**: 「設定 → アカウント」の**「APIサーバーURL」**に
  `http://localhost:8787` を入力（`src/core/apiBase.ts` が localStorage に保存）。
- **ビルド時に指定**: 環境変数 `VITE_API_BASE=http://localhost:8787` を設定してビルド。

API サーバー側は **CORS を許可済み**（`server/index.mjs`）です。既定は全オリジン許可（ローカル
個人利用向け）で、`CORS_ORIGIN` 環境変数で特定オリジンに限定できます。認証は Cookie ではなく
`Authorization: Bearer` ヘッダで行うため、資格情報付き CORS は使いません。

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
| 既定値の自動適用 | `src/core/mappingDefaults.ts` | 未割当の項目にテンプレの既定値を固定値で自動設定 |
| テンプレート/レシピ保存 | `src/core/schemaRepository.ts`, `src/core/collectionRepository.ts` | ログイン時はDB(API)、未ログイン時はlocalStorage |
| 認証・DBドライバ | `src/core/auth.ts`, `server/auth.mjs`, `server/storage/` | メール+パスワード認証、差し替え可能なDB層 |

### LLM への差し替え

推論器は `MappingSuggester` インターフェース(`src/types.ts`)に統一されています。
既定では `HeuristicSuggester`(ローカル推論)を使用します。設定でLLMをONにしてAPIキー
(**Anthropic / OpenAI / Google Gemini**)を入れると、`src/core/inference/llm.ts` がバックエンド
`/api/suggest`(`server/suggest.mjs`)経由でプロバイダを呼びます。送るのはマスキング済みの
`SuggestContext` のみで、実データは送信しません。LLM応答は必ず `MappingConfig` にサニタイズ
してから使い、失敗時はローカル推論へ自動フォールバックします。

## 機能別のモジュール

| 機能 | ファイル |
| --- | --- |
| 設定(機能ON/OFF・AI・マスキング) | `src/core/settings.ts`, `src/components/Settings.tsx` |
| マスキング(個人情報の自動判定) | `src/core/anonymize.ts` (`isPersonalColumn`) |
| LLM推論(Anthropic / OpenAI / Gemini) | `src/core/inference/llm.ts`, `server/suggest.mjs` |
| ログイン・アカウント | `src/core/auth.ts`, `src/components/AccountPanel.tsx`, `src/components/AuthBadge.tsx`, `server/auth.mjs` |
| DBドライバ(差し替え可能) | `server/storage/index.mjs`, `server/storage/sqlite.mjs` |
| APIベースURL(別オリジン対応)・CORS | `src/core/apiBase.ts`, `server/index.mjs` (CORS) |
| 固定値・選択肢・既定値 | `src/types.ts` (`TargetField`), `src/core/mappingDefaults.ts`, `src/components/MappingEditor.tsx` |
| 学習辞書 | `src/core/learning.ts` |
| レシピ(マッピングの記憶) | `src/core/recipes.ts`, `src/core/collectionRepository.ts` |
| 重複検出・名寄せ | `src/core/dedupe.ts` |
| テキスト整形モード（画面） | `src/components/TextShaper.tsx` |
| テキストのマスキング（自動＋手動＋復元） | `src/core/textMasking.ts` |
| テキスト→テンプレ抽出（LLM/ローカル） | `src/core/textExtract.ts`, `server/extract.mjs` |

## 今後の拡張余地

- メールドメインからの企業名補完
- CRM API への直接連携(ブラウザから直接 POST)
- レシピ/学習辞書のチーム共有(SQLite に保存済みのため拡張が容易)
