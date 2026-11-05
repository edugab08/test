import type { Backend, Change } from './backend';
import type { Card, Category, Data, Member, Recurring, TableName, Tx } from '../domain/types';
import { uuid } from '../domain/build';
import { addMonths, dateIn, thisMonth } from '../domain/dates';
import { invoiceMonth } from '../domain/cards';
import { splitInstallments } from '../domain/money';

/** Modo demonstração: tudo no navegador, para testar o app sem configurar o Supabase. */
const KEY = 'fad_demo_v1';
const H = 'demo-house';
const CATS: [string, string, string, Category['kind']][] = [
  ['Moradia & Contas', '#60A5FA', 'home', 'expense'], ['Mercado', '#4BE3A6', 'cart', 'expense'], ['Restaurantes & Delivery', '#FB923C', 'utensils', 'expense'],
  ['Transporte', '#FFC861', 'car', 'expense'], ['Saúde', '#FB7185', 'pill', 'expense'], ['Roupas', '#F472B6', 'shirt', 'expense'],
  ['Beleza & Academia', '#C084FC', 'sparkles', 'expense'], ['Educação', '#2DD4BF', 'book', 'expense'], ['Assinaturas', '#A78BFA', 'film', 'expense'],
  ['Lazer & Viagens', '#22D3EE', 'gamepad', 'expense'], ['Pets & Casa', '#84CC16', 'paw', 'expense'], ['Outros', '#94A3B8', 'box', 'expense'],
  ['Salário', '#4BE3A6', 'wallet', 'income'], ['Renda extra', '#FACC15', 'coins', 'income'], ['Investimentos', '#38BDF8', 'trend', 'investment']
];

function seed(): Data {
  const me: Member = { id: 'm-edu', household_id: H, user_id: 'demo-user', display_name: 'Eduardo', color: '#3DD9EB' };
  const her: Member = { id: 'm-mari', household_id: H, user_id: 'demo-partner', display_name: 'Marina', color: '#FF7AB6' };
  const categories: Category[] = CATS.map(([name, color, icon, kind], i) => ({ id: 'c' + i, household_id: H, name, color, icon, kind, budget: null, sort: i, archived: false }));
  const c = (n: string) => categories.find(x => x.name === n)!.id;
  categories.find(x => x.name === 'Mercado')!.budget = 1200;
  categories.find(x => x.name === 'Restaurantes & Delivery')!.budget = 450;
  categories.find(x => x.name === 'Lazer & Viagens')!.budget = 400;
  const nu: Card = { id: 'card-nu', household_id: H, name: 'Nubank', limit_amount: 6000, closing_day: 3, due_day: 10, holder_id: me.id, archived: false };
  const inter: Card = { id: 'card-inter', household_id: H, name: 'Inter', limit_amount: 3000, closing_day: 25, due_day: 5, holder_id: her.id, archived: false };
  const now = thisMonth(), start = addMonths(now, -2);
  const rec = (p: Partial<Recurring>): Recurring => ({ id: uuid(), household_id: H, description: '', amount: 0, kind: 'expense', nature: 'fixed', category_id: null, method: 'pix', card_id: null, wallet_id: null, day: 5, payer_id: me.id, shared: true, start_month: start, end_month: null, skipped: [], created_by: me.id, ...p });
  const recurring = [
    rec({ description: 'Salário', amount: 5200, kind: 'income', nature: null, category_id: c('Salário'), shared: false, day: 5 }),
    rec({ description: 'Salário', amount: 3800, kind: 'income', nature: null, category_id: c('Salário'), shared: false, day: 5, payer_id: her.id, created_by: her.id }),
    rec({ description: 'Aluguel', amount: 1650, category_id: c('Moradia & Contas'), day: 10 }),
    rec({ description: 'Internet iFibra', amount: 119.9, category_id: c('Moradia & Contas'), day: 15, payer_id: null }),
    rec({ description: 'Luz Copel', amount: 186.4, category_id: c('Moradia & Contas'), day: 20, payer_id: her.id }),
    rec({ description: 'Netflix', amount: 44.9, category_id: c('Assinaturas'), method: 'card', card_id: nu.id, day: 12 }),
    rec({ description: 'Academia', amount: 99.9, category_id: c('Beleza & Academia'), payer_id: her.id, shared: false, day: 8 }),
    rec({ description: 'Faculdade Campo Real', amount: 689, category_id: c('Educação'), shared: false, day: 10 })
  ];
  const txs: Tx[] = [];
  const add = (month: string, day: number, description: string, amount: number, cat: string, o: Partial<Tx> = {}) => {
    const date = dateIn(month, day);
    const card = o.card_id === nu.id ? nu : o.card_id === inter.id ? inter : null;
    txs.push({ id: uuid(), household_id: H, description, notes: '', amount, kind: 'expense', nature: 'variable', category_id: c(cat), method: card ? 'card' : 'pix', card_id: card?.id ?? null, wallet_id: null, occurred_on: date, month: card ? invoiceMonth(card, date) : month, paid: !card && date <= dateIn(now, new Date().getDate()), payer_id: me.id, shared: true, installment_group: null, installment_no: null, installment_total: null, recurring_id: null, created_by: me.id, ...o });
  };
  [-2, -1, 0].forEach(off => {
    const m = addMonths(now, off), past = off < 0;
    add(m, 2, 'Mercado Condor', 412.37 + off * 30, 'Mercado', { payer_id: her.id, created_by: her.id });
    add(m, 9, 'Feira', 86.5, 'Mercado');
    add(m, 4, 'iFood', 78.9, 'Restaurantes & Delivery', { card_id: nu.id });
    add(m, 1, 'Posto Ipiranga', 180, 'Transporte', { shared: false });
    if (past) {
      add(m, 16, 'Mercado Muffato', 356.2, 'Mercado', { card_id: inter.id, payer_id: her.id, created_by: her.id });
      add(m, 21, 'Pizza sexta', 96, 'Restaurantes & Delivery', { payer_id: her.id, created_by: her.id });
      add(m, 23, 'Cinema', 64, 'Lazer & Viagens');
      add(m, 26, 'Farmácia Nissei', 57.8, 'Saúde', { payer_id: her.id, shared: false, created_by: her.id });
      add(m, 18, 'Uber', 23.4, 'Transporte', { payer_id: her.id, shared: false, created_by: her.id });
    }
    txs.push({ id: uuid(), household_id: H, description: 'Guardado · Reserva de emergência', notes: '', amount: 500, kind: 'investment', nature: null, category_id: c('Investimentos'), method: 'pix', card_id: null, wallet_id: 'w-reserva', occurred_on: dateIn(m, 6), month: m, paid: true, payer_id: null, shared: true, installment_group: null, installment_no: null, installment_total: null, recurring_id: null, created_by: me.id });
  });
  add(now, 3, 'Restaurante aniversário', 238, 'Restaurantes & Delivery', { payer_id: her.id, created_by: her.id });
  add(now, 1, 'Ração', 149.9, 'Pets & Casa', { paid: true });
  const g = uuid(), tvDate = dateIn(addMonths(now, -1), 14);
  splitInstallments(2399, 6).forEach((amount, i) => txs.push({ id: uuid(), household_id: H, description: 'Smart TV 55"', notes: 'Black Friday', amount, kind: 'expense', nature: 'variable', category_id: c('Pets & Casa'), method: 'card', card_id: nu.id, wallet_id: null, occurred_on: tvDate, month: addMonths(invoiceMonth(nu, tvDate), i), paid: false, payer_id: me.id, shared: true, installment_group: g, installment_no: i + 1, installment_total: 6, recurring_id: null, created_by: me.id }));
  // faturas passadas já pagas
  txs.forEach(t => { if (t.method === 'card' && t.month < now) t.paid = true; });
  return {
    household: { id: H, name: 'Eduardo & Marina', invite_code: 'K7Q2ZP', split_mode: 'prop' },
    members: [me, her], categories, cards: [nu, inter],
    wallets: [{ id: 'w-reserva', household_id: H, name: 'Reserva de emergência', base_balance: 8200, rate: 14 }, { id: 'w-viagem', household_id: H, name: 'Caixinha viagem', base_balance: 1350, rate: 12 }],
    goals: [{ id: 'g1', household_id: H, name: 'Viagem para o Chile', target: 9000, deadline: addMonths(now, 9), wallet_id: 'w-viagem' }, { id: 'g2', household_id: H, name: 'Reserva de 6 meses', target: 30000, deadline: addMonths(now, 24), wallet_id: 'w-reserva' }],
    recurring, transactions: txs,
    settlements: []
  };
}

export class DemoBackend implements Backend {
  readonly kind = 'demo' as const;
  private data: Data;
  constructor() {
    let d: Data | null = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* sem cache */ }
    this.data = d && d.household ? d : seed();
    this.save();
  }
  private save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* cheio */ } }
  async userId() { return 'demo-user'; }
  async signIn() {}
  async signUp() { return false; }
  async sendPasswordReset() {}
  async updatePassword() {}
  async signOut() { localStorage.removeItem(KEY); this.data = seed(); this.save(); location.reload(); }
  onAuth() { return () => {}; }
  async load() { return structuredClone(this.data); }
  private list(t: TableName) { return (this.data as unknown as Record<string, { id: string }[]>)[t]; }
  async upsert(t: TableName, rows: Record<string, unknown>[]) {
    if (t === 'households') { Object.assign(this.data.household!, rows[0]); this.save(); return; }
    const L = this.list(t);
    rows.forEach(r => { const i = L.findIndex(x => x.id === r.id); if (i >= 0) L[i] = { ...L[i], ...r } as never; else L.push(r as never); });
    this.save();
  }
  async remove(t: TableName, ids: string[]) {
    const L = this.list(t); const keep = L.filter(x => !ids.includes(x.id));
    (this.data as unknown as Record<string, unknown>)[t] = keep; this.save();
  }
  async ensureRecurring(months: string[]) {
    let n = 0;
    for (const r of this.data.recurring) for (const m of months) {
      const card = r.method === 'card' ? this.data.cards.find(c => c.id === r.card_id) : null;
      const occ = dateIn(m, r.day), inv = card ? invoiceMonth(card, occ) : m;
      if (r.start_month > m || (r.end_month && r.end_month < m) || r.skipped.includes(inv)) continue;
      if (this.data.transactions.some(t => t.recurring_id === r.id && t.month === inv)) continue;
      n++;
      this.data.transactions.push({ id: uuid(), household_id: H, description: r.description, notes: '', amount: r.amount, kind: r.kind, nature: r.nature, category_id: r.category_id, method: r.method, card_id: r.card_id, wallet_id: r.wallet_id, occurred_on: occ, month: inv, paid: inv < thisMonth(), payer_id: r.payer_id, shared: r.shared, installment_group: null, installment_no: null, installment_total: null, recurring_id: r.id, created_by: r.created_by });
    }
    this.save();
    return n;
  }
  async createHousehold() {}
  async joinHousehold() {}
  async newInviteCode() { const c = Math.random().toString(16).slice(2, 10).toUpperCase(); this.data.household!.invite_code = c; this.save(); return c; }
  async importTransactions(rows: Record<string, unknown>[]) { await this.upsert('transactions', rows); return rows.length; }
  subscribe(_h: string, _cb: (c: Change) => void) { return () => {}; }
}
