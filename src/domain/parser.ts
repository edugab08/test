import type { Card, Category, Kind, Member, Method, Nature } from './types';
import { categorize, norm } from './categorize';
import { parseAmount } from './money';
import { isoDate } from './dates';

export interface Draft {
  description: string;
  amount: number | null;
  kind: Kind;
  nature: Nature | null;
  category: Category | null;
  method: Method;
  cardId: string | null;
  installments: number;
  date: string;
  /** 'me' | 'partner' | 'joint' — só preenchido se a frase disser */
  payer?: 'me' | 'partner' | 'joint';
  shared?: boolean;
}

interface Ctx { cards: Card[]; categories: Category[]; me?: Member | null; partner?: Member | null; now?: Date }

const METHOD_WORDS: Record<string, Method> = { pix: 'pix', debito: 'pix', 'débito': 'pix', boleto: 'boleto', dinheiro: 'cash', especie: 'cash', cartao: 'card', credito: 'card' };
const STOP = new Set(['no', 'na', 'em', 'de', 'do', 'da', 'com', 'pelo', 'pela', 'r$', 'reais', 'real', 'vezes', 'pagou', 'paguei', 'parcelado', 'parcelas']);

/**
 * Lê uma frase como "mercado 230,50 nubank 3x", "+ freela 800", "farmácia 85 só eu ontem", "aluguel 1500 conjunta".
 */
export function parseQuick(input: string, ctx: Ctx): Draft {
  const now = ctx.now ?? new Date();
  let text = input.trim();
  let kind: Kind = 'expense';
  if (/^\+/.test(text) || /\b(recebi|ganhei)\b/i.test(norm(text))) { kind = 'income'; text = text.replace(/^\+\s*/, ''); }

  let payer: Draft['payer'], shared: boolean | undefined;
  const n = norm(text);
  // quem pagou / de quem é
  if (/\b(so eu|so meu|so minha|pessoal|individual)\b/.test(n)) { shared = false; payer = 'me'; text = text.replace(/\b(s[oó] (eu|meu|minha)|pessoal|individual)\b/gi, ' '); }
  if (/\b(conjunta|conta conjunta)\b/.test(n)) { payer = 'joint'; text = text.replace(/\b(conta conjunta|conjunta)\b/gi, ' '); }
  if (/\b(dividir|dividido|meio a meio|nos dois|casal)\b/.test(n)) { shared = true; text = text.replace(/\b(dividir|dividido|meio a meio|n[oó]s dois|casal)\b/gi, ' '); }
  if (ctx.partner) {
    const pn = norm(ctx.partner.display_name.split(' ')[0]);
    if (pn.length > 1 && new RegExp(`\\b${pn}\\b`).test(norm(text))) {
      payer = 'partner';
      text = text.replace(new RegExp(`\\b(a |o )?${ctx.partner.display_name.split(' ')[0]}( pagou)?\\b`, 'gi'), ' ');
    }
  }
  if (/\b(ela|ele) pagou\b/i.test(text)) { payer = 'partner'; text = text.replace(/\b(ela|ele) pagou\b/gi, ' '); }

  // data
  let date = isoDate(now);
  const nn = norm(text);
  if (/\banteontem\b/.test(nn)) { date = isoDate(new Date(now.getTime() - 2 * 864e5)); text = text.replace(/\banteontem\b/gi, ' '); }
  else if (/\bontem\b/.test(nn)) { date = isoDate(new Date(now.getTime() - 864e5)); text = text.replace(/\bontem\b/gi, ' '); }
  else if (/\bhoje\b/.test(nn)) text = text.replace(/\bhoje\b/gi, ' ');
  const dm = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (dm) {
    let y = dm[3] ? Number(dm[3]) : now.getFullYear();
    if (y < 100) y += 2000;
    const cand = new Date(y, Number(dm[2]) - 1, Number(dm[1]));
    if (!dm[3] && cand.getTime() > now.getTime() + 864e5 * 31) cand.setFullYear(y - 1); // "28/12" digitado em janeiro
    date = isoDate(cand);
    text = text.replace(dm[0], ' ');
  }

  // parcelas
  let installments = 1;
  const pm = text.match(/\b(\d{1,2})\s*x\b/i);
  if (pm) { installments = Math.min(48, Math.max(1, Number(pm[1]))); text = text.replace(pm[0], ' '); }

  // cartão por nome ("nubank", "inter"...)
  let method: Method = installments > 1 ? 'card' : 'pix';
  let cardId: string | null = null;
  const tn = norm(text);
  const card = ctx.cards.filter(c => !c.archived).find(c => norm(c.name).split(/\s+/).some(w => w.length > 2 && !['cartao', 'credito'].includes(w) && new RegExp(`\\b${w}\\b`).test(tn)));
  if (card) {
    method = 'card'; cardId = card.id;
    norm(card.name).split(/\s+/).forEach(w => { if (w.length > 2) text = text.replace(new RegExp(`\\b${w}\\b`, 'i'), ' '); });
  }

  // valor + palavras de forma de pagamento
  let amount: number | null = null;
  const words: string[] = [];
  for (const tok of text.split(/\s+/).filter(Boolean)) {
    const k = norm(tok);
    if (k in METHOD_WORDS) { method = METHOD_WORDS[k]; continue; }
    if (amount === null && /^(r\$)?\d[\d.,]*$/i.test(tok)) { amount = parseAmount(tok); continue; }
    if (/^r\$$/i.test(tok)) continue;
    words.push(tok);
  }
  if (method === 'card' && !cardId) cardId = ctx.cards.find(c => !c.archived)?.id ?? null;
  if (method !== 'card') cardId = null;
  if (kind === 'income' && method === 'card') method = 'pix';

  while (words.length && STOP.has(norm(words[words.length - 1]))) words.pop();
  while (words.length && STOP.has(norm(words[0]))) words.shift();
  let description = words.join(' ').replace(/\s+/g, ' ').trim();
  description = description ? description[0].toUpperCase() + description.slice(1) : (kind === 'income' ? 'Entrada' : 'Lançamento');

  const { category, nature } = categorize(input, ctx.categories.filter(c => (kind === 'income' ? c.kind === 'income' : c.kind !== 'income')));
  if (category?.kind === 'investment') kind = 'investment';
  return { description, amount, kind, nature: kind === 'expense' ? (nature ?? 'variable') : null, category, method, cardId, installments, date, payer, shared };
}
