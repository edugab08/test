import { useEffect, useRef, type ReactNode } from 'react';
import { fmt, fmtShort } from '../domain/money';
import { addMonths, monthLabel } from '../domain/dates';
import { Icon } from './Icon';
import { dismissToast, getState, setMonth, useStore } from '../data/store';
import { memberColor } from './theme';
import type { Member } from '../domain/types';

export function Money({ v, className = '', sign = false }: { v: number; className?: string; sign?: boolean }) {
  const s = sign && v > 0 ? '+' : '';
  return <span className={`money num ${className}`}>{s}{fmt(v)}</span>;
}

export function Sheet({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 60);
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center md:p-6" onMouseDown={e => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={title}>
      <div ref={ref} className={`sheet panel safe-b max-h-[92dvh] w-full overflow-y-auto rounded-b-none p-5 md:rounded-b-[var(--radius)] ${wide ? 'md:max-w-2xl' : 'md:max-w-lg'}`} style={{ background: 'var(--sheet-bg)' }}>
        <div className="mx-auto -mt-2 mb-3 h-1 w-10 rounded-full bg-white/15 md:hidden" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button className="rounded-full p-2 text-mist-2 hover:bg-white/5 hover:text-mist-1" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function MonthSwitcher() {
  const month = useStore(s => s.month);
  return (
    <div className="flex items-center gap-1">
      <button className="rounded-full p-2 text-mist-2 hover:bg-white/5 hover:text-mist-1" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mês anterior"><Icon name="left" /></button>
      <span className="min-w-[9.5rem] text-center font-display text-[15px] font-semibold">{monthLabel(month)}</span>
      <button className="rounded-full p-2 text-mist-2 hover:bg-white/5 hover:text-mist-1" onClick={() => setMonth(addMonths(month, 1))} aria-label="Próximo mês"><Icon name="right" /></button>
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

export const Dot = ({ color, size = 8 }: { color: string; size?: number }) => <i className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color, boxShadow: `0 0 10px ${color}88` }} />;

export function Avatar({ m, size = 28 }: { m: Member | null | undefined; size?: number }) {
  const c = memberColor(m, getState().data.members);
  return <span className="inline-grid shrink-0 place-items-center rounded-full font-display font-semibold text-ink" style={{ width: size, height: size, background: c, fontSize: size * 0.42 }}>{(m?.display_name ?? '♥')[0].toUpperCase()}</span>;
}

/** Barra dividida por pessoa — a peça visual central do app. */
export function DuoBar({ parts, className = '' }: { parts: { value: number; color: string; label?: string }[]; className?: string }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  return (
    <div className={`duo-track ${className}`} role="img" aria-label={parts.map(p => `${p.label ?? ''} ${Math.round((p.value / total) * 100)}%`).join(', ')}>
      {parts.filter(p => p.value > 0).map((p, i) => <i key={i} style={{ flexGrow: p.value / total, background: p.color, boxShadow: `0 0 14px ${p.color}66` }} />)}
    </div>
  );
}

export function Donut({ items, size = 168, center }: { items: { value: number; color: string; label: string }[]; size?: number; center?: ReactNode }) {
  const total = items.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 12, C = 2 * Math.PI * r, gap = items.length > 1 ? 4 : 0;
  let acc = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--ov) / .08)" strokeWidth="14" />
        {total > 0 && items.map((it, i) => {
          const len = (it.value / total) * C, dash = Math.max(0, len - gap);
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={it.color} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc} style={{ transition: 'stroke-dasharray .7s' }}><title>{it.label}</title></circle>;
          acc += len; return el;
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{center}</div>
    </div>
  );
}

export function Bars({ data, highlight }: { data: { label: string; a: number; b: number; line: number }[]; highlight: number }) {
  const H = 150, W = 600, n = data.length, bw = W / n;
  const max = Math.max(1, ...data.flatMap(d => [d.a, d.b]));
  const lmin = Math.min(0, ...data.map(d => d.line)), lmax = Math.max(1, ...data.map(d => d.line));
  const ly = (v: number) => H - 8 - ((v - lmin) / (lmax - lmin || 1)) * (H - 24);
  const pts = data.map((d, i) => `${i * bw + bw / 2},${ly(d.line)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} className="h-auto w-full" role="img" aria-label="Renda e gastos por mês">
      {data.map((d, i) => {
        const x = i * bw, on = i === highlight, ha = (d.a / max) * (H - 10), hb = (d.b / max) * (H - 10);
        return (
          <g key={i} opacity={on ? 1 : 0.45}>
            <rect x={x + bw * 0.2} y={H - ha} width={bw * 0.27} height={ha} rx="4" fill="rgb(var(--c-mint))"><title>{`${d.label}: renda ${fmt(d.a)}`}</title></rect>
            <rect x={x + bw * 0.53} y={H - hb} width={bw * 0.27} height={hb} rx="4" fill="var(--her)"><title>{`${d.label}: saídas ${fmt(d.b)}`}</title></rect>
            <text x={x + bw / 2} y={H + 16} textAnchor="middle" fontSize="12" fill={on ? 'rgb(var(--c-mist1))' : 'rgb(var(--c-mist3))'} fontWeight={on ? 700 : 500}>{d.label}</text>
          </g>
        );
      })}
      <polyline points={pts} fill="none" stroke="var(--me)" strokeWidth="2.5" strokeLinejoin="round" />
      {data.map((d, i) => <circle key={i} cx={i * bw + bw / 2} cy={ly(d.line)} r={i === highlight ? 4.5 : 2.5} fill="var(--me)"><title>{`Saldo acumulado: ${fmt(d.line)}`}</title></circle>)}
      <text x={W - 2} y={10} textAnchor="end" fontSize="11" fill="rgb(var(--c-mist3))">até {fmtShort(max)}</text>
    </svg>
  );
}

export function Toasts() {
  const toasts = useStore(s => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className="sheet pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/10 bg-ink-3/95 px-4 py-3 text-sm shadow-2xl backdrop-blur">
          <span>{t.text}</span>
          {t.action && <button className="font-semibold text-me" onClick={() => { t.action!.run(); dismissToast(t.id); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-mist-2"><Icon name={icon} size={22} /></span>
      <p className="font-display font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-xs text-sm text-mist-2">{children}</div>}
    </div>
  );
}

export function Section({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-display text-[15px] font-semibold">{title}</h2>{action}</div>
      {children}
    </section>
  );
}
