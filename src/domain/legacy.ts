import type { Card, Category, Goal, Method, Recurring, Settlement, Tx, Wallet } from './types';
import { uuid } from './build';
import { dateIn, monthStart } from './dates';
import { round2 } from './money';

/** Converte o backup JSON do app antigo (planilha do Google) para as tabelas novas. */

const CAT_MAP: Record<string, string> = {
  'Moradia & Contas': 'Moradia & Contas', 'Alimentação & Mercado': 'Mercado', 'Delivery & Restaurantes': 'Restaurantes & Delivery',
  'Transporte & Combustível': 'Transporte', 'Saúde & Farmácia': 'Saúde', 'Roupas & Acessórios': 'Roupas',
  'Beleza & Cuidados': 'Beleza & Academia', 'Educação & Cursos': 'Educação', 'Assinaturas & Streaming': 'Assinaturas',
  'Lazer & Casal': 'Lazer & Viagens', 'Pets & Casa': 'Pets & Casa', Investimentos: 'Investimentos', 'Renda Extra': 'Renda extra',
  Renda: 'Salário', Outros: 'Outros'
};
const PALETTE = ['#F472B6', '#60A5FA', '#4BE3A6', '#FFC861', '#A78BFA', '#22D3EE', '#FB923C', '#84CC16'];

export interface LegacyCtx { householdId: string; p1: string; p2: string | null; categories: Category[]; me: string }
export interface LegacyResult {
  newCategories: Category[]; budgets: { id: string; budget: number }[];
  cards: Card[]; wallets: Wallet[]; goals: Goal[]; recurring: Recurring[]; transactions: Tx[]; settlements: Settlement[];
  stats: { transactions: number; salaries: number; months: number };
}

const method = (m: string | undefined): Method => {
  const s = (m || '').toLowerCase();
  if (s.includes('cart')) return 'card';
  if (s.includes('boleto')) return 'boleto';
  if (s.includes('dinheiro')) return 'cash';
  return 'pix';
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertLegacy(old: any, ctx: LegacyCtx): LegacyResult {
  if (!old || !Array.isArray(old.transactions)) throw new Error('Este arquivo não parece um backup do app antigo (falta a lista de transações).');
  const H = ctx.householdId;
  const memberOf = (p: 'p1' | 'p2') => (p === 'p1' ? ctx.p1 : ctx.p2 ?? ctx.p1);
  const ownerOf = (o: string | undefined): { payer_id: string | null; shared: boolean } => {
    switch (o) {
      case 'p1': return { payer_id: memberOf('p1'), shared: true };
      case 'p2': return { payer_id: memberOf('p2'), shared: true };
      case 'p1_ind': return { payer_id: memberOf('p1'), shared: false };
      case 'p2_ind': return { payer_id: memberOf('p2'), shared: false };
      default: return { payer_id: null, shared: true };
    }
  };

  // categorias
  const cats = [...ctx.categories];
  const newCategories: Category[] = [];
  const catId = (name: string | undefined, kind: Tx['kind']): string | null => {
    const want = CAT_MAP[name || ''] ?? name ?? '';
    if (!want) return null;
    let c = cats.find(x => x.name.toLowerCase() === want.toLowerCase());
    if (!c) {
      c = { id: uuid(), household_id: H, name: want, color: PALETTE[newCategories.length % PALETTE.length], icon: 'box', kind: kind === 'income' ? 'income' : kind === 'investment' ? 'investment' : 'expense', budget: null, sort: 50 + newCategories.length, archived: false };
      cats.push(c); newCategories.push(c);
    }
    return c.id;
  };
  (old.categories?.custom || []).forEach((c: { value?: string; label?: string }) => catId(c.value || c.label, 'expense'));

  const cardMap = new Map<unknown, string>();
  const cards: Card[] = (old.cards || []).map((c: { id: unknown; name: string; limit?: number; dueDay?: number; closingDay?: number }) => {
    const id = uuid(); cardMap.set(c.id, id);
    return { id, household_id: H, name: c.name || 'Cartão', limit_amount: Number(c.limit) || 0, closing_day: c.closingDay || 1, due_day: c.dueDay || 10, holder_id: null, archived: false };
  });
  const firstCard = cards[0]?.id ?? null;

  const walletMap = new Map<unknown, string>();
  const wallets: Wallet[] = (old.wallets || []).map((w: { id: unknown; name: string; balance?: number; rate?: number }) => {
    const id = uuid(); walletMap.set(w.id, id);
    return { id, household_id: H, name: w.name, base_balance: Number(w.balance) || 0, rate: Number(w.rate) || 0 };
  });
  const goals: Goal[] = (old.goals || []).map((g: { name: string; target?: number; deadline?: string; walletId?: unknown }) => ({
    id: uuid(), household_id: H, name: g.name, target: Number(g.target) || 0,
    deadline: g.deadline ? g.deadline.slice(0, 7) + '-01' : null, wallet_id: walletMap.get(g.walletId) ?? null
  }));

  const kindOf = (type: string): { kind: Tx['kind']; nature: Tx['nature'] } =>
    type === 'income' ? { kind: 'income', nature: null } : type === 'investment' ? { kind: 'investment', nature: null } : { kind: 'expense', nature: type === 'expense_fixed' ? 'fixed' : 'variable' };

  const recMap = new Map<unknown, string>();
  const recurring: Recurring[] = (old.recurring || []).map((r: Record<string, any>) => {
    const id = uuid(); recMap.set(r.id, id);
    const k = kindOf(r.type), m = method(r.method), own = ownerOf(r.owner);
    return {
      id, household_id: H, description: r.desc, amount: round2(Number(r.amount) || 0), ...k,
      category_id: catId(r.category, k.kind), method: m, card_id: m === 'card' ? (cardMap.get(r.cardId) ?? firstCard) : null,
      wallet_id: walletMap.get(r.walletId) ?? null, day: Number(r.day) || 5,
      payer_id: k.kind === 'income' ? null : own.payer_id, shared: k.kind === 'income' ? false : own.shared,
      start_month: (r.start || '2024-01') + '-01', end_month: null, skipped: (r.skipped || []).map((s: string) => s + '-01'), created_by: ctx.me
    };
  }).filter((r: Recurring) => r.amount > 0);

  const seenRec = new Set<string>();
  const transactions: Tx[] = [];
  for (const t of old.transactions as Record<string, any>[]) {
    const amount = round2(Math.abs(Number(t.amount) || 0));
    if (!amount || !/^\d{4}-\d{2}$/.test(t.monthKey || '')) continue;
    const month = t.monthKey + '-01', k = kindOf(t.type), m = method(t.method), own = ownerOf(t.owner);
    let recurring_id = recMap.get(t.recurId) ?? null;
    if (recurring_id) { const key = recurring_id + month; if (seenRec.has(key)) recurring_id = null; else seenRec.add(key); }
    const inst = String(t.desc || '').match(/\((\d+)\/(\d+)\)\s*$/);
    transactions.push({
      id: uuid(), household_id: H, description: t.desc || 'Lançamento', notes: t.notes || '', amount, ...k,
      category_id: catId(t.category, k.kind), method: m, card_id: m === 'card' ? (cardMap.get(t.cardId) ?? firstCard) : null,
      wallet_id: walletMap.get(t.walletId) ?? null, occurred_on: dateIn(month, Number(t.day) || 1), month,
      paid: t.status === 'paid', payer_id: own.payer_id, shared: k.kind === 'income' ? false : own.shared,
      installment_group: null, installment_no: inst ? Number(inst[1]) : null, installment_total: inst ? Number(inst[2]) : null,
      recurring_id, created_by: ctx.me
    });
  }

  // salários antigos (um valor por mês por pessoa) viram lançamentos de renda de cada um
  let salaries = 0;
  const salCat = catId('Renda', 'income');
  (['p1', 'p2'] as const).forEach(p => {
    const map = (p === 'p1' ? old.salariesP1 : old.salariesP2) || {};
    if (p === 'p2' && !ctx.p2) return;
    Object.entries(map).forEach(([mk, v]) => {
      const amount = round2(Number(v) || 0);
      if (amount <= 0 || !/^\d{4}-\d{2}$/.test(mk)) return;
      salaries++;
      transactions.push({
        id: uuid(), household_id: H, description: 'Salário', notes: '', amount, kind: 'income', nature: null, category_id: salCat,
        method: 'pix', card_id: null, wallet_id: null, occurred_on: mk + '-05', month: mk + '-01', paid: true,
        payer_id: memberOf(p), shared: false, installment_group: null, installment_no: null, installment_total: null, recurring_id: null, created_by: ctx.me
      });
    });
  });

  const settlements: Settlement[] = (old.settlements || []).filter((s: { amount?: number }) => Number(s.amount) > 0).map((s: Record<string, any>) => ({
    id: uuid(), household_id: H, month: (s.monthKey || '') + '-01', from_member: memberOf(s.from === 'p2' ? 'p2' : 'p1'), to_member: memberOf(s.from === 'p2' ? 'p1' : 'p2'), amount: round2(Number(s.amount)), note: s.note || ''
  }));

  const budgets = Object.entries(old.budgets || {}).map(([name, v]) => ({ id: catId(name, 'expense')!, budget: Number(v) || 0 })).filter(b => b.id && b.budget > 0);

  return {
    newCategories, budgets, cards, wallets, goals, recurring, transactions, settlements,
    stats: { transactions: old.transactions.length, salaries, months: new Set(transactions.map(t => monthStart(t.month))).size }
  };
}
