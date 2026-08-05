import type { TargetField } from '../types';
import { fieldDisplayName } from './fieldMeta';

type Row = Record<string, string>;

function valueOf(row: Row, key: string): string {
  const value = row[key];
  return value == null ? '' : String(value);
}

function splitFieldRef(rawName: string): { name: string; attr: string } {
  const raw = rawName.trim();
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return { name: raw, attr: 'value' };
  const attr = raw.slice(dot + 1).trim();
  if (!['value', 'label', 'labal', 'key'].includes(attr)) {
    return { name: raw, attr: 'value' };
  }
  return { name: raw.slice(0, dot).trim(), attr };
}

function fieldLookup(fields: TargetField[]): Map<string, TargetField> {
  const lookup = new Map<string, TargetField>();
  for (const field of fields) {
    lookup.set(field.key, field);
    const display = fieldDisplayName(field);
    if (display) lookup.set(display, field);
    if (field.label.trim()) lookup.set(field.label.trim(), field);
  }
  return lookup;
}

function resolveFieldRef(
  rawName: string,
  row: Row,
  fields: TargetField[],
): string {
  const { name, attr } = splitFieldRef(rawName);
  if (!name) return '';
  const field = fieldLookup(fields).get(name);
  if (attr === 'key') return field?.key ?? name;
  if (attr === 'label' || attr === 'labal')
    return field ? fieldDisplayName(field) : name;
  return valueOf(row, field?.key ?? name);
}

function renderTemplate(
  template: string,
  row: Row,
  fields: TargetField[],
): string {
  return template.replace(/\{([^{}]+)\}/g, (_, rawName: string) => {
    return resolveFieldRef(rawName, row, fields);
  });
}

type Token =
  | { type: 'string'; value: string }
  | { type: 'field'; value: string }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: string }
  | { type: 'punct'; value: '(' | ')' | ',' }
  | { type: 'eof'; value: '' };

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly row: Row,
    private readonly fields: TargetField[],
  ) {}

  parse(): string {
    const value = this.expr();
    this.expect('eof');
    return stringify(value);
  }

  private expr(): unknown {
    return this.concat();
  }

  private concat(): unknown {
    let value = this.compare();
    while (this.matchOp('&')) {
      value = stringify(value) + stringify(this.compare());
    }
    return value;
  }

  private compare(): unknown {
    const left = this.primary();
    const op = this.peek();
    if (
      (op.type !== 'op' && op.type !== 'ident') ||
      !['=', '==', '!=', 'contains', 'startsWith', 'endsWith'].includes(
        op.value,
      )
    ) {
      return left;
    }
    this.pos++;
    const right = this.primary();
    const l = stringify(left);
    const r = stringify(right);
    switch (op.value) {
      case '=':
      case '==':
        return l === r;
      case '!=':
        return l !== r;
      case 'contains':
        return l.includes(r);
      case 'startsWith':
        return l.startsWith(r);
      case 'endsWith':
        return l.endsWith(r);
      default:
        return false;
    }
  }

  private primary(): unknown {
    const token = this.peek();
    if (token.type === 'string') {
      this.pos++;
      return renderTemplate(token.value, this.row, this.fields);
    }
    if (token.type === 'field') {
      this.pos++;
      return renderTemplate('{' + token.value + '}', this.row, this.fields);
    }
    if (token.type === 'ident') return this.callOrIdentifier();
    if (token.type === 'punct' && token.value === '(') {
      this.pos++;
      const value = this.expr();
      this.expect('punct', ')');
      return value;
    }
    throw new Error('式の構文を確認してください。');
  }

  private callOrIdentifier(): unknown {
    const name = this.expect('ident').value;
    if (!this.matchPunct('(')) return name;
    const args: unknown[] = [];
    if (!this.matchPunct(')')) {
      do {
        args.push(this.expr());
      } while (this.matchPunct(','));
      this.expect('punct', ')');
    }
    return callFunction(name, args);
  }

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: 'eof', value: '' };
  }

  private expect(type: Token['type'], value?: string): Token {
    const token = this.peek();
    if (token.type !== type || (value != null && token.value !== value)) {
      throw new Error('式の構文を確認してください。');
    }
    this.pos++;
    return token;
  }

  private matchOp(value: string): boolean {
    const token = this.peek();
    if (token.type === 'op' && token.value === value) {
      this.pos++;
      return true;
    }
    return false;
  }

  private matchPunct(value: '(' | ')' | ','): boolean {
    const token = this.peek();
    if (token.type === 'punct' && token.value === value) {
      this.pos++;
      return true;
    }
    return false;
  }
}

function stringify(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value == null) return '';
  return String(value);
}

function truthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return stringify(value).trim() !== '';
}

function caseValue(args: unknown[]): string {
  for (let i = 0; i + 1 < args.length; i += 2) {
    if (truthy(args[i])) return stringify(args[i + 1]);
  }
  return args.length % 2 === 1 ? stringify(args[args.length - 1]) : '';
}

function coalesceValue(args: unknown[]): string {
  for (const arg of args) {
    const value = stringify(arg);
    if (value.trim() !== '') return value;
  }
  return '';
}

function callFunction(name: string, args: unknown[]): unknown {
  switch (name) {
    case 'if':
      return truthy(args[0]) ? stringify(args[1]) : stringify(args[2]);
    case 'case':
      return caseValue(args);
    case 'else':
      return stringify(args[0]);
    case 'coalesce':
      return coalesceValue(args);
    case 'contains':
      return stringify(args[0]).includes(stringify(args[1]));
    case 'startsWith':
      return stringify(args[0]).startsWith(stringify(args[1]));
    case 'endsWith':
      return stringify(args[0]).endsWith(stringify(args[1]));
    case 'empty':
      return stringify(args[0]).trim() === '';
    case 'notEmpty':
      return stringify(args[0]).trim() !== '';
    case 'trim':
      return stringify(args[0]).trim();
    case 'value':
      return stringify(args[0]);
    case 'label':
      return stringify(args[0]);
    case 'upper':
      return stringify(args[0]).toUpperCase();
    case 'lower':
      return stringify(args[0]).toLowerCase();
    default:
      throw new Error('未対応の関数です: ' + name);
  }
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let value = '';
      i++;
      while (i < input.length) {
        const c = input[i++];
        if (c === quote) break;
        if (c === '\\' && i < input.length) {
          const next = input[i++];
          value += next === 'n' ? '\n' : next;
        } else {
          value += c;
        }
      }
      tokens.push({ type: 'string', value });
      continue;
    }
    if (ch === '{') {
      const end = input.indexOf('}', i + 1);
      if (end < 0) throw new Error('フィールド参照の } がありません。');
      tokens.push({ type: 'field', value: input.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === ',') {
      tokens.push({ type: 'punct', value: ch });
      i++;
      continue;
    }
    const two = input.slice(i, i + 2);
    if (two === '==' || two === '!=') {
      tokens.push({ type: 'op', value: two });
      i += 2;
      continue;
    }
    if (ch === '=') {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    if (ch === '&') {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    const ident = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(i));
    if (ident) {
      const value = ident[0];
      tokens.push({ type: 'ident', value });
      i += value.length;
      continue;
    }
    throw new Error('未対応の文字です: ' + ch);
  }
  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

export function evaluateAutoFillExpression(
  expression: string,
  row: Row,
  fields: TargetField[],
): string {
  const trimmed = expression.trim();
  if (!trimmed) return '';
  return new Parser(tokenize(trimmed), row, fields).parse();
}

export function expressionHelpText(): string {
  return [
    '例: if({LeadSource} = "Web", "Webリード: {Company}", "会社名: {Company}")',
    '複数分岐: case({LeadSource} = "Web", "Web", {LeadSource} = "展示会", "Event", "Other")',
    'フィールド参照: {Company}, {Company.value}, {Company.label}, {Company.key}',
    '比較: =, ==, !=, contains, startsWith, endsWith',
    '関数: if(条件, 真, 偽), case(条件1, 値1, ..., 既定値), coalesce(a,b), empty(a), trim(a)',
    '結合: "固定テキスト" & {Company}',
  ].join('\n');
}
