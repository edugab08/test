import { describe, expect, it } from 'vitest';
import { parseAmount, splitInstallments, sum } from './money';
import { invoiceMonth, cardUsed } from './cards';
import { categorize } from './categorize';
import { parseQuick } from './parser';
import { buildTxs } from './build';
import { monthMetrics, rule503020 } from './metrics';
import { convertLegacy } from './legacy';
import { addMonths } from './dates';
import type { Card, Category, Data, Member, Tx } from './types';

const H = 'h1';
const cat = (name: string, kind: Category['kind'] = 'expense'): Category => ({ id: 'c-' + name, household_id: H, name, color: '#fff', icon: 'box', kind, budget: null, sort: 0, archived: false });
const CATS = ['Moradia & Contas', 'Mercado', 'Restaurantes & Delivery', 'Transporte', 'Saúde', 'Educação', 'Assinaturas', 'Lazer & Viagens', 'Outros']
  .map(n => cat(n)).concat([cat('Salário', 'income'), cat('Renda extra', 'income'), cat('Investimentos', 'investment')]);
const nubank: Card = { id: 'nu', household_id: H, name: 'Nubank', limit_amount: 5000, closing_day: 3, due_day: 10, holder_id: null, archived: false };
const inter: Card = { id: 'in', household_id: H, name: 'Inter', limit_amount: 2000, closing_day: 28, due_day: 5, holder_id: null, archived: false };
const edu: Member = { id: 'm1', household_id: H, user_id: 'u1', display_name: 'Eduardo', color: '#3DD9EB' };
const ana: Member = { id: 'm2', household_id: H, user_id: 'u2', display_name: 'Ana', color: '#FF7AB6' };
const ctx = { cards: [nubank, inter], categories: CATS, me: edu, partner: ana, now: new Date(2026, 10, 4, 12) };

describe('dinheiro', () => {
  it('lê valores em formato brasileiro e americano', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('85,9')).toBe(85.9);
    expect(parseAmount('1234.5')).toBe(1234.5);
    expect(parseAmount('1.500')).toBe(1500);
    expect(parseAmount('R$40')).toBe(40);
  });
  it('parcelas não perdem centavos', () => {
    const p = splitInstallments(100, 3);
    expect(p).toEqual([33.34, 33.33, 33.33]);
    expect(sum(p, x => x)).toBe(100);
  });
});

describe('fatura do cartão', () => {
  it('compra antes do fechamento cai na fatura do mês', () => expect(invoiceMonth(nubank, '2026-11-02')).toBe('2026-11-01'));
  it('compra no dia do fechamento ou depois vai para a próxima', () => expect(invoiceMonth(nubank, '2026-11-03')).toBe('2026-12-01'));
  it('fecha 28 e vence 5: vence no mês seguinte ao fechamento', () => {
    expect(invoiceMonth(inter, '2026-11-20')).toBe('2026-12-01');
    expect(invoiceMonth(inter, '2026-11-29')).toBe('2027-01-01');
  });
});

describe('categorias por palavra inteira', () => {
  it('não confunde pedaços de palavra (bugs do app antigo)', () => {
    expect(categorize('Depósito do aluguel', CATS).category?.name).toBe('Moradia & Contas');
    expect(categorize('metade da pizza', CATS).category?.name).toBe('Restaurantes & Delivery');
    expect(categorize('Viagem para Vegas', CATS).category?.name).toBe('Lazer & Viagens');
    expect(categorize('Posto Ipiranga', CATS).category?.name).toBe('Transporte');
  });
  it('ignora acentos', () => expect(categorize('FARMÁCIA nissei', CATS).category?.name).toBe('Saúde'));
});

describe('lançamento rápido', () => {
  it('despesa simples', () => {
    const d = parseQuick('mercado 230,50', ctx);
    expect(d).toMatchObject({ description: 'Mercado', amount: 230.5, kind: 'expense', method: 'pix', installments: 1, date: '2026-11-04' });
    expect(d.category?.name).toBe('Mercado');
  });
  it('cartão pelo nome e parcelas', () => {
    const d = parseQuick('TV 2.400 nubank 10x', ctx);
    expect(d).toMatchObject({ description: 'TV', amount: 2400, method: 'card', cardId: 'nu', installments: 10 });
  });
  it('renda com +', () => {
    const d = parseQuick('+ freela site 800', ctx);
    expect(d).toMatchObject({ kind: 'income', amount: 800, description: 'Freela site' });
    expect(d.category?.name).toBe('Renda extra');
  });
  it('quem pagou, se é pessoal e a data', () => {
    expect(parseQuick('farmácia 85 só eu ontem', ctx)).toMatchObject({ shared: false, payer: 'me', date: '2026-11-03', description: 'Farmácia' });
    expect(parseQuick('aluguel 1500 Ana pagou', ctx)).toMatchObject({ payer: 'partner', description: 'Aluguel' });
    expect(parseQuick('luz 210 conjunta 28/10', ctx)).toMatchObject({ payer: 'joint', date: '2026-10-28', description: 'Luz' });
  });
  it('investimento vira aporte', () => expect(parseQuick('caixinha 300', ctx).kind).toBe('investment'));
});

describe('montagem dos lançamentos', () => {
  it('parcelado no cartão: uma parcela por fatura, centavos corretos', () => {
    const d = parseQuick('notebook 1000 nubank 3x', ctx);
    const txs = buildTxs({ ...d, amount: d.amount!, date: '2026-11-05' }, { householdId: H, me: edu, partner: ana, cards: [nubank] });
    expect(txs.map(t => t.month)).toEqual(['2026-12-01', '2027-01-01', '2027-02-01']);
    expect(txs.map(t => t.amount)).toEqual([333.34, 333.33, 333.33]);
    expect(txs.every(t => !t.paid && t.occurred_on === '2026-11-05')).toBe(true);
    expect(cardUsed(txs, 'nu')).toBe(1000);
  });
});

const tx = (p: Partial<Tx>): Tx => ({
  id: Math.random().toString(36), household_id: H, description: 'x', notes: '', amount: 0, kind: 'expense', nature: 'variable', category_id: null,
  method: 'pix', card_id: null, wallet_id: null, occurred_on: '2026-11-05', month: '2026-11-01', paid: true, payer_id: edu.id, shared: true,
  installment_group: null, installment_no: null, installment_total: null, recurring_id: null, created_by: edu.id, ...p
});
const data = (txs: Tx[], split: 'prop' | 'equal' = 'prop'): Data => ({
  household: { id: H, name: 'n', invite_code: 'X', split_mode: split }, members: [edu, ana], categories: CATS, cards: [], wallets: [], goals: [], recurring: [], transactions: txs, settlements: []
});

describe('mês do casal', () => {
  const txs = [
    tx({ kind: 'income', nature: null, amount: 6000, payer_id: edu.id, shared: false }),
    tx({ kind: 'income', nature: null, amount: 4000, payer_id: ana.id, shared: false }),
    tx({ amount: 2000, payer_id: edu.id, nature: 'fixed', description: 'Aluguel' }),
    tx({ amount: 500, payer_id: ana.id, description: 'Mercado' }),
    tx({ amount: 300, payer_id: ana.id, shared: false, description: 'Roupa dela' }),
    tx({ amount: 1000, month: '2026-10-01', kind: 'expense' })
  ];
  it('divisão proporcional à renda de cada um', () => {
    const m = monthMetrics(data(txs), '2026-11-01');
    expect(m.income).toBe(10000);
    expect(m.sharedTotal).toBe(2500);
    const [e, a] = m.people;
    expect(e.share).toBeCloseTo(0.6);
    expect(e.sharedPart).toBe(1500);
    expect(a.sharedPart).toBe(1000);
    expect(a.free).toBe(4000 - 1000 - 300);
    // Eduardo pagou 2000, deveria 1500 → Ana transfere 500
    expect(m.settlement).toMatchObject({ from: ana, to: edu, amount: 500 });
  });
  it('meio a meio', () => {
    const m = monthMetrics(data(txs, 'equal'), '2026-11-01');
    expect(m.settlement).toMatchObject({ from: ana, to: edu, amount: 750 });
  });
  it('acerto registrado zera a diferença', () => {
    const d = data(txs); d.settlements = [{ id: 's', household_id: H, month: '2026-11-01', from_member: ana.id, to_member: edu.id, amount: 500, note: '' }];
    expect(monthMetrics(d, '2026-11-01').settlement).toBeNull();
  });
  it('50/30/20 usa só o próprio mês, não o saldo acumulado', () => {
    const m = monthMetrics(data(txs), '2026-11-01');
    expect(m.carried).toBe(-1000);
    const r = rule503020(m);
    expect(r.fixed.value).toBe(2000);
    expect(r.save.value).toBe(10000 - 2800);
  });
});

describe('importação do app antigo', () => {
  const old = {
    splitMode: 'prop', salariesP1: { '2026-09': 5000, '2026-10': 5000 }, salariesP2: { '2026-10': 3500 },
    cards: [{ id: 1, name: 'Nubank', limit: 4000, dueDay: 10, closingDay: 3 }],
    transactions: [
      { id: 1, monthKey: '2026-10', day: 10, desc: 'TV (1/2)', amount: 500, category: 'Lazer & Casal', type: 'expense_variable', method: 'Cartão de Crédito', cardId: 1, owner: 'p1', status: 'pending' },
      { id: 2, monthKey: '2026-10', day: 3, desc: 'Roupa', amount: 120, category: 'Roupas & Acessórios', type: 'expense_variable', method: 'PIX/Débito', owner: 'p2_ind', status: 'paid' },
      { id: 3, monthKey: '2026-10', day: 1, desc: 'Coisa', amount: 50, category: 'Minha categoria', type: 'expense_fixed', method: 'Boleto', owner: 'joint', status: 'paid' }
    ],
    settlements: [{ monthKey: '2026-10', from: 'p2', amount: 100 }],
    budgets: { 'Alimentação & Mercado': 800 }
  };
  it('converte lançamentos, salários, cartões e categorias', () => {
    const r = convertLegacy(old, { householdId: H, p1: edu.id, p2: ana.id, categories: CATS, me: edu.id });
    expect(r.stats.salaries).toBe(3);
    const tv = r.transactions.find(t => t.description.startsWith('TV'))!;
    expect(tv).toMatchObject({ method: 'card', card_id: r.cards[0].id, payer_id: edu.id, shared: true, paid: false, installment_no: 1, installment_total: 2, category_id: 'c-Lazer & Viagens' });
    expect(r.transactions.find(t => t.description === 'Roupa')).toMatchObject({ payer_id: ana.id, shared: false });
    expect(r.newCategories.map(c => c.name)).toContain('Minha categoria');
    const salAna = r.transactions.filter(t => t.kind === 'income' && t.payer_id === ana.id);
    expect(sum(salAna, t => t.amount)).toBe(3500);
    expect(r.settlements[0]).toMatchObject({ from_member: ana.id, to_member: edu.id, amount: 100 });
    expect(r.budgets[0]).toEqual({ id: 'c-Mercado', budget: 800 });
  });
  it('recusa arquivo errado', () => expect(() => convertLegacy({}, { householdId: H, p1: 'a', p2: null, categories: [], me: 'a' })).toThrow());
});

it('addMonths atravessa o ano', () => expect(addMonths('2026-11-01', 3)).toBe('2027-02-01'));

import { goalStatus, savings, walletBalance } from './savings';

describe('dinheiro guardado', () => {
  const w = { id: 'w1', household_id: H, name: 'Reserva', base_balance: 1000, rate: 12 };
  const txs = [
    tx({ kind: 'income', nature: null, amount: 5000, payer_id: edu.id, shared: false }),
    tx({ kind: 'investment', nature: null, amount: 800, wallet_id: 'w1', payer_id: edu.id, shared: false }),
    tx({ kind: 'investment', nature: null, amount: 400, wallet_id: 'w1', payer_id: null }),
    tx({ kind: 'income', nature: null, amount: 300, wallet_id: 'w1', payer_id: edu.id, shared: false, description: 'Resgate' }),
    tx({ kind: 'investment', nature: null, amount: 500, wallet_id: 'w1', payer_id: null, month: '2026-10-01' })
  ];
  const d = { ...data(txs), wallets: [w], goals: [{ id: 'g', household_id: H, name: 'Viagem', target: 3000, deadline: '2027-05-01', wallet_id: 'w1' }] };
  it('resgate devolve dinheiro da reserva e não conta como renda', () => {
    expect(walletBalance(w, txs)).toBe(1000 + 800 + 400 - 300 + 500);
    const m = monthMetrics(d, '2026-11-01');
    expect(m.income).toBe(5000);
    expect(m.invested).toBe(900);
    expect(m.net).toBe(4100);
    expect(m.people[0].invested).toBe(500); // Eduardo guardou 800 sozinho e resgatou 300
  });
  it('resumo, quem guardou e projeção', () => {
    const s = savings(d, '2026-11-01');
    expect(s.total).toBe(2400);
    expect(s.savedThisMonth).toBe(900);
    expect(s.byPerson.find(p => p.member?.id === edu.id)?.amount).toBe(500);
    expect(s.byPerson.find(p => p.member === null)?.amount).toBe(900);
    expect(s.history.at(-1)!.total).toBe(2400);
    expect(s.history.at(-2)!.total).toBe(1500);
    expect(s.projection).toHaveLength(12);
    expect(s.projection[0].total).toBeGreaterThan(2400);
  });
  it('meta: quanto falta, quanto por mês e quando chega', () => {
    const s = savings(d, '2026-11-01');
    const g = goalStatus(d.goals[0], d, '2026-11-01', s);
    expect(g.current).toBe(2400);
    expect(g.missing).toBe(600);
    expect(g.monthsLeft).toBe(6);
    expect(g.perMonth).toBe(100);
    expect(g.eta).not.toBeNull();
  });
});

import { looksLikeInvoicePayment, parseStatement } from './statement';

describe('extrato do banco', () => {
  it('OFX de conta', () => {
    const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261103000000[-3:BRT]<TRNAMT>-45.90<FITID>abc1<MEMO>Compra no débito - MERCADO CONDOR
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261105<TRNAMT>5200.00<FITID>abc2<MEMO>Salário iFibra
</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const s = parseStatement(ofx);
    expect(s).toMatchObject({ format: 'ofx', source: 'account' });
    expect(s.rows).toEqual([
      { externalId: 'ofx:abc1', date: '2026-11-03', description: 'Compra no débito - MERCADO CONDOR', amount: -45.9 },
      { externalId: 'ofx:abc2', date: '2026-11-05', description: 'Salário iFibra', amount: 5200 }
    ]);
  });
  it('fatura do Nubank (CSV): compras positivas viram saída', () => {
    const csv = `date,title,amount\n2026-10-28,Ifood *Restaurante,45.90\n2026-10-29,Uber *Trip,23.40\n2026-11-02,Pagamento recebido,-1200.00\n2026-10-29,Uber *Trip,23.40`;
    const s = parseStatement(csv, 'Nubank_2026-11-10.csv');
    expect(s.source).toBe('card');
    expect(s.rows.map(r => r.amount)).toEqual([-45.9, -23.4, 1200, -23.4]);
    // duas corridas iguais no mesmo dia continuam sendo duas
    expect(new Set(s.rows.map(r => r.externalId)).size).toBe(4);
    expect(looksLikeInvoicePayment(s.rows[2].description)).toBe(true);
  });
  it('conta do Nubank (CSV) com identificador', () => {
    const csv = `Data,Valor,Identificador,Descrição\n03/11/2026,-120.00,6543a1,Transferência enviada pelo Pix - MARINA\n05/11/2026,5200.00,6543a2,Transferência recebida - IFIBRA`;
    const s = parseStatement(csv);
    expect(s.rows[0]).toEqual({ externalId: 'csv:6543a1', date: '2026-11-03', description: 'Transferência enviada pelo Pix - MARINA', amount: -120 });
    expect(s.rows[1].amount).toBe(5200);
  });
  it('Inter (CSV com ; e linhas antes da tabela)', () => {
    const csv = `Extrato Conta Corrente\nConta ;12345\n\nData Lançamento;Histórico;Descrição;Valor;Saldo\n01/11/2026;Pix enviado ;Posto Ipiranga;-180,00;1.020,00\n02/11/2026;Pix recebido;Marina;1.500,50;2.520,50`;
    const s = parseStatement(csv);
    expect(s.rows).toHaveLength(2);
    expect(s.rows[0]).toMatchObject({ date: '2026-11-01', description: 'Pix enviado · Posto Ipiranga', amount: -180 });
    expect(s.rows[1].amount).toBe(1500.5);
  });
  it('mesmo arquivo gera os mesmos ids (reimportar não duplica)', () => {
    const csv = `date,title,amount\n2026-10-28,Ifood,45.90`;
    expect(parseStatement(csv).rows[0].externalId).toBe(parseStatement(csv).rows[0].externalId);
  });
});

import { weekSummary } from './metrics';
it('resumo da semana compara com a anterior', () => {
  const d = data([
    tx({ amount: 100, occurred_on: '2026-11-04', category_id: 'c-Mercado' }),
    tx({ amount: 50, occurred_on: '2026-10-29', category_id: 'c-Restaurantes & Delivery' }),
    tx({ amount: 60, occurred_on: '2026-10-27', category_id: 'c-Mercado' }),
    tx({ amount: 999, occurred_on: '2026-10-01' })
  ]);
  const w = weekSummary(d, '2026-11-04');
  expect(w.total).toBe(150);
  expect(w.prev).toBe(60);
  expect(w.diff).toBe(90);
  expect(w.biggest?.amount).toBe(100);
  expect(w.topChange?.category_id).toBe('c-Restaurantes & Delivery');
});

import { invoiceInfo } from './cards';
import { inMonthList } from './metrics';
describe('fatura aberta e lista do mês', () => {
  const sicredi = { closing_day: 27, due_day: 10 };
  it('compra de novembro em cartão que fecha 27 e vence 10 cai na fatura de dezembro, que está aberta', () => {
    expect(invoiceMonth(sicredi, '2026-11-03')).toBe('2026-12-01');
    expect(invoiceInfo(sicredi, '2026-12-01', '2026-11-05')).toEqual({ due: '2026-12-10', closing: '2026-11-27', status: 'aberta' });
    expect(invoiceInfo(sicredi, '2026-11-01', '2026-11-05').status).toBe('fechada');
    expect(invoiceInfo(sicredi, '2027-01-01', '2026-11-05').status).toBe('futura');
  });
  it('compra no cartão aparece na lista do mês em que foi feita; parcelas seguintes no mês da fatura', () => {
    const c = tx({ method: 'card', card_id: 'x', occurred_on: '2026-11-03', month: '2026-12-01', installment_no: 1, installment_total: 3 });
    const p2 = { ...c, month: '2027-01-01', installment_no: 2 };
    expect(inMonthList(c, '2026-11-01')).toBe(true);
    expect(inMonthList(c, '2026-12-01')).toBe(false);
    expect(inMonthList(p2, '2027-01-01')).toBe(true);
    expect(inMonthList(tx({}), '2026-11-01')).toBe(true);
  });
});

import { spendingOf } from './metrics';
it('gastos por categoria contam compras do mês, inclusive no cartão', () => {
  const d = data([
    tx({ amount: 9.45, category_id: 'c-Transporte', occurred_on: '2026-11-03' }),
    tx({ amount: 23.4, category_id: 'c-Transporte', method: 'card', card_id: 'x', occurred_on: '2026-11-04', month: '2026-12-01', paid: false }),
    tx({ amount: 40, category_id: 'c-Transporte', method: 'card', card_id: 'x', occurred_on: '2026-10-29', month: '2026-11-01' })
  ]);
  expect(sum(spendingOf(d, '2026-11-01').filter(t => t.category_id === 'c-Transporte'), t => t.amount)).toBe(32.85);
  expect(monthMetrics(d, '2026-11-01').expenses).toBe(49.45); // a sobra continua pelo vencimento da fatura
});
