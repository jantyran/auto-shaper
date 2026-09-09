import { createTranslator } from '../core/i18n';
import { useStore } from '../state/store';
const EXAMPLES = [
  {
    title: 'formula.example.fixed.title',
    code: '"Public web: " & {Company Name}',
    note: 'formula.example.fixed.note',
  },
  {
    title: 'formula.example.if.title',
    code: 'if({LeadSource} = "Web", "Public web: " & {Company Name}, "Other: " & {Company Name})',
    note: 'formula.example.if.note',
  },
  {
    title: 'formula.example.case.title',
    code: [
      'case(',
      '  {LeadSource} = "Web", "Public web: " & {Company Name},',
      '  {LeadSource} = "展示会", "Event: " & {Company Name},',
      '  {LeadSource} = "紹介", "Referral: " & {Company Name},',
      '  "Other: " & {Company Name}',
      ')',
    ].join('\n'),
    note: 'formula.example.case.note',
  },
  {
    title: 'formula.example.contains.title',
    code: [
      'case(',
      '  contains({LeadSource}, "Web"), "Public web: " & {Company Name},',
      '  contains({LeadSource}, "展示"), "Event: " & {Company Name},',
      '  "Other: " & {Company Name}',
      ')',
    ].join('\n'),
    note: 'formula.example.contains.note',
  },
  {
    title: 'formula.example.context.title',
    code: 'case({LeadSource} = "展示会", "EV(" & {Import.EventName} & "): " & {Company Name}, "Other: " & {Company Name})',
    note: 'formula.example.context.note',
  },
  {
    title: 'formula.example.coalesce.title',
    code: 'coalesce({Phone}, {MobilePhone}, "連絡先なし")',
    note: 'formula.example.coalesce.note',
  },
  {
    title: 'formula.example.label.title',
    code: '"{Company.label}: " & {Company.value}',
    note: 'formula.example.label.note',
  },
] as const;

const REFS = [
  ['{Field}', 'formula.syntax.field'],
  ['{Field.value}', 'formula.syntax.fieldValue'],
  [
    '{Field.label}',
    'formula.syntax.fieldLabel',
  ],
  ['{Field.key}', 'formula.syntax.fieldKey'],
  [
    '{Import.EventName}',
    'formula.syntax.importValue',
  ],
  ['"文字列"', 'formula.syntax.string'],
  ['&', 'formula.syntax.concat'],
  ['= / == / !=', 'formula.syntax.comparison'],
  [
    'contains(a, b)',
    'formula.syntax.contains',
  ],
  ['startsWith(a, b)', 'formula.syntax.startsWith'],
  ['endsWith(a, b)', 'formula.syntax.endsWith'],
  ['empty(a)', 'formula.syntax.empty'],
  ['notEmpty(a)', 'formula.syntax.notEmpty'],
  ['if(cond, yes, no)', 'formula.syntax.if'],
  [
    'case(cond1, value1, ..., default)',
    'formula.syntax.case',
  ],
  ['coalesce(a, b, ...)', 'formula.syntax.coalesce'],
  ['trim / upper / lower', 'formula.syntax.textTransform'],
] as const;

export function FormulaReference() {
  const locale = useStore((state) => state.settings.locale);
  const t = createTranslator(locale);
  return (
    <div className="panel formula-reference" data-tour="tour-formula-panel">
      <h2>{t('formula.heading')}</h2>
      <p className="subtitle" style={{ marginBottom: 14 }}>
        {t('formula.description')}
      </p>

      <h3>{t('formula.examples')}</h3>
      <div className="formula-example-list">
        {EXAMPLES.map((item) => (
          <section className="formula-example" key={item.title}>
            <h4>{t(item.title)}</h4>
            <pre>{item.code}</pre>
            <p>{t(item.note)}</p>
          </section>
        ))}
      </div>

      <h3>{t('formula.syntax')}</h3>
      <div className="formula-ref-table">
        {REFS.map(([syntax, description]) => (
          <div className="formula-ref-row" key={syntax}>
            <code>{syntax}</code>
            <span>{t(description)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
