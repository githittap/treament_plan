-- 직원 건의 1: 승인 연차 변경. 운영에는 검수·원장 승인 뒤 적용함.
begin;
create table if not exists public.suggestion_asks_20261006_restore (name text primary key,definition text not null);
alter table public.suggestion_asks_20261006_restore enable row level security;
revoke all on public.suggestion_asks_20261006_restore from public,anon,authenticated;
-- 기존 결재 CHECK 식을 보존하고 물품구매만 더함. 새 종류 외 기존 값은 그대로 유지됨.
do $$ declare original text; begin
  select pg_get_constraintdef(oid) into original from pg_constraint where conrelid='public.approval_docs'::regclass and conname='approval_docs_kind_check';
  if original is null then raise exception 'approval kind constraint required'; end if;
  insert into public.suggestion_asks_20261006_restore values('approval_kind',original) on conflict do nothing;
  select definition into original from public.suggestion_asks_20261006_restore where name='approval_kind';
  alter table public.approval_docs drop constraint approval_docs_kind_check;
  execute 'alter table public.approval_docs add constraint approval_docs_kind_check CHECK ('||substring(original from 7)||' OR kind = ''물품구매'')';
end $$;
create table if not exists public.leave_change_requests (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.leave_requests(id),
  user_id uuid not null references public.profiles(user_id),
  action text not null check(action in ('cancel','half')),
  type_note text, reason text not null check(length(trim(reason))>0),
  status text not null default '대기' check(status in ('대기','승인','반려')),
  created_at timestamptz not null default now(), processed_at timestamptz, processed_by uuid
);
create unique index if not exists leave_change_one_pending on public.leave_change_requests(request_id) where status='대기';
alter table public.leave_change_requests enable row level security;
revoke all on public.leave_change_requests from public,anon,authenticated;
grant select on public.leave_change_requests to authenticated;
drop policy if exists leave_change_read on public.leave_change_requests;
create policy leave_change_read on public.leave_change_requests for select to authenticated
  using(public.employee_hub_access_allowed() and (user_id=auth.uid() or public.my_role() in ('chief','owner')));

create or replace function public.request_leave_change(p_request_id bigint,p_action text,p_reason text,p_type_note text default null)
returns bigint language plpgsql security definer set search_path=public as $$
declare r public.leave_requests%rowtype; new_id bigint;
begin
  if not public.employee_hub_access_allowed() then raise exception 'active approved profile required'; end if;
  select * into r from public.leave_requests where id=p_request_id for update;
  if not found or r.user_id<>auth.uid() or r.status<>'승인' or r.date_from<(now() at time zone 'Asia/Seoul')::date then raise exception 'only own future approved leave can be changed'; end if;
  if p_action is null or p_action not in ('cancel','half') or p_reason is null or length(trim(p_reason))=0 then raise exception 'action and reason required'; end if;
  if p_action='half' and (r.type<>'연차' or r.days<=0 or p_type_note is null or p_type_note !~ '^[0-2][0-9]:[0-5][0-9]~[0-2][0-9]:[0-5][0-9]$') then raise exception 'full leave and half-day time range required'; end if;
  if p_action='half' and (split_part(p_type_note,'~',1)::time>=split_part(p_type_note,'~',2)::time) then raise exception 'invalid half-day time range'; end if;
  insert into public.leave_change_requests(request_id,user_id,action,reason,type_note) values(r.id,r.user_id,p_action,trim(p_reason),p_type_note) returning id into new_id;
  return new_id;
end $$;

create or replace function public.process_leave_change(p_id bigint,p_action text)
returns table(change_id bigint,status text) language plpgsql security definer set search_path=public as $$
declare c public.leave_change_requests%rowtype; r public.leave_requests%rowtype; role_name text; restored numeric;
begin
  role_name:=coalesce(public.my_role(),'');
  if not public.employee_hub_access_allowed() or role_name not in ('chief','owner') or p_action is null or p_action not in ('approve','reject') or (p_action='approve' and role_name<>'chief') then raise exception 'chief approval or lead rejection required'; end if;
  select * into c from public.leave_change_requests where id=p_id for update;
  if not found or c.status<>'대기' then raise exception 'pending change required'; end if;
  if p_action='approve' then
    select * into r from public.leave_requests where id=c.request_id for update;
    if not found or r.status<>'승인' or r.date_from<(now() at time zone 'Asia/Seoul')::date or (c.action='half' and r.type<>'연차') then raise exception 'original leave changed or date passed'; end if;
    perform pg_advisory_xact_lock(hashtextextended(r.user_id::text,0));
    restored:=case when c.action='cancel' then r.days else r.days/2 end;
    if c.action='cancel' then
      update public.leave_requests set status='취소',cancelled_by=(select name from public.profiles where user_id=auth.uid()),cancelled_at=now() where id=r.id;
    else
      update public.leave_requests set type='반차',type_note=c.type_note,days=r.days/2 where id=r.id;
    end if;
    insert into public.leave_ledger(user_id,kind,days,ref,note) values(r.user_id,'조정',restored,r.id,format('승인취소 복구: 변경요청 %s (%s)',c.id,c.action));
  end if;
  update public.leave_change_requests set status=case when p_action='approve' then '승인' else '반려' end,processed_at=now(),processed_by=auth.uid() where id=c.id;
  return query select lc.id,lc.status from public.leave_change_requests lc where lc.id=c.id;
end $$;

create or replace function public.queue_leave_change_push()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record;
begin
  if tg_op='INSERT' then
    for recipient in select user_id from public.p7_notify_recipients('leave_request',array(select user_id from public.profiles where role in ('chief','owner') and active and approved),new.user_id) loop
      perform public.enqueue_push_event(format('leave-change:%s:submitted:%s',new.id,recipient.user_id),recipient.user_id,'leave_submitted',jsonb_build_object('url','/hr.html?tab=leave'));
    end loop;
  elsif old.status is distinct from new.status then
    for recipient in select user_id from public.p7_notify_recipients('leave_result',array[new.user_id],new.user_id) loop
      perform public.enqueue_push_event(format('leave-change:%s:%s:%s',new.id,new.status,recipient.user_id),recipient.user_id,'leave_status_changed',jsonb_build_object('url','/hr.html?tab=leave'));
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists queue_leave_change_push on public.leave_change_requests;
create trigger queue_leave_change_push after insert or update of status on public.leave_change_requests for each row execute function public.queue_leave_change_push();
revoke all on function public.request_leave_change(bigint,text,text,text),public.process_leave_change(bigint,text),public.queue_leave_change_push() from public,anon,authenticated;
grant execute on function public.request_leave_change(bigint,text,text,text),public.process_leave_change(bigint,text) to authenticated;
-- 대기 계정은 본인 서류와 지문 등록만 처리함. 일반 허브 접근 함수는 바꾸지 않음.
create or replace function public.onboarding_self_access_allowed()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.account_access_status='활성' and (p.approved or p.role='staff'))
$$;
revoke all on function public.onboarding_self_access_allowed() from public,anon;
grant execute on function public.onboarding_self_access_allowed() to authenticated;
-- Storage 제한식 원문을 저장하고, 기존 식에 본인 hr-docs INSERT 조건만 더함.
do $$ declare original text; begin
  select pg_get_expr(polwithcheck,polrelid) into original from pg_policy where polrelid='storage.objects'::regclass and polname='employee_hub_storage_access_gate';
  if original is null then raise exception 'storage employee access gate required'; end if;
  insert into public.suggestion_asks_20261006_restore values('storage_check',original) on conflict do nothing;
  select definition into original from public.suggestion_asks_20261006_restore where name='storage_check';
  execute 'alter policy employee_hub_storage_access_gate on storage.objects with check (('||original||') or (bucket_id=''hr-docs'' and split_part(name,''/'',1)=auth.uid()::text and public.onboarding_self_access_allowed()))';
end $$;

create or replace function public.pending_onboarding_info()
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.onboarding_self_access_allowed() then raise exception 'active onboarding profile required'; end if;
  return jsonb_build_object(
    'items',coalesce((select jsonb_agg(jsonb_build_object('label',label) order by order_no) from public.onboarding_items where active),'[]'::jsonb),
    'docs',coalesce((select jsonb_agg(jsonb_build_object('original_name',original_name,'document_type',document_type,'checked_at',checked_at) order by created_at desc) from public.employee_documents where user_id=auth.uid()),'[]'::jsonb),
    'fingerprint',(select to_jsonb(f) from public.fingerprint_registration_requests f where f.user_id=auth.uid()),
    'texts',coalesce((select jsonb_agg(jsonb_build_object('key',key,'value',value)) from public.hub_ui_texts where key like 'onbo.guide.%' or key like 'onbo.check.%' or key like 'onbo.docs.%' or key like 'pending.onbo.%'),'[]'::jsonb)
  );
end $$;

create or replace function public.pending_report_fingerprint()
returns text language plpgsql security definer set search_path=public as $$
declare result text;
begin
  if not public.onboarding_self_access_allowed() then raise exception 'active onboarding profile required'; end if;
  insert into public.fingerprint_registration_requests(user_id,status) values(auth.uid(),'요청') on conflict(user_id) do nothing;
  select status into result from public.fingerprint_registration_requests where user_id=auth.uid();
  return result;
end $$;

create or replace function public.pending_add_document(p_storage_path text,p_original_name text,p_document_type text)
returns bigint language plpgsql security definer set search_path=public as $$
declare object_row storage.objects%rowtype; result bigint;
begin
  if not public.onboarding_self_access_allowed() or split_part(p_storage_path,'/',1) is distinct from auth.uid()::text or nullif(trim(p_original_name),'') is null or nullif(trim(p_document_type),'') is null then raise exception 'own document required'; end if;
  select * into object_row from storage.objects where bucket_id='hr-docs' and name=p_storage_path;
  if not found then raise exception 'uploaded document not found'; end if;
  if coalesce(object_row.metadata->>'size','') !~ '^[0-9]+$' or (object_row.metadata->>'size')::bigint not between 1 and 10485760 then raise exception 'invalid document size'; end if;
  insert into public.employee_documents(user_id,uploaded_by,document_type,original_name,storage_path,mime_type,size_bytes)
    values(auth.uid(),auth.uid(),p_document_type,p_original_name,p_storage_path,object_row.metadata->>'mimetype',(object_row.metadata->>'size')::bigint)
    on conflict(storage_path) do nothing returning id into result;
  if result is null then select id into result from public.employee_documents where storage_path=p_storage_path and user_id=auth.uid(); end if;
  return result;
end $$;
revoke all on function public.pending_onboarding_info(),public.pending_report_fingerprint(),public.pending_add_document(text,text,text) from public,anon,authenticated;
grant execute on function public.pending_onboarding_info(),public.pending_report_fingerprint(),public.pending_add_document(text,text,text) to authenticated;
commit;
