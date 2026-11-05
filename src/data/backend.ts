import type { Data, TableName } from '../domain/types';

export type Change = { table: TableName; type: 'upsert' | 'delete'; row: Record<string, unknown> };

/** O app conversa com o banco só por esta interface: Supabase em produção, localStorage no modo demonstração. */
export interface Backend {
  readonly kind: 'supabase' | 'demo';
  /** id do usuário logado, ou null se precisa entrar */
  userId(): Promise<string | null>;
  signIn(email: string, password: string): Promise<void>;
  /** devolve true se o Supabase pediu para confirmar o e-mail antes de entrar */
  signUp(email: string, password: string): Promise<boolean>;
  sendPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  onAuth(cb: (event: string) => void): () => void;
  load(): Promise<Data>;
  upsert(table: TableName, rows: Record<string, unknown>[]): Promise<void>;
  remove(table: TableName, ids: string[]): Promise<void>;
  ensureRecurring(months: string[]): Promise<number>;
  createHousehold(name: string, color: string): Promise<void>;
  joinHousehold(code: string, name: string, color: string): Promise<void>;
  /** gera um código de convite novo e devolve */
  newInviteCode(): Promise<string>;
  importTransactions(rows: Record<string, unknown>[]): Promise<number>;
  subscribe(householdId: string, cb: (c: Change) => void): () => void;
}

/** Erros que não adianta tentar de novo (permissão, dado inválido) — os outros (rede) ficam na fila. */
export class PermanentError extends Error {}

export const emptyData = (): Data => ({ household: null, members: [], categories: [], cards: [], wallets: [], goals: [], recurring: [], transactions: [], settlements: [] });

const NUMERIC: Partial<Record<TableName, string[]>> = {
  transactions: ['amount'], recurring: ['amount'], settlements: ['amount'], cards: ['limit_amount'],
  wallets: ['base_balance', 'rate'], goals: ['target'], categories: ['budget']
};
/** O Postgres devolve numeric às vezes como texto; normaliza para número. */
export function normalizeRow<T>(table: TableName, row: T): T {
  const r = { ...(row as Record<string, unknown>) };
  (NUMERIC[table] || []).forEach(k => { if (r[k] !== null && r[k] !== undefined) r[k] = Number(r[k]); });
  return r as T;
}
