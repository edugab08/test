import { useMemo, useState } from 'react';
import { byCategory, monthMetrics, rule503020, weekSummary } from '../domain/metrics';
import { parts, MONTHS_SHORT, monthLabel, thisMonth, today } from '../domain/dates';
import { fmt, parseAmount, round2 } from '../domain/money';
import { cardInvoice } from '../domain/cards';
import { uuid } from '../domain/build';
import type { Tx } from '../domain/types';
import { meOf, save, toast, useStore } from '../data/store';
import { Avatar, Bars, Donut, DuoBar, Money, Section, Seg, Sheet } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { TxRow } from '../ui/TxRow';
import { catColor, memberColor, tint } from '../ui/theme';

export function Home({ onOpen, go }: { onOpen: (t: Tx) => void; go: (v: string) => void }) {
  const data = useStore(s => s.data), month = useStore(s => s.month), me = useStore(meOf)!;
  const m = useMemo(() => monthMetrics(data, month), [data, month]);
  const r = rule503020(m);
  const [settleOpen, setSettleOpen] = useState(false);

  const cats = byCategory(m.txs).map(([id, v]) => { const c = data.categories.find(x => x.id === id); return { label: c?.name ?? 'Sem categoria', color: catColor(c?.color), value: v, icon: c?.icon ?? 'box' }; });
  const totalCats = cats.reduce((s, c) => s + c.value, 0);

  const year = parts(month).y;
  const yearData = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const mk = `${year}-${String(i + 1).padStart(2, '0')}-01`, M = monthMetrics(data, mk);
    return { label: MONTHS_SHORT[i], a: M.income, b: round2(M.expenses + M.invested), line: M.balance };
  }), [data, year]);

  // Avisos: orçamento estourando, fatura vencendo, contas pendentes
  const alerts: { icon: string; text: string; tone: string; to?: string }[] = [];
  data.categories.filter(c => c.budget && c.kind === 'expense').forEach(c => {
    const spent = m.txs.filter(t => t.category_id === c.id && t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
    const p = spent / c.budget!;
    if (p >= 0.8) alerts.push({ icon: 'alert', tone: p >= 1 ? 'text-coral' : 'text-amber', text: p >= 1 ? `${c.name} passou ${fmt(spent - c.budget!)} do limite` : `${c.name} já usou ${Math.round(p * 100)}% do limite`, to: 'plan' });
  });
  const t0 = today();
  data.cards.filter(c => !c.archived).forEach(c => {
    const inv = cardInvoice(data.transactions, c.id, month).filter(t => !t.paid);
    const due = `${month.slice(0, 8)}${String(c.due_day).padStart(2, '0')}`;
    const days = Math.round((new Date(due + 'T12:00').getTime() - new Date(t0 + 'T12:00').getTime()) / 864e5);
    if (inv.length && days >= 0 && days <= 7) alerts.push({ icon: 'card', tone: 'text-amber', text: `Fatura ${c.name} de ${fmt(inv.reduce((s, t) => s + t.amount, 0))} vence ${days === 0 ? 'hoje' : `em ${days} dia${days > 1 ? 's' : ''}`}`, to: 'cards' });
  });

  const recent = [...m.txs].sort((a, b) => (b.occurred_on + (b.created_at ?? '')).localeCompare(a.occurred_on + (a.created_at ?? ''))).slice(0, 6);
  const people = m.people;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 [&>*]:min-w-0">
      {/* Herói: a sobra do mês, dividida pelas cores de cada um */}
      <section className="hero panel relative overflow-hidden p-5 sm:p-7 lg:col-span-7" onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`); e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`); e.currentTarget.style.setProperty('--ang', `${((e.clientX - r.left) / r.width) * 360}deg`); }}>
        <p className="text-sm text-mist-2">Sobra de {monthLabel(month).split(' ')[0].toLowerCase()}</p>
        <Money v={m.net} className={`hero-num mt-2 block ${m.net < 0 ? 'text-coral' : ''}`} />
        <p className="mt-2 text-sm text-mist-2">Com o que sobrou antes: <Money v={m.balance} className={m.balance < 0 ? 'text-coral' : 'text-mist-1'} /></p>
        <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
          <Stat label="Entrou" v={m.income} tone="text-mint" />
          <Stat label="Saiu" v={m.expenses} />
          <Stat label="Guardado" v={m.invested} tone="text-sky" />
        </div>
        {people.length > 1 && (
          <div className="mt-6">
            <div className="mb-2 flex justify-between text-[12px] text-mist-2"><span>Quem trouxe a renda</span><span>{people.map(p => `${p.member.display_name.split(' ')[0]} ${Math.round(p.share * 100)}%`).join('  ·  ')}</span></div>
            <DuoBar parts={people.map(p => ({ value: p.income, color: memberColor(p.member, data.members), label: p.member.display_name }))} />
          </div>
        )}
        {m.pending > 0 && <p className="mt-4 text-[13px] text-amber">Ainda falta pagar <Money v={m.pending} /> neste mês.</p>}
      </section>

      {/* Cada um */}
      <section className="panel p-5 lg:col-span-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-[15px] font-semibold">Livre para cada um</h2>
          <div className="w-52"><Seg label="Como dividir" value={data.household?.split_mode ?? 'prop'} onChange={v => save('households', { id: data.household!.id, split_mode: v })} options={[['prop', 'Pela renda'], ['equal', 'Meio a meio']]} /></div>
        </div>
        {people.length < 2 && <p className="mb-3 text-sm text-mist-2">Convide quem divide as contas com você em Ajustes para ver a parte de cada um.</p>}
        <div className="space-y-4">
          {people.map(p => (
            <div key={p.member.id}>
              <div className="flex items-center gap-3">
                <Avatar m={p.member} />
                <span className="flex-1 font-medium">{p.member.id === me.id ? 'Você' : p.member.display_name}</span>
                <Money v={p.free} className={`text-xl font-semibold ${p.free < 0 ? 'text-coral' : ''}`} />
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-2 pl-10 text-[12px] text-mist-3">
                <div><dt>Renda</dt><dd className="text-mist-2"><Money v={p.income} /></dd></div>
                <div><dt>Parte do casal</dt><dd className="text-mist-2"><Money v={p.sharedPart} /></dd></div>
                <div><dt>Só {p.member.id === me.id ? 'seus' : 'dele(a)'}</dt><dd className="text-mist-2"><Money v={p.personal + p.invested} /></dd></div>
              </dl>
            </div>
          ))}
        </div>
        {people.length === 2 && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-3.5">
            <Icon name="swap" className="shrink-0 text-duo" />
            {m.settlement
              ? <><p className="flex-1 text-sm"><b>{m.settlement.from.id === me.id ? 'Você' : m.settlement.from.display_name}</b> passa <Money v={m.settlement.amount} className="font-semibold" /> para <b>{m.settlement.to.id === me.id ? 'você' : m.settlement.to.display_name}</b></p>
                <button className="btn-ghost px-3 py-1.5 text-[13px]" onClick={() => setSettleOpen(true)}>Acertar</button></>
              : <p className="flex-1 text-sm text-mist-2">{m.sharedTotal ? 'Contas do casal equilibradas neste mês.' : 'Nenhuma despesa do casal neste mês ainda.'}</p>}
          </div>
        )}
      </section>

      {alerts.length > 0 && (
        <div className="flex flex-col gap-2 lg:col-span-12">
          {alerts.slice(0, 4).map((a, i) => (
            <button key={i} onClick={() => a.to && go(a.to)} className="panel-quiet flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-white/[.05]">
              <Icon name={a.icon} className={a.tone} /><span className="flex-1">{a.text}</span><Icon name="right" size={16} className="text-mist-3" />
            </button>
          ))}
        </div>
      )}

      {month === thisMonth() && <WeekCard />}

      <Section title="Para onde foi" className="lg:col-span-7">
        {cats.length === 0 ? <p className="py-6 text-center text-sm text-mist-2">Nenhuma despesa neste mês.</p> : (
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <Donut items={cats} center={<div><p className="text-[11px] text-mist-3">despesas</p><Money v={totalCats} className="text-lg font-semibold" /></div>} />
            <ul className="w-full flex-1 space-y-2.5">
              {cats.slice(0, 6).map(c => (
                <li key={c.label}>
                  <div className="flex items-center gap-2 text-sm"><Icon name={c.icon} size={15} className="shrink-0" stroke={2} /><span className="flex-1 truncate" style={{ color: tint(c.color) }}>{c.label}</span><Money v={c.value} className="font-medium" /><span className="w-9 text-right text-[12px] text-mist-3">{Math.round((c.value / totalCats) * 100)}%</span></div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full" style={{ width: `${(c.value / cats[0].value) * 100}%`, background: c.color }} /></div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="Regra 50 · 30 · 20" className="lg:col-span-5" action={<span className="text-[12px] text-mist-3">do que entrou no mês</span>}>
        {[['Fixos', r.fixed, 'var(--me)'], ['Variáveis', r.variable, 'var(--her)'], ['Guardado ou sobrando', r.save, 'rgb(var(--c-mint))']].map(([label, x, color]) => {
          const it = x as { value: number; pct: number; target: number };
          const ok = label === 'Guardado ou sobrando' ? it.pct >= it.target : it.pct <= it.target;
          return (
            <div key={label as string} className="mb-3.5 last:mb-0">
              <div className="mb-1.5 flex items-baseline justify-between text-sm"><span>{label as string} <span className="text-[12px] text-mist-3">meta {label === 'Guardado ou sobrando' ? 'mín.' : 'máx.'} {it.target}%</span></span>
                <span className={`num font-semibold ${m.income ? (ok ? 'text-mint' : 'text-amber') : 'text-mist-3'}`}>{m.income ? `${Math.round(it.pct)}%` : '—'}</span></div>
              <div className="relative h-2 rounded-full bg-white/5">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, it.pct)}%`, background: color as string }} />
                <i className="absolute -top-1 h-4 w-px bg-white/40" style={{ left: `${it.target}%` }} aria-hidden="true" />
              </div>
            </div>
          );
        })}
        {!m.income && <p className="mt-2 text-[12px] text-mist-3">Lance a renda do mês para ver as porcentagens.</p>}
      </Section>

      <Section title={`Ano de ${year}`} className="lg:col-span-7" action={<span className="flex gap-3 text-[11px] text-mist-3"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-mint" />renda</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-her" />saídas</span><span className="flex items-center gap-1"><i className="h-0.5 w-3 bg-me" />saldo</span></span>}>
        <Bars data={yearData} highlight={parts(month).m0} />
      </Section>

      <Section title="Últimos lançamentos" className="lg:col-span-5" action={<button className="text-[13px] font-medium text-me" onClick={() => go('tx')}>Ver todos</button>}>
        {recent.length ? <ul className="-mx-2">{recent.map(t => <TxRow key={t.id} t={t} data={data} onOpen={onOpen} meId={me.id} />)}</ul> : <p className="py-6 text-center text-sm text-mist-2">Nada lançado em {monthLabel(month)}.</p>}
      </Section>

      <SettleSheet open={settleOpen} onClose={() => setSettleOpen(false)} s={m.settlement} month={month} householdId={data.household!.id} meId={me.id} />
    </div>
  );
}

function WeekCard() {
  const data = useStore(s => s.data);
  const w = useMemo(() => weekSummary(data, today()), [data]);
  if (!w.count && !w.prev) return null;
  const cat = (id: string | null) => data.categories.find(c => c.id === id);
  const up = w.diff > 0;
  return (
    <section className="panel grid gap-4 p-4 sm:grid-cols-[auto_1fr_1fr] sm:items-center sm:p-5 lg:col-span-12">
      <div>
        <p className="text-[12px] text-mist-2">Últimos 7 dias</p>
        <Money v={w.total} className="text-2xl font-bold" />
        <p className={`text-[12px] ${w.prev === 0 ? 'text-mist-3' : up ? 'text-amber' : 'text-mint'}`}>
          {w.prev === 0 ? 'sem gastos na semana anterior' : `${up ? '+' : '−'}${fmt(Math.abs(w.diff))} vs. semana anterior${w.pct !== null ? ` (${up ? '+' : ''}${Math.round(w.pct)}%)` : ''}`}
        </p>
      </div>
      {w.topChange && Math.abs(w.topChange.diff) >= 1 && (
        <div className="panel-quiet flex items-center gap-3 p-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: catColor(cat(w.topChange.category_id)?.color) + '1f', color: tint(catColor(cat(w.topChange.category_id)?.color)) }}><Icon name={cat(w.topChange.category_id)?.icon ?? 'box'} size={17} /></span>
          <p className="text-[13px] leading-snug text-mist-2"><b className="text-mist-1">{cat(w.topChange.category_id)?.name ?? 'Sem categoria'}</b> foi o que mais mudou: {w.topChange.diff > 0 ? 'subiu' : 'caiu'} <Money v={Math.abs(w.topChange.diff)} className="text-mist-1" /></p>
        </div>
      )}
      {w.biggest && (
        <div className="panel-quiet flex items-center gap-3 p-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 text-mist-2"><Icon name="alert" size={17} /></span>
          <p className="text-[13px] leading-snug text-mist-2">Maior gasto: <b className="text-mist-1">{w.biggest.description}</b>, <Money v={w.biggest.amount} className="text-mist-1" /> · média de <Money v={w.perDay} className="text-mist-1" /> por dia</p>
        </div>
      )}
    </section>
  );
}

function Stat({ label, v, tone = '' }: { label: string; v: number; tone?: string }) {
  return <div><p className="text-[12px] text-mist-3">{label}</p><Money v={v} className={`text-[15px] font-semibold sm:text-lg ${tone}`} /></div>;
}

function SettleSheet({ open, onClose, s, month, householdId, meId }: { open: boolean; onClose: () => void; s: ReturnType<typeof monthMetrics>['settlement']; month: string; householdId: string; meId: string }) {
  const [v, setV] = useState('');
  if (!s) return null;
  const amount = round2((v ? parseAmount(v) : null) ?? s.amount);
  return (
    <Sheet open={open} onClose={onClose} title="Registrar acerto">
      <p className="mb-4 text-sm text-mist-2">{s.from.id === meId ? 'Você' : s.from.display_name} transferiu para {s.to.id === meId ? 'você' : s.to.display_name}:</p>
      <input data-autofocus className="field num mb-4 text-2xl font-semibold" inputMode="decimal" placeholder={fmt(s.amount)} value={v} onChange={e => setV(e.target.value)} />
      <button className="btn-primary w-full" onClick={() => {
        save('settlements', { id: uuid(), household_id: householdId, month, from_member: s.from.id, to_member: s.to.id, amount, note: '' });
        toast('Acerto registrado'); setV(''); onClose();
      }}>Registrar {fmt(amount)}</button>
      <p className="mt-3 text-center text-[12px] text-mist-3">O acerto vale só para {monthLabel(month)}.</p>
    </Sheet>
  );
}
