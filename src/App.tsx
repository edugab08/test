import { useEffect, useState } from 'react';
import type { Tx } from './domain/types';
import { backend, meOf, partnerOf, reload, togglePrivacy, useStore } from './data/store';
import { Avatar, MonthSwitcher, Sheet, Toasts } from './ui/kit';
import { Icon } from './ui/Icon';
import { TxForm } from './ui/TxForm';
import { Home } from './screens/Home';
import { Transactions } from './screens/Transactions';
import { Cards } from './screens/Cards';
import { Plan } from './screens/Plan';
import { Settings } from './screens/Settings';
import { Loading, NewPassword, Onboarding, SignIn } from './screens/Welcome';
import { memberColor } from './ui/theme';

const VIEWS = [
  { id: 'home', label: 'Início', icon: 'home' },
  { id: 'tx', label: 'Lançamentos', icon: 'list' },
  { id: 'cards', label: 'Cartões', icon: 'card' },
  { id: 'plan', label: 'Planejar', icon: 'target' },
  { id: 'settings', label: 'Ajustes', icon: 'settings' }
] as const;
type View = (typeof VIEWS)[number]['id'];

export default function App() {
  const phase = useStore(s => s.phase), error = useStore(s => s.error);
  useEffect(() => { void reload(); }, []);
  if (phase === 'loading') return <Loading />;
  if (phase === 'error') return <Loading error={error} />;
  if (phase === 'signed-out') return <SignIn />;
  if (phase === 'recovery') return <NewPassword />;
  if (phase === 'onboarding') return <Onboarding />;
  return <Shell />;
}

function Shell() {
  const me = useStore(meOf), partner = useStore(partnerOf), privacy = useStore(s => s.privacy);
  const theme = useStore(s => s.theme), members = useStore(s => s.data.members);
  const [view, setView] = useState<View>(() => (location.hash.slice(1) as View) || 'home');
  const [form, setForm] = useState<{ tx?: Tx } | null>(null);

  useEffect(() => { history.replaceState(null, '', view === 'home' ? location.pathname : '#' + view); window.scrollTo({ top: 0 }); }, [view]);
  useEffect(() => {
    const h = () => { const v = location.hash.slice(1) as View; if (VIEWS.some(x => x.id === v)) setView(v); else if (!location.hash) setView('home'); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  useEffect(() => {
    const r = document.documentElement.style;
    if (me) r.setProperty('--me', memberColor(me, members));
    r.setProperty('--her', partner ? memberColor(partner, members) : me?.color === '#FF7AB6' ? '#3DD9EB' : '#FF7AB6');
  }, [me, partner, members, theme]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (form || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.metaKey || e.ctrlKey) return;
      if (e.key === 'n' || e.key === '+') { e.preventDefault(); setForm({}); }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [form]);

  if (!me) return <Loading error="Sua conta não está ligada a nenhum casal." />;
  const open = (tx: Tx) => setForm({ tx });
  const title = VIEWS.find(v => v.id === view)!.label;

  return (
    <div className={privacy ? 'privacy' : ''}>
      {/* Lateral (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/5 bg-ink/40 p-5 backdrop-blur-xl lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <span className="flex -space-x-2"><span className="h-6 w-6 rounded-full bg-me" /><span className="h-6 w-6 rounded-full bg-her mix-blend-screen" /></span>
          <span className="font-display text-[17px] font-bold">Finanças a Dois</span>
        </div>
        <button className="btn-primary mb-6 w-full py-3" onClick={() => setForm({})}><Icon name="plus" size={18} />Lançar <kbd className="ml-auto rounded bg-black/20 px-1.5 text-[11px]">N</kbd></button>
        <nav className="space-y-1" aria-label="Seções">
          {VIEWS.map(v => (
            <button key={v.id} onClick={() => setView(v.id)} aria-current={view === v.id ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${view === v.id ? 'bg-white/[.08] text-mist-1' : 'text-mist-2 hover:bg-white/[.04] hover:text-mist-1'}`}>
              <Icon name={v.icon} size={18} />{v.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <SyncBadge />
          <div className="flex items-center gap-2 px-2 text-sm"><Avatar m={me} size={26} />{partner && <Avatar m={partner} size={26} />}<span className="truncate text-mist-2">{me.display_name}{partner ? ` & ${partner.display_name}` : ''}</span></div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-white/5 bg-ink/60 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2 sm:px-6">
            <h1 className="hidden font-display text-lg font-semibold sm:block lg:w-40">{title}</h1>
            <MonthSwitcher />
            <div className="flex items-center gap-1 lg:w-40 lg:justify-end">
              <span className="lg:hidden"><SyncBadge compact /></span>
              <button className="rounded-full p-2 text-mist-2 hover:bg-white/5 hover:text-mist-1" onClick={togglePrivacy} aria-label={privacy ? 'Mostrar valores' : 'Esconder valores'} aria-pressed={privacy}><Icon name={privacy ? 'eyeoff' : 'eye'} /></button>
              <button className="rounded-full p-1 lg:hidden" onClick={() => setView('settings')} aria-label="Ajustes"><Avatar m={me} size={30} /></button>
            </div>
          </div>
        </header>

        <main key={view + theme} className="view-enter mx-auto max-w-6xl px-3 pb-32 pt-4 sm:px-6 lg:pb-12">
          {backend.kind === 'demo' && view === 'home' && <p className="mb-3 rounded-xl border border-amber/20 bg-amber/[.06] px-4 py-2.5 text-[13px] text-amber">Modo demonstração com dados de exemplo. Configure o Supabase para usar com seus dados.</p>}
          {view === 'home' && <Home onOpen={open} go={v => setView(v as View)} />}
          {view === 'tx' && <Transactions onOpen={open} />}
          {view === 'cards' && <Cards onOpen={open} />}
          {view === 'plan' && <Plan />}
          {view === 'settings' && <Settings />}
        </main>
      </div>

      {/* Doca (celular) */}
      <nav className="safe-b fixed inset-x-0 bottom-0 z-30 border-t border-white/5 bg-ink/80 px-2 pt-1.5 backdrop-blur-xl lg:hidden" aria-label="Seções">
        <div className="mx-auto grid max-w-md grid-cols-5 items-end">
          {VIEWS.slice(0, 2).map(v => <DockBtn key={v.id} v={v} on={view === v.id} go={() => setView(v.id)} />)}
          <div className="flex justify-center">
            <button className="btn-primary -mt-6 grid h-14 w-14 place-items-center !p-0 !rounded-2xl"  onClick={() => setForm({})} aria-label="Novo lançamento"><Icon name="plus" size={26} stroke={2.4} /></button>
          </div>
          {VIEWS.slice(2, 4).map(v => <DockBtn key={v.id} v={v} on={view === v.id} go={() => setView(v.id)} />)}
        </div>
      </nav>

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.tx ? 'Editar lançamento' : 'Novo lançamento'}>
        {form && <TxForm key={form.tx?.id ?? 'new'} tx={form.tx} onDone={() => setForm(null)} />}
      </Sheet>
      <Toasts />
    </div>
  );
}

function DockBtn({ v, on, go }: { v: (typeof VIEWS)[number]; on: boolean; go: () => void }) {
  return (
    <button onClick={go} aria-current={on ? 'page' : undefined} className={`flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium transition ${on ? 'text-mist-1' : 'text-mist-3'}`}>
      <span className={`grid h-8 w-12 place-items-center rounded-full transition ${on ? 'bg-white/10' : ''}`}><Icon name={v.icon} size={20} /></span>{v.label}
    </button>
  );
}

function SyncBadge({ compact = false }: { compact?: boolean }) {
  const sync = useStore(s => s.sync), pending = useStore(s => s.pending);
  const map = {
    ok: { c: 'bg-mint', t: 'Tudo salvo', i: 'cloud' },
    saving: { c: 'bg-me animate-pulse', t: 'Salvando…', i: 'cloud' },
    offline: { c: 'bg-amber', t: `Sem internet${pending ? ` · ${pending} para enviar` : ''}`, i: 'cloudoff' },
    error: { c: 'bg-coral', t: `Não salvou ainda${pending ? ` · ${pending} na fila` : ''}`, i: 'cloudoff' }
  }[sync];
  if (compact) return sync === 'ok' ? null : <span className="flex items-center gap-1.5 px-1 text-[11px] text-mist-2" role="status"><i className={`h-2 w-2 rounded-full ${map.c}`} />{sync === 'saving' ? '' : map.t.split(' ·')[0]}</span>;
  return <p className="flex items-center gap-2 px-2 text-[12px] text-mist-2" role="status"><i className={`h-2 w-2 rounded-full ${map.c}`} />{map.t}</p>;
}
