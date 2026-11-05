import { useState } from 'react';
import type { Card, Tx } from '../domain/types';
import { cardInvoice, cardUsed } from '../domain/cards';
import { addMonths, dateIn, monthLabel } from '../domain/dates';
import { fmt, parseAmount, round2, sum } from '../domain/money';
import { uuid } from '../domain/build';
import { del, getState, meOf, save, toast, useStore } from '../data/store';
import { Empty, Money, Section, Sheet } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { TxRow } from '../ui/TxRow';
import { memberColor } from '../ui/theme';

export function Cards({ onOpen }: { onOpen: (t: Tx) => void }) {
  const data = useStore(s => s.data), month = useStore(s => s.month), me = useStore(meOf)!;
  const [edit, setEdit] = useState<Card | 'new' | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const cards = data.cards.filter(c => !c.archived);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {cards.length === 0 && <div className="panel"><Empty icon="card" title="Nenhum cartão ainda">Cadastre o cartão com o dia de fechamento: o app coloca cada compra na fatura certa sozinho.</Empty></div>}
      {cards.map(c => {
        const inv = cardInvoice(data.transactions, c.id, month);
        const total = sum(inv, t => t.amount), unpaid = sum(inv.filter(t => !t.paid), t => t.amount);
        const used = cardUsed(data.transactions, c.id), pct = c.limit_amount ? Math.min(100, (used / c.limit_amount) * 100) : 0;
        const next = sum(cardInvoice(data.transactions, c.id, addMonths(month, 1)), t => t.amount);
        const holder = data.members.find(m => m.id === c.holder_id);
        const expanded = open === c.id;
        return (
          <section key={c.id} className="panel overflow-hidden">
            <div className="relative p-5" style={{ background: `linear-gradient(120deg, color-mix(in srgb, ${memberColor(holder, data.members)} 16%, transparent), transparent 60%)` }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-semibold">{c.name}</p>
                  <p className="mt-0.5 text-[12px] text-mist-2">Fecha dia {c.closing_day}, vence dia {c.due_day}{holder ? ` · de ${holder.id === me.id ? 'você' : holder.display_name}` : ''}</p>
                </div>
                <button className="rounded-full p-2 text-mist-2 hover:bg-white/5" onClick={() => setEdit(c)} aria-label={`Editar ${c.name}`}><Icon name="edit" size={16} /></button>
              </div>
              <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
                <div><p className="mb-1 text-[12px] text-mist-2">Fatura de {monthLabel(month)}</p><Money v={total} className="block text-3xl font-bold" /></div>
                {unpaid > 0
                  ? <button className="btn-primary" onClick={() => { const ids = inv.filter(t => !t.paid); save('transactions', ...ids.map(t => ({ ...t, paid: true } as unknown as Record<string, unknown>))); toast(`Fatura ${c.name} paga`, { label: 'Desfazer', run: () => save('transactions', ...(ids as unknown as Record<string, unknown>[])) }); }}>Pagar fatura · {fmt(unpaid)}</button>
                  : total > 0 ? <span className="chip text-mint"><Icon name="check" size={14} />Paga</span> : null}
              </div>
              <div className="mt-5">
                <div className="mb-1.5 flex justify-between text-[12px]"><span className="text-mist-2">Limite usado <Money v={used} className="text-mist-1" /></span><span className="text-mist-2">Livre <Money v={Math.max(0, c.limit_amount - used)} className="text-mint" /></span></div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: pct > 85 ? 'rgb(var(--c-coral))' : 'linear-gradient(90deg, var(--me), var(--duo))' }} /></div>
                {next > 0 && <p className="mt-2 text-[12px] text-mist-3">Próxima fatura já tem <Money v={next} className="text-mist-2" /> lançados.</p>}
              </div>
            </div>
            <button className="flex w-full items-center justify-between border-t border-white/5 px-5 py-3 text-sm text-mist-2 hover:bg-white/[.03]" onClick={() => setOpen(expanded ? null : c.id)} aria-expanded={expanded}>
              <span>{inv.length} compra{inv.length === 1 ? '' : 's'} nesta fatura</span><Icon name="down" size={16} className={`transition ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded && <ul className="px-2 pb-2 sm:px-3">{inv.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)).map(t => <TxRow key={t.id} t={t} data={data} onOpen={onOpen} meId={me.id} />)}</ul>}
          </section>
        );
      })}
      <button className="btn-ghost w-full py-3" onClick={() => setEdit('new')}><Icon name="plus" size={16} />Adicionar cartão</button>
      <InvoiceHistory />
      <CardSheet card={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

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
