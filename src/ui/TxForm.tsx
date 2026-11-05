import { useMemo, useState } from 'react';
import type { Kind, Method, Nature, Recurring, Tx } from '../domain/types';
import { parseQuick } from '../domain/parser';
import { buildTxs, uuid } from '../domain/build';
import { invoiceMonth } from '../domain/cards';
import { addMonths, monthLabel, monthStart, today } from '../domain/dates';
import { fmt, parseAmount, splitInstallments } from '../domain/money';
import { del, getState, meOf, partnerOf, save, toast, useStore } from '../data/store';
import { Icon } from './Icon';
import { Seg } from './kit';
import { memberColor } from './theme';

type Who = 'me' | 'partner' | 'joint';

export function TxForm({ tx, onDone, presetKind }: { tx?: Tx; onDone: () => void; presetKind?: Kind }) {
  const data = useStore(s => s.data);
  const me = useStore(meOf)!, partner = useStore(partnerOf);
  const viewMonth = useStore(s => s.month);
  const isNew = !tx;

  const whoOf = (id: string | null): Who => (id === null ? 'joint' : id === me.id ? 'me' : 'partner');
  const [quick, setQuick] = useState('');
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [f, setF] = useState(() => ({
    kind: (tx?.kind ?? presetKind ?? 'expense') as Kind,
    description: tx?.description ?? '',
    amount: tx ? String(tx.amount).replace('.', ',') : '',
    date: tx?.occurred_on ?? (viewMonth === monthStart(today()) ? today() : viewMonth),
    category_id: tx?.category_id ?? '',
    method: (tx?.method ?? 'pix') as Method,
    card_id: tx?.card_id ?? data.cards.find(c => !c.archived)?.id ?? '',
    installments: 1,
    who: (tx ? whoOf(tx.payer_id) : 'me') as Who,
    shared: tx?.shared ?? (presetKind === 'income' ? false : true),
    nature: (tx?.nature ?? 'variable') as Nature,
    paid: tx?.paid ?? true,
    notes: tx?.notes ?? '',
    repeat: false,
    wallet_id: tx?.wallet_id ?? data.wallets[0]?.id ?? ''
  }));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF(p => ({ ...p, [k]: v })); setTouched(t => new Set(t).add(k)); };

  const locked = !!tx && tx.kind === 'income' && tx.payer_id !== null && tx.payer_id !== me.id;
  const owner = data.members.find(m => m.id === tx?.payer_id);

  function onQuick(text: string) {
    setQuick(text);
    const d = parseQuick(text, { cards: data.cards, categories: data.categories, me, partner });
    setF(p => {
      const n = { ...p };
      const keep = (k: string) => touched.has(k);
      if (!keep('kind')) n.kind = d.kind;
      if (!keep('description')) n.description = text.trim() ? d.description : '';
      if (!keep('amount')) n.amount = d.amount != null ? String(d.amount).replace('.', ',') : '';
      if (!keep('date')) n.date = d.date;
      if (!keep('category_id') && d.category) n.category_id = d.category.id;
      if (!keep('method')) n.method = d.method;
      if (!keep('card_id') && d.cardId) n.card_id = d.cardId;
      if (!keep('installments')) n.installments = d.installments;
      if (!keep('who') && d.payer) n.who = d.payer;
      if (!keep('who') && !d.payer) n.who = 'me';
      if (!keep('shared')) n.shared = d.kind === 'income' ? false : d.shared ?? true;
      if (!keep('nature') && d.nature) n.nature = d.nature;
      if (!keep('paid')) n.paid = d.method !== 'card';
      return n;
    });
  }

  const amount = parseAmount(f.amount);
  const card = data.cards.find(c => c.id === f.card_id);
  const cats = data.categories.filter(c => !c.archived && (f.kind === 'income' ? c.kind === 'income' : f.kind === 'investment' ? c.kind === 'investment' : c.kind === 'expense'));
  const invoice = f.method === 'card' && card ? invoiceMonth(card, f.date) : null;
  const parcels = f.method === 'card' && f.installments > 1 && amount ? splitInstallments(amount, f.installments) : null;
  const valid = !!amount && amount > 0 && f.description.trim().length > 0 && (f.method !== 'card' || !!card);

  const preview = useMemo(() => {
    if (!amount) return null;
    if (invoice) return `Entra na fatura de ${monthLabel(invoice)}${parcels ? ` — ${f.installments}× de ${fmt(parcels[parcels.length - 1])}` : ''}`;
    return null;
  }, [amount, invoice, parcels, f.installments]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || locked) return;
    const s = getState();
    const method: Method = f.kind === 'expense' ? f.method : 'pix'; // guardar e renda não usam cartão
    const H = s.data.household!.id;
    const payer = f.kind === 'income' && f.who === 'partner' ? 'me' : f.who;
    const cat = s.data.categories.find(c => c.id === f.category_id) ?? null;
    if (isNew) {
      const txs = buildTxs(
        { description: f.description.trim(), amount: amount!, kind: f.kind, nature: f.kind === 'expense' ? f.nature : null, category: cat, method, cardId: method === 'card' ? f.card_id : null, installments: method === 'card' ? f.installments : 1, date: f.date, payer, shared: f.kind === 'income' ? false : f.shared },
        { householdId: H, me, partner, cards: s.data.cards, notes: f.notes.trim() }
      );
      if (method !== 'card') txs.forEach(t => (t.paid = f.paid));
      txs.forEach(t => (t.wallet_id = f.kind === 'investment' ? f.wallet_id || null : null));
      if (f.repeat && txs.length === 1) {
        const t = txs[0];
        const r: Recurring = { id: uuid(), household_id: H, description: t.description, amount: t.amount, kind: t.kind, nature: t.nature, category_id: t.category_id, method: t.method, card_id: t.card_id, wallet_id: t.wallet_id, day: Number(f.date.slice(8)), payer_id: t.payer_id, shared: t.shared, start_month: monthStart(t.occurred_on), end_month: null, skipped: [], created_by: me.id };
        save('recurring', r as unknown as Record<string, unknown>);
        t.recurring_id = r.id;
      }
      save('transactions', ...(txs as unknown as Record<string, unknown>[]));
      toast(txs.length > 1 ? `${t0(txs[0].description)} lançado em ${txs.length} parcelas` : `${t0(txs[0].description)} lançado`, { label: 'Desfazer', run: () => del('transactions', ...txs) });
    } else {
      const payer_id = payer === 'joint' ? null : payer === 'partner' ? partner?.id ?? me.id : me.id;
      const dateChanged = f.date !== tx!.occurred_on || f.card_id !== tx!.card_id || f.method !== tx!.method;
      let month = tx!.month;
      if (dateChanged && !tx!.installment_group) month = method === 'card' && card ? invoiceMonth(card, f.date) : monthStart(f.date);
      save('transactions', { ...tx!, description: f.description.trim(), amount: amount!, kind: f.kind, nature: f.kind === 'expense' ? f.nature : null, category_id: f.category_id || null, method, card_id: method === 'card' ? f.card_id : null, occurred_on: f.date, month, paid: f.paid, payer_id, shared: f.kind === 'income' ? false : f.shared, notes: f.notes.trim(), wallet_id: f.kind === 'investment' ? f.wallet_id || null : tx!.kind === 'income' ? tx!.wallet_id : null } as unknown as Record<string, unknown>);
      toast('Alterações salvas');
    }
    onDone();
  }

  function remove(scope: 'one' | 'all' | 'stop') {
    const s = getState();
    if (!tx) return;
    if (scope === 'all' && tx.installment_group) {
      const all = s.data.transactions.filter(t => t.installment_group === tx.installment_group);
      del('transactions', ...all);
      toast(`${all.length} parcelas excluídas`, { label: 'Desfazer', run: () => save('transactions', ...(all as unknown as Record<string, unknown>[])) });
    } else if (scope === 'stop' && tx.recurring_id) {
      const r = s.data.recurring.find(x => x.id === tx.recurring_id);
      const chargeMonth = monthStart(tx.occurred_on);
      const future = s.data.transactions.filter(t => t.recurring_id === tx.recurring_id && t.occurred_on >= chargeMonth && !t.paid);
      if (r) save('recurring', { ...r, end_month: addMonths(chargeMonth, -1) } as unknown as Record<string, unknown>);
      del('transactions', ...future);
      toast(`${t0(tx.description)} não se repete mais`);
    } else {
      const r = tx.recurring_id ? s.data.recurring.find(x => x.id === tx.recurring_id) : null;
      if (r) save('recurring', { ...r, skipped: [...new Set([...r.skipped, tx.month])] } as unknown as Record<string, unknown>);
      del('transactions', tx);
      toast(`${t0(tx.description)} excluído`, { label: 'Desfazer', run: () => { save('transactions', tx as unknown as Record<string, unknown>); if (r) save('recurring', r as unknown as Record<string, unknown>); } });
    }
    onDone();
  }

  const pName = partner?.display_name.split(' ')[0] ?? 'Parceiro(a)';
  const [confirmDel, setConfirmDel] = useState(false);

  if (locked) {
    return (
      <div className="space-y-4">
        <div className="panel-quiet flex gap-3 p-4 text-sm text-mist-2"><Icon name="users" className="mt-0.5 shrink-0 text-her" />
          <p>Esta é a renda de <b className="text-mist-1">{owner?.display_name}</b>. Só {owner?.display_name.split(' ')[0]} pode alterar — assim ninguém precisa digitar o salário do outro.</p></div>
        <div className="flex items-baseline justify-between"><span className="text-mist-2">{tx!.description}</span><span className="num text-2xl font-semibold text-mint">{fmt(tx!.amount)}</span></div>
        <button className="btn-ghost w-full" onClick={onDone}>Fechar</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {isNew && (
        <div>
          <div className="relative">
            <Icon name="sparkles" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-me" />
            <input data-autofocus className="field pl-10 text-base" placeholder="mercado 230 nubank 3x" value={quick} onChange={e => onQuick(e.target.value)} enterKeyHint="done" autoComplete="off" aria-label="Lançamento rápido" />
          </div>
          <p className="mt-1.5 text-[12px] text-mist-3">Escreva do seu jeito: <span className="text-mist-2">"+ freela 800"</span>, <span className="text-mist-2">"farmácia 85 só eu ontem"</span>, <span className="text-mist-2">"luz 210 {pName.toLowerCase()} pagou"</span>.</p>
        </div>
      )}

      <Seg label="Tipo" value={f.kind} onChange={v => { set('kind', v); if (v === 'income') { set('shared', false); if (f.who === 'partner') set('who', 'me'); } setF(p => ({ ...p, category_id: '' })); }}
        options={[['expense', 'Despesa'], ['income', 'Renda'], ['investment', 'Guardar']]} />

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div><label className="label" htmlFor="tx-desc">Descrição</label><input id="tx-desc" className="field" value={f.description} onChange={e => set('description', e.target.value)} placeholder="Mercado" required /></div>
        <div className="w-36"><label className="label" htmlFor="tx-amount">Valor</label>
          <input id="tx-amount" className="field num text-right font-semibold" inputMode="decimal" value={f.amount} onChange={e => set('amount', e.target.value)} placeholder="0,00" required /></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="tx-date">{f.method === 'card' ? 'Data da compra' : 'Data'}</label><input id="tx-date" type="date" className="field" value={f.date} onChange={e => set('date', e.target.value)} required /></div>
        <div><label className="label" htmlFor="tx-cat">Categoria</label>
          <select id="tx-cat" className="field" value={f.category_id} onChange={e => set('category_id', e.target.value)}>
            <option value="">Sem categoria</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
      </div>

      {f.kind === 'investment' && (
        <div><label className="label" htmlFor="tx-wallet">Para qual reserva</label>
          {data.wallets.length ? <select id="tx-wallet" className="field" value={f.wallet_id} onChange={e => set('wallet_id', e.target.value)}>
            <option value="">Sem reserva específica</option>
            {data.wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select> : <p className="panel-quiet p-3 text-[13px] text-mist-2">Crie uma reserva em Planejar → Guardado para acompanhar o saldo de cada uma.</p>}
          <p className="mt-1.5 text-[12px] text-mist-3">Guardar não é gasto: o dinheiro sai da conta e vai para a reserva.</p>
        </div>
      )}

      {f.kind === 'expense' && (
        <div>
          <span className="label">Como foi pago</span>
          <Seg label="Forma de pagamento" value={f.method} onChange={v => { set('method', v); set('paid', v !== 'card'); }} options={[['pix', 'Pix/débito'], ['card', 'Cartão'], ['boleto', 'Boleto'], ['cash', 'Dinheiro']]} />
        </div>
      )}

      {f.method === 'card' && f.kind === 'expense' && (
        data.cards.length === 0
          ? <p className="panel-quiet p-3 text-sm text-mist-2">Cadastre um cartão na aba Cartões para lançar compras nele.</p>
          : <div className="grid grid-cols-[1fr_auto] gap-3">
            <div><label className="label" htmlFor="tx-card">Cartão</label>
              <select id="tx-card" className="field" value={f.card_id} onChange={e => set('card_id', e.target.value)}>
                {data.cards.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            {isNew && <div className="w-28"><label className="label" htmlFor="tx-inst">Parcelas</label>
              <select id="tx-inst" className="field" value={f.installments} onChange={e => set('installments', Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}×`}</option>)}
              </select></div>}
          </div>
      )}
      {preview && <p className="-mt-1 flex items-center gap-2 text-[13px] text-me"><Icon name="calendar" size={15} />{preview}</p>}

      {f.kind === 'income' ? (
        <div><span className="label">De quem é esta renda</span>
          <Seg label="Dono da renda" value={f.who === 'joint' ? 'joint' : 'me'} onChange={v => set('who', v)} options={[['me', 'Minha'], ['joint', 'Conta conjunta']]} />
          <p className="mt-1.5 text-[12px] text-mist-3">A renda de {pName} é lançada por {pName} — você não precisa digitar o salário do outro.</p>
        </div>
      ) : (
        <>
          <div><span className="label">Quem pagou</span>
            <Seg label="Quem pagou" value={f.who} onChange={v => set('who', v)} options={[
              ['me', <span key="a" className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: memberColor(me, data.members) }} />Eu</span>],
              ...(partner ? [['partner', <span key="b" className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: memberColor(partner, data.members) }} />{pName}</span>] as [Who, React.ReactNode]] : []),
              ['joint', <span key="c" className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-duo" />Conjunta</span>]
            ]} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className="label">É de quem</span>
              <Seg label="Divisão" value={f.shared ? 'y' : 'n'} onChange={v => set('shared', v === 'y')} options={[['y', 'Do casal'], ['n', f.who === 'joint' ? 'Pessoal' : f.who === 'me' ? 'Só meu' : `Só de ${pName}`]]} /></div>
            {f.kind === 'expense' && <div><span className="label">Tipo de gasto</span>
              <Seg label="Natureza" value={f.nature} onChange={v => set('nature', v)} options={[['fixed', 'Fixo'], ['variable', 'Variável']]} /></div>}
          </div>
        </>
      )}

      {(f.method !== 'card' || f.kind !== 'expense') && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="chip" aria-pressed={f.paid} onClick={() => set('paid', !f.paid)}><Icon name="check" size={14} />{f.kind === 'income' ? 'Já recebido' : 'Já pago'}</button>
          {isNew && <button type="button" className="chip" aria-pressed={f.repeat} onClick={() => set('repeat', !f.repeat)}><Icon name="repeat" size={14} />Repetir todo mês</button>}
        </div>
      )}

      <div><label className="label" htmlFor="tx-notes">Observação</label><input id="tx-notes" className="field" value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="Opcional" /></div>

      <button className="btn-primary w-full py-3 text-[15px]" disabled={!valid}>{isNew ? (parcels ? `Lançar ${f.installments} parcelas` : 'Lançar') : 'Salvar alterações'}</button>

      {!isNew && (
        confirmDel ? (
          <div className="panel-quiet space-y-2 p-3">
            <p className="text-sm text-mist-2">Excluir {tx!.description}?</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-danger" onClick={() => remove('one')}>{tx!.recurring_id ? 'Só este mês' : tx!.installment_group ? 'Só esta parcela' : 'Excluir'}</button>
              {tx!.installment_group && <button type="button" className="btn-danger" onClick={() => remove('all')}>Todas as parcelas</button>}
              {tx!.recurring_id && <button type="button" className="btn-danger" onClick={() => remove('stop')}>Parar de repetir</button>}
              <button type="button" className="btn-ghost" onClick={() => setConfirmDel(false)}>Cancelar</button>
            </div>
          </div>
        ) : <button type="button" className="btn-ghost w-full text-coral" onClick={() => setConfirmDel(true)}><Icon name="trash" size={16} />Excluir</button>
      )}
    </form>
  );
}

const t0 = (s: string) => `“${s}”`;
