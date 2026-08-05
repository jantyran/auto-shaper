const EXAMPLES = [
  {
    title: '固定テキスト + 会社名',
    code: '"Public web: " & {Company Name}',
    note: 'Public web: サンプル株式会社 のように出力します。',
  },
  {
    title: 'if で2分岐',
    code: 'if({LeadSource} = "Web", "Public web: " & {Company Name}, "Other: " & {Company Name})',
    note: '条件が真なら2つ目、偽なら3つ目の値を使います。',
  },
  {
    title: 'case で複数分岐',
    code: [
      'case(',
      '  {LeadSource} = "Web", "Public web: " & {Company Name},',
      '  {LeadSource} = "展示会", "Event: " & {Company Name},',
      '  {LeadSource} = "紹介", "Referral: " & {Company Name},',
      '  "Other: " & {Company Name}',
      ')',
    ].join('\n'),
    note: '上から順に条件を見て、最初に合った値を出します。最後の値はどれにも合わない時の既定値です。',
  },
  {
    title: '部分一致で分岐',
    code: [
      'case(',
      '  contains({LeadSource}, "Web"), "Public web: " & {Company Name},',
      '  contains({LeadSource}, "展示"), "Event: " & {Company Name},',
      '  "Other: " & {Company Name}',
      ')',
    ].join('\n'),
    note: '完全一致ではなく、文字列を含むかで判定します。',
  },
  {
    title: '今回の追加情報を使う',
    code: 'case({LeadSource} = "展示会", "EV(" & {Import.EventName} & "): " & {Company Name}, "Other: " & {Company Name})',
    note: '表の整形画面で今回の追加情報に EventName を入れると、ファイルに無いイベント名をTOPICへ差し込めます。',
  },
  {
    title: '最初の非空値を使う',
    code: 'coalesce({Phone}, {MobilePhone}, "連絡先なし")',
    note: '左から見て、最初に空ではない値を使います。',
  },
  {
    title: '項目ラベルを出す',
    code: '"{Company.label}: " & {Company.value}',
    note: '会社名: サンプル株式会社 のように、項目の表示名と値を組み合わせます。',
  },
];

const REFS = [
  ['{Field}', '項目の値を差し込みます。例: {Company}'],
  ['{Field.value}', '項目の値を明示して差し込みます。'],
  [
    '{Field.label}',
    '項目の表示名を差し込みます。{Field.labal} も typo 互換で使えます。',
  ],
  ['{Field.key}', '出力列名としてのキーを差し込みます。'],
  [
    '{Import.EventName}',
    '表の整形で入力した「今回の追加情報」を差し込みます。EventName の部分は任意のキーにできます。',
  ],
  ['"文字列"', '固定テキストです。シングルクォートも使えます。'],
  ['&', '文字列を連結します。'],
  ['= / == / !=', '一致・不一致を判定します。'],
  [
    'contains(a, b)',
    'a が b を含むかを判定します。中置で a contains b とも書けます。',
  ],
  ['startsWith(a, b)', 'a が b で始まるかを判定します。'],
  ['endsWith(a, b)', 'a が b で終わるかを判定します。'],
  ['empty(a)', 'a が空欄かを判定します。'],
  ['notEmpty(a)', 'a が空欄ではないかを判定します。'],
  ['if(cond, yes, no)', 'cond が真なら yes、偽なら no を返します。'],
  [
    'case(cond1, value1, ..., default)',
    '複数条件を上から評価し、最初に合った値を返します。',
  ],
  ['coalesce(a, b, ...)', '最初の非空値を返します。'],
  ['trim / upper / lower', '前後空白削除、大文字化、小文字化をします。'],
];

export function FormulaReference() {
  return (
    <div className="panel formula-reference">
      <h2>自動記入ルール 式リファレンス</h2>
      <p className="subtitle" style={{ marginBottom: 14 }}>
        テンプレート項目の自動記入ルールで使える安全なミニ式です。JavaScriptやPythonのコードは実行せず、ここに載っている構文だけを評価します。
      </p>

      <h3>よく使う例</h3>
      <div className="formula-example-list">
        {EXAMPLES.map((item) => (
          <section className="formula-example" key={item.title}>
            <h4>{item.title}</h4>
            <pre>{item.code}</pre>
            <p>{item.note}</p>
          </section>
        ))}
      </div>

      <h3>構文一覧</h3>
      <div className="formula-ref-table">
        {REFS.map(([syntax, description]) => (
          <div className="formula-ref-row" key={syntax}>
            <code>{syntax}</code>
            <span>{description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
