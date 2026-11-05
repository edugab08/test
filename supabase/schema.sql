-- =====================================================================
-- Finanças a Dois v2 — esquema do banco (Supabase / Postgres)
-- Cole este arquivo inteiro em: Supabase → SQL Editor → New query → Run
-- =====================================================================

-- gen_random_uuid() já vem no Postgres 13+ (Supabase usa 15)

-- ---------- Tabelas ----------
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Nosso casal',
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  split_mode text not null default 'prop' check (split_mode in ('prop', 'equal')),
  created_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  color text not null default '#3DD9EB',
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  color text not null,
  icon text not null default 'box',
  kind text not null default 'expense' check (kind in ('expense', 'income', 'investment')),
  budget numeric(12,2),
  sort int not null default 0,
  archived boolean not null default false
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  limit_amount numeric(12,2) not null default 0,
  closing_day int not null default 1 check (closing_day between 1 and 31),
  due_day int not null default 10 check (due_day between 1 and 31),
  holder_id uuid references members(id) on delete set null,
  archived boolean not null default false
);

create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  base_balance numeric(12,2) not null default 0,
  rate numeric(6,2) not null default 0
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  target numeric(12,2) not null,
  deadline date,
  wallet_id uuid references wallets(id) on delete set null
);

create table if not exists recurring (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  kind text not null check (kind in ('expense', 'income', 'investment')),
  nature text check (nature in ('fixed', 'variable')),
  category_id uuid references categories(id) on delete set null,
  method text not null default 'pix',
  card_id uuid references cards(id) on delete set null,
  wallet_id uuid references wallets(id) on delete set null,
  day int not null default 5 check (day between 1 and 31),
  payer_id uuid references members(id) on delete cascade,  -- quem paga (despesa) ou quem recebe (renda); null = conta conjunta
  shared boolean not null default true,                     -- despesa dividida entre o casal
  start_month date not null,
  end_month date,
  skipped date[] not null default '{}',
  created_by uuid references members(id) on delete set null
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  description text not null,
  notes text not null default '',
  amount numeric(12,2) not null check (amount > 0),
  kind text not null check (kind in ('expense', 'income', 'investment')),
  nature text check (nature in ('fixed', 'variable')),
  category_id uuid references categories(id) on delete set null,
  method text not null default 'pix' check (method in ('pix', 'card', 'boleto', 'cash')),
  card_id uuid references cards(id) on delete set null,
  wallet_id uuid references wallets(id) on delete set null,
  occurred_on date not null,          -- data real da compra / recebimento
  month date not null,                -- mês em que conta (para cartão: mês de vencimento da fatura)
  paid boolean not null default false,
  payer_id uuid references members(id) on delete cascade,
  shared boolean not null default true,
  installment_group uuid,
  installment_no int,
  installment_total int,
  recurring_id uuid references recurring(id) on delete set null,
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Impede que dois celulares gerem a mesma recorrência duas vezes no mesmo mês
create unique index if not exists tx_recurring_month on transactions(recurring_id, month) where recurring_id is not null;
create index if not exists tx_household_month on transactions(household_id, month);

create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  month date not null,
  from_member uuid not null references members(id) on delete cascade,
  to_member uuid not null references members(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  note text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- Funções auxiliares ----------
create or replace function my_household() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from members where user_id = auth.uid()
$$;

create or replace function my_member() returns uuid
language sql stable security definer set search_path = public as $$
  select id from members where user_id = auth.uid()
$$;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists tx_touch on transactions;
create trigger tx_touch before update on transactions for each row execute function touch_updated_at();

-- Categorias padrão
create or replace function seed_categories(h uuid) returns void language sql security definer set search_path = public as $$
  insert into categories (household_id, name, color, icon, kind, sort) values
  (h, 'Moradia & Contas', '#60A5FA', 'home', 'expense', 1),
  (h, 'Mercado', '#4BE3A6', 'cart', 'expense', 2),
  (h, 'Restaurantes & Delivery', '#FB923C', 'utensils', 'expense', 3),
  (h, 'Transporte', '#FFC861', 'car', 'expense', 4),
  (h, 'Saúde', '#FB7185', 'pill', 'expense', 5),
  (h, 'Roupas', '#F472B6', 'shirt', 'expense', 6),
  (h, 'Beleza & Academia', '#C084FC', 'sparkles', 'expense', 7),
  (h, 'Educação', '#2DD4BF', 'book', 'expense', 8),
  (h, 'Assinaturas', '#A78BFA', 'film', 'expense', 9),
  (h, 'Lazer & Viagens', '#22D3EE', 'gamepad', 'expense', 10),
  (h, 'Pets & Casa', '#84CC16', 'paw', 'expense', 11),
  (h, 'Outros', '#94A3B8', 'box', 'expense', 12),
  (h, 'Salário', '#4BE3A6', 'wallet', 'income', 20),
  (h, 'Renda extra', '#FACC15', 'coins', 'income', 21),
  (h, 'Investimentos', '#38BDF8', 'trend', 'investment', 30);
$$;

-- Cria o casal e coloca quem chamou como primeiro membro
create or replace function create_household(p_name text, p_color text default '#3DD9EB') returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then raise exception 'Você já faz parte de um casal'; end if;
  insert into households default values returning id into h;
  insert into members (household_id, user_id, display_name, color) values (h, auth.uid(), p_name, p_color);
  perform seed_categories(h);
  return h;
end $$;

-- Entra no casal pelo código de convite (máximo de 2 pessoas)
create or replace function join_household(p_code text, p_name text, p_color text default '#FF7AB6') returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then raise exception 'Você já faz parte de um casal'; end if;
  select id into h from households where invite_code = upper(trim(p_code));
  if h is null then raise exception 'Código de convite não encontrado'; end if;
  if (select count(*) from members where household_id = h) >= 2 then raise exception 'Este casal já tem duas pessoas'; end if;
  insert into members (household_id, user_id, display_name, color) values (h, auth.uid(), p_name, p_color);
  return h;
end $$;

-- Importação do app antigo: grava em lote mesmo a renda da outra pessoa (só dentro do próprio casal)
create or replace function import_transactions(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare h uuid := my_household(); n int;
begin
  if h is null then raise exception 'Sem casal'; end if;
  insert into transactions (id, household_id, description, notes, amount, kind, nature, category_id, method, card_id,
    wallet_id, occurred_on, month, paid, payer_id, shared, installment_group, installment_no, installment_total, recurring_id, created_by)
  select id, h, description, coalesce(notes, ''), amount, kind, nature, category_id, coalesce(method, 'pix'), card_id,
    wallet_id, occurred_on, month, coalesce(paid, false), payer_id, coalesce(shared, true), installment_group, installment_no,
    installment_total, recurring_id, created_by
  from jsonb_populate_recordset(null::transactions, p_rows)
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Gera os lançamentos das recorrências (inclusive o salário de cada um) para os meses pedidos.
-- Roda no servidor para que o salário dela apareça mesmo se ela ainda não abriu o app no mês.
create or replace function ensure_recurring(p_months date[]) returns int
language plpgsql security definer set search_path = public as $$
declare h uuid := my_household(); n int;
begin
  if h is null then return 0; end if;
  insert into transactions (household_id, description, amount, kind, nature, category_id, method, card_id, wallet_id,
    occurred_on, month, paid, payer_id, shared, recurring_id, created_by)
  select r.household_id, r.description, r.amount, r.kind, r.nature, r.category_id, r.method, r.card_id, r.wallet_id,
    (m + (least(r.day, extract(day from (m + interval '1 month' - interval '1 day'))::int) - 1)),
    m, (m < date_trunc('month', now())::date), r.payer_id, r.shared, r.id, r.created_by
  from recurring r cross join unnest(p_months) m
  where r.household_id = h and r.start_month <= m and (r.end_month is null or r.end_month >= m) and not (m = any(r.skipped))
  on conflict (recurring_id, month) where recurring_id is not null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- Segurança (RLS): cada casal só enxerga os próprios dados ----------
alter table households enable row level security;
alter table members enable row level security;
alter table categories enable row level security;
alter table cards enable row level security;
alter table wallets enable row level security;
alter table goals enable row level security;
alter table recurring enable row level security;
alter table transactions enable row level security;
alter table settlements enable row level security;

drop policy if exists hh_read on households;
create policy hh_read on households for select using (id = my_household());
drop policy if exists hh_update on households;
create policy hh_update on households for update using (id = my_household());

drop policy if exists mem_read on members;
create policy mem_read on members for select using (household_id = my_household());
drop policy if exists mem_update on members;
create policy mem_update on members for update using (user_id = auth.uid());

do $$ declare t text; begin
  foreach t in array array['categories','cards','wallets','goals','settlements'] loop
    execute format('drop policy if exists %1$s_all on %1$s', t);
    execute format('create policy %1$s_all on %1$s for all using (household_id = my_household()) with check (household_id = my_household())', t);
  end loop;
end $$;

-- Regra da renda: a renda (salário etc.) de uma pessoa só pode ser criada, editada ou apagada por ela mesma.
-- Despesas e renda da conta conjunta (payer_id nulo) qualquer um do casal pode mexer.
do $$ declare t text; begin
  foreach t in array array['transactions','recurring'] loop
    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format('create policy %1$s_read on %1$s for select using (household_id = my_household())', t);
    execute format('drop policy if exists %1$s_write on %1$s', t);
    execute format($p$create policy %1$s_write on %1$s for insert with check (
      household_id = my_household() and (kind <> 'income' or payer_id is null or payer_id = my_member()))$p$, t);
    execute format('drop policy if exists %1$s_upd on %1$s', t);
    execute format($p$create policy %1$s_upd on %1$s for update using (
      household_id = my_household() and (kind <> 'income' or payer_id is null or payer_id = my_member()))
      with check (household_id = my_household() and (kind <> 'income' or payer_id is null or payer_id = my_member()))$p$, t);
    execute format('drop policy if exists %1$s_del on %1$s', t);
    execute format($p$create policy %1$s_del on %1$s for delete using (
      household_id = my_household() and (kind <> 'income' or payer_id is null or payer_id = my_member()))$p$, t);
  end loop;
end $$;

-- ---------- Tempo real ----------
do $$ declare t text; begin
  foreach t in array array['transactions','recurring','categories','cards','wallets','goals','settlements','members','households'] loop
    begin execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;
