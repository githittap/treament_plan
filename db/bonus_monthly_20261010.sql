-- 원장 전용 월별 상여. 기존 employee_hub_access_allowed / my_role 접근 기준 사용.
begin;
create table if not exists public.bonus_criteria (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name))>0),
 kind text not null check(kind in('amount','points','point_rate')), value numeric not null default 0 check(value>=0),
 sort_order integer not null default 0,active boolean not null default true,
 updated_at timestamptz not null default now(),updated_by uuid
);
create unique index if not exists bonus_point_rate_one on public.bonus_criteria(kind) where kind='point_rate';
create table if not exists public.bonus_entries (
 id uuid primary key default gen_random_uuid(),month text not null check(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 person_key text not null,user_id uuid,source_name text not null check(length(btrim(source_name))>0),
 amount numeric check(amount>=0),memo text not null default '',selections jsonb not null default '{}',
 criteria_snapshot jsonb not null default '[]',updated_at timestamptz not null default now(),updated_by uuid,
 unique(month,person_key),check(person_key=coalesce(user_id::text,'name:'||source_name)),
 check(jsonb_typeof(selections)='object'),check(jsonb_typeof(criteria_snapshot)='array')
);
create table if not exists public.bonus_defaults (
 person_key text primary key,id uuid not null unique default gen_random_uuid(),user_id uuid,
 source_name text not null check(length(btrim(source_name))>0),amount numeric check(amount>=0),
 memo text not null default '',active boolean not null default true,
 updated_at timestamptz not null default now(),updated_by uuid,
 check(person_key=coalesce(user_id::text,'name:'||source_name))
);
create table if not exists public.bonus_history (
 id bigint generated always as identity primary key,table_name text not null,row_id uuid not null,
 month text,actor uuid,changed_at timestamptz not null default now(),before_row jsonb,after_row jsonb
);
alter table public.bonus_entries add column if not exists confirmed boolean not null default false;
alter table public.bonus_entries add column if not exists confirmed_at timestamptz;
alter table public.bonus_entries add column if not exists confirmed_by uuid;
-- 일반 저장은 확정 필드를 무시한다. 다른 상여 RPC는 진입 즉시 확정 표지를 지운다.
-- 확정 표지와 함수 소유자 문맥은 bonus_confirm 안에서만 함께 유지된다.
create or replace function public.bonus_guard_confirmation() returns trigger language plpgsql set search_path='' as $$
declare confirming boolean;
begin
 confirming:=coalesce(current_setting('app.bonus_confirming',true),'')='on'
  and current_user=(select pg_catalog.pg_get_userbyid(proowner) from pg_catalog.pg_proc where oid=to_regprocedure('public.bonus_confirm(text,text[])'))
  and public.employee_hub_access_allowed() and public.my_role()='owner';
 if tg_op='INSERT' then
  new.confirmed:=false;new.confirmed_at:=null;new.confirmed_by:=null;
 elsif row(new.amount,new.memo,new.selections,new.criteria_snapshot,new.month,new.person_key,new.user_id,new.source_name)
  is distinct from row(old.amount,old.memo,old.selections,old.criteria_snapshot,old.month,old.person_key,old.user_id,old.source_name) then
  new.confirmed:=false;new.confirmed_at:=null;new.confirmed_by:=null;
 elsif confirming then
  new.confirmed:=true;new.confirmed_at:=now();new.confirmed_by:=auth.uid();
 else
  new.confirmed:=old.confirmed;new.confirmed_at:=old.confirmed_at;new.confirmed_by:=old.confirmed_by;
 end if;
 return new;
end;$$;
revoke all on function public.bonus_guard_confirmation() from public,anon,authenticated;
drop trigger if exists bonus_guard_confirmation on public.bonus_entries;
create trigger bonus_guard_confirmation before insert or update on public.bonus_entries for each row execute function public.bonus_guard_confirmation();
create or replace function public.bonus_confirm(p_month text,p_person_keys text[] default null) returns integer
language plpgsql security definer set search_path='' as $$
declare changed integer;prior text;
begin
 if not coalesce(public.employee_hub_access_allowed(),false) or public.my_role() is distinct from 'owner' then raise exception 'owner only';end if;
 if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid month';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bonus:'||p_month,0));
 prior:=coalesce(current_setting('app.bonus_confirming',true),'');
 perform set_config('app.bonus_confirming','on',true);
 update public.bonus_entries set confirmed=true where month=p_month and not confirmed
  and (coalesce(cardinality(p_person_keys),0)=0 or person_key=any(p_person_keys));
 get diagnostics changed=row_count;
 perform set_config('app.bonus_confirming',prior,true);
 return changed;
end;$$;
revoke all on function public.bonus_confirm(text,text[]) from public,anon,authenticated;
grant execute on function public.bonus_confirm(text,text[]) to authenticated;
create or replace function public.bonus_set_audit() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at:=now();new.updated_by:=auth.uid();return new;end;$$;
create or replace function public.bonus_write_history() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.bonus_history(table_name,row_id,month,actor,before_row,after_row)
 values(tg_table_name,coalesce(new.id,old.id),coalesce(to_jsonb(new)->>'month',to_jsonb(old)->>'month'),auth.uid(),
 case when tg_op='INSERT' then null else to_jsonb(old) end,case when tg_op='DELETE' then null else to_jsonb(new) end);
 return coalesce(new,old);
end;$$;
revoke all on function public.bonus_set_audit(),public.bonus_write_history() from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['bonus_criteria','bonus_entries','bonus_defaults','bonus_history'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('drop policy if exists bonus_owner_read on public.%I',t);
  execute format('create policy bonus_owner_read on public.%I for select to authenticated using(public.employee_hub_access_allowed() and public.my_role()=''owner'')',t);
  execute format('drop policy if exists bonus_owner_gate on public.%I',t);
  execute format('create policy bonus_owner_gate on public.%I as restrictive for all to authenticated using(public.employee_hub_access_allowed() and public.my_role()=''owner'') with check(public.employee_hub_access_allowed() and public.my_role()=''owner'')',t);
  execute format('drop policy if exists deputy_contract_only_v4_block on public.%I',t);
  execute format('create policy deputy_contract_only_v4_block on public.%I as restrictive for all to authenticated using(public.my_role()<>''deputy'') with check(public.my_role()<>''deputy'')',t);
  if to_regprocedure('public._install_employee_hub_access_gate(regclass)') is not null then perform public._install_employee_hub_access_gate(('public.'||t)::regclass);end if;
  if t<>'bonus_history' then
   execute format('grant insert,update,delete on public.%I to authenticated',t);
   execute format('drop policy if exists bonus_owner_write on public.%I',t);
   execute format('create policy bonus_owner_write on public.%I for all to authenticated using(public.employee_hub_access_allowed() and public.my_role()=''owner'') with check(public.employee_hub_access_allowed() and public.my_role()=''owner'')',t);
   execute format('drop trigger if exists bonus_set_audit on public.%I',t);
   execute format('create trigger bonus_set_audit before insert or update on public.%I for each row execute function public.bonus_set_audit()',t);
   execute format('drop trigger if exists bonus_write_history on public.%I',t);
   execute format('create trigger bonus_write_history after insert or update or delete on public.%I for each row execute function public.bonus_write_history()',t);
  end if;
 end loop;
end;$$;
-- 저장 순간에도 빈 행인 사람만 복사한다. 충돌 행 잠금 뒤 조건을 다시 검사한다.
create or replace function public.bonus_copy_previous(p_month text) returns integer
language plpgsql security definer set search_path='' as $$
declare copied integer;
begin
 perform set_config('app.bonus_confirming','',true);
 if not coalesce(public.employee_hub_access_allowed(),false) or public.my_role() is distinct from 'owner' then
  raise exception 'owner only';
 end if;
 if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid month';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bonus:'||p_month,0));
 insert into public.bonus_entries as current_entry(month,person_key,user_id,source_name,amount,memo,selections,criteria_snapshot)
 select p_month,person_key,user_id,source_name,amount,memo,selections,'[]'::jsonb
 from public.bonus_entries where month=to_char((p_month||'-01')::date-interval '1 month','YYYY-MM')
 on conflict(month,person_key) do update set
  user_id=excluded.user_id,source_name=excluded.source_name,amount=excluded.amount,
  memo=excluded.memo,selections=excluded.selections,criteria_snapshot='[]'::jsonb
 where not current_entry.confirmed and current_entry.amount is null and current_entry.memo ~ '^[[:space:]]*$' and current_entry.selections='{}'::jsonb;
 get diagnostics copied=row_count;
 return copied;
end;$$;
revoke all on function public.bonus_copy_previous(text) from public,anon,authenticated;
grant execute on function public.bonus_copy_previous(text) to authenticated;
-- 원장 기본 제안값도 저장 순간에 빈 줄인 경우에만 채운다. 0원·확정 빈 줄도 보존한다.
create or replace function public.bonus_apply_defaults(p_month text) returns integer
language plpgsql security definer set search_path='' as $$
declare copied integer;
begin
 perform set_config('app.bonus_confirming','',true);
 if not coalesce(public.employee_hub_access_allowed(),false) or public.my_role() is distinct from 'owner' then raise exception 'owner only';end if;
 if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid month';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bonus:'||p_month,0));
 insert into public.bonus_entries as current_entry(month,person_key,user_id,source_name,amount,memo)
 select p_month,person_key,user_id,source_name,amount,memo from public.bonus_defaults
 where active and (amount is not null or memo !~ '^[[:space:]]*$')
 on conflict(month,person_key) do update set user_id=excluded.user_id,source_name=excluded.source_name,
  amount=excluded.amount,memo=excluded.memo,selections='{}'::jsonb,criteria_snapshot='[]'::jsonb
 where not current_entry.confirmed and current_entry.amount is null and current_entry.memo ~ '^[[:space:]]*$' and current_entry.selections='{}'::jsonb;
 get diagnostics copied=row_count;return copied;
end;$$;
revoke all on function public.bonus_apply_defaults(text) from public,anon,authenticated;
grant execute on function public.bonus_apply_defaults(text) to authenticated;
-- 원본 CSV는 받지 않는다. 선택한 제안 줄만 받고 월별 잠금 후 조건부로 넣는다.
create or replace function public.bonus_import_suggestions(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare copied integer;target_month text;
begin
 perform set_config('app.bonus_confirming','',true);
 if not coalesce(public.employee_hub_access_allowed(),false) or public.my_role() is distinct from 'owner' then raise exception 'owner only';end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'invalid suggestions';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r)<>'object'
  or coalesce(r->>'month','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  or length(btrim(coalesce(r->>'source_name','')))=0
  or r->>'person_key' is distinct from coalesce(nullif(r->>'user_id',''),'name:'||(r->>'source_name'))
  or (r->>'amount')::numeric<0) then raise exception 'invalid suggestions';end if;
 for target_month in select distinct r->>'month' from jsonb_array_elements(p_rows) r order by 1 loop
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bonus:'||target_month,0));
 end loop;
 insert into public.bonus_entries as current_entry(month,person_key,user_id,source_name,amount,memo)
 select distinct on (r.month,r.person_key) r.month,r.person_key,r.user_id,r.source_name,r.amount,coalesce(r.memo,'')
 from jsonb_array_elements(p_rows) with ordinality v(data,n)
 cross join lateral jsonb_to_record(v.data) as r(month text,person_key text,user_id uuid,source_name text,amount numeric,memo text)
 order by r.month,r.person_key,v.n
 on conflict(month,person_key) do update set user_id=excluded.user_id,source_name=excluded.source_name,
  amount=excluded.amount,memo=excluded.memo,selections='{}'::jsonb,criteria_snapshot='[]'::jsonb
 where not current_entry.confirmed and current_entry.amount is null and current_entry.memo ~ '^[[:space:]]*$' and current_entry.selections='{}'::jsonb;
 get diagnostics copied=row_count;return jsonb_build_object('inserted',copied,'skipped',jsonb_array_length(p_rows)-copied);
end;$$;
revoke all on function public.bonus_import_suggestions(jsonb) from public,anon,authenticated;
grant execute on function public.bonus_import_suggestions(jsonb) to authenticated;
commit;
