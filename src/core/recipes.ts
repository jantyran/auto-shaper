/**
 * マッピングのレシピ(記憶)。
 * 「このソース形式 → このターゲット」の確定済みマッピングを保存し、
 * 次回、同じ列構成のファイルが来たらワンクリックで再適用する。
 * 毎月届く同じ代理店フォーマットの取り込みを一撃で終わらせるための機能。
 */
import type { LookupTable, MappingConfig, SourceDataset } from '../types';
import type { DedupeConfig } from './dedupe';
import { normalizeHeader } from './inference/dictionary';
import { makeCollectionRepo } from './collectionRepository';

/**
 * レシピが覚えている参照テーブル1件分。
 *
 * ファイルの中身は保存しない。実データをブラウザの外にも保存先にも
 * 置かないというアプリの方針を、レシピだけ例外にはできないため。
 * 代わりにファイル名を控えておき、適用時に「これを入れてください」と促す。
 */
export interface SavedLookup {
  /** 保存時のファイル名(再投入を促す表示に使う) */
  fileName: string;
  /** 突き合わせ方の設定。fileIndex は復元時に振り直す。 */
  table: LookupTable;
}

export interface Recipe {
  id: string;
  name: string;
  targetSchemaId: string;
  /** ソース列名の正規化シグネチャ(列構成の一致判定に使う) */
  signature: string;
  /** 保存時点のソース列名(表示用) */
  sourceColumns: string[];
  mapping: MappingConfig;
  /** 参照テーブル(横引き)の設定。ファイルの中身は含まない。 */
  lookups?: SavedLookup[];
  /** 重複の照合キーと処理 */
  dedupe?: DedupeConfig;
  updatedAt: number;
}

const repo = makeCollectionRepo<Recipe>('recipes');

/** ソースの列構成から一意なシグネチャを作る(順不同・表記ゆれを吸収) */
export function sourceSignature(columns: { name: string }[]): string {
  return columns
    .map((c) => normalizeHeader(c.name))
    .filter((s) => s !== '')
    .sort()
    .join('|');
}

export function listRecipes(): Promise<Recipe[]> {
  return repo.list();
}

export function saveRecipe(recipe: Recipe): Promise<Recipe[]> {
  return repo.put(recipe);
}

export function deleteRecipe(id: string): Promise<Recipe[]> {
  return repo.remove(id);
}

export function createRecipe(
  name: string,
  source: SourceDataset,
  mapping: MappingConfig,
  extras: { lookups?: SavedLookup[]; dedupe?: DedupeConfig } = {},
): Recipe {
  const lookups = extras.lookups?.length ? extras.lookups : undefined;
  // 参照テーブルが足した列はシグネチャから外す。次回、まだ参照テーブルを
  // 入れていない素のファイルを読んだ時点で候補に出したいため。
  const added = lookups ? lookupAddedColumns(lookups) : new Set<string>();
  const baseColumns = source.columns.filter(
    (c) => !added.has(normalizeHeader(c.name)),
  );
  return {
    id: `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    targetSchemaId: mapping.targetSchemaId,
    signature: sourceSignature(baseColumns),
    sourceColumns: baseColumns.map((c) => c.name),
    mapping,
    lookups,
    dedupe: extras.dedupe,
    updatedAt: Date.now(),
  };
}

/** 参照テーブルが元データに足す列名(正規化済み) */
export function lookupAddedColumns(lookups: SavedLookup[]): Set<string> {
  const added = new Set<string>();
  for (const { table } of lookups) {
    for (const col of table.columns) added.add(normalizeHeader(col.as));
    if (table.statusColumn) added.add(normalizeHeader(table.statusColumn));
  }
  return added;
}

/**
 * ソースの列構成に一致するレシピを探す。
 * 完全一致を優先し、無ければ列の重なりが十分(70%以上)なものを候補にする。
 */
export function findMatchingRecipes(
  recipes: Recipe[],
  source: SourceDataset,
): Recipe[] {
  const sig = sourceSignature(source.columns);
  const sourceSet = new Set(sig.split('|').filter(Boolean));

  return recipes
    .map((r) => {
      if (r.signature === sig) return { r, score: 1 };
      const recipeSet = new Set(r.signature.split('|').filter(Boolean));
      let overlap = 0;
      for (const s of sourceSet) if (recipeSet.has(s)) overlap++;
      const denom = Math.max(sourceSet.size, recipeSet.size) || 1;
      return { r, score: overlap / denom };
    })
    .filter((x) => x.score >= 0.7)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);
}
