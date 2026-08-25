# やり残しメモ

コードからは読み取れない「次にやること」を書き留めておく場所。
完了したら該当項目を消す。

## Google Search Console への登録（担当: リポジトリ所有者）

公開版 <https://auto-shaper.web.app> を検索エンジンにインデックス登録する作業。
サイト側の準備（`sitemap.xml` / `robots.txt` / メタタグ / 構造化データ）は実装済みなので、
残っているのは Search Console 側の操作だけ。

手順:

1. <https://search.google.com/search-console> を開く
2. 「URL プレフィックス」で `https://auto-shaper.web.app` を登録
3. 所有権の確認方法に **「HTML タグ」** を選び、表示される
   `<meta name="google-site-verification" content="..." />` を `index.html` の
   `<head>` に追記してデプロイ
4. Search Console に戻って「確認」
5. 確認できたら「サイトマップ」から `sitemap.xml` を送信

補足: 手順 3 の確認用メタタグは所有者が Search Console にログインしないと取得できない
（CLI からは発行できない）。そのため、この作業だけは人手で行う必要がある。
