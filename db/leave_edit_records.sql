begin;

alter table public.leave_ledger add column effective_date date;
create table public.leave_edit_audit (
  id bigint generated always as identity primary key,
  subject text not null, subject_id bigint not null, user_id uuid not null,
  before_data jsonb not null, after_data jsonb not null,
  actor_id uuid not null, actor_name text, edited_at timestamptz not null default now()
);
alter table public.leave_edit_audit enable row level security;
revoke all on public.leave_edit_audit from public, anon, authenticated, service_role;

create function public.leave_protected_ledger_ids() returns table(ledger_id bigint)
language plpgsql security definer set search_path='' as $$
begin
  if not public.employee_hub_access_allowed() or (public.my_role() is distinct from 'owner' and not public.leave_manager_allowed()) then raise exception 'not allowed' using errcode='42501'; end if;
  return query select r.ledger_id from public.leave_accrual_runs r where r.ledger_id is not null
    union select r.revoke_ledger_id from public.leave_accrual_runs r where r.revoke_ledger_id is not null;
end $$;

create function public.edit_approved_leave_dates(
  p_id bigint, p_expected jsonb, p_type text, p_type_note text, p_date_from date, p_date_to date
) returns numeric language plpgsql security definer set search_path='' as $$
declare r public.leave_requests%rowtype; l public.leave_ledger%rowtype; x record;
  actor uuid:=auth.uid(); actor_role text:=public.my_role(); actor_name text;
  n numeric; prior numeric; half_setting text; before_data jsonb; after_data jsonb;
begin
  select name into actor_name from public.profiles where user_id=actor and active and approved;
  if not found or not public.employee_hub_access_allowed() or (actor_role is distinct from 'owner' and not public.leave_manager_allowed()) then raise exception 'not allowed' using errcode='42501'; end if;
  select * into r from public.leave_requests where id=p_id for update;
  if not found or r.status<>'승인' then raise exception 'approved request required'; end if;
  if actor_role='manager' and r.user_id=actor then raise exception 'not allowed to edit own leave' using errcode='42501'; end if;
  if p_expected is null or p_expected is distinct from jsonb_build_object('type',r.type,'type_note',r.type_note,'date_from',r.date_from,'date_to',r.date_to,'days',r.days) then raise exception 'request changed; reload'; end if;
  if exists(select 1 from public.leave_change_requests where request_id=r.id and status='대기') then raise exception 'pending change request'; end if;
  if p_date_from is null or p_date_to is null or not isfinite(p_date_from) or not isfinite(p_date_to) or p_date_to<p_date_from or p_date_to-p_date_from>366 or p_type not in ('연차','반차','조퇴','기타') or p_type is null then raise exception 'invalid leave dates or type'; end if;
  if r.type in ('기타','조퇴') and p_type<>r.type then raise exception 'original type must be preserved'; end if;
  if r.type in ('연차','반차') and p_type not in ('연차','반차') then raise exception 'invalid leave type'; end if;
  if p_type=r.type and p_date_from=r.date_from and p_date_to=r.date_to and (p_type in ('연차','기타') or coalesce(p_type_note,'')=coalesce(r.type_note,'')) then return r.days; end if;
  if p_type in ('반차','조퇴') then
    if p_date_from<>p_date_to then raise exception 'invalid half-day date'; end if;
    if nullif(btrim(p_type_note),'') is null then
      if p_type<>r.type or nullif(btrim(r.type_note),'') is not null then raise exception 'invalid half-day time'; end if;
      p_type_note:=r.type_note;
    elsif p_type_note !~ '^([01][0-9]|2[0-3]):[0-5][0-9]~([01][0-9]|2[0-3]):[0-5][0-9]$' or split_part(p_type_note,'~',1)::time>=split_part(p_type_note,'~',2)::time then raise exception 'invalid half-day time'; end if;
    select value into half_setting from public.app_settings where key='leave.half_day_value';
    n:=0.5;
    if coalesce(half_setting,'') ~ '^[0-9]+(\.[0-9]+)?$' and length(half_setting)<20 then
      if half_setting::numeric between 0.1 and 1 and mod(half_setting::numeric,0.1)=0 then n:=half_setting::numeric; end if;
    end if;
    if p_type=r.type then n:=r.days; end if;
  else
    select count(*) into n from generate_series(p_date_from::timestamp,p_date_to::timestamp,interval '1 day') d
      where not exists(select 1 from public.holidays h where h.date=d::date)
      and not exists(select 1 from public.schedules s where s.user_id=r.user_id and s.week_start=date_trunc('week',d)::date and s.day=extract(dow from d)::integer and s.shift='off');
    if p_type='기타' then p_type_note:=r.type_note; else p_type_note:=null; end if;
  end if;
  if p_type=r.type and p_type_note is not distinct from r.type_note and p_date_from=r.date_from and p_date_to=r.date_to and n=r.days then return n; end if;
  perform pg_advisory_xact_lock(hashtextextended(r.user_id::text,0));
  if (select count(*) from public.leave_ledger where ref=r.id and kind='사용')<>1 then raise exception 'usage link missing or duplicated'; end if;
  select * into l from public.leave_ledger where ref=r.id and kind='사용' for update;
  if l.user_id<>r.user_id or exists(select 1 from public.leave_ledger where ref=r.id and (user_id<>r.user_id or (kind<>'사용' and (kind<>'조정' or coalesce(note,'') not like '승인취소 복구:%')))) then raise exception 'inconsistent linked ledger'; end if;
  select coalesce(sum(days),0) into prior from public.leave_ledger where ref=r.id and kind='조정';
  if l.days-prior<>r.days then raise exception 'inconsistent linked balance'; end if;
  before_data:=jsonb_build_object('request',jsonb_build_object('type',r.type,'type_note',r.type_note,'date_from',r.date_from,'date_to',r.date_to,'days',r.days),'usage',jsonb_build_object('id',l.id,'days',l.days,'note',l.note));
  for x in select (created_at at time zone 'Asia/Seoul')::date as day, sum(days) as amount from public.leave_ledger where ref=r.id and kind='조정' group by 1 having sum(days)<>0 loop
    insert into public.leave_ledger(user_id,kind,days,ref,note,created_at) values(r.user_id,'조정',-x.amount,r.id,'승인취소 복구: 날짜 수정 상쇄',x.day::timestamp at time zone 'Asia/Seoul');
  end loop;
  update public.leave_requests set type=p_type,type_note=p_type_note,date_from=p_date_from,date_to=p_date_to,days=n where id=r.id;
  after_data:=jsonb_build_object('type',p_type,'type_note',p_type_note,'date_from',p_date_from,'date_to',p_date_to,'days',n);
  update public.leave_ledger set days=n,note=format('%s %s~%s',p_type,p_date_from,p_date_to) where id=l.id;
  insert into public.leave_edit_audit(subject,subject_id,user_id,before_data,after_data,actor_id,actor_name)
    values('request',r.id,r.user_id,before_data,jsonb_build_object('request',after_data,'usage',(select jsonb_build_object('id',ll.id,'days',ll.days,'note',ll.note) from public.leave_ledger ll where id=l.id)),actor,actor_name);
  return n;
end $$;

create function public.update_leave_ledger_entry(p_id bigint,p_expected jsonb,p_kind text,p_days numeric,p_effective_date date,p_note text)
returns bigint language plpgsql security definer set search_path='' as $$
declare l public.leave_ledger%rowtype; original_user uuid; after_data jsonb; actor uuid:=auth.uid(); actor_role text:=public.my_role(); actor_name text;
begin
  select name into actor_name from public.profiles where user_id=actor and active and approved;
  if not found or not public.employee_hub_access_allowed() or (actor_role is distinct from 'owner' and not public.leave_manager_allowed()) then raise exception 'not allowed' using errcode='42501'; end if;
  select * into l from public.leave_ledger where id=p_id;
  if not found then raise exception 'ledger entry missing'; end if;
  original_user:=l.user_id;
  if actor_role='manager' and l.user_id=actor then raise exception 'not allowed to edit own leave' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(l.user_id::text,0));
  select * into l from public.leave_ledger where id=p_id for update;
  if not found then raise exception 'ledger entry missing'; end if;
  if l.user_id is distinct from original_user or (actor_role='manager' and l.user_id=actor) then raise exception 'ledger changed; reload'; end if;
  if p_expected is null or p_expected is distinct from jsonb_build_object('kind',l.kind,'days',l.days,'note',l.note,'effective_date',l.effective_date) then raise exception 'ledger changed; reload'; end if;
  if l.ref is not null or exists(select 1 from public.leave_accrual_runs where ledger_id=l.id or revoke_ledger_id=l.id) then raise exception 'linked or accrual entry protected'; end if;
  if p_kind is null or p_kind not in ('부여','사용','조정') or p_days is null or p_days in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or mod(p_days,0.1)<>0 or abs(p_days)>9999.9 or (p_kind in ('부여','사용') and p_days<0) then raise exception 'invalid ledger values'; end if;
  if p_kind='조정' and btrim(coalesce(p_note,'')) like '승인취소 복구:%' then raise exception 'reserved restoration note'; end if;
  if p_effective_date is not null and not isfinite(p_effective_date) then raise exception 'invalid ledger date'; end if;
  if p_kind=l.kind and p_days=l.days and p_effective_date is not distinct from l.effective_date and nullif(btrim(p_note),'') is not distinct from l.note then return l.id; end if;
  update public.leave_ledger set kind=p_kind,days=p_days,effective_date=p_effective_date,note=nullif(btrim(p_note),'') where id=l.id returning to_jsonb(leave_ledger.*) into after_data;
  insert into public.leave_edit_audit(subject,subject_id,user_id,before_data,after_data,actor_id,actor_name) values('ledger',l.id,l.user_id,to_jsonb(l),after_data,actor,actor_name);
  return l.id;
end $$;

revoke all on function public.edit_approved_leave_dates(bigint,jsonb,text,text,date,date),public.update_leave_ledger_entry(bigint,jsonb,text,numeric,date,text),public.leave_protected_ledger_ids() from public,anon,authenticated,service_role;
grant execute on function public.edit_approved_leave_dates(bigint,jsonb,text,text,date,date),public.update_leave_ledger_entry(bigint,jsonb,text,numeric,date,text),public.leave_protected_ledger_ids() to authenticated;
commit;
