import type { Data, Tx } from '../domain/types';
import { Icon } from './Icon';
import { Money } from './kit';
import { save } from '../data/store';
import { catColor, memberColor, tint } from './theme';
import { monthShortLabel } from '../domain/dates';

const METHOD: Record<string, string> = { pix: 'Pix', card: 'Cartão', boleto: 'Boleto', cash: 'Dinheiro' };

export function TxRow({ t, data, onOpen, meId }: { t: Tx; data: Data; onOpen: (t: Tx) => void; meId: string }) {
  const cat = data.categories.find(c => c.id === t.category_id);
  const payer = data.members.find(m => m.id === t.payer_id);
  const card = data.cards.find(c => c.id === t.card_id);
  const color = memberColor(payer, data.members);
  const isIn = t.kind === 'income';
  const locked = isIn && t.payer_id !== null && t.payer_id !== meId;
  const who = t.kind === 'income'
    ? (payer ? payer.display_name.split(' ')[0] : 'Conjunta')
    : `${payer ? payer.display_name.split(' ')[0] : 'Conjunta'}${t.shared ? '' : ' · pessoal'}`;
  return (
    <li className="group relative flex items-center gap-3 rounded-2xl px-2 py-3 transition hover:bg-white/[.035]">
      <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} aria-hidden="true" />
      <span className="ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: catColor(cat?.color) + '1f', color: tint(catColor(cat?.color)) }}>
        <Icon name={cat?.icon ?? 'box'} size={18} />
      </span>
      <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(t)}>
        <span className="block truncate text-[15px] font-medium">
          {t.description}
          {t.installment_total && <span className="ml-1.5 text-[12px] text-mist-3">{t.installment_no}/{t.installment_total}</span>}
          {t.recurring_id && <Icon name="repeat" size={12} className="ml-1.5 inline text-mist-3" />}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-mist-3">{cat?.name ?? 'Sem categoria'} · {card ? card.name : METHOD[t.method]} · <span style={{ color: tint(color) }}>{who}</span>{t.notes ? ` · ${t.notes}` : ''}</span>
      </button>
      <div className="flex flex-col items-end gap-1">
        <Money v={isIn ? t.amount : -t.amount} className={`text-[15px] font-semibold ${isIn ? 'text-mint' : t.kind === 'investment' ? 'text-sky' : ''}`} sign />
        {(t.method === 'card' && !isIn) || locked
          ? <span className="text-[11px] text-mist-3">{locked ? (t.paid ? 'recebido' : 'a receber') : t.paid ? 'fatura paga' : `fatura ${monthShortLabel(t.month).split('/')[0].toLowerCase()}`}</span>
          : <button onClick={() => save('transactions', { ...t, paid: !t.paid } as unknown as Record<string, unknown>)} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.paid ? 'bg-mint/10 text-mint' : 'bg-amber/10 text-amber'}`} aria-label={t.paid ? 'Marcar como pendente' : 'Marcar como pago'}>
            {t.paid ? (isIn ? 'recebido' : 'pago') : 'pendente'}
          </button>}
      </div>
    </li>
  );
}
