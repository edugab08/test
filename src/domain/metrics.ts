import type { Data, Member, Tx } from './types';
import { round2, sum } from './money';

export interface PersonMonth {
  member: Member;
  income: number;        // renda que entrou para esta pessoa (+ metade da renda da conta conjunta)
  share: number;         // fração das despesas do casal que cabe a ela (0..1)
  sharedPart: number;    // quanto das despesas do casal cabe a ela
  personal: number;      // despesas só dela
  invested: number;      // aportes que ela fez sozinha
  free: number;          // o que sobra para ela no mês
  paidShared: number;    // quanto ela já pagou do bolso das despesas do casal
}

export interface MonthMetrics {
  month: string;
  txs: Tx[];
  income: number;
  expenses: number;
  invested: number;
  net: number;           // sobra do mês (renda − despesas − aportes)
  carried: number;       // saldo acumulado de meses anteriores
  balance: number;       // net + carried
  pending: number;       // despesas ainda não pagas no mês
  fixed: number; variable: number;
  sharedTotal: number;   // despesas do casal no mês
  people: PersonMonth[];
  settlement: { from: Member; to: Member; amount: number } | null;
  settled: number;       // acertos já registrados neste mês
}

const isOut = (t: Tx) => t.kind !== 'income';

export function monthMetrics(data: Data, month: string): MonthMetrics {
  const txs = data.transactions.filter(t => t.month === month);
  const income = sum(txs.filter(t => t.kind === 'income'), t => t.amount);
  const expenses = sum(txs.filter(t => t.kind === 'expense'), t => t.amount);
  const invested = sum(txs.filter(t => t.kind === 'investment'), t => t.amount);
  const net = round2(income - expenses - invested);
  const carried = sum(data.transactions.filter(t => t.month < month), t => (t.kind === 'income' ? t.amount : -t.amount));
  const pending = sum(txs.filter(t => isOut(t) && !t.paid), t => t.amount);
  const fixed = sum(txs.filter(t => t.kind === 'expense' && t.nature === 'fixed'), t => t.amount);
  const variable = round2(expenses - fixed);

  const members = data.members;
  const jointIncome = sum(txs.filter(t => t.kind === 'income' && !t.payer_id), t => t.amount);
  const incomeOf = (m: Member) => round2(sum(txs.filter(t => t.kind === 'income' && t.payer_id === m.id), t => t.amount) + (members.length ? jointIncome / members.length : 0));
  const totalIncome = sum(members, incomeOf);
  const shareOf = (m: Member) => {
    if (members.length < 2) return 1;
    if (data.household?.split_mode === 'equal' || totalIncome <= 0) return 1 / members.length;
    return incomeOf(m) / totalIncome;
  };
  const sharedOut = txs.filter(t => isOut(t) && t.shared);
  const sharedTotal = sum(sharedOut, t => t.amount);

  const people: PersonMonth[] = members.map(m => {
    const share = shareOf(m);
    const personal = sum(txs.filter(t => t.kind === 'expense' && !t.shared && t.payer_id === m.id), t => t.amount);
    const investedSolo = sum(txs.filter(t => t.kind === 'investment' && !t.shared && t.payer_id === m.id), t => t.amount);
    const sharedPart = round2(sharedTotal * share);
    const inc = incomeOf(m);
    return {
      member: m, income: inc, share, sharedPart, personal, invested: investedSolo,
      free: round2(inc - sharedPart - personal - investedSolo),
      paidShared: sum(sharedOut.filter(t => t.payer_id === m.id), t => t.amount)
    };
  });

  // Acerto: das despesas do casal pagas do bolso de alguém (não da conta conjunta),
  // cada um deveria ter pago a sua fração. Quem pagou a mais recebe a diferença.
  let settlement: MonthMetrics['settlement'] = null;
  const monthSettles = data.settlements.filter(s => s.month === month);
  const settled = sum(monthSettles, s => s.amount);
  if (people.length === 2) {
    const [a, b] = people;
    const outOfPocket = round2(a.paidShared + b.paidShared);
    let aNet = round2(a.paidShared - outOfPocket * a.share);
    monthSettles.forEach(s => { aNet = round2(aNet + (s.from_member === a.member.id ? s.amount : -s.amount)); });
    if (Math.abs(aNet) >= 0.01) settlement = aNet > 0 ? { from: b.member, to: a.member, amount: aNet } : { from: a.member, to: b.member, amount: -aNet };
  }

  return { month, txs, income, expenses, invested, net, carried, balance: round2(net + carried), pending, fixed, variable, sharedTotal, people, settlement, settled };
}

/** Regra 50/30/20 usando só o próprio mês (o app antigo somava o saldo de todos os meses anteriores na fatia de poupança). */
export function rule503020(m: MonthMetrics) {
  const base = m.income || 1;
  const save = round2(m.invested + Math.max(0, m.net));
  return {
    fixed: { value: m.fixed, pct: m.income ? (m.fixed / base) * 100 : 0, target: 50 },
    variable: { value: m.variable, pct: m.income ? (m.variable / base) * 100 : 0, target: 30 },
    save: { value: save, pct: m.income ? (save / base) * 100 : 0, target: 20 }
  };
}

export function byCategory(txs: Tx[]) {
  const g = new Map<string | null, number>();
  txs.filter(t => t.kind === 'expense').forEach(t => g.set(t.category_id, round2((g.get(t.category_id) || 0) + t.amount)));
  return [...g.entries()].sort((a, b) => b[1] - a[1]);
}

/** Média de gasto por categoria nos últimos n meses antes de `month` — base para sugerir orçamentos. */
export function categoryAverages(data: Data, months: string[]) {
  const acc = new Map<string, number>();
  months.forEach(mk => byCategory(data.transactions.filter(t => t.month === mk)).forEach(([c, v]) => { if (c) acc.set(c, (acc.get(c) || 0) + v / months.length); }));
  return acc;
}
