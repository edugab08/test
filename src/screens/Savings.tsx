import { useMemo, useState } from 'react';
import type { Goal, Tx, Wallet } from '../domain/types';
import { goalStatus, savings, walletBalance } from '../domain/savings';
import { isRescue } from '../domain/metrics';
import { addMonths, monthLabel, monthShortLabel, thisMonth, today } from '../domain/dates';
import { fmt, fmtShort, parseAmount, round2 } from '../domain/money';
import { uuid } from '../domain/build';
import { del, getState, meOf, partnerOf, save, toast, useStore } from '../data/store';
import { DuoBar, Money, Section, Seg, Sheet } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { TxRow } from '../ui/TxRow';
import { memberColor } from '../ui/theme';

type Move = { mode: 'in' | 'out'; walletId?: string; goal?: Goal } | null;
const HELP_KEY = 'fad_help_saved';

export function Savings({ onOpen }: { onOpen: (t: Tx) => void }) {
  const data = useStore(s => s.data), month = useStore(s => s.month), me = useStore(meOf)!;
  const s = useMemo(() => savings(data, month), [data, month]);
  const [move, setMove] = useState<Move>(null);
  const [wallet, setWallet] = useState<Wallet | 'new' | null>(null);
  const [goal, setGoal] = useState<Goal | 'new' | null>(null);
  const [help, setHelp] = useState(() => { try { return localStorage.getItem(HELP_KEY) !== 'off'; } catch { return true; } });
  const closeHelp = () => { setHelp(false); try { localStorage.setItem(HELP_KEY, 'off'); } catch { /* ok */ } };
  const recent = data.transactions.filter(t => t.kind === 'investment' || isRescue(t)).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)).slice(0, 8);
  const noWallets = data.wallets.length === 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 [&>*]:min-w-0">
      {(help || noWallets) && (
        <section className="panel-quiet relative p-4 text-sm leading-relaxed lg:col-span-12">
          {!noWallets && <button className="absolute right-3 top-3 rounded-full p-1.5 text-mist-3 hover:text-mist-1" onClick={closeHelp} aria-label="Fechar explicação"><Icon name="x" size={16} /></button>}
          <p className="mb-2 font-display font-semibold">Como funciona o guardado</p>
          <ul className="space-y-1.5 text-mist-2">
            <li><b className="text-mist-1">Reserva</b> é cada lugar onde vocês guardam dinheiro: caixinha do Nubank, poupança, Tesouro, CDB.</li>
            <li><b className="text-mist-1">Guardar</b> é tirar dinheiro da conta do dia a dia e colocar numa reserva. Não é gasto: o dinheiro continua de vocês, só muda de lugar. Por isso sai da sobra do mês e aumenta o patrimônio.</li>
            <li><b className="text-mist-1">Resgatar</b> é o caminho inverso: trazer dinheiro da reserva de volta para a conta. Não conta como renda.</li>
            <li><b className="text-mist-1">Rendimento</b> é uma estimativa pela taxa que você informa (100% do CDI fica em torno de 14% ao ano). De vez em quando, atualize o saldo pelo app do banco.</li>
          </ul>
          {noWallets && <button className="btn-primary mt-4" onClick={() => setWallet('new')}><Icon name="plus" size={16} />Criar a primeira reserva</button>}
        </section>
      )}

      {/* Total guardado */}
      <section className="panel p-5 sm:p-6 lg:col-span-7">
        <p className="text-sm text-mist-2">Guardado pelo casal</p>
        <Money v={s.total} className="hero-num mt-2 block text-sky" />
        <div className="mt-6 grid grid-cols-3 gap-4 text-sm">
          <div className="min-w-0"><p className="mb-1 text-[12px] text-mist-3">Em {monthLabel(month).split(' ')[0].toLowerCase()}</p><Money v={s.savedThisMonth} sign className={`block truncate text-[15px] font-semibold ${s.savedThisMonth < 0 ? 'text-coral' : 'text-mint'}`} /></div>
          <div className="min-w-0"><p className="mb-1 text-[12px] text-mist-3">Rende por mês</p><Money v={s.yieldMonth} className="block truncate text-[15px] font-semibold" /></div>
          <div className="min-w-0"><p className="mb-1 text-[12px] text-mist-3">Média guardada</p><Money v={s.avgMonthly} className="block truncate text-[15px] font-semibold" /></div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button className="btn-primary" disabled={noWallets} onClick={() => setMove({ mode: 'in' })}><Icon name="plus" size={16} />Guardar</button>
          <button className="btn-ghost" disabled={noWallets || s.total <= 0} onClick={() => setMove({ mode: 'out' })}><Icon name="swap" size={16} />Resgatar</button>
        </div>
        {s.byPerson.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-[12px] text-mist-2">Quem guardou em {month.slice(0, 4)}</p>
            <DuoBar parts={s.byPerson.map(p => ({ value: Math.max(0, p.amount), color: p.member ? memberColor(p.member, data.members) : 'var(--duo)', label: p.member?.display_name ?? 'Conjunta' }))} />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-mist-2">
              {s.byPerson.map((p, i) => <span key={i} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: p.member ? memberColor(p.member, data.members) : 'var(--duo)' }} />{p.member ? (p.member.id === me.id ? 'Você' : p.member.display_name) : 'Conta conjunta'} <Money v={p.amount} className="text-mist-1" /></span>)}
            </div>
          </div>
        )}
      </section>

      {/* Projeção */}
      <Section title="Para onde vai" className="lg:col-span-5" action={<span className="text-[12px] text-mist-3">{s.rate.toFixed(1).replace('.', ',')}% a.a.</span>}>
        <Projection s={s} />
        <p className="mt-3 text-[13px] text-mist-2">
          {s.avgMonthly > 0
            ? <>Guardando <Money v={s.avgMonthly} className="text-mist-1" /> por mês, como nos últimos 3 meses, em um ano vocês terão cerca de <Money v={s.projection[11].total} className="font-semibold text-sky" />.</>
            : <>Só com o rendimento, em um ano o total vai para cerca de <Money v={s.projection[11].total} className="font-semibold text-sky" />. Guardar um pouco todo mês acelera bastante.</>}
        </p>
      </Section>

      {/* Reservas */}
      <Section title="Reservas" className="lg:col-span-7" action={<button className="text-[13px] font-medium text-me" onClick={() => setWallet('new')}>Nova reserva</button>}>
        {noWallets ? <p className="text-sm text-mist-2">Nenhuma reserva ainda.</p> : (
          <ul className="space-y-3">
            {s.wallets.map(({ wallet: w, balance, yieldMonth, share }) => (
              <li key={w.id} className="panel-quiet p-4">
                <button className="flex w-full items-center gap-2 text-left" onClick={() => setWallet(w)} aria-label={`Editar ${w.name}`}>
                  <Icon name="wallet" size={16} className="shrink-0 text-sky" />
                  <span className="min-w-0 flex-1 truncate font-medium">{w.name}</span>
                  <Icon name="edit" size={14} className="shrink-0 text-mist-3" />
                </button>
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <Money v={balance} className="text-xl font-semibold" />
                  <span className="text-[12px] text-mist-3">{String(w.rate).replace('.', ',')}% ao ano · rende ~{fmt(yieldMonth)}/mês</span>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-white/5"><div className="h-full rounded-full bg-sky transition-all duration-700" style={{ width: `${share * 100}%` }} /></div>
                <div className="mt-3.5 flex flex-wrap gap-2">
                  <button className="btn-ghost px-3 py-1.5 text-[13px]" onClick={() => setMove({ mode: 'in', walletId: w.id })}><Icon name="plus" size={14} />Guardar</button>
                  <button className="btn-ghost px-3 py-1.5 text-[13px]" disabled={balance <= 0} onClick={() => setMove({ mode: 'out', walletId: w.id })}><Icon name="swap" size={14} />Resgatar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Metas */}
      <Section title="Metas" className="lg:col-span-5" action={<button className="text-[13px] font-medium text-me" onClick={() => setGoal('new')}>Nova meta</button>}>
        {data.goals.length === 0 && <p className="text-sm text-mist-2">Crie uma meta (viagem, entrada do apê, carro) para ver quanto guardar por mês e quando vocês chegam lá.</p>}
        <ul className="space-y-4">
          {data.goals.map(g => {
            const st = goalStatus(g, data, month, s);
            const behind = st.perMonth !== null && st.pace < st.perMonth && !st.reached;
            return (
              <li key={g.id}>
                <button className="w-full text-left" onClick={() => setGoal(g)}>
                  <div className="flex items-baseline justify-between gap-2"><span className="font-medium">{g.name}</span><span className="num text-sm text-mist-2">{Math.round(st.pct)}%</span></div>
                  <div className="mt-1.5 h-2 rounded-full bg-white/5"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${st.pct}%`, background: st.reached ? 'rgb(var(--c-mint))' : 'linear-gradient(90deg, rgb(var(--c-sky)), var(--duo))' }} /></div>
                </button>
                <p className="mt-2 text-[12px] leading-relaxed text-mist-3">
                  {st.reached ? <span className="text-mint">Meta atingida. Parabéns aos dois!</span> : <>
                    <Money v={st.current} className="text-mist-2" /> de <Money v={g.target} className="text-mist-2" /> · faltam <Money v={st.missing} className="text-mist-2" />
                    {st.perMonth !== null && <><br />Para chegar até {monthLabel(g.deadline!).toLowerCase()}: guardar <Money v={st.perMonth} className={behind ? 'text-amber' : 'text-mist-1'} /> por mês.</>}
                    <br />{st.eta ? <>No ritmo atual, vocês chegam em <b className="text-mist-1">{monthLabel(st.eta).toLowerCase()}</b>.</> : <>No ritmo atual, ainda não dá para prever quando chega.</>}
                  </>}
                </p>
                {!st.reached && <button className="mt-2 text-[13px] font-medium text-me" onClick={() => setMove({ mode: 'in', walletId: g.wallet_id ?? undefined, goal: g })}>+ Guardar para esta meta</button>}
              </li>
            );
          })}
        </ul>
      </Section>

      {recent.length > 0 && (
        <Section title="Últimas movimentações" className="lg:col-span-12">
          <ul className="-mx-2">{recent.map(t => <TxRow key={t.id} t={t} data={data} onOpen={onOpen} meId={me.id} />)}</ul>
        </Section>
      )}

      <MoveSheet move={move} onClose={() => setMove(null)} />
      <WalletSheet w={wallet} onClose={() => setWallet(null)} />
      <GoalSheet g={goal} onClose={() => setGoal(null)} />
    </div>
  );
}

function Projection({ s }: { s: ReturnType<typeof savings> }) {
  const pts = [...s.history.map(h => ({ ...h, past: true })), ...s.projection.map(p => ({ ...p, past: false }))];
  const W = 320, H = 130, max = Math.max(1, ...pts.map(p => p.total)), min = Math.min(0, ...pts.map(p => p.total));
  const x = (i: number) => (i / (pts.length - 1)) * (W - 8) + 4;
  const y = (v: number) => H - 6 - ((v - min) / (max - min || 1)) * (H - 22);
  const nowI = s.history.length - 1;
  const line = (from: number, to: number) => pts.slice(from, to + 1).map((p, i) => `${i ? 'L' : 'M'}${x(from + i)},${y(p.total)}`).join(' ');
  const area = `${line(0, nowI)} L${x(nowI)},${H} L${x(0)},${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="h-auto w-full" role="img" aria-label={`Guardado hoje ${fmt(s.total)}, projeção em 12 meses ${fmt(s.projection[11].total)}`}>
      <defs><linearGradient id="sv-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="rgb(var(--c-sky))" stopOpacity=".35" /><stop offset="1" stopColor="rgb(var(--c-sky))" stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill="url(#sv-fill)" />
      <path d={line(0, nowI)} fill="none" stroke="rgb(var(--c-sky))" strokeWidth="2.5" strokeLinejoin="round" />
      <path d={line(nowI, pts.length - 1)} fill="none" stroke="var(--duo)" strokeWidth="2.5" strokeDasharray="5 5" strokeLinejoin="round" />
      <circle cx={x(nowI)} cy={y(s.total)} r="4.5" fill="rgb(var(--c-sky))" />
      <text x={x(nowI)} y={y(s.total) - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill="rgb(var(--c-mist1))">hoje</text>
      <text x={W - 4} y={y(s.projection[11].total) - 8} textAnchor="end" fontSize="11" fontWeight="700" fill="rgb(var(--c-mist1))">{fmtShort(s.projection[11].total)}</text>
      <text x={4} y={H + 14} fontSize="10" fill="rgb(var(--c-mist3))">{monthShortLabel(pts[0].month)}</text>
      <text x={W - 4} y={H + 14} fontSize="10" textAnchor="end" fill="rgb(var(--c-mist3))">{monthShortLabel(pts[pts.length - 1].month)}</text>
    </svg>
  );
}

/** Guardar ou resgatar: vira um lançamento ligado à reserva, para a sobra do mês continuar batendo com a conta. */
function MoveSheet({ move, onClose }: { move: Move; onClose: () => void }) {
  const data = useStore(s => s.data), me = useStore(meOf)!, partner = useStore(partnerOf);
  const [f, setF] = useState({ amount: '', wallet: '', who: 'me' as 'me' | 'partner' | 'joint', date: today() });
  const [key, setKey] = useState<string | null>(null);
  const k = move ? `${move.mode}-${move.walletId ?? ''}-${move.goal?.id ?? ''}` : null;
  if (k !== key) { setKey(k); setF({ amount: '', wallet: move?.walletId ?? data.wallets[0]?.id ?? '', who: 'me', date: today() }); }
  if (!move) return null;
  const out = move.mode === 'out';
  const w = data.wallets.find(x => x.id === f.wallet);
  const bal = w ? walletBalance(w, data.transactions) : 0;
  const amount = parseAmount(f.amount);
  const tooMuch = out && !!amount && amount > bal;
  const pName = partner?.display_name.split(' ')[0];
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !w) return;
    const H = getState().data.household!.id, inv = data.categories.find(c => c.kind === 'investment');
    const payer_id = f.who === 'joint' ? null : f.who === 'partner' && !out ? partner?.id ?? me.id : me.id;
    const tx: Tx = {
      id: uuid(), household_id: H, description: out ? `Resgate · ${w.name}` : move.goal ? `Guardado · ${move.goal.name}` : `Guardado · ${w.name}`, notes: '',
      amount: round2(amount), kind: out ? 'income' : 'investment', nature: null, category_id: inv?.id ?? null, method: 'pix', card_id: null, wallet_id: w.id,
      occurred_on: f.date, month: f.date.slice(0, 8) + '01', paid: true, payer_id, shared: !out && f.who === 'joint',
      installment_group: null, installment_no: null, installment_total: null, recurring_id: null, created_by: me.id
    };
    save('transactions', tx as unknown as Record<string, unknown>);
    toast(out ? `${fmt(amount)} resgatados de ${w.name}` : `${fmt(amount)} guardados em ${w.name}`, { label: 'Desfazer', run: () => del('transactions', tx) });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={out ? 'Resgatar' : move.goal ? `Guardar para ${move.goal.name}` : 'Guardar'}>
      <form className="space-y-4" onSubmit={submit}>
        <p className="text-[13px] text-mist-2">{out ? 'Dinheiro que sai da reserva e volta para a conta. Não conta como renda.' : 'Dinheiro que sai da conta e vai para a reserva. Não conta como gasto: só muda de lugar.'}</p>
        <div><label className="label" htmlFor="mv-a">Valor</label><input id="mv-a" data-autofocus className="field num text-2xl font-semibold" inputMode="decimal" placeholder="0,00" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} required />
          {tooMuch && <p className="mt-1.5 text-[12px] text-amber">A reserva tem {fmt(bal)}. Confira o valor.</p>}</div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="mv-w">{out ? 'De qual reserva' : 'Para qual reserva'}</label>
            <select id="mv-w" className="field" value={f.wallet} onChange={e => setF({ ...f, wallet: e.target.value })}>{data.wallets.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
          <div><label className="label" htmlFor="mv-d">Data</label><input id="mv-d" type="date" className="field" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></div>
        </div>
        <div><span className="label">{out ? 'Volta para' : 'Saiu do dinheiro de'}</span>
          <Seg label="De quem" value={f.who} onChange={v => setF({ ...f, who: v })} options={out ? [['me', 'Minha conta'], ['joint', 'Conta conjunta']] : [['me', 'Eu'], ...(partner ? [['partner', pName!] as ['partner', string]] : []), ['joint', 'Conjunta']]} /></div>
        <button className="btn-primary w-full py-3" disabled={!amount || !w}>{out ? `Resgatar${amount ? ' ' + fmt(amount) : ''}` : `Guardar${amount ? ' ' + fmt(amount) : ''}`}</button>
      </form>
    </Sheet>
  );
}

function WalletSheet({ w, onClose }: { w: Wallet | 'new' | null; onClose: () => void }) {
  const data = useStore(s => s.data);
  const x = w && w !== 'new' ? w : null;
  const [f, setF] = useState({ name: '', bal: '', rate: '' });
  const [key, setKey] = useState<string | null>(null);
  const k = w === 'new' ? 'new' : x?.id ?? null;
  const cur = x ? walletBalance(x, data.transactions) : 0;
  if (k !== key) { setKey(k); setF({ name: x?.name ?? '', bal: x ? String(cur).replace('.', ',') : '', rate: x ? String(x.rate).replace('.', ',') : '' }); }
  return (
    <Sheet open={!!w} onClose={onClose} title={x ? x.name : 'Nova reserva'}>
      <form className="space-y-4" onSubmit={e => {
        e.preventDefault();
        const bal = parseAmount(f.bal) ?? 0, moved = x ? round2(cur - x.base_balance) : 0;
        // o saldo informado vira o novo ponto de partida; o que já foi guardado/resgatado continua no histórico
        save('wallets', { id: x?.id ?? uuid(), household_id: getState().data.household!.id, name: f.name.trim(), base_balance: round2(bal - moved), rate: parseAmount(f.rate) ?? 0 });
        toast(x ? 'Reserva atualizada' : 'Reserva criada'); onClose();
      }}>
        <div><label className="label" htmlFor="w-n">Nome</label><input id="w-n" data-autofocus className="field" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Caixinha Nubank, Tesouro Selic…" required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="w-b">Saldo hoje</label><input id="w-b" className="field num" inputMode="decimal" value={f.bal} onChange={e => setF({ ...f, bal: e.target.value })} placeholder="0,00" /></div>
          <div><label className="label" htmlFor="w-r">Rende % ao ano</label><input id="w-r" className="field num" inputMode="decimal" value={f.rate} onChange={e => setF({ ...f, rate: e.target.value })} placeholder="ex.: 14" /></div>
        </div>
        <p className="text-[12px] text-mist-3">{x ? 'Rendeu? Coloque o saldo que aparece no app do banco e o app ajusta sem mexer no histórico.' : 'Coloque quanto já tem guardado lá hoje. Daqui pra frente, use Guardar e Resgatar.'}</p>
        <button className="btn-primary w-full">{x ? 'Salvar' : 'Criar reserva'}</button>
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
  if (k !== key) { setKey(k); setF({ name: x?.name ?? '', target: x ? String(x.target).replace('.', ',') : '', deadline: (x?.deadline ?? addMonths(thisMonth(), 12)).slice(0, 7), wallet: x?.wallet_id ?? data.wallets[0]?.id ?? '' }); }
  return (
    <Sheet open={!!g} onClose={onClose} title={x ? x.name : 'Nova meta'}>
      <form className="space-y-4" onSubmit={e => {
        e.preventDefault();
        save('goals', { id: x?.id ?? uuid(), household_id: getState().data.household!.id, name: f.name.trim(), target: parseAmount(f.target) ?? 0, deadline: f.deadline ? f.deadline + '-01' : null, wallet_id: f.wallet || null });
        toast('Meta salva'); onClose();
      }}>
        <div><label className="label" htmlFor="g-n">Meta</label><input id="g-n" data-autofocus className="field" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Viagem de fim de ano" required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="g-t">Quanto</label><input id="g-t" className="field num" inputMode="decimal" value={f.target} onChange={e => setF({ ...f, target: e.target.value })} required /></div>
          <div><label className="label" htmlFor="g-d">Até quando</label><input id="g-d" className="field" type="month" value={f.deadline} onChange={e => setF({ ...f, deadline: e.target.value })} /></div>
        </div>
        <div><label className="label" htmlFor="g-w">Dinheiro da meta fica em</label>
          <select id="g-w" className="field" value={f.wallet} onChange={e => setF({ ...f, wallet: e.target.value })}><option value="">Tudo que o casal guardou</option>{data.wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
        <button className="btn-primary w-full">Salvar meta</button>
        {x && <button type="button" className="btn-ghost w-full text-coral" onClick={() => { del('goals', x); toast('Meta removida', { label: 'Desfazer', run: () => save('goals', x as unknown as Record<string, unknown>) }); onClose(); }}><Icon name="trash" size={16} />Remover meta</button>}
      </form>
    </Sheet>
  );
}
