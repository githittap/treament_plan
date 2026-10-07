-- 리콜 명단: 선행 문의함 followup/handled, 상담일지 action_followup, hub_ui_texts, app_settings 뒤 적용.
-- 로컬 구현안. 기존 행은 갱신하지 않는다. 롤백은 기능만 끄고 모든 기록을 보존한다.
begin;
alter table public.consultation_inbox add column if not exists next_contact_on date;
create index if not exists consultation_inbox_recall_due_idx
  on public.consultation_inbox(next_contact_on,id) where status in ('recall_1','recall_2','recall_3');

insert into public.app_settings(key,value,label) values
 ('recall.interval_1','3','리콜 1차 기본 간격(일)'),
 ('recall.interval_2','7','리콜 2차 기본 간격(일)'),
 ('recall.interval_3','14','리콜 3차 기본 간격(일)'),
 ('recall.today_alert','true','오늘 리콜 표시'),
 ('recall.push_enabled','false','아침 9시 리콜 폰 알림'),
 ('recall.enabled','true','리콜 명단 사용') on conflict(key) do nothing;

insert into public.hub_ui_texts(key,value) values
 ('recall.journal','상담일지'),
 ('recall.empty','연락할 사람이 없습니다.'),
 ('recall.unassigned','미배정'),
 ('recall.unknown','미상'),
 ('recall.unscheduled','예정일 없음'),
 ('recall.contacted','📞 연락함'),
 ('recall.reschedule','예정일 바꾸기'),
 ('recall.finish','✅ 리콜 끝'),
 ('recall.to_journal','상담일지로'),
 ('recall.tabs','문의함 하위 화면'),
 ('recall.inbox','📥 문의함'),
 ('recall.title','📞 리콜 명단'),
 ('recall.hint','문의와 상담일지의 다음 조치를 연락처별로 모았습니다. 예정일이 빠른 순서입니다.'),
 ('recall.stage','지금 단계'),
 ('recall.all_stage','전체 단계'),
 ('recall.assignee','담당'),
 ('recall.all_assignee','모든 담당'),
 ('recall.mine','내 담당만'),
 ('recall.overdue_only','기한 지남만'),
 ('recall.refresh','새로 조회'),
 ('recall.loading','불러오는 중…'),
 ('recall.load_error','리콜 명단을 불러오지 못했습니다: {msg}'),
 ('recall.summary','오늘 연락할 사람 {today}명 · 기한 지남 {overdue}명'),
 ('recall.note','연락 메모'),
 ('recall.due','다음 연락 예정일'),
 ('recall.save','저장'),
 ('recall.cancel','취소'),
 ('recall.need_note','연락 메모를 입력하세요.'),
 ('recall.need_date','예정일을 입력하세요.'),
 ('recall.save_error','저장 결과를 확인해 주세요: {msg}. 새로 조회한 뒤 다시 처리하세요.'),
 ('recall.recall_1','리콜 1차'),
 ('recall.recall_2','리콜 2차'),
 ('recall.recall_3','리콜 3차'),
 ('recall.push_title','📞 오늘 리콜'),
 ('recall.push_body','오늘 리콜 {n}명'),
 ('recall.next_action','다시 연락') on conflict(key) do nothing;

create or replace function public.recall_user_allowed(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.user_id=p_user_id
   and p.active is true and p.approved is true and p.account_access_status is distinct from '차단'
   and (p.role in ('manager','chief','owner') or (p.role='staff' and
     (p.dept='데스크' or p.user_id='212cef7e-8aab-4f72-b78d-4dfca59581e0'::uuid))))
$$;
revoke all on function public.recall_user_allowed(uuid) from public,anon,authenticated;

create or replace function public.recall_access_allowed()
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.employee_hub_access_allowed()
   and public.recall_user_allowed(auth.uid())
   and coalesce((select value from public.app_settings where key='recall.enabled'),'true')='true'
$$;
revoke all on function public.recall_access_allowed() from public,anon,authenticated;
grant execute on function public.recall_access_allowed() to authenticated;

create or replace function public.recall_interval(p_stage text)
returns integer language plpgsql stable security definer set search_path='' as $$
declare v text; fallback integer;
begin
 fallback:=case p_stage when 'recall_2' then 7 when 'recall_3' then 14 else 3 end;
 select value into v from public.app_settings where key='recall.interval_'||right(p_stage,1);
 if v ~ '^[0-9]{1,3}$' and v::integer between 1 and 365 then return v::integer; end if;
 return fallback;
end $$;
revoke all on function public.recall_interval(text) from public,anon,authenticated;

create or replace function public.recall_set_due()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce((select value from public.app_settings where key='recall.enabled'),'true')<>'true' then return new; end if;
 if new.status in ('recall_1','recall_2','recall_3') then
   if tg_op='INSERT' then
     if new.next_contact_on is null then
       new.next_contact_on:=(now() at time zone 'Asia/Seoul')::date+public.recall_interval(new.status);
     end if;
   elsif new.status is distinct from old.status and new.next_contact_on is null then
     new.next_contact_on:=(now() at time zone 'Asia/Seoul')::date+public.recall_interval(new.status);
   end if;
 elsif new.status in ('closed','converted') then new.next_contact_on:=null;
 end if;
 return new;
end $$;
revoke all on function public.recall_set_due() from public,anon,authenticated;
do $$begin
 if not exists(select 1 from pg_trigger where tgname='recall_set_due' and tgrelid='public.consultation_inbox'::regclass) then
   create trigger recall_set_due before insert or update of status,next_contact_on on public.consultation_inbox
    for each row execute function public.recall_set_due();
 end if;
end $$;

create table if not exists public.consultation_recall_journal_notes(
 id bigint generated always as identity primary key,
 journal_id uuid not null references public.consultation_journals(id),
 author_id uuid not null references auth.users(id),
 note text not null check(char_length(btrim(note)) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index if not exists consultation_recall_journal_notes_latest_idx
 on public.consultation_recall_journal_notes(journal_id,created_at desc,id desc);
alter table public.consultation_recall_journal_notes enable row level security;
revoke all on public.consultation_recall_journal_notes from public,anon,authenticated;
grant select on public.consultation_recall_journal_notes to authenticated;
do $$begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='consultation_recall_journal_notes' and policyname='recall_notes_reader') then
   create policy recall_notes_reader on public.consultation_recall_journal_notes for select to authenticated
     using(public.recall_access_allowed());
 end if;
end $$;

-- 직원 일반 계정이 넓은 문의함 SELECT 권한을 갖더라도 이 명단은 RPC에서 별도로 제한한다.
create or replace function public.recall_list()
returns table(kind text,id uuid,name text,contact text,source text,stage text,due_on date,
 assigned_to uuid,last_contact_at timestamptz,memo text)
language plpgsql security definer set search_path='' as $$
begin
 if not public.recall_access_allowed() then raise exception 'recall access required'; end if;
 return query
 select 'inbox'::text,i.id,i.sender_name,i.contact,i.source,i.status,i.next_contact_on,i.assigned_to,r.created_at,left(r.reply,160)
 from public.consultation_inbox i
 left join lateral(select n.created_at,n.reply from public.consultation_inbox_replies n
   where n.inbox_id=i.id order by n.created_at desc,n.id desc limit 1) r on true
 where i.status in ('recall_1','recall_2','recall_3') and i.journal_id is null
 union all
 select 'journal'::text,j.id,j.patient_name,j.contact_phone,'journal'::text,'journal'::text,j.action_due_on,j.action_assignee_id,n.created_at,left(coalesce(n.note,j.next_action),160)
 from public.consultation_journals j
 left join lateral(select h.created_at,h.note from public.consultation_recall_journal_notes h
   where h.journal_id=j.id order by h.created_at desc,h.id desc limit 1) n on true
 where j.action_done is false and j.action_due_on is not null and nullif(btrim(j.next_action),'') is not null;
end $$;
revoke all on function public.recall_list() from public,anon,authenticated;
grant execute on function public.recall_list() to authenticated;

-- 메모·단계·예정일을 한 RPC로 갱신한다. 하나라도 실패하면 전체가 취소된다.
create or replace function public.recall_update(p_inbox_ids uuid[],p_journal_ids uuid[],p_action text,
 p_note text default null,p_due_on date default null)
returns void language plpgsql security definer set search_path='' as $$
declare i record; j record; v_stage text; v_count integer:=0;
begin
 if not public.recall_access_allowed() then raise exception 'recall access required'; end if;
 if p_action not in ('contact','reschedule','finish') or p_action is null then raise exception 'invalid recall action'; end if;
 if p_action='contact' and char_length(btrim(coalesce(p_note,''))) not between 1 and 4000 then raise exception 'recall note required'; end if;
 if p_action='reschedule' and p_due_on is null then raise exception 'recall due date required'; end if;
 if coalesce(cardinality(p_inbox_ids),0)+coalesce(cardinality(p_journal_ids),0)=0 then raise exception 'recall target required'; end if;
 for i in select x.id,x.status from public.consultation_inbox x where x.id=any(p_inbox_ids) order by x.id for update loop
   if i.status not in ('recall_1','recall_2','recall_3') then raise exception 'recall target changed; reload'; end if;
   v_count:=v_count+1;
   if p_action='contact' then
     v_stage:=case i.status when 'recall_1' then 'recall_2' else 'recall_3' end;
     insert into public.consultation_inbox_replies(inbox_id,author_id,reply) values(i.id,auth.uid(),btrim(p_note));
     update public.consultation_inbox set status=v_stage,next_contact_on=(now() at time zone 'Asia/Seoul')::date+public.recall_interval(v_stage) where consultation_inbox.id=i.id;
   elsif p_action='finish' then
     update public.consultation_inbox set status='closed',next_contact_on=null where consultation_inbox.id=i.id;
   else update public.consultation_inbox set next_contact_on=p_due_on where consultation_inbox.id=i.id;
   end if;
 end loop;
 for j in select x.id,x.action_done,x.action_due_on from public.consultation_journals x where x.id=any(p_journal_ids) order by x.id for update loop
   if j.action_done or j.action_due_on is null then raise exception 'recall target changed; reload'; end if;
   v_count:=v_count+1;
   if p_action='contact' then
     insert into public.consultation_recall_journal_notes(journal_id,author_id,note) values(j.id,auth.uid(),btrim(p_note));
     update public.consultation_journals set action_due_on=(now() at time zone 'Asia/Seoul')::date+public.recall_interval('recall_1') where consultation_journals.id=j.id;
   elsif p_action='finish' then
     update public.consultation_journals set action_done=true where consultation_journals.id=j.id;
   else update public.consultation_journals set action_due_on=p_due_on where consultation_journals.id=j.id;
   end if;
 end loop;
 if v_count<>(select count(distinct x) from unnest(coalesce(p_inbox_ids,'{}'::uuid[])) x)
             +(select count(distinct x) from unnest(coalesce(p_journal_ids,'{}'::uuid[])) x) then
   raise exception 'recall target missing';
 end if;
end $$;
revoke all on function public.recall_update(uuid[],uuid[],text,text,date) from public,anon,authenticated;
grant execute on function public.recall_update(uuid[],uuid[],text,text,date) to authenticated;

-- 다음 조치가 있는 문의는 전환 뒤 상담일지 명단에서 계속 이어진다.
create or replace function public.recall_convert_to_journal(p_inbox_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare i public.consultation_inbox; v_journal uuid; v_source text;
begin
 if not public.recall_access_allowed() then raise exception 'recall access required'; end if;
 select * into i from public.consultation_inbox where consultation_inbox.id=p_inbox_id for update;
 if not found or i.status not in ('recall_1','recall_2','recall_3') or i.journal_id is not null then raise exception 'recall target changed; reload'; end if;
 v_source:=case when i.source='homepage' then '홈페이지' when i.source in ('daangn','kakao','naver_email','naver_talktalk') then '카카오,네이버예약,당근' else '원본' end;
 insert into public.consultation_journals(patient_name,contact_phone,source_sheet,consulted_on,status,consultation_note,next_action,author_id,action_due_on,action_assignee_id)
 values(coalesce(nullif(i.sender_name,''),'미상'),i.contact,v_source,(i.received_at at time zone 'Asia/Seoul')::date,'대기',i.message,
   coalesce(nullif(i.subject,''),(select value from public.hub_ui_texts where key='recall.next_action'),'다시 연락'),auth.uid(),
   coalesce(i.next_contact_on,(now() at time zone 'Asia/Seoul')::date+public.recall_interval('recall_1')),i.assigned_to)
 returning consultation_journals.id into v_journal;
 insert into public.consultation_recall_journal_notes(journal_id,author_id,note,created_at)
 select v_journal,r.author_id,r.reply,r.created_at from public.consultation_inbox_replies r where r.inbox_id=i.id;
 update public.consultation_inbox set status='converted',journal_id=v_journal where consultation_inbox.id=i.id;
 return v_journal;
end $$;
revoke all on function public.recall_convert_to_journal(uuid) from public,anon,authenticated;
grant execute on function public.recall_convert_to_journal(uuid) to authenticated;

-- 폰 알림은 기존 dispatcher(매분 실행)가 오전 9시 이후 큐를 채운다. 날짜·담당자로 멱등.
create or replace function public.queue_recall_daily_push(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path='' as $$
declare who record; n integer:=0; day date:=(p_now at time zone 'Asia/Seoul')::date; title text; body text;
begin
 if (p_now at time zone 'Asia/Seoul')::time < time '09:00'
   or coalesce((select value from public.app_settings where key='recall.push_enabled'),'false')<>'true'
   or coalesce((select value from public.app_settings where key='recall.enabled'),'true')<>'true' then return 0; end if;
 if to_regclass('public.push_events') is null then return 0; end if;
 select value into title from public.hub_ui_texts where key='recall.push_title';
 select value into body from public.hub_ui_texts where key='recall.push_body';
 for who in
   with targets as (
     select i.assigned_to who,coalesce(nullif(regexp_replace(i.contact,'[^0-9]','','g'),''),'inbox:'||i.id::text) person
       from public.consultation_inbox i where i.status in ('recall_1','recall_2','recall_3') and i.next_contact_on<=day and i.journal_id is null
     union all
     select j.action_assignee_id,coalesce(nullif(regexp_replace(j.contact_phone,'[^0-9]','','g'),''),'journal:'||j.id::text)
       from public.consultation_journals j where j.action_done is false and j.action_due_on<=day and nullif(btrim(j.next_action),'') is not null
   ) select t.who,count(distinct t.person)::integer total from targets t
     where public.recall_user_allowed(t.who) group by t.who
 loop
   perform public.enqueue_push_event('recall-daily:'||day::text||':'||who.who::text,who.who,'recall_daily',
     jsonb_build_object('count',who.total,'push_title',coalesce(title,'📞 오늘 리콜'),'push_body',coalesce(body,'오늘 리콜 {n}명')));
   n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.queue_recall_daily_push(timestamptz) from public,anon,authenticated;
grant execute on function public.queue_recall_daily_push(timestamptz) to service_role;

create or replace function public.can_dispatch_recall_push(p_event_id bigint,p_claim_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare e record;
begin
 select * into e from public.push_events where id=p_event_id;
 if not found or e.claim_token is distinct from p_claim_token or e.claimed_at is null
   or e.claimed_at<now()-interval '10 minutes' then raise exception 'push delivery claim lost'; end if;
 return e.event_type='recall_daily' and public.recall_user_allowed(e.recipient_id)
   and coalesce((select value from public.app_settings where key='recall.push_enabled'),'false')='true'
   and coalesce((select value from public.app_settings where key='recall.enabled'),'true')='true';
end $$;
revoke all on function public.can_dispatch_recall_push(bigint,uuid) from public,anon,authenticated;
grant execute on function public.can_dispatch_recall_push(bigint,uuid) to service_role;

-- 기존 알림 종류 CHECK를 보존하면서 종류를 추가한다(건의·마케팅 등 후행 종류 포함).
do $$declare c record; expression text;
begin
 if to_regclass('public.push_events') is not null then
   for c in select conname,pg_get_expr(conbin,conrelid) expr from pg_constraint
     where conrelid='public.push_events'::regclass and contype='c'
       and pg_get_expr(conbin,conrelid) like '%event_type%' loop
     if position('recall_daily' in c.expr)=0 then
       expression:='('||c.expr||') OR event_type = ''recall_daily''';
       execute format('alter table public.push_events drop constraint %I',c.conname);
       execute format('alter table public.push_events add constraint %I check (%s)',c.conname,expression);
     end if;
   end loop;
 end if;
end $$;
commit;
