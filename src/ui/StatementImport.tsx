import { useMemo, useState } from 'react';
import type { Tx } from '../domain/types';
import { looksLikeInvoicePayment, parseStatement, type Statement } from '../domain/statement';
import { categorize } from '../domain/categorize';
import { invoiceMonth } from '../domain/cards';
import { monthLabel, monthStart } from '../domain/dates';
import { fmt, round2 } from '../domain/money';
import { uuid } from '../domain/build';
import { del, getState, meOf, partnerOf, save, toast, useStore } from '../data/store';
import { Money, Seg, Sheet } from './kit';
import { Icon } from './Icon';

type Who = 'me' | 'partner' | 'joint';
interface Row { i: number; on: boolean; tag: string | null; date: string; description: string; amount: number; externalId: string; category_id: string }

/** Importa o extrato baixado do banco (OFX ou CSV), com prévia para conferir antes de lançar. */
export function StatementImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useStore(s => s.data), me = useStore(meOf)!, partner = useStore(partnerOf);
  const [stmt, setStmt] = useState<Statement | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [src, setSrc] = useState<string>('account'); // 'account' ou id do cartão
  const [invoice, setInvoice] = useState('');
  const [who, setWho] = useState<Who>('me');
  const [shared, setShared] = useState(true);
  const [err, setErr] = useState('');
  const cards = data.cards.filter(c => !c.archived);
  const card = cards.find(c => c.id === src) ?? null;

  const reset = () => { setStmt(null); setRows([]); setErr(''); };
  const close = () => { reset(); onClose(); };

  async function onFile(file: File) {
    setErr('');
    const buf = await file.arrayBuffer();
    // bancos brasileiros ainda exportam em Latin-1; se o UTF-8 vier com caracteres quebrados, tenta de novo
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    const s = parseStatement(text, file.name);
    if (!s.rows.length) { setErr('Não encontrei lançamentos nesse arquivo. Use o extrato em OFX ou CSV baixado pelo app ou site do banco.'); return; }
    const d = getState().data;
    const known = new Set(d.transactions.map(t => t.external_id).filter(Boolean));
    const similar = (date: string, amount: number) => d.transactions.some(t => !t.external_id && t.occurred_on === date && Math.abs(t.amount - Math.abs(amount)) < 0.01);
    const isCard = s.source === 'card' && cards.length > 0;
    setSrc(isCard ? cards[0].id : 'account');
    const cats = d.categories;
    setRows(s.rows.map((r, i) => {
      let tag: string | null = null;
      if (known.has(r.externalId)) tag = 'já importado';
      else if (looksLikeInvoicePayment(r.description)) tag = 'pagamento de fatura';
      else if (similar(r.date, r.amount)) tag = 'parece já lançado';
      else if (isCard && r.amount > 0) tag = 'estorno';
      const kindCats = cats.filter(c => !c.archived && (r.amount > 0 ? c.kind === 'income' : c.kind !== 'income'));
      return { i, on: !tag, tag, ...r, category_id: categorize(r.description, kindCats).category?.id ?? '' };
    }));
    setStmt(s);
    if (isCard) setInvoice(mostCommonInvoice(s, cards[0]));
  }

  const mostCommonInvoice = (s: Statement, c: typeof cards[number]) => {
    const count = new Map<string, number>();
    s.rows.filter(r => r.amount < 0).forEach(r => { const m = invoiceMonth(c, r.date); count.set(m, (count.get(m) || 0) + 1); });
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? monthStart(s.rows[0].date);
  };
  const invoiceOptions = useMemo(() => {
    if (!stmt || !card) return [];
    const set = new Set(stmt.rows.map(r => invoiceMonth(card, r.date)));
    if (invoice) set.add(invoice);
    return [...set].sort();
  }, [stmt, card, invoice]);

  const chosen = rows.filter(r => r.on);
  const outTotal = round2(chosen.filter(r => r.amount < 0).reduce((s, r) => s - r.amount, 0));
  const inTotal = round2(chosen.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0));
  const setRow = (i: number, p: Partial<Row>) => setRows(rs => rs.map(r => (r.i === i ? { ...r, ...p } : r)));

  function run() {
    const d = getState().data, H = d.household!.id;
    const payerOut = who === 'joint' ? null : who === 'partner' ? partner?.id ?? me.id : me.id;
    const txs: Tx[] = chosen.filter(r => !(card && r.amount > 0)).map(r => {
      const cat = d.categories.find(c => c.id === r.category_id);
      const income = r.amount > 0;
      const kind: Tx['kind'] = income ? 'income' : cat?.kind === 'investment' ? 'investment' : 'expense';
      const nature = kind === 'expense' ? categorize(r.description, d.categories).nature ?? 'variable' : null;
      return {
        id: uuid(), household_id: H, description: r.description, notes: '', amount: Math.abs(r.amount), kind, nature,
        category_id: r.category_id || null, method: card ? 'card' : 'pix', card_id: card?.id ?? null, wallet_id: null,
        occurred_on: r.date, month: card ? invoice : monthStart(r.date), paid: !card,
        payer_id: income ? (who === 'joint' ? null : me.id) : payerOut, shared: income ? false : shared,
        installment_group: null, installment_no: null, installment_total: null, recurring_id: null, created_by: me.id, external_id: r.externalId
      };
    });
    if (!txs.length) return;
    save('transactions', ...(txs as unknown as Record<string, unknown>[]));
    toast(`${txs.length} lançamentos importados`, { label: 'Desfazer', run: () => del('transactions', ...txs) });
    close();
  }

  const pName = partner?.display_name.split(' ')[0];
  return (
    <Sheet open={open} onClose={close} title="Importar extrato do banco" wide>
      {!stmt ? (
        <div className="space-y-4">
          <p className="text-sm text-mist-2">Baixe o extrato no app ou site do banco e escolha o arquivo aqui. Você confere tudo antes de lançar, e importar o mesmo arquivo de novo não duplica nada.</p>
          <ul className="panel-quiet space-y-1.5 p-4 text-[13px] text-mist-2">
            <li><b className="text-mist-1">Nubank, fatura do cartão:</b> no app, abra a fatura e toque em "Exportar fatura" (CSV).</li>
            <li><b className="text-mist-1">Nubank, conta:</b> no app, vá em Extrato e toque em "Exportar extrato" (CSV ou OFX).</li>
            <li><b className="text-mist-1">Inter e outros bancos:</b> no extrato, use "Exportar" ou "Baixar" e escolha OFX ou CSV.</li>
          </ul>
          <label className="btn-primary w-full cursor-pointer py-3"><Icon name="upload" size={18} />Escolher arquivo
            <input type="file" accept=".ofx,.csv,.txt,text/csv,application/x-ofx" className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onFile(f); }} />
          </label>
          {err && <p className="text-sm text-coral">{err}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div><span className="label">Este arquivo é de</span>
            <Seg label="Origem" value={src} onChange={v => { setSrc(v); const c = cards.find(x => x.id === v); if (c && stmt) setInvoice(mostCommonInvoice(stmt, c)); }}
              options={[['account', 'Conta (Pix/débito)'], ...cards.map(c => [c.id, c.name] as [string, string])]} /></div>
          {card && (
            <div><label className="label" htmlFor="im-inv">Entra na fatura de</label>
              <select id="im-inv" className="field" value={invoice} onChange={e => setInvoice(e.target.value)}>{invoiceOptions.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
              <p className="mt-1.5 text-[12px] text-mist-3">A fatura exportada do banco já é uma fatura só: deixe todas as compras no mesmo mês.</p></div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div><span className="label">Quem pagou os gastos</span>
              <Seg label="Quem pagou" value={who} onChange={setWho} options={[['me', 'Eu'], ...(partner ? [['partner', pName!] as [Who, string]] : []), ['joint', 'Conjunta']]} /></div>
            <div><span className="label">Os gastos são</span>
              <Seg label="Divisão" value={shared ? 'y' : 'n'} onChange={v => setShared(v === 'y')} options={[['y', 'Do casal'], ['n', 'Pessoais']]} /></div>
          </div>

          <div className="flex items-center justify-between text-[13px] text-mist-2">
            <span>{chosen.length} de {rows.length} selecionados</span>
            <span className="flex gap-3">
              <button className="font-medium text-me" onClick={() => setRows(rs => rs.map(r => ({ ...r, on: true })))}>Marcar todos</button>
              <button className="font-medium text-me" onClick={() => setRows(rs => rs.map(r => ({ ...r, on: false })))}>Nenhum</button>
            </span>
          </div>
          <ul className="max-h-[42dvh] divide-y divide-white/5 overflow-y-auto rounded-xl border border-white/10">
            {rows.map(r => {
              const kindCats = data.categories.filter(c => !c.archived && (r.amount > 0 ? c.kind === 'income' : c.kind !== 'income'));
              return (
                <li key={r.i} className={`flex items-center gap-3 px-3 py-2.5 ${r.on ? '' : 'opacity-50'}`}>
                  <input type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--me)]" checked={r.on} onChange={e => setRow(r.i, { on: e.target.checked })} aria-label={`Importar ${r.description}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{r.description}</p>
                    <p className="flex items-center gap-2 text-[12px] text-mist-3">
                      {r.date.slice(8)}/{r.date.slice(5, 7)}
                      {r.tag && <span className="rounded-full bg-amber/10 px-1.5 text-amber">{r.tag}</span>}
                      <select className="min-w-0 max-w-[11rem] truncate bg-transparent text-mist-2 outline-none" value={r.category_id} onChange={e => setRow(r.i, { category_id: e.target.value })} aria-label="Categoria">
                        <option value="">Sem categoria</option>{kindCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </p>
                  </div>
                  <Money v={r.amount} sign className={`shrink-0 text-sm font-semibold ${r.amount > 0 ? 'text-mint' : ''}`} />
                </li>
              );
            })}
          </ul>
          {card && chosen.some(r => r.amount > 0) && <p className="text-[12px] text-amber">Créditos na fatura (estornos e pagamentos) não são importados.</p>}
          <button className="btn-primary w-full py-3" disabled={!chosen.length} onClick={run}>
            Importar {chosen.filter(r => !(card && r.amount > 0)).length} lançamentos · saídas {fmt(outTotal)}{!card && inTotal ? ` · entradas ${fmt(inTotal)}` : ''}
          </button>
          <button className="w-full text-center text-[13px] text-mist-2" onClick={reset}>Escolher outro arquivo</button>
        </div>
      )}
    </Sheet>
  );
}
