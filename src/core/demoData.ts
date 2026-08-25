/**
 * ガイドツアーの「体験しながら学ぶ」用に埋め込む固定サンプルデータ。
 * ネットワーク取得はせず、ビルドに同梱する。
 * 内容は samples/messy-leads.csv と同一(表記ゆれのある名刺リスト5件)。
 */
export const DEMO_SOURCE_FILE_NAME = 'sample-leads.csv';

export const DEMO_SOURCE_CSV = `氏名,御社名,ﾒｰﾙ,TEL,役職,獲得経路
山田 太郎,(株)サンプル商事,taro.yamada@sample.co.jp,03-1234-5678,営業部長,展示会
佐藤　花子,有限会社テストワークス,hanako@test-works.jp,０９０－１１１１－２２２２,マネージャー,Web問い合わせ
鈴木 一郎,合同会社ABC,ichiro@abc.com,06 9999 8888,代表取締役,紹介
田中 次郎,株式会社ＤＥＦ,jiro@def.co.jp,090-5555-6666,主任,セミナー
山田　太郎,株式会社サンプル商事,Taro.Yamada@sample.co.jp,03-1234-5678,営業部長,再登録`;

/** テキスト整形タブのデモ用プリフィル文面(TextShaperのプレースホルダーと同内容) */
export const DEMO_INQUIRY_TEXT = `お世話になっております。株式会社サンプルの山田と申します。
新製品のお見積もりについてお問い合わせいたします。
連絡先: yamada@example.co.jp / 03-1234-5678
ご担当者よりご連絡いただけますと幸いです。`;
