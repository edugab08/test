import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Backend, Change } from './backend';
import { PermanentError, emptyData, normalizeRow } from './backend';
import type { Data, TableName } from '../domain/types';

const TABLES: TableName[] = ['categories', 'cards', 'wallets', 'goals', 'recurring', 'transactions', 'settlements'];

export class SupabaseBackend implements Backend {
  readonly kind = 'supabase' as const;
  private sb: SupabaseClient;
  constructor(url: string, key: string) {
    this.sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }

  async userId() { const { data } = await this.sb.auth.getSession(); return data.session?.user.id ?? null; }
  async signIn(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(authMsg(error.message));
  }
  async signUp(email: string, password: string) {
    const { data, error } = await this.sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.search } });
    if (error) throw new Error(authMsg(error.message));
    return !data.session;
  }
  async sendPasswordReset(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
    if (error) throw new Error(authMsg(error.message));
  }
  async updatePassword(password: string) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw new Error(authMsg(error.message));
  }
  async signOut() { await this.sb.auth.signOut(); }
  onAuth(cb: (event: string) => void) { const { data } = this.sb.auth.onAuthStateChange(e => cb(e)); return () => data.subscription.unsubscribe(); }

  private fail(error: { message: string; code?: string } | null) {
    if (!error) return;
    // 42501 = bloqueado pela regra de segurança; 23xxx = dado inválido; PGRST = requisição recusada
    if (error.code && (error.code === '42501' || error.code.startsWith('23') || error.code.startsWith('22') || error.code.startsWith('PGRST'))) throw new PermanentError(error.message);
    throw new Error(error.message);
  }

  private async all(table: TableName) {
    const out: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.sb.from(table).select('*').range(from, from + 999);
      this.fail(error);
      out.push(...(data || []).map(r => normalizeRow(table, r)));
      if (!data || data.length < 1000) return out;
    }
  }

  async load(): Promise<Data> {
    const d = emptyData();
    const { data: hh, error } = await this.sb.from('households').select('*').maybeSingle();
    this.fail(error);
    if (!hh) return d;
    d.household = hh;
    d.members = (await this.all('members')) as unknown as Data['members'];
    const results = await Promise.all(TABLES.map(t => this.all(t)));
    TABLES.forEach((t, i) => { (d as unknown as Record<string, unknown>)[t] = results[i]; });
    return d;
  }

  async upsert(table: TableName, rows: Record<string, unknown>[]) {
    if (!rows.length) return;
    // casal e pessoas já existem e só aceitam atualização de alguns campos (regra de segurança do banco)
    const EDITABLE: Partial<Record<TableName, string[]>> = { households: ['name', 'split_mode'], members: ['display_name', 'color'] };
    const allowed = EDITABLE[table];
    if (allowed) {
      for (const r of rows) {
        const patch = Object.fromEntries(Object.entries(r).filter(([k]) => allowed.includes(k)));
        if (!Object.keys(patch).length) continue;
        const { error } = await this.sb.from(table).update(patch).eq('id', String(r.id));
        this.fail(error);
      }
      return;
    }
    const clean = rows.map(r => { const { created_at: _c, updated_at: _u, ...rest } = r; return rest; });
    const { error } = await this.sb.from(table).upsert(clean);
    this.fail(error);
  }
  async remove(table: TableName, ids: string[]) {
    if (!ids.length) return;
    const { error } = await this.sb.from(table).delete().in('id', ids);
    this.fail(error);
  }
  async ensureRecurring(months: string[]) {
    const { data, error } = await this.sb.rpc('ensure_recurring', { p_months: months });
    this.fail(error);
    return Number(data) || 0;
  }
  async createHousehold(name: string, color: string) { const { error } = await this.sb.rpc('create_household', { p_name: name, p_color: color }); if (error) throw new Error(error.message); }
  async joinHousehold(code: string, name: string, color: string) {
    const { data, error } = await this.sb.rpc('join_household', { p_code: code, p_name: name, p_color: color });
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Código de convite não encontrado. Confira as letras e números.');
  }
  async newInviteCode() {
    const { data, error } = await this.sb.rpc('new_invite_code');
    if (error) throw new Error(error.message);
    return String(data);
  }
  async importTransactions(rows: Record<string, unknown>[]) {
    let n = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const { data, error } = await this.sb.rpc('import_transactions', { p_rows: rows.slice(i, i + 500) });
      if (error) throw new Error(error.message);
      n += Number(data) || 0;
    }
    return n;
  }

  subscribe(householdId: string, cb: (c: Change) => void) {
    const ch = this.sb.channel('casal-' + householdId);
    [...TABLES, 'members', 'households'].forEach(table => {
      const filter = table === 'households' ? `id=eq.${householdId}` : `household_id=eq.${householdId}`;
      const up = (p: { new: unknown }) => cb({ table: table as TableName, type: 'upsert', row: normalizeRow(table as TableName, p.new as Record<string, unknown>) });
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, up);
      ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, up);
      // exclusões não aceitam filtro no Realtime; chega só o id, e um id que não é nosso é simplesmente ignorado
      ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, p => cb({ table: table as TableName, type: 'delete', row: p.old as Record<string, unknown> }));
    });
    ch.subscribe();
    return () => { this.sb.removeChannel(ch); };
  }
}

/** Mensagens do Supabase em português */
function authMsg(m: string) {
  if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (/already registered|already been registered/i.test(m)) return 'Este e-mail já tem conta. Use "Entrar".';
  if (/password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
  if (/same password/i.test(m)) return 'A nova senha precisa ser diferente da anterior.';
  return m;
}
