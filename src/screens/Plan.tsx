import { useState } from 'react';
import type { Recurring, Tx } from '../domain/types';
import { Savings } from './Savings';
import { categoryAverages } from '../domain/metrics';
import { addMonths, dateIn, monthLabel, monthStart, thisMonth } from '../domain/dates';
import { invoiceMonth } from '../domain/cards';
import { fmt, parseAmount, sum } from '../domain/money';
import { del, getState, meOf, save, toast, useStore } from '../data/store';
import { Money, Section, Seg, Sheet } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { catColor, memberColor, tint } from '../ui/theme';

type Tab = 'budget' | 'saved' | 'recurring';
const TAB_KEY = 'fad_plan_tab';

export function Plan({ onOpen }: { onOpen: (t: Tx) => void }) {
  const [tab, setTab] = useState<Tab>(() => { try { return (sessionStorage.getItem(TAB_KEY) as Tab) || 'budget'; } catch { return 'budget'; } });
  const go = (t: Tab) => { setTab(t); try { sessionStorage.setItem(TAB_KEY, t); } catch { /* ok */ } };
  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-md"><Seg label="Seção" value={tab} onChange={go} options={[['budget', 'Orçamento'], ['saved', 'Guardado'], ['recurring', 'Todo mês']]} /></div>
      {tab === 'budget' && <div className="mx-auto max-w-3xl"><Budgets /></div>}
      {tab === 'saved' && <Savings onOpen={onOpen} />}
      {tab === 'recurring' && <div className="mx-auto max-w-3xl"><Recurrings /></div>}
    </div>
  );
}

function Budgets() {
  const data = useStore(s => s.data), month = useStore(s => s.month);
  const cats = data.categories.filter(c => c.kind === 'expense' && !c.archived);
  const spentOf = (id: string) => sum(data.transactions.filter(t => t.month === month && t.kind === 'expense' && t.category_id === id), t => t.amount);
  const withBudget = cats.filter(c => c.budget);
  const totB = sum(withBudget, c => c.budget!), totS = sum(withBudget, c => spentOf(c.id));
  const suggest = () => {
    const avg = categoryAverages(getState().data, [1, 2, 3].map(n => addMonths(month, -n)));
    const rows = cats.filter(c => (avg.get(c.id) || 0) > 0).map(c => ({ ...c, budget: Math.ceil(((avg.get(c.id) || 0) * 1.05) / 10) * 10 }));
    if (!rows.length) return toast('Ainda não há 3 meses de histórico para sugerir limites.');
    save('categories', ...(rows as unknown as Record<string, unknown>[]));
    toast(`Limites sugeridos para ${rows.length} categorias (média de 3 meses + 5%)`);
  };
  return (
    <Section title={`Orçamento de ${monthLabel(month).split(' ')[0].toLowerCase()}`} action={<button className="text-[13px] font-medium text-me" onClick={suggest}>Sugerir limites</button>}>
      {totB > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 flex justify-between text-sm"><span className="text-mist-2">Gasto <Money v={totS} className="text-mist-1" /> de <Money v={totB} className="text-mist-1" /></span><span className="num text-mist-2">{Math.round((totS / totB) * 100)}%</span></div>
          <div className="h-2 rounded-full bg-white/5"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (totS / totB) * 100)}%`, background: totS > totB ? 'rgb(var(--c-coral))' : 'linear-gradient(90deg, var(--me), var(--her))' }} /></div>
        </div>
      )}
      <ul className="divide-y divide-white/5">
        {cats.map(c => {
          const s = spentOf(c.id), b = c.budget || 0, p = b ? (s / b) * 100 : 0;
          const tone = p >= 100 ? 'rgb(var(--c-coral))' : p >= 80 ? 'rgb(var(--c-amber))' : catColor(c.color);
          return (
            <li key={c.id} className="py-3">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: catColor(c.color) + '1f', color: tint(catColor(c.color)) }}><Icon name={c.icon} size={16} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="text-[12px] text-mist-3">{b ? (s > b ? <span className="text-coral">passou {fmt(s - b)}</span> : <>sobram {fmt(b - s)}</>) : <>gasto {fmt(s)}</>}</span></span>
                <BudgetInput id={c.id} value={b} />
              </div>
              {b > 0 && <div className="ml-11 mt-2 h-1.5 rounded-full bg-white/5"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, p)}%`, background: tone }} /></div>}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function BudgetInput({ id, value }: { id: string; value: number }) {
  const [v, setV] = useState(value ? String(value) : '');
  const [last, setLast] = useState(value);
  if (value !== last) { setLast(value); setV(value ? String(value) : ''); }
  const commit = () => {
    const n = parseAmount(v) ?? 0;
    if (n === value) return;
    const c = getState().data.categories.find(x => x.id === id)!;
    save('categories', { ...c, budget: n > 0 ? n : null } as unknown as Record<string, unknown>);
  };
  return <input className="field num w-28 px-2.5 py-1.5 text-right text-sm" inputMode="decimal" placeholder="Sem limite" value={v} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Limite do mês" />;
}

function Recurrings() {
  const data = useStore(s => s.data), me = useStore(meOf)!;
  const [edit, setEdit] = useState<Recurring | null>(null);
  const now = thisMonth();
  const active = data.recurring.filter(r => !r.end_month || r.end_month >= now).sort((a, b) => (a.kind === 'income' ? 0 : 1) - (b.kind === 'income' ? 0 : 1) || a.day - b.day);
  const out = sum(active.filter(r => r.kind !== 'income'), r => r.amount);
  return (
    <Section title="Todo mês" action={<span className="text-[12px] text-mist-3">compromete <Money v={out} className="text-mist-2" /></span>}>
      {active.length === 0 && <p className="text-sm text-mist-2">Ao lançar algo, marque "Repetir todo mês" — aluguel, internet, assinaturas e salário entram sozinhos.</p>}
      <ul className="divide-y divide-white/5">
        {active.map(r => {
          const who = data.members.find(m => m.id === r.payer_id);
          const locked = r.kind === 'income' && r.payer_id !== null && r.payer_id !== me.id;
          return (
            <li key={r.id}>
              <button className="flex w-full items-center gap-3 py-2.5 text-left disabled:cursor-default" onClick={() => setEdit(r)} disabled={locked}>
                <i className="h-8 w-1 shrink-0 rounded-full" style={{ background: memberColor(who, data.members) }} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.description}{r.kind === 'income' && who ? <span className="text-mist-3"> · {who.id === me.id ? 'você' : who.display_name}</span> : ''}</span>
                  <span className="text-[12px] text-mist-3">dia {r.day}{locked ? ` · só ${who?.display_name.split(' ')[0]} edita` : ''}</span></span>
                <Money v={r.kind === 'income' ? r.amount : -r.amount} sign className={`text-sm font-semibold ${r.kind === 'income' ? 'text-mint' : ''}`} />
              </button>
            </li>
          );
        })}
      </ul>
      <RecurringSheet r={edit} onClose={() => setEdit(null)} />
    </Section>
  );
}

export function RecurringSheet({ r, onClose }: { r: Recurring | null; onClose: () => void }) {
  const [f, setF] = useState({ description: '', amount: '', day: '5' });
  const [key, setKey] = useState<string | null>(null);
  if ((r?.id ?? null) !== key) { setKey(r?.id ?? null); setF({ description: r?.description ?? '', amount: r ? String(r.amount).replace('.', ',') : '', day: String(r?.day ?? 5) }); }
  if (!r) return null;
  const m0 = thisMonth();
  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const s = getState(), amount = parseAmount(f.amount);
    if (!amount) return;
    const day = Math.min(31, Math.max(1, Number(f.day) || 1));
    const next = { ...r, description: f.description.trim() || r.description, amount, day };
    save('recurring', next as unknown as Record<string, unknown>);
    // atualiza também os meses já gerados que ainda não foram pagos (a partir deste mês)
    const gen = s.data.transactions.filter(t => t.recurring_id === r.id && t.occurred_on >= m0 && !t.paid);
    const card = s.data.cards.find(c => c.id === r.card_id && r.method === 'card');
    if (gen.length) save('transactions', ...gen.map(t => {
      const occurred_on = dateIn(monthStart(t.occurred_on), day);
      return { ...t, description: next.description, amount, occurred_on, month: card ? invoiceMonth(card, occurred_on) : t.month } as unknown as Record<string, unknown>;
    }));
    toast(`${next.description} atualizado de ${monthLabel(m0)} em diante`); onClose();
  };
  const stop = () => {
    const s = getState();
    save('recurring', { ...r, end_month: addMonths(m0, -1) } as unknown as Record<string, unknown>);
    del('transactions', ...s.data.transactions.filter(t => t.recurring_id === r.id && t.occurred_on >= m0 && !t.paid));
    toast(`${r.description} não se repete mais`, { label: 'Desfazer', run: () => save('recurring', r as unknown as Record<string, unknown>) });
    onClose();
  };
  return (
    <Sheet open={!!r} onClose={onClose} title={r.kind === 'income' ? 'Sua renda fixa' : 'Recorrente'}>
      <form className="space-y-4" onSubmit={apply}>
        <div><label className="label" htmlFor="rc-d">Descrição</label><input id="rc-d" className="field" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="rc-a">Valor</label><input id="rc-a" data-autofocus className="field num" inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></div>
          <div><label className="label" htmlFor="rc-day">Dia do mês</label><input id="rc-day" className="field" type="number" min={1} max={31} value={f.day} onChange={e => setF({ ...f, day: e.target.value })} /></div>
        </div>
        <p className="text-[12px] text-mist-3">Muda de {monthLabel(m0)} em diante. Meses anteriores ficam como estão.</p>
        <button className="btn-primary w-full">Salvar</button>
        <button type="button" className="btn-ghost w-full text-coral" onClick={stop}>Parar de repetir</button>
      </form>
    </Sheet>
  );
}
