-- 직원허브 첫 화면 「🔮 운세 카드」 — 재미용 하루 뽑기. 상품권 이름·금액·확률·개수와 하루 횟수는 전부 원장이 허브 화면에서 고친다(코드에 박지 않음).
-- 뽑기는 반드시 서버(fortune_draw 함수)에서 정한다 — 화면 난수는 조작할 수 있어서. 직원은 표를 직접 읽거나 쓰지 못하고 함수로만 뽑는다.
-- 표 3개: fortune_settings(켬/끔·하루 횟수, 한 줄) · fortune_prizes(상품 목록 — 원장만 읽음) · fortune_draws(뽑은 기록 — 본인 것만, 원장은 전부).
-- 읽기: 허브에 들어올 수 있는 직원 전부(employee_hub_access_allowed) · 설정·상품 고치기와 지급 체크: 원장만(my_role()='owner') · anon 권한 없음.
-- 재실행 안전: create table if not exists · create or replace function · drop … if exists 뒤 다시 만듦.
begin;

create table if not exists public.fortune_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  draws_per_day smallint not null default 1 check (draws_per_day between 1 and 20),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.fortune_settings(id) values (1) on conflict (id) do nothing;

create table if not exists public.fortune_prizes (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  amount_krw integer not null default 0 check (amount_krw between 0 and 10000000),
  probability_pct numeric(7,4) not null check (probability_pct >= 0 and probability_pct <= 100),
  stock_total integer check (stock_total is null or stock_total >= 0),
  stock_monthly integer check (stock_monthly is null or stock_monthly >= 0),
  stock_daily integer check (stock_daily is null or stock_daily >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fortune_draws (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  draw_date date not null,
  draw_no smallint not null check (draw_no >= 1),
  seed integer not null,
  prize_id bigint references public.fortune_prizes(id) on delete set null,
  prize_name text,
  prize_amount_krw integer,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  paid_by uuid,
  unique (user_id, draw_date, draw_no)
);
create index if not exists fortune_draws_prize_idx on public.fortune_draws (prize_id, draw_date);
create index if not exists fortune_draws_date_idx on public.fortune_draws (draw_date);

alter table public.fortune_settings enable row level security;
alter table public.fortune_prizes enable row level security;
alter table public.fortune_draws enable row level security;
revoke all on table public.fortune_settings, public.fortune_prizes, public.fortune_draws from public, anon, authenticated;
grant select on table public.fortune_settings, public.fortune_prizes, public.fortune_draws to authenticated;

drop policy if exists fortune_settings_hub_select on public.fortune_settings;
create policy fortune_settings_hub_select on public.fortune_settings for select to authenticated
  using (public.employee_hub_access_allowed());
drop policy if exists fortune_prizes_owner_select on public.fortune_prizes;
create policy fortune_prizes_owner_select on public.fortune_prizes for select to authenticated
  using ((select public.my_role()) = 'owner');
drop policy if exists fortune_draws_own_or_owner_select on public.fortune_draws;
create policy fortune_draws_own_or_owner_select on public.fortune_draws for select to authenticated
  using (public.employee_hub_access_allowed() and (user_id = (select auth.uid()) or (select public.my_role()) = 'owner'));

-- 내 오늘 상태 — 켬/끔 · 하루 횟수 · 오늘 뽑은 것 · 최근 당첨 내역
create or replace function public.fortune_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Asia/Seoul')::date;
  s record;
  todays jsonb;
  wins jsonb;
begin
  if uid is null or not public.employee_hub_access_allowed() then raise exception 'not_allowed'; end if;
  select * into s from public.fortune_settings where id = 1;
  select coalesce(jsonb_agg(jsonb_build_object('draw_no', d.draw_no, 'seed', d.seed, 'prize_name', d.prize_name,
           'prize_amount_krw', d.prize_amount_krw, 'paid', d.paid_at is not null) order by d.draw_no), '[]'::jsonb)
    into todays from public.fortune_draws d where d.user_id = uid and d.draw_date = today;
  select coalesce(jsonb_agg(w order by w.draw_date desc, w.id desc), '[]'::jsonb) into wins from (
    select d.id, d.draw_date, d.prize_name, d.prize_amount_krw, d.paid_at is not null as paid
      from public.fortune_draws d where d.user_id = uid and d.prize_name is not null
      order by d.draw_date desc, d.id desc limit 10) w;
  return jsonb_build_object('enabled', s.enabled, 'draws_per_day', s.draws_per_day,
    'used_today', jsonb_array_length(todays), 'today', todays, 'wins', wins);
end;
$$;

-- 뽑기 — 서버가 정한다. 하루 횟수를 넘기면 새로 뽑지 않고 오늘 기록을 돌려준다(재접속해도 같은 결과).
create or replace function public.fortune_draw() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Asia/Seoul')::date;
  month_start date := date_trunc('month', (now() at time zone 'Asia/Seoul'))::date;
  s record;
  used int;
  roll double precision;
  acc numeric := 0;
  p record;
  picked_id bigint;
  picked_name text;
  picked_amt int;
  new_seed int;
  new_id bigint;
begin
  if uid is null or not public.employee_hub_access_allowed() then raise exception 'not_allowed'; end if;
  -- 설정 한 줄을 잠가 동시에 뽑아도 개수가 어긋나지 않게 한 사람씩 처리한다.
  select * into s from public.fortune_settings where id = 1 for update;
  if not s.enabled then return jsonb_build_object('ok', false, 'reason', 'disabled'); end if;
  select count(*) into used from public.fortune_draws where user_id = uid and draw_date = today;
  if used >= s.draws_per_day then return jsonb_build_object('ok', false, 'reason', 'limit', 'used_today', used); end if;
  new_seed := floor(random() * 2147483646)::int + 1;
  roll := random() * 100;
  for p in select * from public.fortune_prizes where active and probability_pct > 0 order by sort_order, id loop
    -- 개수가 다 찬 상품은 건너뜀 — 그 확률은 「꽝」으로 돌아가고 다른 상품 확률은 그대로임.
    if (p.stock_total is null or (select count(*) from public.fortune_draws where prize_id = p.id) < p.stock_total)
       and (p.stock_monthly is null or (select count(*) from public.fortune_draws where prize_id = p.id and draw_date >= month_start) < p.stock_monthly)
       and (p.stock_daily is null or (select count(*) from public.fortune_draws where prize_id = p.id and draw_date = today) < p.stock_daily) then
      acc := acc + p.probability_pct;
      if roll < acc then picked_id := p.id; picked_name := p.name; picked_amt := p.amount_krw; exit; end if;
    end if;
  end loop;
  insert into public.fortune_draws(user_id, draw_date, draw_no, seed, prize_id, prize_name, prize_amount_krw)
    values (uid, today, used + 1, new_seed, picked_id, picked_name, picked_amt)
    returning id into new_id;
  return jsonb_build_object('ok', true, 'draw_no', used + 1, 'seed', new_seed, 'prize_name', picked_name,
    'prize_amount_krw', picked_amt, 'used_today', used + 1, 'draws_per_day', s.draws_per_day);
end;
$$;

-- ── 원장 전용 ──
-- 한눈에: 설정 · 상품(쓴 개수 포함) · 최근 당첨(이름 포함) · 합계
create or replace function public.fortune_admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  month_start date := date_trunc('month', (now() at time zone 'Asia/Seoul'))::date;
  s record;
  prizes jsonb;
  recent jsonb;
  totals jsonb;
begin
  if (select public.my_role()) <> 'owner' then raise exception 'owner_only'; end if;
  select * into s from public.fortune_settings where id = 1;
  select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'amount_krw', z.amount_krw,
      'probability_pct', z.probability_pct, 'stock_total', z.stock_total, 'stock_monthly', z.stock_monthly,
      'stock_daily', z.stock_daily, 'active', z.active, 'sort_order', z.sort_order,
      'used_total', z.used_total, 'used_month', z.used_month, 'used_today', z.used_today) order by z.sort_order, z.id), '[]'::jsonb)
    into prizes from (
      select p.*,
        (select count(*) from public.fortune_draws d where d.prize_id = p.id) as used_total,
        (select count(*) from public.fortune_draws d where d.prize_id = p.id and d.draw_date >= month_start) as used_month,
        (select count(*) from public.fortune_draws d where d.prize_id = p.id and d.draw_date = today) as used_today
      from public.fortune_prizes p) z;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'draw_date', r.draw_date, 'name', r.who, 'prize_name', r.prize_name,
      'prize_amount_krw', r.prize_amount_krw, 'paid', r.paid_at is not null) order by r.draw_date desc, r.id desc), '[]'::jsonb)
    into recent from (
      select d.id, d.draw_date, d.prize_name, d.prize_amount_krw, d.paid_at, coalesce(pr.name, '(알 수 없음)') as who
        from public.fortune_draws d left join public.profiles pr on pr.user_id = d.user_id
        where d.prize_name is not null order by d.draw_date desc, d.id desc limit 100) r;
  select jsonb_build_object(
      'draws', (select count(*) from public.fortune_draws),
      'draws_month', (select count(*) from public.fortune_draws where draw_date >= month_start),
      'wins', (select count(*) from public.fortune_draws where prize_name is not null),
      'wins_month', (select count(*) from public.fortune_draws where prize_name is not null and draw_date >= month_start),
      'amount_month_krw', (select coalesce(sum(prize_amount_krw), 0) from public.fortune_draws where prize_name is not null and draw_date >= month_start),
      'unpaid_count', (select count(*) from public.fortune_draws where prize_name is not null and paid_at is null and coalesce(prize_amount_krw, 0) > 0),
      'unpaid_krw', (select coalesce(sum(prize_amount_krw), 0) from public.fortune_draws where prize_name is not null and paid_at is null))
    into totals;
  return jsonb_build_object('enabled', s.enabled, 'draws_per_day', s.draws_per_day, 'prizes', prizes, 'recent', recent, 'totals', totals);
end;
$$;

-- 켬/끔 · 하루 횟수 저장
create or replace function public.fortune_save_settings(p_enabled boolean, p_draws_per_day int) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if (select public.my_role()) <> 'owner' then raise exception 'owner_only'; end if;
  if p_enabled is null then raise exception 'invalid_settings: 켬/끔을 골라 주세요.'; end if;
  if p_draws_per_day is null or p_draws_per_day < 1 or p_draws_per_day > 20 then raise exception 'invalid_settings: 하루 횟수는 1~20 사이로 적어 주세요.'; end if;
  update public.fortune_settings set enabled = p_enabled, draws_per_day = p_draws_per_day, updated_at = now(), updated_by = auth.uid() where id = 1;
  return jsonb_build_object('ok', true);
end;
$$;

-- 상품 목록 통째로 저장 — [{id?, name, amount_krw, probability_pct, stock_total?, stock_monthly?, stock_daily?, active}]
-- id가 있으면 그 상품을 고치고, 없으면 새로 만들고, 목록에 없는 기존 상품은 지운다(뽑은 기록의 상품 이름·금액은 그대로 남음).
create or replace function public.fortune_save_prizes(p_prizes jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  idx int := 0;
  total_pct numeric := 0;
  nm text;
  amt numeric;
  pct numeric;
  st numeric; sm numeric; sd numeric;
  pid bigint;
  keep_ids bigint[] := '{}';
begin
  if (select public.my_role()) <> 'owner' then raise exception 'owner_only'; end if;
  if p_prizes is null or jsonb_typeof(p_prizes) <> 'array' then raise exception 'invalid_prizes: 상품 목록 모양이 아니에요.'; end if;
  if jsonb_array_length(p_prizes) > 30 then raise exception 'invalid_prizes: 상품은 30개까지만 만들 수 있어요.'; end if;
  perform 1 from public.fortune_settings where id = 1 for update; -- 뽑기와 동시에 바뀌지 않게
  -- 1차: 검사만
  for item in select * from jsonb_array_elements(p_prizes) loop
    nm := btrim(coalesce(item->>'name', ''));
    if char_length(nm) < 1 or char_length(nm) > 60 then raise exception 'invalid_prizes: 상품 이름은 1~60자로 적어 주세요.'; end if;
    begin amt := coalesce(nullif(item->>'amount_krw', ''), '0')::numeric; exception when others then raise exception 'invalid_prizes: 금액은 숫자만 적어 주세요(%).', nm; end;
    if amt < 0 or amt > 10000000 or amt <> trunc(amt) then raise exception 'invalid_prizes: 금액은 0~10,000,000원 사이 정수로 적어 주세요(%).', nm; end if;
    begin pct := (item->>'probability_pct')::numeric; exception when others then raise exception 'invalid_prizes: 확률은 숫자만 적어 주세요(%).', nm; end;
    if pct is null or pct < 0 or pct > 100 then raise exception 'invalid_prizes: 확률은 0~100 사이로 적어 주세요(%).', nm; end if;
    if pct <> round(pct, 4) then raise exception 'invalid_prizes: 확률은 소수 넷째 자리까지만 적어 주세요(%).', nm; end if;
    foreach st in array array[
      case when coalesce(item->>'stock_total', '') = '' then null else (item->>'stock_total')::numeric end,
      case when coalesce(item->>'stock_monthly', '') = '' then null else (item->>'stock_monthly')::numeric end,
      case when coalesce(item->>'stock_daily', '') = '' then null else (item->>'stock_daily')::numeric end] loop
      if st is not null and (st < 0 or st > 1000000 or st <> trunc(st)) then raise exception 'invalid_prizes: 개수는 0 이상 정수로 적어 주세요. 비워 두면 무제한이에요(%).', nm; end if;
    end loop;
    if coalesce((item->>'active')::boolean, true) then total_pct := total_pct + pct; end if;
  end loop;
  if total_pct > 100 then raise exception 'invalid_prizes: 켜 둔 상품의 확률을 다 더하면 %예요. 100%%를 넘을 수 없어요.', total_pct; end if;
  -- 2차: 저장
  for item in select * from jsonb_array_elements(p_prizes) loop
    idx := idx + 1;
    nm := btrim(item->>'name');
    amt := coalesce(nullif(item->>'amount_krw', ''), '0')::numeric;
    pct := (item->>'probability_pct')::numeric;
    st := case when coalesce(item->>'stock_total', '') = '' then null else (item->>'stock_total')::numeric end;
    sm := case when coalesce(item->>'stock_monthly', '') = '' then null else (item->>'stock_monthly')::numeric end;
    sd := case when coalesce(item->>'stock_daily', '') = '' then null else (item->>'stock_daily')::numeric end;
    pid := case when coalesce(item->>'id', '') = '' then null else (item->>'id')::bigint end;
    if pid is not null and exists (select 1 from public.fortune_prizes where id = pid) then
      update public.fortune_prizes set name = nm, amount_krw = amt::int, probability_pct = pct, stock_total = st::int, stock_monthly = sm::int,
        stock_daily = sd::int, active = coalesce((item->>'active')::boolean, true), sort_order = idx, updated_at = now() where id = pid;
    else
      insert into public.fortune_prizes(name, amount_krw, probability_pct, stock_total, stock_monthly, stock_daily, active, sort_order)
        values (nm, amt::int, pct, st::int, sm::int, sd::int, coalesce((item->>'active')::boolean, true), idx) returning id into pid;
    end if;
    keep_ids := keep_ids || pid;
  end loop;
  delete from public.fortune_prizes where not (id = any(keep_ids));
  return jsonb_build_object('ok', true, 'count', idx);
end;
$$;

-- 지급 완료 체크(수동 지급) — 되돌릴 수도 있음
create or replace function public.fortune_mark_paid(p_draw_id bigint, p_paid boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if (select public.my_role()) <> 'owner' then raise exception 'owner_only'; end if;
  update public.fortune_draws set paid_at = case when coalesce(p_paid, true) then now() else null end,
    paid_by = case when coalesce(p_paid, true) then auth.uid() else null end
    where id = p_draw_id and prize_name is not null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fortune_status(), public.fortune_draw(), public.fortune_admin_overview(),
  public.fortune_save_settings(boolean, int), public.fortune_save_prizes(jsonb), public.fortune_mark_paid(bigint, boolean) from public, anon;
grant execute on function public.fortune_status(), public.fortune_draw(), public.fortune_admin_overview(),
  public.fortune_save_settings(boolean, int), public.fortune_save_prizes(jsonb), public.fortune_mark_paid(bigint, boolean) to authenticated;

commit;
