-- 카드 원장 1단계. 운영 실행은 별도 승인 뒤임. 기존 이벤트·푸시 트리거를 유지함.
begin;
create table if not exists public.card_merchants (
  id bigint generated always as identity primary key,
  merchant_key text not null unique check(length(merchant_key) between 1 and 120),
  display_name text not null check(length(display_name) between 1 and 120),
  category text not null default '기타' check(category in ('병원','개인','AI','광고','기타')),
  ai_platform text,
  memo text,
  updated_at timestamptz not null default now()
);
create table if not exists public.card_transactions (
  id bigint generated always as identity primary key,
  source text not null check(source in ('sms','backup_import','manual')),
  received_at timestamptz not null,
  card_issuer text not null check(card_issuer in ('samsung','kb','hana')),
  card_last4 text check(card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  event_kind text not null check(event_kind in ('purchase','cancellation')),
  transaction_at timestamptz not null,
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  amount_native numeric(18,4) not null,
  amount_krw bigint,
  fx_rate numeric(18,6),
  fx_source text not null check(fx_source in ('native','fixed_estimate','unconverted')),
  merchant text not null check(length(merchant) between 1 and 120),
  merchant_key text not null,
  merchant_id bigint not null references public.card_merchants(id),
  abroad text not null check(abroad in ('domestic','overseas')),
  dedupe_hash text not null unique check(dedupe_hash ~ '^[0-9a-f]{64}$'),
  reversed_transaction_id bigint unique references public.card_transactions(id),
  cancellation_review text check(cancellation_review in ('unmatched','ambiguous','duplicate')),
  created_at timestamptz not null default now(),
  check((event_kind='purchase' and amount_native>0 and (amount_krw is null or amount_krw>0) and reversed_transaction_id is null and cancellation_review is null)
     or (event_kind='cancellation' and amount_native<0 and (amount_krw is null or amount_krw<0))),
  check(fx_rate is null or fx_rate>0)
);
create index if not exists card_transactions_date_idx on public.card_transactions(transaction_at);
create index if not exists card_transactions_match_idx on public.card_transactions(card_issuer,card_last4,merchant_key,currency,amount_native,transaction_at);
create table if not exists public.card_sms_failed_raw (
  id bigint generated always as identity primary key,
  dedupe_hash text not null unique check(dedupe_hash ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default now(),
  body text not null check(length(body) between 1 and 16000),
  fail_reason text not null,
  expires_at timestamptz not null default(now()+interval '30 days'),
  check(expires_at<=received_at+interval '30 days')
);
create index if not exists card_sms_failed_raw_expiry_idx on public.card_sms_failed_raw(expires_at);
-- 기존 행은 고치지 않고 새 성공 건만 원문 대신 가맹점을 남김.
alter table public.ai_billing_events add column if not exists card_merchant text;

-- service_role 전용임. 카드·금액·가맹점별 동시 기록을 순서대로 처리해 이중 취소를 방지함.
create or replace function public.record_card_transaction(p_transaction jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t public.card_transactions%rowtype; v_id bigint; v_merchant bigint; candidates bigint[]; v_review text; v_reverse bigint;
begin
  t:=jsonb_populate_record(null::public.card_transactions,p_transaction);
  perform pg_advisory_xact_lock(hashtextextended(t.card_issuer||coalesce(t.card_last4,'?')||t.merchant_key||t.currency||abs(t.amount_native)::text,0));
  select id into v_id from public.card_transactions where dedupe_hash=t.dedupe_hash;
  if v_id is not null then return jsonb_build_object('id',v_id,'duplicate',true); end if;
  insert into public.card_merchants(merchant_key,display_name) values(t.merchant_key,t.merchant)
    on conflict(merchant_key) do nothing;
  select id into v_merchant from public.card_merchants where merchant_key=t.merchant_key;
  if t.event_kind='cancellation' then
    select array_agg(p.id) into candidates from public.card_transactions p
      where p.event_kind='purchase' and p.card_issuer=t.card_issuer
        and p.card_last4 is not distinct from t.card_last4 and p.currency=t.currency
        and p.amount_native=abs(t.amount_native) and p.merchant_key=t.merchant_key
        and p.transaction_at<=t.transaction_at
        and not exists(select 1 from public.card_transactions c where c.reversed_transaction_id=p.id);
    if cardinality(candidates)=1 then v_reverse:=candidates[1];
    elsif cardinality(candidates)>1 then v_review:='ambiguous';
    elsif exists(select 1 from public.card_transactions p where p.event_kind='purchase' and p.card_issuer=t.card_issuer
      and p.card_last4 is not distinct from t.card_last4 and p.currency=t.currency and p.amount_native=abs(t.amount_native)
      and p.merchant_key=t.merchant_key and p.transaction_at<=t.transaction_at) then v_review:='duplicate';
    else v_review:='unmatched'; end if;
  end if;
  insert into public.card_transactions(source,received_at,card_issuer,card_last4,event_kind,transaction_at,currency,amount_native,
    amount_krw,fx_rate,fx_source,merchant,merchant_key,merchant_id,abroad,dedupe_hash,reversed_transaction_id,cancellation_review)
  values(t.source,t.received_at,t.card_issuer,t.card_last4,t.event_kind,t.transaction_at,t.currency,t.amount_native,
    t.amount_krw,t.fx_rate,t.fx_source,t.merchant,t.merchant_key,v_merchant,t.abroad,t.dedupe_hash,v_reverse,v_review)
  returning id into v_id;
  return jsonb_build_object('id',v_id,'duplicate',false,'cancellation_review',v_review);
end$$;
create or replace function public.card_sms_failed_raw_purge() returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin delete from public.card_sms_failed_raw where expires_at<=now();get diagnostics n=row_count;return n;end$$;
-- pg_cron이 설치된 환경에서는 하루 한 번 만료 원문을 정리함.
do $$begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if not exists(select 1 from cron.job where jobname='card-sms-failed-raw-purge') then
      perform cron.schedule('card-sms-failed-raw-purge','17 3 * * *','select public.card_sms_failed_raw_purge();');
    end if;
  end if;
end$$;
alter table public.card_merchants enable row level security;
alter table public.card_transactions enable row level security;
alter table public.card_sms_failed_raw enable row level security;
revoke all on public.card_merchants,public.card_transactions,public.card_sms_failed_raw from public,anon,authenticated;
grant select,insert,update on public.card_merchants to authenticated;
grant select on public.card_transactions to authenticated;
grant select,insert,update on public.card_merchants,public.card_transactions to service_role;
grant select,insert,delete on public.card_sms_failed_raw to service_role;
grant usage,select on sequence public.card_merchants_id_seq to authenticated,service_role;
grant usage,select on sequence public.card_transactions_id_seq,public.card_sms_failed_raw_id_seq to service_role;
do $$begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='card_merchants' and policyname='card_merchants_owner') then
  create policy card_merchants_owner on public.card_merchants for all to authenticated using(public.my_role()='owner') with check(public.my_role()='owner');
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='card_transactions' and policyname='card_transactions_owner') then
  create policy card_transactions_owner on public.card_transactions for select to authenticated using(public.my_role()='owner');
 end if;
end$$;
revoke all on function public.record_card_transaction(jsonb),public.card_sms_failed_raw_purge() from public,anon,authenticated;
grant execute on function public.record_card_transaction(jsonb),public.card_sms_failed_raw_purge() to service_role;
commit;