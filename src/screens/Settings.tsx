import { useState } from 'react';
import type { Category, Member, Recurring } from '../domain/types';
import { convertLegacy } from '../domain/legacy';
import { thisMonth } from '../domain/dates';
import { fmt, parseAmount } from '../domain/money';
import { uuid } from '../domain/build';
import { backend, getState, meOf, partnerOf, refreshRecurring, reload, save, setTheme, signOut, toast, useStore } from '../data/store';
import { THEMES, catColor } from '../ui/theme';
import { Avatar, Money, Section, Seg, Sheet } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { RecurringSheet } from './Plan';
import { StatementImport } from '../ui/StatementImport';

export const COLORS = ['#3DD9EB', '#FF7AB6', '#4BE3A6', '#FFC861', '#9B8CFF', '#FB923C', '#60A5FA', '#84CC16'];

export function Settings() {
  return (
    <div className="mx-auto grid max-w-4xl gap-4 lg:grid-cols-2">
      <Visual />
      <div className="space-y-4"><Profile /><Income /><Couple /></div>
      <div className="space-y-4"><Categories /><DataTools /></div>
    </div>
  );
}

/** Escolha do estilo visual — cada miniatura já é desenhada com o próprio estilo. */
function Visual() {
  const theme = useStore(s => s.theme), me = useStore(meOf)!, partner = useStore(partnerOf);
  return (
    <section className="panel p-4 sm:p-5 lg:col-span-2">
      <div className="mb-1 flex items-baseline justify-between gap-2"><h2 className="font-display text-[15px] font-semibold">Visual</h2><span className="text-[12px] text-mist-3">cada um escolhe o seu, neste aparelho</span></div>
      <p className="mb-4 text-[13px] text-mist-2">Toque para experimentar. O app inteiro muda na hora.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {THEMES.map(t => {
          const vars = { '--me': t.couple?.[0] ?? me.color, '--her': t.couple?.[1] ?? partner?.color ?? '#FF7AB6', background: 'var(--ambient), var(--bg)' } as React.CSSProperties;
          return (
            <button key={t.id} data-theme={t.id} style={vars} onClick={() => setTheme(t.id)} aria-pressed={theme === t.id}
              className={`group relative overflow-hidden rounded-2xl p-3 text-left text-mist-1 transition ${theme === t.id ? 'ring-2 ring-[var(--me)] ring-offset-2 ring-offset-[var(--bg)]' : 'opacity-90 hover:opacity-100'}`}>
              <div className="hero panel relative p-3.5" style={{ fontFamily: 'var(--font-body)' }}>
                <p className="text-[11px] text-mist-2">Sobra do mês</p>
                <p className="num mt-1 text-[26px] leading-none" style={{ fontWeight: 'var(--num-weight)' as unknown as number }}>R$ 3.808</p>
                <div className="duo-track mt-3"><i style={{ flexGrow: 0.58, background: 'var(--me)' }} /><i style={{ flexGrow: 0.42, background: 'var(--her)' }} /></div>
              </div>
              <p className="mt-3 font-display text-[15px] font-semibold">{t.name}{theme === t.id && <span className="ml-2 align-middle text-[11px] font-medium text-mint">em uso</span>}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-mist-2" style={{ fontFamily: 'var(--font-body)' }}>{t.blurb}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Profile() {
  const me = useStore(meOf)!;
  const owned = THEMES.find(t => t.id === useStore(s => s.theme))?.couple;
  const [name, setName] = useState(me.display_name);
  return (
    <Section title="Você">
      <div className="flex items-center gap-3">
        <Avatar m={me} size={44} />
        <input className="field flex-1" value={name} onChange={e => setName(e.target.value)} onBlur={() => name.trim() && name !== me.display_name && save('members', { ...me, display_name: name.trim() } as unknown as Record<string, unknown>)} aria-label="Seu nome" />
      </div>
      <p className="label mt-4">Sua cor — marca tudo o que é seu no app</p>
      {owned && <p className="-mt-0.5 mb-2 text-[12px] text-mist-3">Neste visual as cores do casal são as do estilo; a sua escolha vale nos outros.</p>}
      <div className="flex flex-wrap gap-2.5">
        {COLORS.map(c => <button key={c} onClick={() => save('members', { ...me, color: c } as unknown as Record<string, unknown>)} className="h-9 w-9 rounded-full transition hover:scale-110" style={{ background: c, boxShadow: me.color === c ? `0 0 0 3px #060912, 0 0 0 5px ${c}` : 'none' }} aria-label={`Usar a cor ${c}`} aria-pressed={me.color === c} />)}
      </div>
    </Section>
  );
}

/** A renda de cada um: você só edita a sua. Resolve o "um tem que digitar o salário do outro". */
function Income() {
  const data = useStore(s => s.data), me = useStore(meOf)!, partner = useStore(partnerOf);
  const [edit, setEdit] = useState<Recurring | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ description: 'Salário', amount: '', day: '5' });
  const now = thisMonth();
  const active = (id: string) => data.recurring.filter(r => r.kind === 'income' && r.payer_id === id && (!r.end_month || r.end_month >= now));
  const mine = active(me.id), hers = partner ? active(partner.id) : [];
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseAmount(f.amount); if (!amount) return;
    const sal = data.categories.find(c => c.kind === 'income' && /sal/i.test(c.name)) ?? data.categories.find(c => c.kind === 'income');
    save('recurring', { id: uuid(), household_id: data.household!.id, description: f.description.trim() || 'Salário', amount, kind: 'income', nature: null, category_id: sal?.id ?? null, method: 'pix', card_id: null, wallet_id: null, day: Math.min(31, Math.max(1, Number(f.day) || 5)), payer_id: me.id, shared: false, start_month: now, end_month: null, skipped: [], created_by: me.id });
    setAdding(false); setF({ description: 'Salário', amount: '', day: '5' });
    toast('Renda salva — entra sozinha todo mês');
    await refreshRecurring();
  };
  return (
    <Section title="Renda de cada um">
      <p className="mb-4 text-[13px] text-mist-2">Cada um cadastra a própria renda fixa uma vez. Ela entra sozinha todo mês e a divisão das contas se ajusta.</p>
      <PersonIncome m={me} items={mine} you onEdit={setEdit} />
      {mine.length === 0 && !adding && <button className="btn-primary mt-2 w-full" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Cadastrar meu salário</button>}
      {mine.length > 0 && !adding && <button className="mt-1 text-[13px] font-medium text-me" onClick={() => setAdding(true)}>+ outra renda fixa</button>}
      {adding && (
        <form className="panel-quiet mt-2 space-y-3 p-3" onSubmit={add}>
          <div className="grid grid-cols-[1fr_7rem_4.5rem] gap-2">
            <input className="field" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} aria-label="Descrição" />
            <input className="field num" data-autofocus autoFocus inputMode="decimal" placeholder="Valor" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} aria-label="Valor" required />
            <input className="field" type="number" min={1} max={31} value={f.day} onChange={e => setF({ ...f, day: e.target.value })} aria-label="Dia que cai" title="Dia que cai" />
          </div>
          <div className="flex gap-2"><button className="btn-primary flex-1">Salvar</button><button type="button" className="btn-ghost" onClick={() => setAdding(false)}>Cancelar</button></div>
        </form>
      )}
      {partner && <div className="mt-5 border-t border-white/5 pt-4"><PersonIncome m={partner} items={hers} onEdit={() => {}} />
        {hers.length === 0 && <p className="text-[13px] text-mist-3">{partner.display_name} ainda não cadastrou a renda fixa.</p>}</div>}
      <RecurringSheet r={edit} onClose={() => setEdit(null)} />
    </Section>
  );
}

function PersonIncome({ m, items, you, onEdit }: { m: Member; items: Recurring[]; you?: boolean; onEdit: (r: Recurring) => void }) {
  return (
    <div className="mb-2">
      <div className="mb-2 flex items-center gap-2 text-sm"><Avatar m={m} size={22} /><span className="font-medium">{you ? 'Você' : m.display_name}</span>{!you && <span className="text-[12px] text-mist-3">· só {m.display_name.split(' ')[0]} edita</span>}</div>
      {items.map(r => (
        <button key={r.id} disabled={!you} onClick={() => onEdit(r)} className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-sm enabled:hover:bg-white/[.04]">
          <span>{r.description} <span className="text-[12px] text-mist-3">todo dia {r.day}</span></span><Money v={r.amount} className="font-semibold text-mint" />
        </button>
      ))}
    </div>
  );
}

function Couple() {
  const data = useStore(s => s.data), me = useStore(meOf)!, partner = useStore(partnerOf);
  const code = data.household?.invite_code ?? '';
  const link = `${location.origin}/?convite=${code}`;
  return (
    <Section title="Casal">
      {partner ? (
        <div className="flex items-center gap-3"><Avatar m={me} /><span className="text-mist-3">+</span><Avatar m={partner} /><span className="text-sm">{me.display_name} e {partner.display_name}</span></div>
      ) : (
        <>
          <p className="mb-3 text-sm text-mist-2">Mande o convite para quem divide as contas com você. A pessoa entra com a própria conta Google e cai direto no casal.</p>
          <div className="panel-quiet mb-3 flex items-center justify-between px-4 py-3"><span className="num text-2xl font-bold tracking-[.25em]">{code}</span>
            <button className="btn-ghost px-3 py-1.5 text-[13px]" onClick={async () => {
              const text = `Entra no nosso Finanças a Dois: ${link}`;
              if (navigator.share) await navigator.share({ text }).catch(() => {}); else { await navigator.clipboard.writeText(text); toast('Convite copiado'); }
            }}><Icon name="copy" size={15} />Enviar convite</button></div>
          <button className="text-[13px] text-mist-2 underline-offset-4 hover:underline" onClick={async () => { try { await backend.newInviteCode(); await reload(true); toast('Código novo gerado — o anterior não vale mais'); } catch (e) { toast((e as Error).message); } }}>Gerar outro código</button>
        </>
      )}
      <p className="label mt-4">Despesas do casal são divididas</p>
      <Seg label="Divisão" value={data.household?.split_mode ?? 'prop'} onChange={v => save('households', { id: data.household!.id, split_mode: v })} options={[['prop', 'Pela renda de cada um'], ['equal', 'Meio a meio']]} />
    </Section>
  );
}

function Categories() {
  const data = useStore(s => s.data);
  const [edit, setEdit] = useState<Category | 'new' | null>(null);
  const groups: [string, Category['kind']][] = [['Despesas', 'expense'], ['Renda', 'income'], ['Investimentos', 'investment']];
  return (
    <Section title="Categorias" action={<button className="text-[13px] font-medium text-me" onClick={() => setEdit('new')}>Nova</button>}>
      {groups.map(([label, kind]) => (
        <div key={kind} className="mb-3">
          <p className="mb-1.5 text-[12px] text-mist-3">{label}</p>
          <div className="flex flex-wrap gap-2">
            {data.categories.filter(c => c.kind === kind && !c.archived).sort((a, b) => a.sort - b.sort).map(c => (
              <button key={c.id} className="chip" onClick={() => setEdit(c)}><i className="h-2 w-2 rounded-full" style={{ background: catColor(c.color) }} />{c.name}</button>
            ))}
          </div>
        </div>
      ))}
      <CategorySheet c={edit} onClose={() => setEdit(null)} />
    </Section>
  );
}

function CategorySheet({ c, onClose }: { c: Category | 'new' | null; onClose: () => void }) {
  const x = c && c !== 'new' ? c : null;
  const [f, setF] = useState({ name: '', color: COLORS[0], kind: 'expense' as Category['kind'] });
  const [key, setKey] = useState<string | null>(null);
  const k = c === 'new' ? 'new' : x?.id ?? null;
  if (k !== key) { setKey(k); setF({ name: x?.name ?? '', color: x?.color ?? COLORS[2], kind: x?.kind ?? 'expense' }); }
  return (
    <Sheet open={!!c} onClose={onClose} title={x ? 'Editar categoria' : 'Nova categoria'}>
      <form className="space-y-4" onSubmit={e => {
        e.preventDefault();
        const d = getState().data;
        save('categories', { ...(x ?? { id: uuid(), household_id: d.household!.id, icon: 'box', budget: null, sort: 60 + d.categories.length, archived: false }), name: f.name.trim(), color: f.color, kind: f.kind } as unknown as Record<string, unknown>);
        toast('Categoria salva'); onClose();
      }}>
        <div><label className="label" htmlFor="ct-n">Nome</label><input id="ct-n" data-autofocus className="field" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></div>
        {!x && <Seg label="Tipo" value={f.kind} onChange={v => setF({ ...f, kind: v })} options={[['expense', 'Despesa'], ['income', 'Renda'], ['investment', 'Investimento']]} />}
        <div className="flex flex-wrap gap-2.5">{COLORS.concat(['#F472B6', '#FB7185', '#94A3B8']).map(col => <button type="button" key={col} onClick={() => setF({ ...f, color: col })} className="h-8 w-8 rounded-full" style={{ background: col, boxShadow: f.color === col ? `0 0 0 3px #0b1020, 0 0 0 5px ${col}` : 'none' }} aria-label={`Cor ${col}`} aria-pressed={f.color === col} />)}</div>
        <button className="btn-primary w-full">Salvar</button>
        {x && <button type="button" className="btn-ghost w-full text-coral" onClick={() => { save('categories', { ...x, archived: true } as unknown as Record<string, unknown>); toast(`${x.name} arquivada — os lançamentos antigos continuam com ela`); onClose(); }}>Arquivar categoria</button>}
      </form>
    </Sheet>
  );
}

function DataTools() {
  const data = useStore(s => s.data), me = useStore(meOf)!, partner = useStore(partnerOf);
  const [legacy, setLegacy] = useState<unknown>(null);
  const [p1, setP1] = useState<'me' | 'partner'>('me');
  const [busy, setBusy] = useState(false);
  const [stmt, setStmt] = useState(false);

  const exportCsv = () => {
    const cat = (id: string | null) => data.categories.find(c => c.id === id)?.name ?? '';
    const who = (id: string | null) => data.members.find(m => m.id === id)?.display_name ?? 'Conjunta';
    const rows = [['data', 'mes', 'descricao', 'valor', 'tipo', 'categoria', 'forma', 'cartao', 'quem_pagou', 'do_casal', 'pago', 'observacao']];
    [...data.transactions].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on)).forEach(t => rows.push([t.occurred_on, t.month.slice(0, 7), t.description, String(t.amount).replace('.', ','), t.kind, cat(t.category_id), t.method, data.cards.find(c => c.id === t.card_id)?.name ?? '', who(t.payer_id), t.shared ? 'sim' : 'não', t.paid ? 'sim' : 'não', t.notes]));
    download('financas-a-dois.csv', '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n'), 'text/csv');
  };

  async function runImport() {
    setBusy(true);
    try {
      const d = getState().data;
      const ids = { p1: p1 === 'me' ? me.id : partner?.id ?? me.id, p2: p1 === 'me' ? partner?.id ?? null : me.id };
      const r = convertLegacy(legacy, { householdId: d.household!.id, p1: ids.p1, p2: ids.p2, categories: d.categories, me: me.id });
      await backend.upsert('categories', r.newCategories as unknown as Record<string, unknown>[]);
      if (r.budgets.length) await backend.upsert('categories', r.budgets.map(b => ({ ...d.categories.concat(r.newCategories).find(c => c.id === b.id)!, budget: b.budget })) as unknown as Record<string, unknown>[]);
      await backend.upsert('cards', r.cards as unknown as Record<string, unknown>[]);
      await backend.upsert('wallets', r.wallets as unknown as Record<string, unknown>[]);
      await backend.upsert('goals', r.goals as unknown as Record<string, unknown>[]);
      await backend.upsert('recurring', r.recurring as unknown as Record<string, unknown>[]);
      const n = await backend.importTransactions(r.transactions as unknown as Record<string, unknown>[]);
      await backend.upsert('settlements', r.settlements as unknown as Record<string, unknown>[]);
      await reload(true);
      toast(`${n} lançamentos importados (${r.stats.salaries} salários de meses antigos)`);
      setLegacy(null);
    } catch (e) { toast('Não deu para importar: ' + (e as Error).message); }
    setBusy(false);
  }

  return (
    <Section title="Seus dados">
      <div className="space-y-2">
        <label className="btn-ghost w-full cursor-pointer justify-start"><Icon name="upload" size={16} />Importar backup do app antigo
          <input type="file" accept=".json,application/json" className="sr-only" onChange={async e => {
            const file = e.target.files?.[0]; e.target.value = '';
            if (!file) return;
            try { const j = JSON.parse(await file.text()); if (!Array.isArray(j.transactions)) throw new Error(); setLegacy(j); }
            catch { toast('Esse arquivo não é o backup JSON do app antigo.'); }
          }} /></label>
        <button className="btn-ghost w-full justify-start" onClick={() => setStmt(true)}><Icon name="upload" size={16} />Importar extrato do banco (OFX/CSV)</button>
        <button className="btn-ghost w-full justify-start" onClick={exportCsv}><Icon name="download" size={16} />Baixar planilha (CSV)</button>
        <button className="btn-ghost w-full justify-start" onClick={() => download('financas-a-dois-backup.json', JSON.stringify(data, null, 1), 'application/json')}><Icon name="download" size={16} />Baixar backup completo (JSON)</button>
        <button className="btn-ghost w-full justify-start text-coral" onClick={() => signOut()}><Icon name="logout" size={16} />{backend.kind === 'demo' ? 'Reiniciar demonstração' : 'Sair desta conta'}</button>
      </div>
      {backend.kind === 'demo' && <p className="mt-3 text-[12px] text-amber">Modo demonstração: os dados ficam só neste navegador. Configure o Supabase (veja o README) para usar de verdade.</p>}

      <StatementImport open={stmt} onClose={() => setStmt(false)} />
      <Sheet open={!!legacy} onClose={() => setLegacy(null)} title="Importar do app antigo">
        {legacy ? <LegacySummary old={legacy as Record<string, unknown>} /> : null}
        {!partner && <p className="panel-quiet mb-4 p-3 text-[13px] text-amber">Dica: importe depois que a outra pessoa entrar no casal — assim os lançamentos e a renda dela ficam no nome dela.</p>}
        <p className="label">No app antigo, a "Pessoa 1" era</p>
        <Seg label="Pessoa 1" value={p1} onChange={setP1} options={[['me', 'Eu'], ['partner', partner?.display_name ?? 'A outra pessoa']]} />
        <button className="btn-primary mt-5 w-full" disabled={busy} onClick={runImport}>{busy ? 'Importando…' : 'Importar tudo'}</button>
        <p className="mt-3 text-center text-[12px] text-mist-3">Nada do que já está aqui é apagado. Importar duas vezes duplica os lançamentos.</p>
      </Sheet>
    </Section>
  );
}

function LegacySummary({ old }: { old: Record<string, unknown> }) {
  const txs = (old.transactions as { amount: number }[]) || [];
  const months = new Set(txs.map(t => (t as unknown as { monthKey: string }).monthKey)).size;
  return (
    <div className="panel-quiet mb-4 grid grid-cols-3 gap-2 p-4 text-center">
      <div><p className="num text-xl font-bold">{txs.length}</p><p className="text-[12px] text-mist-3">lançamentos</p></div>
      <div><p className="num text-xl font-bold">{months}</p><p className="text-[12px] text-mist-3">meses</p></div>
      <div><p className="num text-xl font-bold">{((old.cards as unknown[]) || []).length}</p><p className="text-[12px] text-mist-3">cartões</p></div>
      <p className="col-span-3 mt-1 text-[12px] text-mist-3">Total lançado: {fmt(txs.reduce((s, t) => s + (Number(t.amount) || 0), 0))}</p>
    </div>
  );
}

function download(name: string, content: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
