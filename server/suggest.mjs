/**
 * LLM によるマッピング推論のバックエンド処理。
 *
 * フロントから受け取るのは「マスキング済みコンテキスト」と接続情報のみ。
 * 顧客の実データは含まれない。プロバイダ呼び出しはここ(サーバー)から行い、
 * ブラウザから直接プロバイダを叩かせない。
 *
 * 返すのは MappingConfig(JSONルール)だけ。実データの全件変換はブラウザ側の
 * 変換エンジンが行う。
 */
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `あなたはCRMインポート用データのマッピング設計者です。
ソースのカラム名・型・匿名化サンプルと、ターゲットスキーマ(インポート先の項目)を受け取り、
各ターゲット項目をどのソース列からどう作るかの「変換ルール(JSON)」を設計してください。

出力は必ず次の形の JSON オブジェクトのみ(前後に説明文やコードフェンスを付けない):
{
  "fields": [
    {
      "targetKey": "<ターゲット項目のkey>",
      "transform": <Transform>,
      "normalizers": [<Normalizer>...],
      "confidence": <0-1の数値>,
      "rationale": "<日本語で簡潔な根拠>"
    }
  ]
}

Transform は次のいずれか:
- {"kind":"direct","source":"<列名>"}                     … 1列をそのまま
- {"kind":"concat","sources":["<列名>",...],"separator":" "} … 複数列を結合(姓+名→氏名 など)
    改行区切りにするなら separator に "\\n"。
    「項目名: 値」形式でまとめたい場合は "withLabels":true, "labelSeparator":": " を付ける
    (例: 役職と獲得経路を備考へ → "役職: 部長\\n獲得経路: 展示会")。
    項目名を別名にしたい場合は "labels":{"<列名>":"<表示名>"}。
    CRM側に無い情報や、余った複数列を備考/メモにまとめる用途に使う。
- {"kind":"split","source":"<列名>","delimiter":" ","index":0} … 1列を分割(氏名→姓/名 など)
- {"kind":"constant","value":"<固定値>"}                   … 固定値
- {"kind":"conditional","source":"<列名>","cases":[{"op":"contains|equals|startsWith|endsWith|isEmpty|notEmpty","value":"<比較値>","then":"<出力>"}],"fallback":"<既定>"}
- {"kind":"empty"}                                        … 対応列なし(空)

Normalizer(適用順の配列。0個でも可)は次のいずれか:
"trim","toHalfWidth","toFullWidth","normalizeCompany","normalizePhone","normalizeEmail","upperCase","lowerCase","removeSpaces"

制約:
- source に使ってよいのは、与えられたソース列名だけ。存在しない列名は使わない。
- すべてのターゲット項目に対して必ず1つ field を出す。対応が無ければ {"kind":"empty"}。
- メール項目には normalizeEmail、電話項目には normalizePhone、会社名には normalizeCompany を推奨。`;

function buildUserContent(context) {
  const columns = context.columns
    .map((c) => `- ${c.name} (型:${c.inferredType}, 充填率:${Math.round((c.fillRate ?? 0) * 100)}%)`)
    .join('\n');
  const target = context.target.fields
    .map(
      (f) =>
        `- key:${f.key} / 表示名:${f.label} / 型:${f.type}${f.required ? ' / 必須' : ''} / 別名:[${(f.aliases ?? []).join(', ')}]`,
    )
    .join('\n');
  const samples = JSON.stringify(context.anonymizedSamples ?? [], null, 0);

  return `# ソースのカラム\n${columns}\n\n# 匿名化サンプル(先頭数行)\n${samples}\n\n# ターゲットスキーマ(${context.target.name})\n${target}\n\nこのソースをターゲットに整形するためのマッピングJSONを出力してください。`;
}

/** テキストから JSON オブジェクトを頑健に取り出す */
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSONが見つかりませんでした');
  return JSON.parse(raw.slice(start, end + 1));
}

async function suggestWithAnthropic({ apiKey, model, context }) {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: model || 'claude-opus-4-8',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserContent(context) }],
  });
  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return extractJson(text);
}

async function suggestWithOpenAI({ apiKey, model, context }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserContent(context) },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenAI API エラー ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content ?? '';
  return extractJson(text);
}

async function suggestWithGemini({ apiKey, model, context }) {
  const m = model || 'gemini-2.5-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: buildUserContent(context) }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gemini API エラー ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('');
  return extractJson(text);
}

/** プロバイダを振り分けてマッピング案(MappingConfig相当)を返す */
export async function runSuggest({ provider, model, apiKey, context }) {
  if (!apiKey || !context?.target) {
    const err = new Error('apiKey と context.target は必須です');
    err.status = 400;
    throw err;
  }
  let config;
  if (provider === 'openai') config = await suggestWithOpenAI({ apiKey, model, context });
  else if (provider === 'gemini') config = await suggestWithGemini({ apiKey, model, context });
  else config = await suggestWithAnthropic({ apiKey, model, context });
  return { targetSchemaId: context.target.id, fields: config.fields ?? [] };
}
