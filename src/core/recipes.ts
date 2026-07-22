/**
 * マッピングのレシピ(記憶)。
 * 「このソース形式 → このターゲット」の確定済みマッピングを保存し、
 * 次回、同じ列構成のファイルが来たらワンクリックで再適用する。
 * 毎月届く同じ代理店フォーマットの取り込みを一撃で終わらせるための機能。
 */
import type { MappingConfig, SourceDataset } from '../types';
import { normalizeHeader } from './inference/dictionary';
import { makeCollectionRepo } from './collectionRepository';

export interface Recipe {
  id: string;
  name: string;
  targetSchemaId: string;
  /** ソース列名の正規化シグネチャ(列構成の一致判定に使う) */
  signature: string;
  /** 保存時点のソース列名(表示用) */
  sourceColumns: string[];
  mapping: MappingConfig;
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
): Recipe {
  return {
    id: `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    targetSchemaId: mapping.targetSchemaId,
    signature: sourceSignature(source.columns),
    sourceColumns: source.columns.map((c) => c.name),
    mapping,
    updatedAt: Date.now(),
  };
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
