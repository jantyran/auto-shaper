/**
 * LLM 推論器の差し込み口(スタブ)。
 *
 * MVPでは未使用だが、設計ドキュメントのアーキテクチャ(Step 3)を将来実装する際、
 * ここを埋めるだけで UI 側を変えずに切り替えられることを示す。
 *
 * 重要な設計上の約束:
 *  - この関数に渡る SuggestContext は buildSuggestContext() で
 *    既に匿名化済み。実データの生の中身は含まれない。
 *  - 送るのは「ターゲットスキーマ / ソースのカラム名と型 / 匿名化サンプル」のみ。
 *  - LLM に生成させるのは MappingConfig(JSONルール)だけで、
 *    実データの全件変換はローカルの変換エンジンが行う。
 */
import type { MappingConfig, MappingSuggester, SuggestContext } from '../../types';

export interface LlmSuggesterOptions {
  /** バックエンドのエンドポイント(実データではなく匿名化コンテキストのみ送る) */
  endpoint: string;
  model?: string;
}

/**
 * バックエンド経由で LLM にマッピングルールを推論させる実装の雛形。
 * endpoint 側では SuggestContext を受け取り、システムプロンプトで
 * 「MappingConfig の JSON のみを返す」ことを強制する想定。
 */
export function createLlmSuggester(opts: LlmSuggesterOptions): MappingSuggester {
  return {
    id: 'llm-remote',
    label: `LLM 推論 (${opts.model ?? 'remote'})`,
    async suggest(ctx: SuggestContext): Promise<MappingConfig> {
      const res = await fetch(opts.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 送信されるのは匿名化済みコンテキストのみ
        body: JSON.stringify({ model: opts.model, context: ctx }),
      });
      if (!res.ok) {
        throw new Error(`LLM推論に失敗しました: ${res.status}`);
      }
      const json = (await res.json()) as MappingConfig;
      return json;
    },
  };
}
