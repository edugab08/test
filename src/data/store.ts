import { useSyncExternalStore } from 'react';
import type { Backend, Change } from './backend';
import { PermanentError, emptyData } from './backend';
import { DemoBackend } from './demo';
import { SupabaseBackend } from './supabase';
import type { Data, Member, TableName } from '../domain/types';
import { addMonths, thisMonth } from '../domain/dates';
import { applyTheme, initialTheme, type ThemeId } from '../ui/theme';

/* ---------- Backend escolhido pelas variáveis do Vercel ---------- */
const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const backend: Backend = URL_ && KEY_ ? new SupabaseBackend(URL_, KEY_) : new DemoBackend();

/* ---------- Estado global ---------- */
export type Phase = 'loading' | 'signed-out' | 'recovery' | 'onboarding' | 'ready' | 'error';
export interface Toast { id: number; text: string; action?: { label: string; run: () => void } }
interface State {
  phase: Phase;
  error: string | null;
  userId: string | null;
  data: Data;
  month: string;
  sync: 'ok' | 'saving' | 'offline' | 'error';
  pending: number;
  privacy: boolean;
  theme: ThemeId;
  toasts: Toast[];
}

const CACHE = 'fad_cache_v1', OUTBOX = 'fad_outbox_v1';
const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* cota cheia */ } };

type Op = { id: string; table: TableName; type: 'upsert' | 'delete'; rows: Record<string, unknown>[] };

let state: State = {
  phase: 'loading', error: null, userId: null, data: emptyData(), month: thisMonth(),
  sync: 'ok', pending: 0, privacy: read('fad_priv', false), theme: initialTheme(), toasts: []
};
let outbox: Op[] = read<Op[]>(OUTBOX, []);
const subs = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach(f => f()); };
export const getState = () => state;
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, () => sel(state));
}

/* ---------- Quem sou eu ---------- */
export const meOf = (s: State): Member | null => s.data.members.find(m => m.user_id === s.userId) ?? null;
export const partnerOf = (s: State): Member | null => s.data.members.find(m => m.user_id !== s.userId) ?? null;

/* ---------- Avisos ---------- */
let tid = 0;
export function toast(text: string, action?: Toast['action']) {
  if (state.toasts.some(x => x.text === text)) return;
  const t = { id: ++tid, text, action };
  set({ toasts: [...state.toasts.slice(-2), t] });
  setTimeout(() => set({ toasts: state.toasts.filter(x => x.id !== t.id) }), action ? 6500 : 3500);
}
export const dismissToast = (id: number) => set({ toasts: state.toasts.filter(x => x.id !== id) });

/* ---------- Mutação local imediata + fila de envio ---------- */
function applyLocal(table: TableName, type: 'upsert' | 'delete', rows: Record<string, unknown>[]) {
  const d = { ...state.data };
  if (table === 'households') { if (type === 'upsert' && d.household) d.household = { ...d.household, ...rows[0] } as Data['household']; set({ data: d }); return; }
  const key = table as keyof Data;
  let list = [...(d[key] as unknown as { id: string }[])];
  if (type === 'delete') { const ids = new Set(rows.map(r => r.id)); list = list.filter(x => !ids.has(x.id)); }
  else rows.forEach(r => { const i = list.findIndex(x => x.id === r.id); if (i >= 0) list[i] = { ...list[i], ...r }; else list.push(r as { id: string }); });
  (d as unknown as Record<string, unknown>)[key] = list;
  set({ data: d });
  write(CACHE, { userId: state.userId, data: d });
}

export function mutate(table: TableName, type: 'upsert' | 'delete', rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  applyLocal(table, type, rows);
  outbox.push({ id: Math.random().toString(36).slice(2), table, type, rows: type === 'delete' ? rows.map(r => ({ id: r.id })) : rows });
  write(OUTBOX, outbox);
  set({ pending: outbox.length });
  void flush();
}
export const save = (table: TableName, ...rows: Record<string, unknown>[]) => mutate(table, 'upsert', rows);
export const del = (table: TableName, ...rows: { id: string }[]) => mutate(table, 'delete', rows);

let flushing = false;
async function flush() {
  if (flushing || !outbox.length) return;
  flushing = true;
  set({ sync: 'saving' });
  try {
    while (outbox.length) {
      const op = outbox[0];
      try {
        if (op.type === 'upsert') await backend.upsert(op.table, op.rows);
        else await backend.remove(op.table, op.rows.map(r => String(r.id)));
      } catch (e) {
        if (e instanceof PermanentError) {
          toast('Não foi possível salvar: ' + translate(e.message));
          outbox.shift(); write(OUTBOX, outbox);
          await reload();
          continue;
        }
        set({ sync: navigator.onLine ? 'error' : 'offline' });
        return; // tenta de novo quando a internet voltar
      }
      outbox.shift(); write(OUTBOX, outbox); set({ pending: outbox.length });
    }
    set({ sync: 'ok', pending: 0 });
  } finally { flushing = false; }
}
const translate = (m: string) => /row-level security/i.test(m) ? 'só a própria pessoa pode alterar a renda dela.' : /Referência inválida/i.test(m) ? 'algo neste lançamento não pertence ao casal.' : /permission denied/i.test(m) ? 'sem permissão para essa alteração.' : m;

window.addEventListener('online', () => { set({ sync: 'saving' }); void flush().then(() => reload()); });
window.addEventListener('offline', () => set({ sync: 'offline' }));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.phase === 'ready') void flush().then(() => reload(true)); });

/* ---------- Tempo real: o que o outro celular gravou aparece na hora ---------- */
let unsub: (() => void) | null = null;
function onRemote(c: Change) {
  if (c.table === 'households') { if (c.type === 'upsert') set({ data: { ...state.data, household: { ...state.data.household!, ...(c.row as object) } } }); return; }
  const mine = outbox.some(op => op.rows.some(r => r.id === c.row.id));
  if (mine) return; // nossa própria alteração voltando; o estado local já está à frente
  const isNew = c.type === 'upsert' && c.table === 'transactions' && !state.data.transactions.some(t => t.id === c.row.id);
  applyLocal(c.table, c.type, [c.row]);
  if (isNew) {
    const t = c.row as { created_by?: string; description?: string; recurring_id?: string | null };
    const me = meOf(state);
    const who = state.data.members.find(m => m.id === t.created_by);
    if (me && who && who.id !== me.id && !t.recurring_id && t.description) toast(`${who.display_name} lançou ${t.description}`);
  }
}

/* ---------- Carregamento ---------- */
export async function reload(quiet = false) {
  try {
    if (!quiet && state.phase !== 'ready') set({ phase: 'loading' });
    const uid = await backend.userId();
    if (!uid) { unsub?.(); unsub = null; set({ phase: 'signed-out', userId: null, data: emptyData() }); return; }
    // mostra o cache na hora e atualiza por trás
    if (state.phase !== 'ready') {
      const c = read<{ userId: string; data: Data } | null>(CACHE, null);
      if (c && c.userId === uid && c.data.household) set({ userId: uid, data: c.data, phase: 'ready' });
    }
    let data = await backend.load();
    if (!data.household) { set({ phase: 'onboarding', userId: uid, data }); return; }
    // recorrências (salários, aluguel...) do mês atual e dos próximos 2
    const m0 = thisMonth();
    const created = await backend.ensureRecurring([m0, addMonths(m0, 1), addMonths(m0, 2)]).catch(() => 0);
    if (created) data = await backend.load();
    // reaplica o que ainda está na fila (feito offline) por cima do que veio do servidor
    for (const op of outbox) {
      const key = op.table as keyof Data;
      if (op.table === 'households') continue;
      let list = [...(data[key] as unknown as { id: string }[])];
      if (op.type === 'delete') { const ids = new Set(op.rows.map(r => r.id)); list = list.filter(x => !ids.has(x.id)); }
      else op.rows.forEach(r => { const i = list.findIndex(x => x.id === r.id); if (i >= 0) list[i] = { ...list[i], ...r }; else list.push(r as { id: string }); });
      (data as unknown as Record<string, unknown>)[key] = list;
    }
    set({ phase: 'ready', userId: uid, data, error: null });
    write(CACHE, { userId: uid, data });
    if (!unsub && data.household) unsub = backend.subscribe(data.household.id, onRemote);
    void flush();
  } catch (e) {
    if (state.phase === 'ready') { set({ sync: navigator.onLine ? 'error' : 'offline' }); return; }
    set({ phase: 'error', error: (e as Error).message });
  }
}

backend.onAuth(event => {
  // o link de "esqueci a senha" abre o app já logado: pede a senha nova antes de continuar
  if (event === 'PASSWORD_RECOVERY') { set({ phase: 'recovery' }); return; }
  if (state.phase !== 'recovery') void reload();
});

/** Depois de criar/alterar uma recorrência: gera os meses que faltam e recarrega. */
export async function refreshRecurring() {
  await flush();
  const m0 = thisMonth();
  const n = await backend.ensureRecurring([m0, addMonths(m0, 1), addMonths(m0, 2)]).catch(() => 0);
  if (n) await reload(true);
}

/* ---------- UI ---------- */
export const setMonth = (month: string) => set({ month });
export const setTheme = (theme: ThemeId) => { applyTheme(theme); set({ theme }); };
export const togglePrivacy = () => { write('fad_priv', !state.privacy); set({ privacy: !state.privacy }); };
export async function signOut() {
  unsub?.(); unsub = null;
  localStorage.removeItem(CACHE); localStorage.removeItem(OUTBOX); outbox = [];
  await backend.signOut();
  set({ phase: 'signed-out', data: emptyData(), userId: null });
}
