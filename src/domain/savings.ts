import type { Data, Goal, Member, Tx, Wallet } from './types';
import { addMonths, parts } from './dates';
import { round2, sum } from './money';
import { isRescue, monthMetrics } from './metrics';

/** Tudo sobre o dinheiro guardado: saldo por reserva, rendimento, quem guardou, projeção e metas. */

const moves = (txs: Tx[], walletId: string) => txs.filter(t => t.paid && t.wallet_id === walletId && (t.kind === 'investment' || isRescue(t)));
const signed = (t: Tx) => (t.kind === 'investment' ? t.amount : -t.amount);

/** Saldo = saldo inicial informado + o que foi guardado − o que foi resgatado. */
export const walletBalance = (w: Wallet, txs: Tx[]) => round2(w.base_balance + sum(moves(txs, w.id), signed));
/** Saldo da reserva no fim de um mês. */
export const walletBalanceAt = (w: Wallet, txs: Tx[], month: string) => round2(w.base_balance + sum(moves(txs, w.id).filter(t => t.month <= month), signed));

/** Taxa anual → rendimento mensal equivalente (juros compostos). */
export const monthlyRate = (annualPct: number) => Math.pow(1 + annualPct / 100, 1 / 12) - 1;

export interface Savings {
  total: number;
  wallets: { wallet: Wallet; balance: number; yieldMonth: number; share: number }[];
  yieldMonth: number;          // rendimento estimado por mês somando todas as reservas
  rate: number;                // taxa anual média ponderada
  savedThisMonth: number;      // guardado − resgatado no mês aberto
  avgMonthly: number;          // média guardada por mês nos últimos 3 meses
  byPerson: { member: Member | null; amount: number }[]; // quem guardou no ano (null = conta conjunta)
  history: { month: string; total: number }[];          // fim de cada um dos últimos 6 meses
  projection: { month: string; total: number }[];       // próximos 12 meses no ritmo atual
}

export function savings(data: Data, month: string): Savings {
  const W = data.wallets;
  const bal = W.map(w => walletBalance(w, data.transactions));
  const total = round2(bal.reduce((a, b) => a + b, 0));
  const yields = W.map((w, i) => round2(bal[i] * monthlyRate(w.rate)));
  const yieldMonth = round2(yields.reduce((a, b) => a + b, 0));
  const rate = total > 0 ? W.reduce((s, w, i) => s + bal[i] * w.rate, 0) / total : W.length ? W.reduce((s, w) => s + w.rate, 0) / W.length : 0;
  const savedThisMonth = monthMetrics(data, month).invested;
  const avgMonthly = round2([1, 2, 3].reduce((s, n) => s + monthMetrics(data, addMonths(month, -n)).invested, 0) / 3);

  const year = String(parts(month).y);
  const yearMoves = data.transactions.filter(t => t.month.startsWith(year) && (t.kind === 'investment' || isRescue(t)));
  const byPerson = [...data.members.map(m => ({ member: m as Member | null, amount: sum(yearMoves.filter(t => t.payer_id === m.id), signed) })),
    { member: null, amount: sum(yearMoves.filter(t => !t.payer_id), signed) }].filter(p => p.amount !== 0);

  const totalAt = (mk: string) => round2(W.reduce((s, w) => s + walletBalanceAt(w, data.transactions, mk), 0));
  const history = [-5, -4, -3, -2, -1, 0].map(n => { const mk = addMonths(month, n); return { month: mk, total: totalAt(mk) }; });
  const r = monthlyRate(rate), pace = Math.max(0, avgMonthly);
  let v = total;
  const projection = Array.from({ length: 12 }, (_, i) => { v = v * (1 + r) + pace; return { month: addMonths(month, i + 1), total: round2(v) }; });

  return { total, wallets: W.map((w, i) => ({ wallet: w, balance: bal[i], yieldMonth: yields[i], share: total ? bal[i] / total : 0 })), yieldMonth, rate, savedThisMonth, avgMonthly, byPerson, history, projection };
}

/** Meta: quanto falta, quanto guardar por mês até o prazo e quando chega no ritmo atual. */
export function goalStatus(g: Goal, data: Data, month: string, s: Savings) {
  const w = data.wallets.find(x => x.id === g.wallet_id);
  const current = w ? walletBalance(w, data.transactions) : s.total;
  const missing = round2(Math.max(0, g.target - current));
  const pct = g.target > 0 ? Math.min(100, (current / g.target) * 100) : 0;
  let monthsLeft: number | null = null;
  if (g.deadline) { const a = parts(g.deadline), b = parts(month); monthsLeft = Math.max(1, (a.y - b.y) * 12 + a.m0 - b.m0); }
  const perMonth = monthsLeft ? round2(missing / monthsLeft) : null;
  // ritmo atual: o que foi guardado nessa reserva (ou no total) por mês, em média, nos últimos 3 meses
  const paceOf = (mk: string) => w ? round2(sum(data.transactions.filter(t => t.month === mk && t.paid && t.wallet_id === w.id && (t.kind === 'investment' || isRescue(t))), signed)) : monthMetrics(data, mk).invested;
  const pace = round2([1, 2, 3].reduce((acc, n) => acc + paceOf(addMonths(month, -n)), 0) / 3);
  const r = monthlyRate(w ? w.rate : s.rate);
  let eta: string | null = null;
  if (missing === 0) eta = month;
  else if (pace > 0 || (r > 0 && current > 0)) {
    let v = current;
    for (let i = 1; i <= 240; i++) { v = v * (1 + r) + Math.max(0, pace); if (v >= g.target) { eta = addMonths(month, i); break; } }
  }
  return { current, missing, pct, monthsLeft, perMonth, pace, eta, reached: missing === 0 };
}
