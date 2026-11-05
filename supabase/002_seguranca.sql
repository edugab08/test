-- =====================================================================
-- Finanças a Dois — reforço de segurança (rode DEPOIS do schema.sql)
-- Supabase → SQL Editor → New query → cole tudo → Run. Pode rodar mais de uma vez.
-- =====================================================================

-- 1) Visitantes sem login (anon) não chegam a nenhuma tabela nem função do app.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;

-- 2) Cada pessoa só pode mudar o próprio nome e cor; do casal, só o nome e a forma de dividir.
revoke update on members from authenticated;
grant update (display_name, color) on members to authenticated;
revoke update on households from authenticated;
grant update (name, split_mode) on households to authenticated;

-- 3) Nenhum dado pode apontar para algo de outro casal (categoria, cartão, reserva, pessoa...).
create or replace function same_house(tbl text, ref uuid, h uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare ok boolean;
begin
  if ref is null then return true; end if;
  execute format('select exists(select 1 from %I where id = $1 and household_id = $2)', tbl) into ok using ref, h;
  return ok;
end $$;

create or replace function check_refs() returns trigger
language plpgsql security definer set search_path = public as $$
declare v jsonb := to_jsonb(new); h uuid := new.household_id; k text; tbl text;
begin
  foreach k in array array['payer_id','created_by','holder_id','from_member','to_member','category_id','card_id','wallet_id','recurring_id'] loop
    if v ? k and v->>k is not null then
      tbl := case k when 'category_id' then 'categories' when 'card_id' then 'cards' when 'wallet_id' then 'wallets'
                    when 'recurring_id' then 'recurring' else 'members' end;
      if not same_house(tbl, (v->>k)::uuid, h) then
        raise exception 'Referência inválida em % (não pertence a este casal)', k using errcode = '42501';
      end if;
    end if;
  end loop;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['transactions','recurring','settlements','cards','goals'] loop
    execute format('drop trigger if exists %1$s_refs on %1$s', t);
    execute format('create trigger %1$s_refs before insert or update on %1$s for each row execute function check_refs()', t);
  end loop;
end $$;

-- 4) "Quem lançou" é sempre quem está logado (não dá para assinar como a outra pessoa).
--    As funções do próprio sistema (recorrências) marcam app.trusted e mantêm o autor original.
create or replace function stamp_author() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.trusted', true), '') <> 'on' and auth.uid() is not null then
    new.created_by := my_member();
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['transactions','recurring'] loop
    execute format('drop trigger if exists %1$s_author on %1$s', t);
    execute format('create trigger %1$s_author before insert on %1$s for each row execute function stamp_author()', t);
  end loop;
end $$;

-- 5) Recorrências: no máximo 6 meses por chamada.
create or replace function ensure_recurring(p_months date[]) returns int
language plpgsql security definer set search_path = public as $$
declare h uuid := my_household(); n int;
begin
  if h is null then return 0; end if;
  if coalesce(array_length(p_months, 1), 0) > 6 then raise exception 'No máximo 6 meses por vez'; end if;
  perform set_config('app.trusted', 'on', true);
  insert into transactions (household_id, description, amount, kind, nature, category_id, method, card_id, wallet_id,
    occurred_on, month, paid, payer_id, shared, recurring_id, created_by)
  select r.household_id, r.description, r.amount, r.kind, r.nature, r.category_id, r.method, r.card_id, r.wallet_id,
    (m + (least(r.day, extract(day from (m + interval '1 month' - interval '1 day'))::int) - 1)),
    m, (m < date_trunc('month', now())::date), r.payer_id, r.shared, r.id, r.created_by
  from recurring r cross join unnest(p_months) m
  where r.household_id = h and r.start_month <= m and (r.end_month is null or r.end_month >= m) and not (m = any(r.skipped))
  on conflict (recurring_id, month) where recurring_id is not null do nothing;
  get diagnostics n = row_count;
  perform set_config('app.trusted', 'off', true);
  return n;
end $$;

-- 6) Convite mais forte: 8 caracteres e no máximo 8 tentativas erradas a cada 15 minutos por conta.
alter table households alter column invite_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
update households set invite_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) where length(invite_code) < 8;

create table if not exists join_attempts (user_id uuid not null, at timestamptz not null default now());
alter table join_attempts enable row level security;  -- sem políticas: ninguém lê nem grava direto
revoke all on join_attempts from anon, authenticated;

create or replace function join_household(p_code text, p_name text, p_color text default '#FF7AB6') returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then raise exception 'Você já faz parte de um casal'; end if;
  if (select count(*) from join_attempts where user_id = auth.uid() and at > now() - interval '15 minutes') >= 8 then
    raise exception 'Muitas tentativas. Espere 15 minutos.';
  end if;
  select id into h from households where invite_code = upper(trim(p_code));
  if h is null then
    insert into join_attempts (user_id) values (auth.uid());
    return null;  -- o app mostra "código não encontrado" (sem erro, para a tentativa ficar registrada)
  end if;
  if (select count(*) from members where household_id = h) >= 2 then raise exception 'Este casal já tem duas pessoas'; end if;
  insert into members (household_id, user_id, display_name, color) values (h, auth.uid(), left(trim(p_name), 40), p_color);
  return h;
end $$;

-- Gerar um código de convite novo (por exemplo, se mandou para a pessoa errada)
create or replace function new_invite_code() returns text
language plpgsql security definer set search_path = public as $$
declare c text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
begin
  update households set invite_code = c where id = my_household();
  return c;
end $$;

-- 7) Limites de tamanho nos textos (evita lixo gigante no banco)
do $$ begin
  alter table transactions add constraint tx_text_len check (length(description) <= 120 and length(notes) <= 500);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table members add constraint mem_name_len check (length(display_name) between 1 and 40);
exception when duplicate_object then null; end $$;

-- 8) Extrato importado do banco: identificador da transação para nunca importar duas vezes
alter table transactions add column if not exists external_id text;
create unique index if not exists tx_external on transactions(household_id, external_id) where external_id is not null;

-- Funções criadas acima também ficam fechadas para quem não fez login
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
