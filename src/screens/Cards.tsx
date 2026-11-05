import { useState } from 'react';
import type { Card, Tx } from '../domain/types';
import { cardInvoice, cardUsed, invoiceInfo, invoiceMonth } from '../domain/cards';
import { addMonths, dateIn, monthLabel, thisMonth, today } from '../domain/dates';
import { fmt, parseAmount, round2, sum } from '../domain/money';
import { uuid } from '../domain/build';
import { del, getState, meOf, save, toast, useStore } from '../data/store';
import { Empty, Money, Section, Sheet } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { TxRow } from '../ui/TxRow';
import { memberColor } from '../ui/theme';

export function Cards({ onOpen }: { onOpen: (t: Tx) => void }) {
  const data = useStore(s => s.data);
  const [edit, setEdit] = useState<Card | 'new' | null>(null);
  const cards = data.cards.filter(c => !c.archived);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {cards.length === 0 && <div className="panel"><Empty icon="card" title="Nenhum cartão ainda">Cadastre o cartão com o dia de fechamento: o app coloca cada compra na fatura certa sozinho.</Empty></div>}
      {cards.map(c => <CardPanel key={c.id} c={c} onOpen={onOpen} onEdit={() => setEdit(c)} />)}
      <button className="btn-ghost w-full py-3" onClick={() => setEdit('new')}><Icon name="plus" size={16} />Adicionar cartão</button>
      <InvoiceHistory />
      <CardSheet card={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

const ddmm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const STATUS = { aberta: 'Aberta', fechada: 'Fechada', futura: 'Próxima' } as const;

function CardPanel({ c, onOpen, onEdit }: { c: Card; onOpen: (t: Tx) => void; onEdit: () => void }) {
  const data = useStore(s => s.data), month = useStore(s => s.month), me = useStore(meOf)!;
  const t0 = today();
  const openInv = invoiceMonth(c, t0);
  // no mês atual, abre na fatura aberta (onde caem as compras de hoje); em outros meses, na que vence naquele mês
  const base = month === thisMonth() ? openInv : month;
  const [sel, setSel] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [lastBase, setLastBase] = useState(base);
  if (lastBase !== base) { setLastBase(base); setSel(null); }
  const cur = sel ?? base;

  const options = [-1, 0, 1].map(n => addMonths(base, n))
    .filter(m => m === base || m === cur || cardInvoice(data.transactions, c.id, m).length > 0);
  const inv = cardInvoice(data.transactions, c.id, cur).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
  const total = sum(inv, t => t.amount), unpaid = sum(inv.filter(t => !t.paid), t => t.amount);
  const info = invoiceInfo(c, cur, t0);
  const used = cardUsed(data.transactions, c.id), pct = c.limit_amount ? Math.min(100, (used / c.limit_amount) * 100) : 0;
  const holder = data.members.find(m => m.id === c.holder_id);
  const label = (m: string) => { const i = invoiceInfo(c, m, t0); return `${STATUS[i.status]} · vence ${ddmm(i.due)}`; };

  return (
    <section className="panel overflow-hidden">
      <div className="relative p-5" style={{ background: `linear-gradient(120deg, color-mix(in srgb, ${memberColor(holder, data.members)} 16%, transparent), transparent 60%)` }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-lg font-semibold">{c.name}</p>
            <p className="mt-0.5 text-[12px] text-mist-2">Fecha dia {c.closing_day}, vence dia {c.due_day}{holder ? ` · de ${holder.id === me.id ? 'você' : holder.display_name}` : ''}</p>
          </div>
          <button className="rounded-full p-2 text-mist-2 hover:bg-white/5" onClick={onEdit} aria-label={`Editar ${c.name}`}><Icon name="edit" size={16} /></button>
        </div>

        {options.length > 1 && (
          <div className="scroll-x -mx-1 mt-4 flex gap-2 px-1" role="group" aria-label="Escolher fatura">
            {options.map(m => <button key={m} className="chip shrink-0" aria-pressed={m === cur} onClick={() => setSel(m)}>{label(m)}</button>)}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-1 text-[12px] text-mist-2">Fatura {info.status === 'aberta' ? 'aberta' : info.status === 'fechada' ? 'fechada' : 'seguinte'} · vence {ddmm(info.due)}</p>
            <Money v={total} className="block text-3xl font-bold" />
            <p className="mt-1 text-[12px] text-mist-3">{info.status === 'aberta' ? `Compras até ${ddmm(addDays(info.closing, -1))} entram aqui. Fecha em ${ddmm(info.closing)}.` : info.status === 'fechada' ? `Fechou em ${ddmm(info.closing)}.` : `Parcelas de compras anteriores já caem aqui. Fecha em ${ddmm(info.closing)}.`}</p>
          </div>
          {unpaid > 0 && info.status === 'fechada'
            ? <button className="btn-primary" onClick={() => { const ids = inv.filter(t => !t.paid); save('transactions', ...ids.map(t => ({ ...t, paid: true } as unknown as Record<string, unknown>))); toast(`Fatura ${c.name} paga`, { label: 'Desfazer', run: () => save('transactions', ...(ids as unknown as Record<string, unknown>[])) }); }}>Pagar fatura · {fmt(unpaid)}</button>
            : total > 0 && unpaid === 0 ? <span className="chip text-mint"><Icon name="check" size={14} />Paga</span> : null}
        </div>
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-[12px]"><span className="text-mist-2">Limite usado <Money v={used} className="text-mist-1" /></span><span className="text-mist-2">Livre <Money v={Math.max(0, c.limit_amount - used)} className="text-mint" /></span></div>
          <div className="h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: pct > 85 ? 'rgb(var(--c-coral))' : 'linear-gradient(90deg, var(--me), var(--duo))' }} /></div>
        </div>
      </div>
      <button className="flex w-full items-center justify-between border-t border-white/5 px-5 py-3 text-sm text-mist-2 hover:bg-white/[.03]" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        <span>{inv.length ? `${inv.length} compra${inv.length === 1 ? '' : 's'} nesta fatura` : 'Nenhuma compra nesta fatura ainda'}</span>{inv.length > 0 && <Icon name="down" size={16} className={`transition ${expanded ? 'rotate-180' : ''}`} />}
      </button>
      {expanded && inv.length > 0 && <ul className="px-2 pb-2 sm:px-3">{inv.map(t => <TxRow key={t.id} t={t} data={data} onOpen={onOpen} meId={me.id} />)}</ul>}
    </section>
  );
}

const addDays = (d: string, n: number) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

function InvoiceHistory() {
  const data = useStore(s => s.data), month = useStore(s => s.month);
  const cards = data.cards.filter(c => !c.archived);
  if (!cards.length) return null;
  const months = [-3, -2, -1, 0, 1, 2].map(n => addMonths(month, n));
  const rows = months.map(mk => ({ mk, values: cards.map(c => sum(cardInvoice(data.transactions, c.id, mk), t => t.amount)) }));
  const max = Math.max(1, ...rows.flatMap(r => r.values));
  return (
    <Section title="Faturas mês a mês">
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.mk} className={`grid grid-cols-[4.5rem_1fr_6.5rem] items-center gap-3 text-sm ${r.mk === month ? '' : 'opacity-70'}`}>
            <span className="text-mist-2">{monthLabel(r.mk).slice(0, 3)} {r.mk.slice(2, 4)}</span>
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-white/5">{r.values.map((v, i) => <i key={i} style={{ width: `${(v / max) * 100}%`, background: ['var(--me)', 'var(--her)', 'var(--duo)', 'rgb(var(--c-mint))'][i % 4] }} />)}</div>
            <Money v={round2(r.values.reduce((a, b) => a + b, 0))} className="text-right" />
          </div>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap gap-3 text-[12px] text-mist-3">{cards.map((c, i) => <span key={c.id} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: ['var(--me)', 'var(--her)', 'var(--duo)', 'rgb(var(--c-mint))'][i % 4] }} />{c.name}</span>)}</p>
    </Section>
  );
}

function CardSheet({ card, onClose }: { card: Card | 'new' | null; onClose: () => void }) {
  const data = useStore(s => s.data);
  const c = card && card !== 'new' ? card : null;
  const [f, setF] = useState({ name: '', limit: '', closing: '1', due: '10', holder: '' });
  const [key, setKey] = useState<string | null>(null);
  const k = card === 'new' ? 'new' : c?.id ?? null;
  if (k !== key) { setKey(k); setF({ name: c?.name ?? '', limit: c ? String(c.limit_amount).replace('.', ',') : '', closing: String(c?.closing_day ?? 1), due: String(c?.due_day ?? 10), holder: c?.holder_id ?? '' }); }
  const day = (s: string) => Math.min(31, Math.max(1, Number(s) || 1));
  return (
    <Sheet open={!!card} onClose={onClose} title={c ? `Editar ${c.name}` : 'Novo cartão'}>
      <form className="space-y-4" onSubmit={e => {
        e.preventDefault();
        const row: Card = { id: c?.id ?? uuid(), household_id: getState().data.household!.id, name: f.name.trim(), limit_amount: parseAmount(f.limit) ?? 0, closing_day: day(f.closing), due_day: day(f.due), holder_id: f.holder || null, archived: false };
        save('cards', row as unknown as Record<string, unknown>); toast(c ? 'Cartão atualizado' : 'Cartão adicionado'); onClose();
      }}>
        <div><label className="label" htmlFor="cd-name">Nome</label><input id="cd-name" data-autofocus className="field" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Nubank" required /></div>
        <div><label className="label" htmlFor="cd-limit">Limite</label><input id="cd-limit" className="field num" inputMode="decimal" value={f.limit} onChange={e => setF({ ...f, limit: e.target.value })} placeholder="5.000" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="cd-close">Dia que fecha</label><input id="cd-close" className="field" type="number" min={1} max={31} value={f.closing} onChange={e => setF({ ...f, closing: e.target.value })} /></div>
          <div><label className="label" htmlFor="cd-due">Dia que vence</label><input id="cd-due" className="field" type="number" min={1} max={31} value={f.due} onChange={e => setF({ ...f, due: e.target.value })} /></div>
        </div>
        <p className="-mt-2 text-[12px] text-mist-3">Ex.: fecha dia {day(f.closing)} — uma compra em {dateIn('2026-01-01', day(f.closing)).slice(8)}/01 já vai para a fatura seguinte.</p>
        <div><label className="label" htmlFor="cd-holder">Titular</label>
          <select id="cd-holder" className="field" value={f.holder} onChange={e => setF({ ...f, holder: e.target.value })}>
            <option value="">Do casal</option>{data.members.map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </select></div>
        <button className="btn-primary w-full">{c ? 'Salvar cartão' : 'Adicionar cartão'}</button>
        {c && <button type="button" className="btn-ghost w-full text-coral" onClick={() => {
          const used = data.transactions.some(t => t.card_id === c.id);
          if (used) save('cards', { ...c, archived: true } as unknown as Record<string, unknown>); else del('cards', c);
          toast(used ? `${c.name} arquivado — as compras antigas continuam no histórico` : `${c.name} removido`); onClose();
        }}><Icon name="trash" size={16} />{data.transactions.some(t => t.card_id === c.id) ? 'Arquivar cartão' : 'Remover cartão'}</button>}
      </form>
    </Sheet>
  );
}
