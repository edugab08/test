-- =====================================================================
-- Finanças a Dois — recorrências no cartão entram na fatura certa
-- Rode DEPOIS do schema.sql e do 002_seguranca.sql. Pode rodar mais de uma vez.
--
-- Antes: uma assinatura no cartão (Netflix, Spotify...) era lançada na fatura do próprio
-- mês da cobrança, sem olhar o dia de fechamento. Agora segue a mesma regra das compras:
-- cobrança antes do fechamento -> fatura que fecha naquele mês; no dia ou depois -> a seguinte.
-- O mês da cobrança (para começar, parar ou pular) continua sendo o mês em que ela acontece.
-- =====================================================================

-- Mês de vencimento da fatura em que cai uma cobrança (mesma regra do app)
create or replace function card_invoice_month(p_closing int, p_due int, p_date date) returns date
language sql immutable as $$
  select (date_trunc('month', p_date)::date
          + case when extract(day from p_date) >= p_closing then interval '1 month' else interval '0' end
          + case when p_due > p_closing then interval '0' else interval '1 month' end)::date
$$;

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
    o.occ, i.inv, (i.inv < date_trunc('month', now())::date), r.payer_id, r.shared, r.id, r.created_by
  from recurring r
  cross join unnest(p_months) m
  left join cards c on c.id = r.card_id and r.method = 'card'
  cross join lateral (select (m + (least(r.day, extract(day from (m + interval '1 month' - interval '1 day'))::int) - 1))::date as occ) o
  cross join lateral (select case when c.id is null then m else card_invoice_month(c.closing_day, c.due_day, o.occ) end as inv) i
  where r.household_id = h
    and r.start_month <= m and (r.end_month is null or r.end_month >= m)
    and not (i.inv = any(r.skipped))
  on conflict (recurring_id, month) where recurring_id is not null do nothing;
  get diagnostics n = row_count;
  perform set_config('app.trusted', 'off', true);
  return n;
end $$;

-- Corrige o que já foi gerado no lugar errado (só cobranças ainda não pagas).
-- Vai do mês mais distante para o mais próximo, para uma cobrança não "trombar" na seguinte.
do $$
declare t record; target date;
begin
  for t in
    select tx.id, tx.month, tx.occurred_on, c.closing_day, c.due_day
    from transactions tx join cards c on c.id = tx.card_id
    where tx.recurring_id is not null and tx.method = 'card' and not tx.paid
    order by tx.month desc
  loop
    target := card_invoice_month(t.closing_day, t.due_day, t.occurred_on);
    if target <> t.month then
      begin
        update transactions set month = target where id = t.id;
      exception when unique_violation then null;  -- já existe a cobrança daquela fatura: deixa como está
      end;
    end if;
  end loop;
end $$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
