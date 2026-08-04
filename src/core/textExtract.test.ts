import { describe, it, expect } from 'vitest';
import { localTextExtract, sanitizeExtraction } from './textExtract';
import type { TargetSchema } from '../types';

const target: TargetSchema = {
  id: 'inquiry',
  name: '問合せ',
  origin: 'preset',
  fields: [
    { key: 'Company', label: '会社名', required: true, type: 'string', aliases: ['会社', '企業名', 'company'] },
    { key: 'Name', label: '氏名', required: true, type: 'string', aliases: ['担当者', 'name', 'お名前'] },
    { key: 'Email', label: 'メール', required: false, type: 'email', aliases: ['email', 'mail', '連絡先'] },
    { key: 'Phone', label: '電話番号', required: false, type: 'phone', aliases: ['tel', 'phone', '電話'] },
    { key: 'Body', label: '要件', required: false, type: 'string', aliases: ['内容', '本文'] },
  ],
};

describe('localTextExtract', () => {
  it('「ラベル: 値」形式の行をテンプレ項目に割り当てる', () => {
    const text = [
      '会社名: 株式会社サンプル',
      'お名前: 山田 太郎',
      '要件: 新製品の見積もり依頼',
    ].join('\n');
    const rec = localTextExtract(text, target);
    expect(rec.Company).toBe('株式会社サンプル');
    expect(rec.Name).toBe('山田 太郎');
    expect(rec.Body).toBe('新製品の見積もり依頼');
  });

  it('全角コロン・別名でも一致する', () => {
    const text = '企業名：ABC商事\n担当者：佐藤';
    const rec = localTextExtract(text, target);
    expect(rec.Company).toBe('ABC商事');
    expect(rec.Name).toBe('佐藤');
  });

  it('メール/電話は本文全体からパターンで補完する', () => {
    const text = 'お問い合わせします。 taro@example.com まで。TEL 03-1234-5678';
    const rec = localTextExtract(text, target);
    expect(rec.Email).toBe('taro@example.com');
    expect(rec.Phone).toContain('03-1234-5678');
  });

  it('メールがマスク済みトークンでも email 型に割り当てる', () => {
    const text = '連絡は [EMAIL_1] へお願いします。';
    const rec = localTextExtract(text, target);
    expect(rec.Email).toBe('[EMAIL_1]');
  });
});

describe('sanitizeExtraction', () => {
  it('{ fields: {...} } 形式を受け付け、テンプレ外のキーを捨てる', () => {
    const raw = { fields: { Company: ' A社 ', Email: 'x@y.com', Bogus: 'ignore' } };
    const rec = sanitizeExtraction(raw, target);
    expect(rec.Company).toBe('A社');
    expect(rec.Email).toBe('x@y.com');
    expect('Bogus' in rec).toBe(false);
  });

  it('フラットなオブジェクトも受け付け、非文字列は文字列化する', () => {
    const rec = sanitizeExtraction({ Company: 'B社', Phone: 12345 }, target);
    expect(rec.Company).toBe('B社');
    expect(rec.Phone).toBe('12345');
  });

  it('空文字・null は落とす', () => {
    const rec = sanitizeExtraction({ Company: '', Name: null }, target);
    expect('Company' in rec).toBe(false);
    expect('Name' in rec).toBe(false);
  });
});
