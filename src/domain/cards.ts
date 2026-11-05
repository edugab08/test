import type { Card, Tx } from './types';
import { addMonths, dateIn, monthStart, parts } from './dates';
import { sum, round2 } from './money';

/**
 * Mês de vencimento da fatura em que uma compra cai.
 * Compra antes do fechamento entra na fatura que fecha neste mês; no dia do fechamento ou depois, na do mês seguinte.
 * Se o vencimento é num dia anterior ao fechamento (fecha 28, vence 5), a fatura vence no mês seguinte ao fechamento.
 */
export function invoiceMonth(card: Pick<Card, 'closing_day' | 'due_day'>, purchaseDate: string): string {
  const { d } = parts(purchaseDate);
  const closing = addMonths(monthStart(purchaseDate), d >= card.closing_day ? 1 : 0);
  return card.due_day > card.closing_day ? closing : addMonths(closing, 1);
}

const onCard = (t: Tx, cardId: string) => t.method === 'card' && t.card_id === cardId && t.kind !== 'income';

/** Limite ocupado: tudo que está no cartão e ainda não foi pago (inclui parcelas futuras). */
export const cardUsed = (txs: Tx[], cardId: string) => sum(txs.filter(t => onCard(t, cardId) && !t.paid), t => t.amount);
export const cardInvoice = (txs: Tx[], cardId: string, month: string) => txs.filter(t => onCard(t, cardId) && t.month === month);
export const cardAvailable = (card: Card, txs: Tx[]) => round2(Math.max(0, card.limit_amount - cardUsed(txs, card.id)));

/** Datas de uma fatura (identificada pelo mês em que vence) e a situação dela hoje. */
export function invoiceInfo(card: Pick<Card, 'closing_day' | 'due_day'>, inv: string, todayIso: string) {
  const due = dateIn(inv, card.due_day);
  const closing = dateIn(card.due_day > card.closing_day ? inv : addMonths(inv, -1), card.closing_day);
  const status: 'aberta' | 'fechada' | 'futura' = todayIso < closing
    ? (invoiceMonth(card, todayIso) === inv ? 'aberta' : 'futura')
    : 'fechada';
  return { due, closing, status };
}
