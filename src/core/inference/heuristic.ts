/**
 * ローカル・ヒューリスティック推論器。
 *
 * カラム名の類似度・別名辞書・データ型/パターンの一致から、
 * ターゲット各フィールドへのマッピングを提案する。
 * 外部APIを一切呼ばず、ブラウザ内で完結する(MVPの既定サジェスト)。
 *
 * 将来 LLM に差し替える際も、同じ MappingSuggester インターフェースと
 * SuggestContext(匿名化済み)を使うため、UI側の変更は不要。
 */
import type {
  DataType,
  FieldMapping,
  MappingConfig,
  MappingSuggester,
  Normalizer,
  SuggestContext,
  TargetField,
} from '../../types';
import {
  FULL_NAME_KEYWORDS,
  isFirstNameField,
  isLastNameField,
  matchesAnyKeyword,
  similarity,
} from './dictionary';
import { learnedBoost, type LearnedEntry } from '../learning';
import { fieldDisplayName } from '../fieldMeta';

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_LIKE_RE = /^[\d\-+()\s]{7,}$/;
const URL_RE = /^https?:\/\//i;

interface ScoredColumn {
  name: string;
  score: number;
  rationale: string;
}

/** ターゲットの型に応じた既定の正規化子 */
function defaultNormalizers(
  type: DataType,
  targetKeyOrLabel: string,
): Normalizer[] {
  switch (type) {
    case 'email':
      return ['normalizeEmail'];
    case 'phone':
      return ['normalizePhone'];
    default:
      // 会社名系はカッコ略記の展開を既定にする
      if (/company|会社|企業|法人|account|組織|団体/i.test(targetKeyOrLabel)) {
        return ['trim', 'normalizeCompany'];
      }
      return ['trim'];
  }
}

/** サンプル値が指定型のパターンに合致する割合(0-1) */
function patternMatchRate(samples: string[], type: DataType): number {
  const vals = samples.filter((s) => s && s.trim() !== '');
  if (vals.length === 0) return 0;
  let hit = 0;
  for (const v of vals) {
    const t = v.trim();
    switch (type) {
      case 'email':
        if (EMAIL_RE.test(t)) hit++;
        break;
      case 'phone':
        if (PHONE_LIKE_RE.test(t) && t.replace(/\D/g, '').length >= 7) hit++;
        break;
      case 'url':
        if (URL_RE.test(t)) hit++;
        break;
      default:
        hit++;
    }
  }
  return hit / vals.length;
}

/**
 * 1つのターゲットフィールドに対して、各ソース列のスコアを算出する。
 */
function scoreColumns(
  field: TargetField,
  ctx: SuggestContext,
  learned: LearnedEntry[] = [],
): ScoredColumn[] {
  const candidates = field.aliases.length
    ? [field.key, fieldDisplayName(field), ...field.aliases]
    : [field.key, fieldDisplayName(field)];

  return ctx.columns
    .map((col) => {
      // 名前類似度: 別名の中で最大の類似度を採用
      let nameScore = 0;
      let bestAlias = '';
      for (const cand of candidates) {
        const s = similarity(col.name, cand);
        if (s > nameScore) {
          nameScore = s;
          bestAlias = cand;
        }
      }

      // 型/パターンによる補正
      const samples = ctx.anonymizedSamples.map((r) => r[col.name] ?? '');
      const patternRate = patternMatchRate(samples, field.type);
      let typeBonus = 0;
      if (field.type === col.inferredType) typeBonus += 0.15;
      if (
        (field.type === 'email' ||
          field.type === 'phone' ||
          field.type === 'url') &&
        patternRate >= 0.6
      ) {
        typeBonus += 0.2;
      }

      // fillRateが低い列は少し減点(欠損だらけの列は誤マップしやすい)
      const fillPenalty = col.fillRate < 0.1 ? -0.1 : 0;

      // 学習辞書による加点(過去にユーザーがこの対応を確定していれば)
      const boost = learnedBoost(col.name, field.key, learned);

      const score = Math.max(
        0,
        Math.min(1, nameScore + typeBonus + fillPenalty + boost),
      );

      const reasons: string[] = [];
      if (boost > 0) reasons.push('過去の修正履歴から学習');
      if (nameScore >= 0.6) reasons.push(`列名が「${bestAlias}」に類似`);
      else if (nameScore > 0) reasons.push(`列名がやや類似(${bestAlias})`);
      if (typeBonus > 0) reasons.push(`データ形式が${field.type}と一致`);

      return {
        name: col.name,
        score,
        rationale: reasons.join(' / ') || '有力な手がかりなし',
      };
    })
    .sort((a, b) => b.score - a.score);
}

/** 姓/名に分割できそうな結合カラム(氏名 等)を探す */
function findFullNameColumn(ctx: SuggestContext): string | undefined {
  const col = ctx.columns.find(
    (c) =>
      matchesAnyKeyword(c.name, FULL_NAME_KEYWORDS) &&
      // 姓・名の単独列そのものは除外
      !isLastNameField(c.name) &&
      !isFirstNameField(c.name),
  );
  return col?.name;
}

const NAME_SEPARATORS = [' ', '　', '/', '・'];

/** 氏名を分割する際の推定区切り文字を、サンプルから決める */
function guessNameDelimiter(ctx: SuggestContext, column: string): string {
  for (const row of ctx.anonymizedSamples) {
    const v = row[column] ?? '';
    for (const sep of NAME_SEPARATORS) {
      if (v.includes(sep)) return sep;
    }
  }
  return ' ';
}

export class HeuristicSuggester implements MappingSuggester {
  readonly id = 'heuristic-local';
  readonly label = 'ローカル推論 (辞書＋類似度)';

  async suggest(
    ctx: SuggestContext,
    learned: LearnedEntry[] = [],
  ): Promise<MappingConfig> {
    const usedColumns = new Set<string>();
    const fields: FieldMapping[] = [];

    // 事前に姓/名の直接対応列があるか調べておく
    const lastNameField = ctx.target.fields.find(
      (f) => isLastNameField(f.key) || isLastNameField(fieldDisplayName(f)),
    );
    const firstNameField = ctx.target.fields.find(
      (f) => isFirstNameField(f.key) || isFirstNameField(fieldDisplayName(f)),
    );

    const directLastCandidate = lastNameField
      ? scoreColumns(lastNameField, ctx, learned)[0]
      : undefined;
    const directFirstCandidate = firstNameField
      ? scoreColumns(firstNameField, ctx, learned)[0]
      : undefined;

    const hasSeparateName =
      (directLastCandidate?.score ?? 0) >= 0.75 &&
      (directFirstCandidate?.score ?? 0) >= 0.75;

    const fullNameColumn = findFullNameColumn(ctx);

    for (const field of ctx.target.fields) {
      const normalizers = defaultNormalizers(
        field.type,
        `${field.key} ${fieldDisplayName(field)}`,
      );

      // ── 姓/名の特別処理: 結合列しか無い場合は split を提案 ──
      if (!hasSeparateName && fullNameColumn) {
        if (
          isLastNameField(field.key) ||
          isLastNameField(fieldDisplayName(field))
        ) {
          usedColumns.add(fullNameColumn);
          fields.push({
            targetKey: field.key,
            transform: {
              kind: 'split',
              source: fullNameColumn,
              delimiter: guessNameDelimiter(ctx, fullNameColumn),
              index: 0,
            },
            normalizers,
            confidence: 0.7,
            rationale: `「${fullNameColumn}」を分割して姓を取得`,
          });
          continue;
        }
        if (
          isFirstNameField(field.key) ||
          isFirstNameField(fieldDisplayName(field))
        ) {
          fields.push({
            targetKey: field.key,
            transform: {
              kind: 'split',
              source: fullNameColumn,
              delimiter: guessNameDelimiter(ctx, fullNameColumn),
              index: 1,
            },
            normalizers,
            confidence: 0.65,
            rationale: `「${fullNameColumn}」を分割して名を取得`,
          });
          continue;
        }
      }

      // 通常のスコアリング
      const scored = scoreColumns(field, ctx, learned).filter(
        (s) => !usedColumns.has(s.name),
      );
      const best = scored[0];

      if (best && best.score >= 0.55) {
        usedColumns.add(best.name);
        fields.push({
          targetKey: field.key,
          transform: { kind: 'direct', source: best.name },
          normalizers,
          confidence: Number(best.score.toFixed(2)),
          rationale: best.rationale,
        });
      } else {
        // 該当なし → 空(ユーザーが手で割り当てる)
        fields.push({
          targetKey: field.key,
          transform: { kind: 'empty' },
          normalizers: [],
          confidence: 0,
          rationale: '対応する列が見つかりませんでした',
        });
      }
    }

    // ── 備考/メモ系フィールドに、どこにも割り当てられなかった列を「項目名: 値」で集約 ──
    const leftover = ctx.columns
      .map((c) => c.name)
      .filter((name) => !usedColumns.has(name));
    if (leftover.length > 0) {
      for (const mapping of fields) {
        const field = ctx.target.fields.find(
          (f) => f.key === mapping.targetKey,
        );
        if (!field) continue;
        if (mapping.transform.kind !== 'empty') continue;
        if (!isNotesField(field.key) && !isNotesField(fieldDisplayName(field)))
          continue;
        mapping.transform = {
          kind: 'concat',
          sources: [...leftover],
          separator: '\n',
          withLabels: true,
          labelSeparator: ': ',
        };
        mapping.normalizers = [];
        mapping.confidence = 0.5;
        mapping.rationale = `未割り当ての ${leftover.length} 列を「項目名: 値」で集約`;
        break; // 最初の備考系フィールドにのみ集約する
      }
    }

    return { targetSchemaId: ctx.target.id, fields };
  }
}

/** 備考・メモ・自由記述のようなフィールドか */
function isNotesField(keyOrLabel: string): boolean {
  return /備考|摘要|メモ|コメント|自由|補足|notes?|remarks?|memo|comment|description|others?|その他/i.test(
    keyOrLabel,
  );
}

export const heuristicSuggester = new HeuristicSuggester();
