import { useMemo, useState } from 'react';
import type { Tx } from '../domain/types';
import { dayLabel, monthLabel } from '../domain/dates';
import { sum } from '../domain/money';
import { norm } from '../domain/categorize';
import { meOf, partnerOf, useStore } from '../data/store';
import { Empty, Money } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { TxRow } from '../ui/TxRow';
import { StatementImport } from '../ui/StatementImport';

type Filter = 'all' | 'shared' | 'me' | 'partner' | 'income' | 'pending' | 'card';

export function Transactions({ onOpen }: { onOpen: (t: Tx) => void }) {
  const data = useStore(s => s.data), month = useStore(s => s.month);
  const me = useStore(meOf)!, partner = useStore(partnerOf);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [cat, setCat] = useState('');
  const [importing, setImporting] = useState(false);

  const list = useMemo(() => {
    const nq = norm(q.trim());
    return data.transactions.filter(t => {
      // com busca, procura em todos os meses; sem busca, só no mês aberto
      if (!nq && t.month !== month) return false;
      if (nq) {
        const c = data.categories.find(x => x.id === t.category_id)?.name ?? '';
        if (!norm(`${t.description} ${t.notes} ${c}`).includes(nq) && !String(t.amount).includes(nq.replace(',', '.'))) return false;
      }
      if (cat && t.category_id !== cat) return false;
      switch (filter) {
        case 'shared': return t.kind !== 'income' && t.shared;
        case 'me': return t.payer_id === me.id && (t.kind === 'income' || !t.shared);
        case 'partner': return !!partner && t.payer_id === partner.id && (t.kind === 'income' || !t.shared);
        case 'income': return t.kind === 'income';
        case 'pending': return !t.paid && t.kind !== 'income';
        case 'card': return t.method === 'card';
        default: return true;
      }
    }).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  }, [data, month, q, filter, cat, me.id, partner]);

  const groups = useMemo(() => {
    const g = new Map<string, Tx[]>();
    list.forEach(t => { const k = q ? t.month : t.occurred_on; g.set(k, [...(g.get(k) || []), t]); });
    return [...g.entries()];
  }, [list, q]);

  const inSum = sum(list.filter(t => t.kind === 'income'), t => t.amount);
  const outSum = sum(list.filter(t => t.kind !== 'income'), t => t.amount);
  const pName = partner?.display_name.split(' ')[0];
  const chips: [Filter, string][] = [['all', 'Tudo'], ['shared', 'Do casal'], ['me', 'Só meus'], ...(partner ? [['partner', `Só de ${pName}`] as [Filter, string]] : []), ['income', 'Renda'], ['card', 'Cartão'], ['pending', 'Pendentes']];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="panel p-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-3" />
            <input className="field pl-10" placeholder="Buscar em todos os meses" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar lançamentos" />
          </div>
          <button className="btn-ghost shrink-0" onClick={() => setImporting(true)} title="Importar extrato do banco"><Icon name="upload" size={17} /><span className="hidden sm:inline">Importar extrato</span><span className="sr-only sm:hidden">Importar extrato</span></button>
        </div>
        <div className="scroll-x -mx-1 mt-3 flex gap-2 px-1">
          {chips.map(([k, l]) => <button key={k} className="chip shrink-0" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
          <select className="chip shrink-0 bg-transparent pr-2" value={cat} onChange={e => setCat(e.target.value)} aria-label="Filtrar por categoria">
            <option value="">Todas as categorias</option>
            {data.categories.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-sm">
        <span className="text-mist-2">{q ? `${list.length} resultado${list.length === 1 ? '' : 's'}` : `${list.length} em ${monthLabel(month)}`}</span>
        <span className="flex gap-4"><span className="text-mist-3">entrou <Money v={inSum} className="text-mint" /></span><span className="text-mist-3">saiu <Money v={outSum} className="text-mist-1" /></span></span>
      </div>

      {groups.length === 0 ? (
        <div className="panel"><Empty icon="list" title={q ? 'Nada encontrado' : 'Nenhum lançamento aqui'}>{q ? 'Tente outra palavra ou valor.' : 'Toque em + e escreva algo como "mercado 230".'}</Empty></div>
      ) : groups.map(([k, txs]) => (
        <section key={k} className="panel px-2 py-2 sm:px-3">
          <div className="flex items-center justify-between px-2 pb-1 pt-2 text-[12px] font-semibold text-mist-3">
            <span>{q ? monthLabel(k) : dayLabel(k)}</span>
            <Money v={-sum(txs.filter(t => t.kind !== 'income'), t => t.amount)} className="font-medium normal-case" />
          </div>
          <ul>{txs.map(t => <TxRow key={t.id} t={t} data={data} onOpen={onOpen} meId={me.id} />)}</ul>
        </section>
      ))}
      <StatementImport open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}
