import { parseAmount, round2 } from './money';
import { norm } from './categorize';

/**
 * Lê extratos de banco: OFX (padrão de todos os bancos) e CSV (Nubank, Inter e genéricos).
 * Saída padronizada: valor NEGATIVO = dinheiro saindo (gasto); POSITIVO = entrando.
 */
export interface StmtRow { externalId: string; date: string; description: string; amount: number }
export interface Statement { format: 'ofx' | 'csv'; source: 'card' | 'account' | 'unknown'; rows: StmtRow[] }

export function parseStatement(text: string, fileName = ''): Statement {
  const t = text.replace(/^﻿/, '');
  if (/<OFX>|<STMTTRN>|OFXHEADER/i.test(t)) return parseOfx(t);
  return parseCsv(t, fileName);
}

/* ---------- OFX ---------- */
function parseOfx(t: string): Statement {
  const source = /<CREDITCARDMSGSRSV1>|<CCSTMTRS>/i.test(t) ? 'card' : /<BANKMSGSRSV1>|<STMTRS>/i.test(t) ? 'account' : 'unknown';
  const rows: StmtRow[] = [];
  const blocks = t.split(/<STMTTRN>/i).slice(1);
  for (const b of blocks) {
    const body = b.split(/<\/STMTTRN>/i)[0];
    // OFX 1.x (SGML) não fecha as tags: lê "<TAG>valor" até a próxima tag ou quebra de linha
    const tag = (name: string) => { const m = body.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i')); return m ? m[1].trim() : ''; };
    const dt = tag('DTPOSTED');
    const amount = parseAmount(tag('TRNAMT').replace(/^\+/, '').replace(/^-/, '')) ?? 0;
    const neg = tag('TRNAMT').trim().startsWith('-');
    if (!/^\d{8}/.test(dt) || !amount) continue;
    const date = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
    const description = cleanDesc(tag('MEMO') || tag('NAME') || 'Lançamento');
    const id = tag('FITID');
    rows.push({ externalId: id ? `ofx:${id}` : '', date, description, amount: neg ? -amount : amount });
  }
  return { format: 'ofx', source, rows: withIds(rows) };
}

/* ---------- CSV ---------- */
function splitLine(line: string, d: string): string[] {
  const out: string[] = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === d && !q) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}
const DATE_RE = /^(\d{4}-\d{2}-\d{2})|^(\d{2})\/(\d{2})\/(\d{2,4})/;
function toDate(v: string): string | null {
  const m = v.trim().match(DATE_RE);
  if (!m) return null;
  if (m[1]) return m[1];
  const y = m[4].length === 2 ? '20' + m[4] : m[4];
  return `${y}-${m[3]}-${m[2]}`;
}
const isMoney = (v: string) => /^[-+]?\s*(R\$\s*)?-?\d[\d.,]*$/i.test(v.trim());
const money = (v: string) => { const neg = /^\s*-|-\s*R\$|R\$\s*-/.test(v) || /^\(.*\)$/.test(v.trim()); const n = parseAmount(v.replace(/[()+-]/g, '')); return n == null ? null : neg ? -n : n; };

function parseCsv(t: string, fileName: string): Statement {
  const lines = t.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { format: 'csv', source: 'unknown', rows: [] };
  const first = lines[0];
  const d = [';', ',', '\t'].map(c => [c, first.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  let table = lines.map(l => splitLine(l, d));
  // alguns bancos põem linhas de cabeçalho antes da tabela: começa na primeira linha que tem uma data
  const firstData = table.findIndex(r => r.some(c => toDate(c)));
  if (firstData < 0) return { format: 'csv', source: 'unknown', rows: [] };
  const header = firstData > 0 ? table[firstData - 1].map(h => norm(h)) : [];
  table = table.slice(firstData);
  const cols = Math.max(...table.map(r => r.length));
  const col = (re: RegExp) => header.findIndex(h => re.test(h));

  let dateCol = col(/^(data|date)/);
  if (dateCol < 0) dateCol = Array.from({ length: cols }, (_, i) => i).find(i => table.every(r => !r[i] || toDate(r[i]))) ?? 0;
  let amtCol = col(/^(valor|amount|value|quantia)/);
  if (amtCol < 0) amtCol = Array.from({ length: cols }, (_, i) => i).filter(i => i !== dateCol && !/saldo|balance/.test(header[i] ?? '')).find(i => table.filter(r => r[i]).every(r => isMoney(r[i]))) ?? -1;
  let descCol = col(/^(descricao|description|title|titulo|historico|estabelecimento|lancamento|memo)/);
  const histCol = col(/^historico/), descrCol = col(/^descricao/);
  if (descCol < 0) {
    const avg = (i: number) => table.reduce((s, r) => s + (r[i]?.length ?? 0), 0) / table.length;
    descCol = Array.from({ length: cols }, (_, i) => i).filter(i => i !== dateCol && i !== amtCol).sort((a, b) => avg(b) - avg(a))[0] ?? -1;
  }
  const idCol = col(/^(identificador|id$|fitid)/);
  if (amtCol < 0) return { format: 'csv', source: 'unknown', rows: [] };

  // Fatura do Nubank (date,title,amount): compras vêm positivas; extrato de conta: saídas negativas
  const looksCard = (header.join(',') === 'date,title,amount') || /fatura|card|cartao/i.test(fileName);
  const source: Statement['source'] = looksCard ? 'card' : header.length ? 'account' : 'unknown';
  const rows: StmtRow[] = [];
  for (const r of table) {
    const date = toDate(r[dateCol] ?? '');
    const v = money(r[amtCol] ?? '');
    if (!date || v === null || v === 0) continue;
    let desc = r[descCol] ?? '';
    // Inter: "Histórico" (Pix enviado) + "Descrição" (nome) juntos ficam mais claros
    if (histCol >= 0 && descrCol >= 0 && histCol !== descrCol) desc = [r[histCol], r[descrCol]].filter(Boolean).join(' · ');
    rows.push({ externalId: idCol >= 0 && r[idCol] ? `csv:${r[idCol]}` : '', date, description: cleanDesc(desc || 'Lançamento'), amount: round2(looksCard ? -v : v) });
  }
  return { format: 'csv', source, rows: withIds(rows) };
}

const cleanDesc = (s: string) => s.replace(/\s+/g, ' ').replace(/^"|"$/g, '').trim().slice(0, 120);

/** Sem id do banco, cria um estável (data + descrição + valor + ordem), para reimportar o mesmo arquivo sem duplicar. */
function withIds(rows: StmtRow[]): StmtRow[] {
  const seen = new Map<string, number>();
  return rows.map(r => {
    if (r.externalId) return r;
    const base = `${r.date}|${norm(r.description)}|${r.amount}`;
    const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    let h = 0; for (const ch of base + '#' + n) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
    return { ...r, externalId: `h:${(h >>> 0).toString(36)}${n}` };
  });
}

/** Linhas que normalmente NÃO devem virar lançamento (o pagamento da fatura já está nas compras do cartão). */
export const looksLikeInvoicePayment = (desc: string) => /pagamento (de |da )?fatura|pgto fatura|fatura (do )?cart|pagamento recebido|credito de pagamento/i.test(norm(desc));
