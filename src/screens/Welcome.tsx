import { useState } from 'react';
import { backend, reload } from '../data/store';
import { Icon } from '../ui/Icon';
import { COLORS } from './Settings';

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center p-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex w-fit -space-x-3" aria-hidden="true">
            <span className="h-12 w-12 rounded-full bg-me/90 shadow-[0_0_40px_var(--me)]" />
            <span className="h-12 w-12 rounded-full bg-her/90 mix-blend-screen shadow-[0_0_40px_var(--her)]" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Finanças a Dois</h1>
          <p className="mt-2 text-mist-2">Cada um com a sua conta. As contas do casal, juntas.</p>
        </div>
        <div className="panel p-5">{children}</div>
      </div>
    </div>
  );
}

export function SignIn() {
  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>(new URLSearchParams(location.search).get('convite') ? 'up' : 'in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      if (mode === 'in') { await backend.signIn(email.trim(), pw); await reload(); }
      else if (mode === 'up') {
        if (pw.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
        const confirm = await backend.signUp(email.trim(), pw);
        if (confirm) setMsg({ ok: true, text: `Enviamos um link de confirmação para ${email.trim()}. Abra o e-mail, confirme e volte aqui para entrar.` });
        else await reload();
      } else {
        await backend.sendPasswordReset(email.trim());
        setMsg({ ok: true, text: `Se ${email.trim()} tiver conta, chega um link para criar uma senha nova.` });
      }
    } catch (x) { setMsg({ ok: false, text: (x as Error).message }); }
    setBusy(false);
  };
  return (
    <Frame>
      {mode !== 'forgot' && (
        <div className="seg mb-5" role="group" aria-label="Entrar ou criar conta">
          <button type="button" aria-pressed={mode === 'in'} onClick={() => { setMode('in'); setMsg(null); }}>Entrar</button>
          <button type="button" aria-pressed={mode === 'up'} onClick={() => { setMode('up'); setMsg(null); }}>Criar conta</button>
        </div>
      )}
      {mode === 'forgot' && <p className="mb-4 text-sm text-mist-2">Digite seu e-mail. Mandamos um link para você criar uma senha nova.</p>}
      <form className="space-y-4" onSubmit={submit}>
        <div><label className="label" htmlFor="au-email">E-mail</label>
          <input id="au-email" className="field" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@email.com" /></div>
        {mode !== 'forgot' && (
          <div><label className="label" htmlFor="au-pw">{mode === 'up' ? 'Crie uma senha' : 'Senha'}</label>
            <div className="relative">
              <input id="au-pw" className="field pr-12" type={show ? 'text' : 'password'} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required minLength={mode === 'up' ? 8 : undefined} value={pw} onChange={e => setPw(e.target.value)} />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-mist-3 hover:text-mist-1" onClick={() => setShow(!show)} aria-label={show ? 'Esconder senha' : 'Mostrar senha'}><Icon name={show ? 'eyeoff' : 'eye'} size={17} /></button>
            </div>
            {mode === 'up' && <p className="mt-1.5 text-[12px] text-mist-3">Pelo menos 8 caracteres. Cada pessoa do casal cria a própria conta.</p>}
          </div>
        )}
        <button className="btn-primary w-full py-3 text-[15px]" disabled={busy}>{busy ? 'Um instante…' : mode === 'in' ? 'Entrar' : mode === 'up' ? 'Criar minha conta' : 'Enviar link'}</button>
      </form>
      {msg && <p className={`mt-4 text-sm ${msg.ok ? 'text-mint' : 'text-coral'}`} role="status">{msg.text}</p>}
      <div className="mt-4 text-center text-[13px]">
        {mode === 'in' && <button className="text-mist-2 underline-offset-4 hover:underline" onClick={() => { setMode('forgot'); setMsg(null); }}>Esqueci minha senha</button>}
        {mode === 'forgot' && <button className="text-mist-2 underline-offset-4 hover:underline" onClick={() => { setMode('in'); setMsg(null); }}>Voltar para entrar</button>}
      </div>
    </Frame>
  );
}

export function NewPassword() {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <Frame>
      <form className="space-y-4" onSubmit={async e => {
        e.preventDefault(); setErr('');
        if (pw.length < 8) return setErr('A senha precisa ter pelo menos 8 caracteres.');
        setBusy(true);
        try { await backend.updatePassword(pw); await reload(); } catch (x) { setErr((x as Error).message); setBusy(false); }
      }}>
        <div><label className="label" htmlFor="np">Sua senha nova</label><input id="np" className="field" type="password" autoComplete="new-password" autoFocus value={pw} onChange={e => setPw(e.target.value)} /></div>
        <button className="btn-primary w-full py-3" disabled={busy}>{busy ? 'Salvando…' : 'Salvar senha e entrar'}</button>
        {err && <p className="text-sm text-coral">{err}</p>}
      </form>
    </Frame>
  );
}

export function Onboarding() {
  const invite = new URLSearchParams(location.search).get('convite') ?? '';
  const [mode, setMode] = useState<'create' | 'join'>(invite ? 'join' : 'create');
  const [name, setName] = useState('');
  const [code, setCode] = useState(invite);
  const [color, setColor] = useState(invite ? COLORS[1] : COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      if (mode === 'create') await backend.createHousehold(name.trim(), color);
      else await backend.joinHousehold(code.trim(), name.trim(), color);
      history.replaceState(null, '', '/');
      await reload();
    } catch (x) { setErr((x as Error).message); setBusy(false); }
  };
  return (
    <Frame>
      <div className="seg mb-5" role="group" aria-label="Como começar">
        <button type="button" aria-pressed={mode === 'create'} onClick={() => setMode('create')}>Começar um casal</button>
        <button type="button" aria-pressed={mode === 'join'} onClick={() => setMode('join')}>Tenho um convite</button>
      </div>
      <form className="space-y-4" onSubmit={go}>
        {mode === 'join' && <div><label className="label" htmlFor="ob-code">Código do convite</label><input id="ob-code" className="field num text-center text-xl tracking-[.3em] uppercase" maxLength={8} value={code} onChange={e => setCode(e.target.value)} required /></div>}
        <div><label className="label" htmlFor="ob-name">Como você quer ser chamado(a)</label><input id="ob-name" className="field" value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" required autoFocus /></div>
        <div><span className="label">Sua cor</span>
          <div className="flex flex-wrap gap-2.5">{COLORS.map(c => <button type="button" key={c} onClick={() => setColor(c)} className="h-9 w-9 rounded-full" style={{ background: c, boxShadow: color === c ? `0 0 0 3px #0b1020, 0 0 0 5px ${c}` : 'none' }} aria-label={`Cor ${c}`} aria-pressed={color === c} />)}</div></div>
        <button className="btn-primary w-full py-3" disabled={busy}>{busy ? 'Um instante…' : mode === 'create' ? 'Criar e convidar depois' : 'Entrar no casal'}</button>
        {err && <p className="text-sm text-coral">{err}</p>}
      </form>
    </Frame>
  );
}

export function Loading({ error }: { error?: string | null }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      {error ? <div className="max-w-sm"><p className="font-display text-lg font-semibold">Não foi possível carregar</p><p className="mt-2 text-sm text-mist-2">{error}</p><button className="btn-primary mt-5" onClick={() => reload()}>Tentar de novo</button></div>
        : <div className="flex -space-x-2" aria-label="Carregando"><span className="h-4 w-4 animate-pulse rounded-full bg-me" /><span className="h-4 w-4 animate-pulse rounded-full bg-her [animation-delay:.2s]" /></div>}
    </div>
  );
}
