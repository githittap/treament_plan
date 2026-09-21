-- 1차 단계 배포 후보 전용. 운영 적용 전 schema/policy snapshot과 총괄 검토가 필요하다.
-- 범위: 직원 소명/수기 제출 -> 실장/원장 승인 -> resolution 생성 -> 본인/관리자 조회.
-- 기존 attendance 원본은 지문(source=fp)인 경우 절대 덮어쓰지 않는다.

create table if not exists public.attendance_manual_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  work_date date not null,
  clock_in time,
  clock_out time,
  late_min int not null default 0 check (late_min>=0),
  early_min int not null default 0 check (early_min>=0),
  overtime_raw_text text not null default '',
  overtime_min int not null default 0 check (overtime_min>=0),
  reason text,
  reason_required boolean not null default false,
  supersedes_id bigint references public.attendance_manual_entries(id),
  status text not null default '대기' check (status in ('대기','실장승인','원장확정','반려','대체')),
  chief_by text, chief_at timestamptz, owner_by text, owner_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.manual_attendance_status_history (
  id bigint generated always as identity primary key,
  entry_id bigint not null references public.attendance_manual_entries(id) on delete restrict,
  from_status text, to_status text not null,
  actor_id uuid not null references public.profiles(user_id), actor_name text not null,
  reason text, acted_at timestamptz not null default now()
);

create table if not exists public.attendance_manual_revisions (
  id bigint generated always as identity primary key,
  entry_id bigint not null references public.attendance_manual_entries(id) on delete restrict,
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  work_date date not null, payload jsonb not null,
  recorded_by uuid not null references public.profiles(user_id), recorded_at timestamptz not null default now()
);

create table if not exists public.attendance_issue_resolutions (
  id bigint generated always as identity primary key,
  issue_id bigint not null references public.attendance_issues(id) on delete restrict,
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  work_date date not null, clock_in time, clock_out time,
  late_min int not null default 0 check (late_min>=0), early_min int not null default 0 check (early_min>=0),
  overtime_min int not null default 0 check (overtime_min>=0),
  source text not null default 'issue_adjustment' check (source='issue_adjustment'),
  approved_by uuid not null references public.profiles(user_id), approved_at timestamptz not null default now(),
  unique(issue_id)
);

alter table public.attendance_manual_entries enable row level security;
alter table public.manual_attendance_status_history enable row level security;
alter table public.attendance_manual_revisions enable row level security;
alter table public.attendance_issue_resolutions enable row level security;
alter table public.attendance_issues enable row level security;

revoke all on table public.attendance_manual_entries,public.manual_attendance_status_history,public.attendance_manual_revisions,public.attendance_issue_resolutions from public,anon,authenticated;
grant select on table public.attendance_manual_entries,public.manual_attendance_status_history,public.attendance_manual_revisions,public.attendance_issue_resolutions to authenticated;
-- 승인 단계는 RPC 하나로만 통과한다. 기존 운영 정책의 직접 UPDATE 우회도 닫는다.
revoke update on table public.attendance_issues from public,anon,authenticated;
create or replace function public.guard_attendance_issue_insert()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true) then raise exception 'active approved profile required'; end if;
  if (new.user_id is distinct from auth.uid() and not (new.rule_label='자동' and public.my_role() in ('manager','chief','owner'))) or new.status is distinct from '대기' or new.chief_by is not null or new.chief_at is not null or new.owner_by is not null or new.owner_at is not null then raise exception 'attendance issue must start as pending self submission'; end if;
  if new.type not in ('시업누락','종업누락','정정') or new.rule_label not in ('지문인식오류','입력오류','기타','자동') then raise exception 'invalid attendance issue classification'; end if;
  return new;
end; $$;
drop trigger if exists guard_attendance_issue_insert on public.attendance_issues;
create trigger guard_attendance_issue_insert before insert on public.attendance_issues for each row execute function public.guard_attendance_issue_insert();
drop policy if exists attendance_issues_insert_self on public.attendance_issues;
create policy attendance_issues_insert_self on public.attendance_issues for insert to authenticated with check (
  (
    user_id=auth.uid() and coalesce(status,'대기')='대기' and chief_by is null and chief_at is null and owner_by is null and owner_at is null
    and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true)
  ) or (
    rule_label='자동' and coalesce(status,'대기')='대기' and chief_by is null and chief_at is null and owner_by is null and owner_at is null
    and public.my_role() in ('manager','chief','owner')
    and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true)
  )
);

drop policy if exists attendance_manual_release_select on public.attendance_manual_entries;
create policy attendance_manual_release_select on public.attendance_manual_entries for select to authenticated using (
  exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true)
  and (user_id=auth.uid() or public.my_role() in ('chief','owner'))
);
drop policy if exists attendance_manual_history_release_select on public.manual_attendance_status_history;
create policy attendance_manual_history_release_select on public.manual_attendance_status_history for select to authenticated using (
  exists(select 1 from public.attendance_manual_entries e where e.id=entry_id and (e.user_id=auth.uid() or public.my_role() in ('chief','owner')))
);
drop policy if exists attendance_manual_revision_release_select on public.attendance_manual_revisions;
create policy attendance_manual_revision_release_select on public.attendance_manual_revisions for select to authenticated using (
  exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true)
  and (user_id=auth.uid() or public.my_role() in ('chief','owner'))
);
drop policy if exists attendance_issue_resolution_release_select on public.attendance_issue_resolutions;
create policy attendance_issue_resolution_release_select on public.attendance_issue_resolutions for select to authenticated using (
  exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true)
  and (user_id=auth.uid() or public.my_role() in ('chief','owner'))
);

create or replace function public.release_normalize_overtime(p_raw text)
returns int language plpgsql immutable strict set search_path=public as $$
declare s text:=trim(coalesce(p_raw,'')); m text[]; n int;
begin
  if s='' then return 0; end if;
  if s~'^\d+$' then n:=s::int; else m:=regexp_match(s,'^(\d{1,2}):(\d{2})$'); if m is null or m[2]::int>59 then raise exception 'invalid overtime raw value'; end if; n:=m[1]::int*60+m[2]::int; end if;
  return floor(n/10.0)*10;
end; $$;

create or replace function public.submit_attendance_issue(p_work_date date,p_type text,p_rule_label text,p_reason text)
returns public.attendance_issues language plpgsql security definer set search_path=public as $$
declare r public.attendance_issues;
begin
  if not exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true) or p_work_date is null or p_type<>'정정' or p_rule_label not in ('지문인식오류','입력오류','기타') or coalesce(trim(p_reason),'')='' then raise exception 'invalid attendance issue submission'; end if;
  insert into public.attendance_issues(user_id,work_date,type,rule_label,reason) values(auth.uid(),p_work_date,p_type,p_rule_label,p_reason) returning * into r;
  return r;
end; $$;

create or replace function public.record_auto_attendance_issue(p_user_id uuid,p_work_date date,p_type text,p_reason text)
returns public.attendance_issues language plpgsql security definer set search_path=public as $$
declare r public.attendance_issues; role_name text;
begin
  if not exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true) then raise exception 'active approved profile required'; end if;
  role_name:=coalesce(public.my_role(),''); if role_name not in ('manager','chief','owner') or p_user_id is null or p_work_date is null or p_type not in ('시업누락','종업누락') then raise exception 'automatic attendance issue requires leadership'; end if;
  select * into r from public.attendance_issues where user_id=p_user_id and work_date=p_work_date order by id desc limit 1 for update;
  if found then return r; end if;
  insert into public.attendance_issues(user_id,work_date,type,reason,rule_label) values(p_user_id,p_work_date,p_type,p_reason,'자동') returning * into r;
  return r;
end; $$;

create or replace function public.submit_manual_attendance(p_work_date date,p_clock_in time,p_clock_out time,p_late_min int,p_early_min int,p_overtime_raw_text text,p_overtime_min int,p_reason text,p_reason_required boolean default false)
returns public.attendance_manual_entries language plpgsql security definer set search_path=public as $$
declare r public.attendance_manual_entries; prior public.attendance_manual_entries; actor_name text; calculated_ot int;
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'|'||coalesce(p_work_date::text,''),0));
  if not exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true) or p_work_date is null or p_late_min is null or p_late_min<0 or p_early_min is null or p_early_min<0 or (p_reason_required and coalesce(trim(p_reason),'')='') then raise exception 'invalid manual attendance submission'; end if;
  calculated_ot:=public.release_normalize_overtime(coalesce(p_overtime_raw_text,'')); if p_overtime_min is distinct from calculated_ot then raise exception 'overtime value mismatch'; end if;
  select * into prior from public.attendance_manual_entries where user_id=auth.uid() and work_date=p_work_date and status in ('대기','실장승인') order by id desc limit 1 for update;
  select name into actor_name from public.profiles where user_id=auth.uid();
  if prior.id is not null then
    update public.attendance_manual_entries set status='대체' where id=prior.id;
    insert into public.manual_attendance_status_history(entry_id,from_status,to_status,actor_id,actor_name,reason) values(prior.id,prior.status,'대체',auth.uid(),actor_name,'새 수기 제출로 대체');
  end if;
  insert into public.attendance_manual_entries(user_id,work_date,clock_in,clock_out,late_min,early_min,overtime_raw_text,overtime_min,reason,reason_required,supersedes_id)
  values(auth.uid(),p_work_date,p_clock_in,p_clock_out,p_late_min,p_early_min,coalesce(p_overtime_raw_text,''),calculated_ot,p_reason,coalesce(p_reason_required,false),prior.id) returning * into r;
  insert into public.attendance_manual_revisions(entry_id,user_id,work_date,payload,recorded_by) values(r.id,r.user_id,r.work_date,jsonb_build_object('clock_in',r.clock_in,'clock_out',r.clock_out,'late_min',r.late_min,'early_min',r.early_min,'overtime_min',r.overtime_min,'reason',r.reason),auth.uid());
  insert into public.manual_attendance_status_history(entry_id,from_status,to_status,actor_id,actor_name,reason) values(r.id,null,'대기',auth.uid(),actor_name,r.reason);
  return r;
end; $$;

create or replace function public.review_attendance_issue(p_id bigint,p_action text)
returns public.attendance_issues language plpgsql security definer set search_path=public as $$
declare r public.attendance_issues; initial public.attendance_issues; role_name text; actor_name text;
begin
  if not exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true) then raise exception 'active approved profile required'; end if;
  role_name:=coalesce(public.my_role(),''); select * into initial from public.attendance_issues where id=p_id; if not found then raise exception 'attendance issue not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(initial.user_id::text||'|'||initial.work_date::text,0));
  select * into r from public.attendance_issues where id=p_id for update; if not found then raise exception 'attendance issue disappeared'; end if;
  select name into actor_name from public.profiles where user_id=auth.uid();
  if r.status='원장확정' then raise exception 'attendance issue is immutable'; end if;
  if p_action='reject' and role_name in ('chief','owner') and r.status in ('대기','실장승인') then update public.attendance_issues set status='반려',chief_by=case when role_name='chief' then actor_name else chief_by end,chief_at=case when role_name='chief' then now() else chief_at end,owner_by=case when role_name='owner' then actor_name else owner_by end,owner_at=case when role_name='owner' then now() else owner_at end where id=p_id;
  elsif p_action='approve' and role_name='chief' and r.status='대기' then update public.attendance_issues set status='실장승인',chief_by=actor_name,chief_at=now() where id=p_id;
  elsif p_action='approve' and role_name='owner' and r.status='실장승인' then update public.attendance_issues set status='원장확정',owner_by=actor_name,owner_at=now() where id=p_id;
  else raise exception 'attendance issue review is not allowed'; end if;
  select * into r from public.attendance_issues where id=p_id; return r;
end; $$;

create or replace function public.review_manual_attendance(p_id bigint,p_action text)
returns public.attendance_manual_entries language plpgsql security definer set search_path=public as $$
declare r public.attendance_manual_entries; role_name text; actor_name text; v_issue_id bigint; n int;
begin
  if not exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active=true and p.approved=true) then raise exception 'active approved profile required'; end if;
  role_name:=coalesce(public.my_role(),''); select * into r from public.attendance_manual_entries where id=p_id; if not found then raise exception 'manual attendance not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(r.user_id::text||'|'||r.work_date::text,0));
  select * into r from public.attendance_manual_entries where id=p_id for update; if not found then raise exception 'manual attendance disappeared'; end if;
  if r.status='원장확정' then raise exception 'confirmed manual attendance is immutable'; end if;
  if exists(select 1 from public.attendance_manual_entries newer where newer.supersedes_id=r.id and newer.status in ('대기','실장승인')) then raise exception 'obsolete manual attendance version'; end if;
  select name into actor_name from public.profiles where user_id=auth.uid();
  if p_action='reject' and role_name in ('chief','owner') and r.status in ('대기','실장승인') then update public.attendance_manual_entries set status='반려',chief_by=case when role_name='chief' then actor_name else chief_by end,chief_at=case when role_name='chief' then now() else chief_at end,owner_by=case when role_name='owner' then actor_name else owner_by end,owner_at=case when role_name='owner' then now() else owner_at end where id=p_id;
  elsif p_action='approve' and role_name='chief' and r.status='대기' then update public.attendance_manual_entries set status='실장승인',chief_by=actor_name,chief_at=now() where id=p_id;
  elsif p_action='approve' and role_name='owner' and r.status='실장승인' then
    select id into v_issue_id from public.attendance_issues where user_id=r.user_id and work_date=r.work_date and rule_label='지문인식오류' and status='원장확정' order by id desc limit 1;
    if exists(select 1 from public.attendance where user_id=r.user_id and work_date=r.work_date and source='fp') then
      if v_issue_id is null then raise exception 'fingerprint evidence requires approved recognition-error issue'; end if;
      if exists(select 1 from public.attendance_issue_resolutions old where old.issue_id=v_issue_id and (old.user_id is distinct from r.user_id or old.work_date is distinct from r.work_date or old.clock_in is distinct from r.clock_in or old.clock_out is distinct from r.clock_out or old.late_min is distinct from r.late_min or old.early_min is distinct from r.early_min or old.overtime_min is distinct from r.overtime_min)) then raise exception 'different recognition-error resolution already exists'; end if;
      insert into public.attendance_issue_resolutions(issue_id,user_id,work_date,clock_in,clock_out,late_min,early_min,overtime_min,approved_by) values(v_issue_id,r.user_id,r.work_date,r.clock_in,r.clock_out,r.late_min,r.early_min,r.overtime_min,auth.uid()) on conflict(issue_id) do nothing;
      if not exists(select 1 from public.attendance_issue_resolutions old where old.issue_id=v_issue_id and old.user_id=r.user_id and old.work_date=r.work_date and old.clock_in is not distinct from r.clock_in and old.clock_out is not distinct from r.clock_out and old.late_min=r.late_min and old.early_min=r.early_min and old.overtime_min=r.overtime_min) then raise exception 'recognition-error resolution could not be recorded'; end if;
      update public.attendance_manual_entries set status='원장확정',owner_by=actor_name,owner_at=now() where id=p_id;
    else
      insert into public.attendance(user_id,work_date,clock_in,clock_out,source,late_min,early_min,overtime_min,memo) values(r.user_id,r.work_date,r.clock_in,r.clock_out,'manual',r.late_min,r.early_min,r.overtime_min,r.reason) on conflict(user_id,work_date) do update set clock_in=excluded.clock_in,clock_out=excluded.clock_out,source='manual',late_min=excluded.late_min,early_min=excluded.early_min,overtime_min=excluded.overtime_min,memo=excluded.memo where public.attendance.source='manual';
      get diagnostics n=row_count; if n<>1 then raise exception 'manual attendance finalization conflicted'; end if;
      update public.attendance_manual_entries set status='원장확정',owner_by=actor_name,owner_at=now() where id=p_id;
    end if;
  else raise exception 'manual attendance review is not allowed'; end if;
  insert into public.manual_attendance_status_history(entry_id,from_status,to_status,actor_id,actor_name) values(p_id,r.status,(select status from public.attendance_manual_entries where id=p_id),auth.uid(),actor_name);
  select * into r from public.attendance_manual_entries where id=p_id; return r;
end; $$;

revoke insert on table public.attendance_issues from public,anon,authenticated;
revoke all on function public.release_normalize_overtime(text),public.submit_attendance_issue(date,text,text,text),public.record_auto_attendance_issue(uuid,date,text,text),public.submit_manual_attendance(date,time,time,int,int,text,int,text,boolean),public.review_attendance_issue(bigint,text),public.review_manual_attendance(bigint,text) from public,anon,authenticated;
grant execute on function public.release_normalize_overtime(text),public.submit_attendance_issue(date,text,text,text),public.record_auto_attendance_issue(uuid,date,text,text),public.submit_manual_attendance(date,time,time,int,int,text,int,text,boolean),public.review_attendance_issue(bigint,text),public.review_manual_attendance(bigint,text) to authenticated;
