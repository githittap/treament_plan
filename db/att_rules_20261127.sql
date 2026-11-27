-- 2026-11-27 월말 근태 — 매니저 의견 1차 반영 (원장 11-27 「처리하라」 = 매니저 의견대로).
-- 근거: 노션 카드 「월말 근태 합계 피드백 정리」 · 구현지시서 구현지시서_1차.md
--  ① 근무조별 지각 기준(A·B·C) — profiles.att_shift_group + app_settings 3줄
--  ② 반차·연차 자동 반영 + 관리자 표시 — attendance_day_marks(넣기·지우기는 RPC로만)
--  ⑥ 실장·매니저 열람·수정 + 수정 기록 — attendance_edit_log(원장만 읽음) · 매니저가 월 요약에 필요한 표를 읽도록 select 정책 넓힘
--  ⑧ 월 마감 결재 — att_months 단계 칸 + RPC att_month_step(매니저 확인 → 실장 확인 → 원장 확정 · 되돌리기는 원장만)
-- 적용 순서: 이 파일 한 번(재실행 안전) → hr.html 배포. 되돌리기: att_rules_20261127_rollback.sql
-- 주 대화가 운영 반영: Supabase SQL Editor에서 실행. 스테이징이 없으니 실행 뒤 아래 「확인 쿼리」 3줄로 점검.

-- ───────────────────────── 1) 직원별 근무조 ─────────────────────────
alter table public.profiles add column if not exists att_shift_group text;
alter table public.profiles drop constraint if exists profiles_att_shift_group_check;
alter table public.profiles add constraint profiles_att_shift_group_check
  check (att_shift_group is null or att_shift_group in ('A','B','C'));

-- 근무조별 지각 기준(허브 설정 › 🕘 근태 기준에서 원장이 고침). A는 지금 적용 중인 late_cut 값을 그대로 이어받음.
insert into public.app_settings(key,value,label)
select 'att.shift_group.A.late_cut',coalesce((select s.value from public.app_settings s where s.key='late_cut'),'09:40'),'지각 기준 — A조(진료실·데스크)'
on conflict (key) do nothing;
insert into public.app_settings(key,value,label) values
  ('att.shift_group.B.late_cut','10:00','지각 기준 — B조(기공·행정·실장)'),
  ('att.shift_group.C.late_cut','09:30','지각 기준 — C조(시간제)')
on conflict (key) do nothing;

-- ───────────────────────── 2) 월 마감 결재 단계 ─────────────────────────
alter table public.att_months add column if not exists manager_checked_by text;
alter table public.att_months add column if not exists manager_checked_at timestamptz;
alter table public.att_months add column if not exists chief_checked_by text;
alter table public.att_months add column if not exists chief_checked_at timestamptz;
do $$ declare c text; begin
  for c in select conname from pg_constraint
    where conrelid='public.att_months'::regclass and contype='c' and pg_get_constraintdef(oid) like '%status%'
  loop execute format('alter table public.att_months drop constraint %I',c); end loop;
end $$;
alter table public.att_months add constraint att_months_status_check
  check (status in ('집계중','매니저확인','실장확인','확정'));
-- 단계 바꾸기는 att_month_step RPC로만 — 원장의 직접 쓰기 정책을 걷어 순서를 건너뛰는 길을 막음.
drop policy if exists att_months_insert_owner on public.att_months;
drop policy if exists att_months_update_owner on public.att_months;

-- ───────────────────────── 3) 관리자 표시 · 수정 기록 표 ─────────────────────────
create table if not exists public.attendance_day_marks (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  work_date date not null,
  mark text not null check (mark in ('annual','am_half','pm_half','early_ok','late_ok','official')),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  removed_by uuid,
  removed_at timestamptz
);
create unique index if not exists attendance_day_marks_active_uq
  on public.attendance_day_marks(user_id,work_date,mark) where removed_at is null;
create index if not exists attendance_day_marks_date_idx on public.attendance_day_marks(work_date);
alter table public.attendance_day_marks enable row level security;
drop policy if exists attendance_day_marks_select_mgr on public.attendance_day_marks;
create policy attendance_day_marks_select_mgr on public.attendance_day_marks for select to authenticated
  using (public.my_role() in ('manager','chief','owner'));
-- insert·update·delete 정책은 만들지 않음 → att_mark_add / att_mark_remove(아래)만 쓸 수 있음.

create table if not exists public.attendance_edit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_name text,
  actor_role text,
  action text not null check (action in ('mark_add','mark_remove','group_change','recalc','month_step')),
  user_id uuid,
  work_date date,
  month text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists attendance_edit_log_created_idx on public.attendance_edit_log(created_at desc);
alter table public.attendance_edit_log enable row level security;
drop policy if exists attendance_edit_log_select_owner on public.attendance_edit_log;
create policy attendance_edit_log_select_owner on public.attendance_edit_log for select to authenticated
  using (public.my_role()='owner');

-- 운영의 「직원허브 접근 차단」 관문 — 기존 표(attendance 등)와 같은 RESTRICTIVE 정책을 새 표에도 직접 붙임
-- (운영에 _install_employee_hub_access_gate 함수가 없어 직접 만듦 · 주 대화 검토 11-27)
do $$ declare t text; begin
  if to_regprocedure('public.employee_hub_access_allowed()') is not null then
    foreach t in array array['attendance_day_marks','attendance_edit_log'] loop
      execute format('drop policy if exists employee_hub_access_gate on public.%I',t);
      execute format('create policy employee_hub_access_gate on public.%I as restrictive for all to authenticated using (public.employee_hub_access_allowed()) with check (public.employee_hub_access_allowed())',t);
    end loop;
  end if;
end $$;

-- ───────────────────────── 4) 매니저가 월 요약에 필요한 표를 읽도록 ─────────────────────────
-- (지금: 본인 · 실장 · 원장만) → 매니저 추가. 쓰기 정책은 건드리지 않음.
drop policy if exists attendance_manual_release_select on public.attendance_manual_entries;
create policy attendance_manual_release_select on public.attendance_manual_entries for select to authenticated using (
  exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true)
  and (user_id=auth.uid() or public.my_role() in ('manager','chief','owner'))
);
drop policy if exists attendance_issue_resolution_release_select on public.attendance_issue_resolutions;
create policy attendance_issue_resolution_release_select on public.attendance_issue_resolutions for select to authenticated using (
  exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true)
  and (user_id=auth.uid() or public.my_role() in ('manager','chief','owner'))
);

-- ───────────────────────── 5) 함수 ─────────────────────────
-- 수정 기록 쓰기(내부용 — 아래 RPC 안에서만 부름)
create or replace function public.att_edit_log_write(p_action text,p_user uuid,p_date date,p_month text,p_detail jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare nm text;
begin
  select p.name into nm from public.profiles p where p.user_id=auth.uid();
  insert into public.attendance_edit_log(actor_id,actor_name,actor_role,action,user_id,work_date,month,detail)
  values(auth.uid(),nm,public.my_role(),p_action,p_user,p_date,p_month,coalesce(p_detail,'{}'::jsonb));
end $$;
revoke all on function public.att_edit_log_write(text,uuid,date,text,jsonb) from public,anon,authenticated;

-- 이 달이 원장 확정 상태인지(확정된 달의 표시·다시 계산은 되돌리기 뒤에)
create or replace function public.att_month_is_final(p_month text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select m.status='확정' from public.att_months m where m.month=p_month),false)
$$;
revoke all on function public.att_month_is_final(text) from public,anon,authenticated;

-- 시간제 직원 번호만(금액은 안 내보냄) — 매니저·실장·원장. p_date가 있으면 그날 기준.
create or replace function public.att_hourly_user_ids(p_date date default null)
returns setof uuid language sql stable security definer set search_path='' as $$
  select t.user_id from (
    select distinct on (w.user_id) w.user_id,w.hourly_enabled
    from public.wage_info w
    where w.effective_from<=coalesce(p_date,(now() at time zone 'Asia/Seoul')::date)
    order by w.user_id,w.effective_from desc
  ) t
  where coalesce(t.hourly_enabled,false) and public.my_role() in ('manager','chief','owner')
$$;
revoke all on function public.att_hourly_user_ids(date) from public,anon;
grant execute on function public.att_hourly_user_ids(date) to authenticated;

-- 직원별 근무조 바꾸기(빈 값 = 자동)
create or replace function public.att_set_shift_group(p_user uuid,p_group text)
returns text language plpgsql security definer set search_path='' as $$
declare g text:=nullif(pg_catalog.btrim(coalesce(p_group,'')),''); old text;
begin
  if public.my_role() not in ('manager','chief','owner') or not public.employee_hub_access_allowed() then raise exception 'manager, chief or owner required'; end if;
  if g is not null and g not in ('A','B','C') then raise exception 'invalid shift group'; end if;
  select p.att_shift_group into old from public.profiles p where p.user_id=p_user for update;
  if not found then raise exception 'profile not found'; end if;
  if old is distinct from g then
    update public.profiles set att_shift_group=g where user_id=p_user;
    perform public.att_edit_log_write('group_change',p_user,null,null,jsonb_build_object('from',old,'to',g));
  end if;
  return g;
end $$;
revoke all on function public.att_set_shift_group(uuid,text) from public,anon;
grant execute on function public.att_set_shift_group(uuid,text) to authenticated;

-- 관리자 표시 넣기(같은 직원·날짜·종류가 이미 켜져 있으면 그대로 돌려줌)
create or replace function public.att_mark_add(p_user uuid,p_date date,p_mark text,p_note text default null)
returns public.attendance_day_marks language plpgsql security definer set search_path='' as $$
declare r public.attendance_day_marks; m text;
begin
  if public.my_role() not in ('manager','chief','owner') or not public.employee_hub_access_allowed() then raise exception 'manager, chief or owner required'; end if;
  if p_mark is null or p_mark not in ('annual','am_half','pm_half','early_ok','late_ok','official') then raise exception 'invalid mark'; end if;
  if p_date is null or not exists(select 1 from public.profiles p where p.user_id=p_user) then raise exception 'invalid user or date'; end if;
  m:=to_char(p_date,'YYYY-MM');
  if public.att_month_is_final(m) then raise exception 'month is final'; end if;
  select * into r from public.attendance_day_marks where user_id=p_user and work_date=p_date and mark=p_mark and removed_at is null;
  if found then return r; end if;
  insert into public.attendance_day_marks(user_id,work_date,mark,note,created_by)
  values(p_user,p_date,p_mark,nullif(pg_catalog.btrim(coalesce(p_note,'')),''),auth.uid()) returning * into r;
  perform public.att_edit_log_write('mark_add',p_user,p_date,m,jsonb_build_object('mark',p_mark,'id',r.id,'note',r.note));
  return r;
end $$;
revoke all on function public.att_mark_add(uuid,date,text,text) from public,anon;
grant execute on function public.att_mark_add(uuid,date,text,text) to authenticated;

-- 관리자 표시 지우기(행은 남기고 지운 사람·시각만 채움)
create or replace function public.att_mark_remove(p_id bigint)
returns public.attendance_day_marks language plpgsql security definer set search_path='' as $$
declare r public.attendance_day_marks; m text;
begin
  if public.my_role() not in ('manager','chief','owner') or not public.employee_hub_access_allowed() then raise exception 'manager, chief or owner required'; end if;
  select * into r from public.attendance_day_marks where id=p_id for update;
  if not found then raise exception 'mark not found'; end if;
  if r.removed_at is not null then return r; end if;
  m:=to_char(r.work_date,'YYYY-MM');
  if public.att_month_is_final(m) then raise exception 'month is final'; end if;
  update public.attendance_day_marks set removed_by=auth.uid(),removed_at=now() where id=p_id returning * into r;
  perform public.att_edit_log_write('mark_remove',r.user_id,r.work_date,m,jsonb_build_object('mark',r.mark,'id',r.id));
  return r;
end $$;
revoke all on function public.att_mark_remove(bigint) from public,anon;
grant execute on function public.att_mark_remove(bigint) to authenticated;

-- 「이 달 다시 계산」 결과 기록(계산·저장은 화면이 하고, 몇 줄 바뀌었는지를 여기에 남김)
create or replace function public.att_log_recalc(p_month text,p_total int,p_changed int,p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if public.my_role() not in ('manager','chief','owner') or not public.employee_hub_access_allowed() then raise exception 'manager, chief or owner required'; end if;
  if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid month'; end if;
  perform public.att_edit_log_write('recalc',null,null,p_month,
    coalesce(p_detail,'{}'::jsonb)||jsonb_build_object('total',p_total,'changed',p_changed));
end $$;
revoke all on function public.att_log_recalc(text,int,int,jsonb) from public,anon;
grant execute on function public.att_log_recalc(text,int,int,jsonb) to authenticated;

-- 월 마감 결재: manager_check → chief_check → owner_confirm, 되돌리기 revert(원장만, 한 단계씩)
create or replace function public.att_month_step(p_month text,p_action text)
returns public.att_months language plpgsql security definer set search_path='' as $$
declare rl text:=public.my_role(); nm text; r public.att_months; st text; nx text;
begin
  if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid month'; end if;
  if rl not in ('manager','chief','owner') or not public.employee_hub_access_allowed() then raise exception 'manager, chief or owner required'; end if;
  select p.name into nm from public.profiles p where p.user_id=auth.uid();
  insert into public.att_months(month,status) values(p_month,'집계중') on conflict (month) do nothing;
  select * into r from public.att_months where month=p_month for update;
  st:=r.status;
  if p_action='manager_check' then
    if rl<>'manager' then raise exception 'manager role required'; end if;
    if st<>'집계중' then raise exception 'step out of order (status=%)',st; end if;
    nx:='매니저확인';
    update public.att_months set status=nx,manager_checked_by=nm,manager_checked_at=now() where month=p_month returning * into r;
  elsif p_action='chief_check' then
    if rl<>'chief' then raise exception 'chief role required'; end if;
    if st<>'매니저확인' then raise exception 'step out of order (status=%)',st; end if;
    nx:='실장확인';
    update public.att_months set status=nx,chief_checked_by=nm,chief_checked_at=now() where month=p_month returning * into r;
  elsif p_action='owner_confirm' then
    if rl<>'owner' then raise exception 'owner role required'; end if;
    if st<>'실장확인' then raise exception 'step out of order (status=%)',st; end if;
    nx:='확정';
    update public.att_months set status=nx,closed_by=nm,closed_at=now() where month=p_month returning * into r;
  elsif p_action='revert' then
    if rl<>'owner' then raise exception 'owner role required'; end if;
    if st='확정' then
      nx:='실장확인';
      update public.att_months set status=nx,closed_by=null,closed_at=null where month=p_month returning * into r;
    elsif st='실장확인' then
      nx:='매니저확인';
      update public.att_months set status=nx,chief_checked_by=null,chief_checked_at=null where month=p_month returning * into r;
    elsif st='매니저확인' then
      nx:='집계중';
      update public.att_months set status=nx,manager_checked_by=null,manager_checked_at=null where month=p_month returning * into r;
    else raise exception 'nothing to revert (status=%)',st;
    end if;
  else raise exception 'invalid action'; end if;
  perform public.att_edit_log_write('month_step',null,null,p_month,jsonb_build_object('action',p_action,'from',st,'to',nx));
  return r;
end $$;
revoke all on function public.att_month_step(text,text) from public,anon;
grant execute on function public.att_month_step(text,text) to authenticated;

-- ───────────────────────── 확인 쿼리(적용 뒤 직접 실행해 보기) ─────────────────────────
-- select key,value from public.app_settings where key like 'att.shift_group.%' order by key;      -- 3줄
-- select column_name from information_schema.columns where table_name='att_months' and column_name like '%checked%'; -- 4줄
-- select proname from pg_proc where proname in ('att_month_step','att_mark_add','att_mark_remove','att_set_shift_group','att_log_recalc','att_hourly_user_ids'); -- 6줄
