/**
 * 変換用 Web Worker。
 * 数万行の実データ変換をメインスレッドから切り離し、UIのフリーズを防ぐ。
 * 実データはこのワーカー(=ブラウザ内)から外に出ない。
 */
import type { MappingConfig } from '../types';
import { transformRow } from '../core/transformEngine';

type Row = Record<string, string>;

export interface TransformRequest {
  rows: Row[];
  config: MappingConfig;
}

export interface TransformProgress {
  type: 'progress';
  done: number;
  total: number;
}

export interface TransformDone {
  type: 'done';
  rows: Row[];
}

export type TransformResponse = TransformProgress | TransformDone;

self.onmessage = (e: MessageEvent<TransformRequest>) => {
  const { rows, config } = e.data;
  const total = rows.length;
  const out: Row[] = new Array(total);
  const chunk = 2000;

  for (let i = 0; i < total; i++) {
    out[i] = transformRow(rows[i], config);
    if (i % chunk === 0) {
      const msg: TransformProgress = { type: 'progress', done: i, total };
      self.postMessage(msg);
    }
  }

  const done: TransformDone = { type: 'done', rows: out };
  self.postMessage(done);
};
