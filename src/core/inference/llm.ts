/**
 * LLM 推論器(フロント側)。
 *
 * 自前バックエンド `/api/suggest` を呼ぶだけで、プロバイダ(Anthropic等)へは
 * サーバー側から接続する。ブラウザから直接プロバイダを叩かないので、
 * CORS 問題を避けつつ、送信内容はマスキング済みコンテキストに限定される。
 *
 * LLM の出力は信頼せず、必ず MappingConfig の形にサニタイズしてから使う。
 */
import type {
  FieldMapping,
  MappingConfig,
  Normalizer,
  SuggestContext,
  Transform,
} from '../../types';
import type { LlmSettings } from '../settings';

const VALID_KINDS = new Set([
  'direct',
  'concat',
  'split',
  'constant',
  'conditional',
  'empty',
]);
const VALID_NORMALIZERS: Normalizer[] = [
  'trim',
  'toHalfWidth',
  'toFullWidth',
  'normalizeCompany',
  'normalizePhone',
  'normalizeEmail',
  'upperCase',
  'lowerCase',
  'removeSpaces',
];

export const llmSuggester = {
  id: 'llm-remote',
  label: 'LLM 推論',

  async suggest(ctx: SuggestContext, llm: LlmSettings): Promise<MappingConfig> {
    const res = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 送るのはマスキング済みコンテキストと、接続情報のみ
      body: JSON.stringify({
        provider: llm.provider,
        model: llm.model,
        apiKey: llm.apiKey,
        context: ctx,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM API エラー (${res.status}): ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as unknown;
    return sanitizeMapping(json, ctx);
  },
};

/** LLM 応答を安全な MappingConfig に整える。未指定の項目は empty で補う */
function sanitizeMapping(raw: unknown, ctx: SuggestContext): MappingConfig {
  const columnNames = new Set(ctx.columns.map((c) => c.name));
  const rawFields: unknown[] = Array.isArray((raw as any)?.fields)
    ? (raw as any).fields
    : [];
  const byKey = new Map<string, any>();
  for (const f of rawFields) {
    if (f && typeof (f as any).targetKey === 'string') {
      byKey.set((f as any).targetKey, f);
    }
  }

  const fields: FieldMapping[] = ctx.target.fields.map((tf) => {
    const rf = byKey.get(tf.key);
    const transform = sanitizeTransform(rf?.transform, columnNames);
    const normalizers = sanitizeNormalizers(rf?.normalizers);
    const confidence =
      typeof rf?.confidence === 'number'
        ? Math.max(0, Math.min(1, rf.confidence))
        : transform.kind === 'empty'
          ? 0
          : 0.8;
    return {
      targetKey: tf.key,
      transform,
      normalizers,
      confidence,
      rationale:
        typeof rf?.rationale === 'string' ? rf.rationale : 'LLM による提案',
    };
  });

  return { targetSchemaId: ctx.target.id, fields };
}

function sanitizeTransform(t: any, columns: Set<string>): Transform {
  if (!t || typeof t.kind !== 'string' || !VALID_KINDS.has(t.kind)) {
    return { kind: 'empty' };
  }
  switch (t.kind) {
    case 'direct':
      return columns.has(t.source)
        ? { kind: 'direct', source: String(t.source) }
        : { kind: 'empty' };
    case 'concat': {
      const sources = Array.isArray(t.sources)
        ? t.sources.filter((s: unknown) => columns.has(s as string)).map(String)
        : [];
      return sources.length
        ? { kind: 'concat', sources, separator: String(t.separator ?? ' ') }
        : { kind: 'empty' };
    }
    case 'split':
      return columns.has(t.source)
        ? {
            kind: 'split',
            source: String(t.source),
            delimiter: String(t.delimiter ?? ' '),
            index: Number.isInteger(t.index) ? t.index : 0,
          }
        : { kind: 'empty' };
    case 'constant':
      return { kind: 'constant', value: String(t.value ?? '') };
    case 'conditional':
      return columns.has(t.source) && Array.isArray(t.cases)
        ? {
            kind: 'conditional',
            source: String(t.source),
            cases: t.cases
              .filter((c: any) => c && typeof c.op === 'string')
              .map((c: any) => ({
                op: c.op,
                value: String(c.value ?? ''),
                then: String(c.then ?? ''),
              })),
            fallback: t.fallback != null ? String(t.fallback) : undefined,
          }
        : { kind: 'empty' };
    default:
      return { kind: 'empty' };
  }
}

function sanitizeNormalizers(arr: unknown): Normalizer[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((n): n is Normalizer =>
    VALID_NORMALIZERS.includes(n as Normalizer),
  );
}
