import { useState } from 'react';
import type { Goal, Recurring, Wallet } from '../domain/types';
import { categoryAverages } from '../domain/metrics';
import { addMonths, monthLabel, parts, thisMonth } from '../domain/dates';
import { fmt, parseAmount, round2, sum } from '../domain/money';
import { uuid } from '../domain/build';
import { del, getState, meOf, save, toast, useStore } from '../data/store';
import { Money, Section, Sheet } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { catColor, memberColor, tint } from '../ui/theme';

export const walletBalance = (w: Wallet, txs: { kind: string; wallet_id: string | null; paid: boolean; amount: number }[]) =>
  round2(w.base_balance + sum(txs.filter(t => t.kind === 'investment' && t.wallet_id === w.id && t.paid), t => t.amount));

export function Plan() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Budgets />
      <div className="space-y-4"><Recurrings /><Wealth /></div>
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
    const gen = s.data.transactions.filter(t => t.recurring_id === r.id && t.month >= m0 && !t.paid);
    if (gen.length) save('transactions', ...gen.map(t => ({ ...t, description: next.description, amount, occurred_on: `${t.month.slice(0, 8)}${String(Math.min(day, 28)).padStart(2, '0')}` } as unknown as Record<string, unknown>)));
    toast(`${next.description} atualizado de ${monthLabel(m0)} em diante`); onClose();
  };
  const stop = () => {
    const s = getState();
    save('recurring', { ...r, end_month: addMonths(m0, -1) } as unknown as Record<string, unknown>);
    del('transactions', ...s.data.transactions.filter(t => t.recurring_id === r.id && t.month >= m0 && !t.paid));
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

function Wealth() {
  const data = useStore(s => s.data);
  const [w, setW] = useState<Wallet | 'new' | null>(null);
  const [g, setG] = useState<Goal | 'new' | null>(null);
  const bals = data.wallets.map(x => walletBalance(x, data.transactions));
  const total = round2(bals.reduce((a, b) => a + b, 0));
  const yieldM = round2(data.wallets.reduce((s, x, i) => s + bals[i] * (Math.pow(1 + x.rate / 100, 1 / 12) - 1), 0));
  const now = thisMonth();
  return (
    <Section title="Patrimônio e metas" action={<button className="text-[13px] font-medium text-me" onClick={() => setW('new')}>Nova reserva</button>}>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div><p className="text-[12px] text-mist-2">Guardado pelo casal</p><Money v={total} className="text-3xl font-bold text-sky" /></div>
        {yieldM > 0 && <p className="text-right text-[12px] text-mist-2">rende cerca de<br /><Money v={yieldM} className="text-mint" /> por mês</p>}
      </div>
      <ul className="mb-5 space-y-2">
        {data.wallets.map((x, i) => (
          <li key={x.id}><button className="panel-quiet flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-white/[.05]" onClick={() => setW(x)}>
            <Icon name="pig" className="text-sky" /><span className="flex-1"><span className="block text-sm font-medium">{x.name}</span><span className="text-[12px] text-mist-3">{x.rate}% ao ano</span></span><Money v={bals[i]} className="font-semibold" />
          </button></li>
        ))}
      </ul>
      <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Metas</h3><button className="text-[13px] font-medium text-me" onClick={() => setG('new')}>Nova meta</button></div>
      {data.goals.length === 0 && <p className="text-sm text-mist-2">Crie uma meta (viagem, entrada do apê) para ver quanto guardar por mês.</p>}
      <ul className="space-y-3">
        {data.goals.map(goal => {
          const wal = data.wallets.find(x => x.id === goal.wallet_id);
          const cur = wal ? walletBalance(wal, data.transactions) : total;
          const p = goal.target ? Math.min(100, (cur / goal.target) * 100) : 0;
          let left = 1;
          if (goal.deadline) { const a = parts(goal.deadline), b = parts(now); left = Math.max(1, (a.y - b.y) * 12 + a.m0 - b.m0); }
          const need = Math.max(0, goal.target - cur) / left;
          return (
            <li key={goal.id}><button className="w-full text-left" onClick={() => setG(goal)}>
              <div className="flex items-baseline justify-between gap-2 text-sm"><span className="font-medium">{goal.name}</span><span className="num text-mist-2">{Math.round(p)}%</span></div>
              <div className="mt-1.5 h-2 rounded-full bg-white/5"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${p}%`, background: 'linear-gradient(90deg, rgb(var(--c-sky)), var(--duo))' }} /></div>
              <p className="mt-1 text-[12px] text-mist-3">{cur >= goal.target ? 'Meta atingida' : <><Money v={cur} /> de <Money v={goal.target} />{goal.deadline ? <> · guardar <Money v={need} className="text-mist-2" />/mês até {monthLabel(goal.deadline).toLowerCase()}</> : null}</>}</p>
            </button></li>
          );
        })}
      </ul>
      <WalletSheet w={w} onClose={() => setW(null)} />
      <GoalSheet g={g} onClose={() => setG(null)} />
    </Section>
  );
}

function WalletSheet({ w, onClose }: { w: Wallet | 'new' | null; onClose: () => void }) {
  const data = useStore(s => s.data), me = useStore(meOf)!;
  const x = w && w !== 'new' ? w : null;
  const [f, setF] = useState({ name: '', bal: '', rate: '', aporte: '' });
  const [key, setKey] = useState<string | null>(null);
  const k = w === 'new' ? 'new' : x?.id ?? null;
  const cur = x ? walletBalance(x, data.transactions) : 0;
  if (k !== key) { setKey(k); setF({ name: x?.name ?? '', bal: x ? String(cur).replace('.', ',') : '', rate: x ? String(x.rate).replace('.', ',') : '', aporte: '' }); }
  return (
    <Sheet open={!!w} onClose={onClose} title={x ? x.name : 'Nova reserva'}>
      <form className="space-y-4" onSubmit={e => {
        e.preventDefault();
        const H = getState().data.household!.id, id = x?.id ?? uuid();
        const bal = parseAmount(f.bal) ?? 0, aportes = x ? round2(cur - x.base_balance) : 0;
        save('wallets', { id, household_id: H, name: f.name.trim(), base_balance: round2(bal - aportes), rate: parseAmount(f.rate) ?? 0 });
        const ap = parseAmount(f.aporte);
        if (ap && ap > 0) {
          const inv = data.categories.find(c => c.kind === 'investment');
          const today = new Date(), d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          save('transactions', { id: uuid(), household_id: H, description: `Aporte ${f.name.trim()}`, notes: '', amount: ap, kind: 'investment', nature: null, category_id: inv?.id ?? null, method: 'pix', card_id: null, wallet_id: id, occurred_on: d, month: d.slice(0, 8) + '01', paid: true, payer_id: null, shared: true, installment_group: null, installment_no: null, installment_total: null, recurring_id: null, created_by: me.id });
        }
        toast(ap ? `Aporte de ${fmt(ap)} registrado` : 'Reserva salva'); onClose();
      }}>
        <div><label className="label" htmlFor="w-n">Nome</label><input id="w-n" className="field" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Reserva de emergência" required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="w-b">Saldo hoje</label><input id="w-b" className="field num" inputMode="decimal" value={f.bal} onChange={e => setF({ ...f, bal: e.target.value })} placeholder="0,00" /></div>
          <div><label className="label" htmlFor="w-r">Rende % ao ano</label><input id="w-r" className="field num" inputMode="decimal" value={f.rate} onChange={e => setF({ ...f, rate: e.target.value })} placeholder="100% CDI ≈ 14" /></div>
        </div>
        {x && <div><label className="label" htmlFor="w-a">Novo aporte (opcional)</label><input id="w-a" data-autofocus className="field num" inputMode="decimal" value={f.aporte} onChange={e => setF({ ...f, aporte: e.target.value })} placeholder="Quanto guardou agora" />
          <p className="mt-1.5 text-[12px] text-mist-3">O aporte entra como saída do mês, para a sobra bater com a conta.</p></div>}
        <button className="btn-primary w-full">Salvar</button>
        {x && <button type="button" className="btn-ghost w-full text-coral" onClick={() => { del('wallets', x); toast(`${x.name} removida`, { label: 'Desfazer', run: () => save('wallets', x as unknown as Record<string, unknown>) }); onClose(); }}><Icon name="trash" size={16} />Remover reserva</button>}
      </form>
    </Sheet>
  );
}

function GoalSheet({ g, onClose }: { g: Goal | 'new' | null; onClose: () => void }) {
  const data = useStore(s => s.data);
  const x = g && g !== 'new' ? g : null;
  const [f, setF] = useState({ name: '', target: '', deadline: '', wallet: '' });
  const [key, setKey] = useState<string | null>(null);
  const k = g === 'new' ? 'new' : x?.id ?? null;
  if (k !== key) { setKey(k); setF({ name: x?.name ?? '', target: x ? String(x.target).replace('.', ',') : '', deadline: (x?.deadline ?? addMonths(thisMonth(), 12)).slice(0, 7), wallet: x?.wallet_id ?? '' }); }
  return (
    <Sheet open={!!g} onClose={onClose} title={x ? x.name : 'Nova meta'}>
      <form className="space-y-4" onSubmit={e => {
        e.preventDefault();
        save('goals', { id: x?.id ?? uuid(), household_id: getState().data.household!.id, name: f.name.trim(), target: parseAmount(f.target) ?? 0, deadline: f.deadline ? f.deadline + '-01' : null, wallet_id: f.wallet || null });
        toast('Meta salva'); onClose();
      }}>
        <div><label className="label" htmlFor="g-n">Meta</label><input id="g-n" data-autofocus className="field" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Viagem de fim de ano" required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="g-t">Valor</label><input id="g-t" className="field num" inputMode="decimal" value={f.target} onChange={e => setF({ ...f, target: e.target.value })} required /></div>
          <div><label className="label" htmlFor="g-d">Até</label><input id="g-d" className="field" type="month" value={f.deadline} onChange={e => setF({ ...f, deadline: e.target.value })} /></div>
        </div>
        <div><label className="label" htmlFor="g-w">Acompanhar</label>
          <select id="g-w" className="field" value={f.wallet} onChange={e => setF({ ...f, wallet: e.target.value })}><option value="">Tudo que o casal guardou</option>{data.wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
        <button className="btn-primary w-full">Salvar meta</button>
        {x && <button type="button" className="btn-ghost w-full text-coral" onClick={() => { del('goals', x); toast('Meta removida', { label: 'Desfazer', run: () => save('goals', x as unknown as Record<string, unknown>) }); onClose(); }}><Icon name="trash" size={16} />Remover meta</button>}
      </form>
    </Sheet>
  );
}
