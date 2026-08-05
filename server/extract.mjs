/**
 * フリーテキスト → テンプレート抽出のバックエンド処理。
 *
 * フロントから受け取るのは「（マスク済みの）テキスト」と「テンプレ定義」と接続情報のみ。
 * プロバイダ呼び出しはここ（サーバー）から行い、ブラウザから直接叩かせない。
 *
 * 返すのは各テンプレ項目に当てはめた値の JSON（{ "fields": { "<key>": "<値>" } }）だけ。
 * 本文中の [EMAIL_1] のようなマスクトークンはそのまま保持させ、復元はブラウザ側で行う。
 */
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `あなたは問合せメールや雑多なメモから項目を抽出して整理するアシスタントです。
与えられた本文テキストから、指定されたテンプレート項目に当てはまる値を読み取り、整形して返してください。

出力は必ず次の形の JSON オブジェクトのみ（前後に説明文やコードフェンスを付けない）:
{
  "fields": {
    "<項目のkey>": "<抽出・整形した値（無ければ空文字）>"
  }
}

ルール:
- 与えられた項目キー以外を出力しない。すべての項目キーを出力に含める（該当が無ければ空文字 ""）。
- 値は本文に書かれている情報だけから作る。推測で埋めたり、事実を創作したりしない。
- 本文に "[EMAIL_1]" や "[NAME_2]" のような角括弧トークンがあれば、それは伏字化された機微情報である。
  値として使う場合はトークン文字列を一字一句そのまま保持する（中身を推測・生成しない）。
- 会社名・氏名・電話・メールなどは、本文の該当箇所を素直に転記する。表記の軽い整形（前後空白の除去）は可。
- 型のヒント（email/phone/url/number/date）がある項目は、その形式に最も合う箇所を選ぶ。`;

function buildUserContent({ text, target }) {
  const fields = (target.fields ?? [])
    .map(
      (f) =>
        `- key:${f.key} / 表示名:${f.label} / 型:${f.type}${f.required ? ' / 必須' : ''} / 別名:[${(f.aliases ?? []).join(', ')}]`,
    )
    .join('\n');

  return `# テンプレート「${target.name}」の項目\n${fields}\n\n# 本文（この内容から抽出する）\n"""\n${text}\n"""\n\n上のテンプレート項目に当てはめた JSON を出力してください。`;
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

async function extractWithAnthropic({ apiKey, model, text, target }) {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: model || 'claude-opus-4-8',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserContent({ text, target }) }],
  });
  const out = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return extractJson(out);
}

async function extractWithOpenAI({ apiKey, model, text, target }) {
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
        { role: 'user', content: buildUserContent({ text, target }) },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenAI API エラー ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  const out = json.choices?.[0]?.message?.content ?? '';
  return extractJson(out);
}

async function extractWithGemini({ apiKey, model, text, target }) {
  const m = model || 'gemini-2.5-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: buildUserContent({ text, target }) }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gemini API エラー ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  const out = (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('');
  return extractJson(out);
}

/** プロバイダを振り分けて抽出結果（{ fields }）を返す */
export async function runExtract({ provider, model, apiKey, text, target }) {
  if (!apiKey || !target?.fields || typeof text !== 'string') {
    const err = new Error('apiKey・text・target.fields は必須です');
    err.status = 400;
    throw err;
  }
  let result;
  if (provider === 'openai') result = await extractWithOpenAI({ apiKey, model, text, target });
  else if (provider === 'gemini') result = await extractWithGemini({ apiKey, model, text, target });
  else result = await extractWithAnthropic({ apiKey, model, text, target });
  return { fields: result.fields ?? result ?? {} };
}
