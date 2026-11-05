export type Kind = 'expense' | 'income' | 'investment';
export type Nature = 'fixed' | 'variable';
export type Method = 'pix' | 'card' | 'boleto' | 'cash';

export interface Household { id: string; name: string; invite_code: string; split_mode: 'prop' | 'equal' }
export interface Member { id: string; household_id: string; user_id: string; display_name: string; color: string }
export interface Category {
  id: string; household_id: string; name: string; color: string; icon: string; kind: Kind;
  budget: number | null; sort: number; archived: boolean;
}
export interface Card {
  id: string; household_id: string; name: string; limit_amount: number; closing_day: number; due_day: number;
  holder_id: string | null; archived: boolean;
}
export interface Wallet { id: string; household_id: string; name: string; base_balance: number; rate: number }
export interface Goal { id: string; household_id: string; name: string; target: number; deadline: string | null; wallet_id: string | null }

/** Campos comuns a lançamentos e recorrências. payer_id: quem paga (despesa) ou recebe (renda); null = conta conjunta. */
interface TxBase {
  id: string; household_id: string; description: string; amount: number; kind: Kind; nature: Nature | null;
  category_id: string | null; method: Method; card_id: string | null; wallet_id: string | null;
  payer_id: string | null; shared: boolean; created_by: string | null;
}
export interface Recurring extends TxBase { day: number; start_month: string; end_month: string | null; skipped: string[] }
export interface Tx extends TxBase {
  notes: string;
  occurred_on: string; // YYYY-MM-DD (data real)
  month: string;       // YYYY-MM-01 (mês em que conta; no cartão, mês de vencimento da fatura)
  paid: boolean;
  installment_group: string | null; installment_no: number | null; installment_total: number | null;
  recurring_id: string | null;
  created_at?: string; updated_at?: string;
}
export interface Settlement { id: string; household_id: string; month: string; from_member: string; to_member: string; amount: number; note: string; created_at?: string }

export interface Data {
  household: Household | null;
  members: Member[];
  categories: Category[];
  cards: Card[];
  wallets: Wallet[];
  goals: Goal[];
  recurring: Recurring[];
  transactions: Tx[];
  settlements: Settlement[];
}

export type TableName = 'categories' | 'cards' | 'wallets' | 'goals' | 'recurring' | 'transactions' | 'settlements' | 'members' | 'households';
