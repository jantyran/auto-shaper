# Contributing

Issue・PR 歓迎です。個人メンテナンスのプロジェクトなので、レビューまで
多少お時間をいただく場合があります。

## セットアップ

```bash
git clone https://github.com/jantyran/auto-shaper.git
cd auto-shaper
npm install
npm run dev   # http://localhost:5173(APIも同一オリジンで同梱)
```

詳細は [README.md](README.md) の「セットアップ / 開発」「アーキテクチャ」を参照してください。

## PR を出す前に

以下がすべて通ることを確認してください(CI でも同じチェックが走ります)。

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

- フォーマットは Prettier(`npm run format`)に従ってください。
- コードコメントは「なぜそうしたか」が非自明な箇所にのみ、最小限で。
- 実データを外部(LLM API 含む)に送らない、という本プロジェクトの中核方針
  (`README.md` の「コンセプト」参照)を崩す変更は、その必要性を PR 説明に明記してください。

## バグ報告 / 機能要望

`.github/ISSUE_TEMPLATE/` のテンプレートに沿って Issue を立ててください。
脆弱性は Issue ではなく [SECURITY.md](SECURITY.md) の手順で報告してください。
