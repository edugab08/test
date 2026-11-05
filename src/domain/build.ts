import type { Card, Member, Tx } from './types';
import type { Draft } from './parser';
import { invoiceMonth } from './cards';
import { addMonths, monthStart, today } from './dates';
import { splitInstallments } from './money';

export const uuid = () =>
  (globalThis.crypto && 'randomUUID' in globalThis.crypto)
    ? globalThis.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); });

export interface BuildOpts {
  householdId: string;
  me: Member;
  partner: Member | null;
  cards: Card[];
  notes?: string;
  /** força o mês (ex.: lançar em outro mês que está aberto na tela). Ignorado para cartão. */
  forceMonth?: string;
}

/** Transforma um rascunho em um ou mais lançamentos (parcelas), já com a fatura certa do cartão. */
export function buildTxs(d: Draft & { amount: number }, o: BuildOpts): Tx[] {
  const payer_id = d.payer === 'joint' ? null : d.payer === 'partner' ? (o.partner?.id ?? o.me.id) : o.me.id;
  const shared = d.kind === 'income' ? false : d.shared ?? true;
  const card = d.method === 'card' ? o.cards.find(c => c.id === d.cardId) ?? null : null;
  const first = card ? invoiceMonth(card, d.date) : (o.forceMonth ?? monthStart(d.date));
  const n = card ? d.installments : 1;
  const parts = n > 1 ? splitInstallments(d.amount, n) : [d.amount];
  const group = n > 1 ? uuid() : null;
  return parts.map((amount, i) => ({
    id: uuid(), household_id: o.householdId, description: d.description, notes: o.notes ?? '', amount,
    kind: d.kind, nature: d.kind === 'expense' ? d.nature ?? 'variable' : null,
    category_id: d.category?.id ?? null, method: d.method, card_id: card?.id ?? null, wallet_id: null,
    occurred_on: d.date, month: addMonths(first, i),
    // cartão fica pendente até pagar a fatura; pix/dinheiro de hoje já saiu da conta
    paid: card ? false : d.kind === 'income' ? true : d.date <= today(),
    payer_id: d.kind === 'income' && payer_id === null ? null : payer_id, shared,
    installment_group: group, installment_no: n > 1 ? i + 1 : null, installment_total: n > 1 ? n : null,
    recurring_id: null, created_by: o.me.id
  }));
}
