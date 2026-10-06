-- 직원허브 사용 기록. 운영 적용은 별도 승인 뒤 진행함.
begin;
create table if not exists public.hub_activity_log(
 id bigint generated always as identity primary key,
 user_id uuid not null default auth.uid(),
 occurred_at timestamptz not null default now(),
 kind text not null check(kind in('enter','leave','tab','click','write','view','download')),
 target text not null check(char_length(target)<=200),
 target_id text check(char_length(target_id)<=100),
 meta jsonb not null default '{}'::jsonb check(jsonb_typeof(meta)='object' and octet_length(meta::text)<=2048),
 session_id text check(char_length(session_id)<=100),
 user_agent_short text check(char_length(user_agent_short)<=80)
);
create index if not exists hub_activity_time_idx on public.hub_activity_log(occurred_at desc,id desc);
create index if not exists hub_activity_user_time_idx on public.hub_activity_log(user_id,occurred_at desc);
alter table public.hub_activity_log enable row level security;
revoke all on public.hub_activity_log from public,anon,authenticated;
revoke all on sequence public.hub_activity_log_id_seq from public,anon,authenticated;
grant select on public.hub_activity_log to authenticated;
drop policy if exists hub_activity_owner_read on public.hub_activity_log;
create policy hub_activity_owner_read on public.hub_activity_log for select to authenticated
 using(public.employee_hub_access_allowed() and public.my_role()='owner');
insert into public.app_settings(key,value,label) values
 ('activity_log.retention_days','1095','사용 기록 보관 일수'),
 ('activity_log.exclude_owner','true','원장 행동 기록 제외') on conflict(key) do nothing;

create or replace function public.log_hub_activity(p_events jsonb) returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare uid uuid:=auth.uid();ev jsonb;m jsonb;used integer;n integer:=0;
begin
 if uid is null or not public.employee_hub_access_allowed() then raise exception 'not_allowed';end if;
 if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>50 then raise exception 'invalid_events';end if;
 if public.my_role()='owner' and coalesce((select value from public.app_settings where key='activity_log.exclude_owner'),'true')='true' then return 0;end if;
 -- 같은 계정의 동시 전송도 분당 한도를 함께 사용함.
 perform pg_advisory_xact_lock(hashtextextended('hub_activity:'||uid::text,0));
 select count(*) into used from public.hub_activity_log where user_id=uid and occurred_at>=date_trunc('minute',now());
 for ev in select value from jsonb_array_elements(p_events) loop
  if jsonb_typeof(ev) is distinct from 'object' or coalesce(ev->>'kind','') not in('enter','leave','tab','click','write','view','download')
   or ev->>'target' is null or char_length(ev->>'target')>200 or char_length(ev->>'target_id')>100
   or char_length(ev->>'session_id')>100 or char_length(ev->>'user_agent_short')>80
   or (ev ? 'meta' and (jsonb_typeof(ev->'meta')<>'object' or octet_length((ev->'meta')::text)>2048)) then raise exception 'invalid_event';end if;
  -- 본문·입력값은 저장하지 않고 허용된 숫자와 고정된 작업 종류만 남김.
  m:='{}'::jsonb;
  if jsonb_typeof(ev->'meta'->'duration_seconds')='number' then m:=m||jsonb_build_object('duration_seconds',least(86400,greatest(0,(ev->'meta'->>'duration_seconds')::numeric)));end if;
  if ev->'meta'->>'action' in('insert','update','delete','upsert','rpc') then m:=m||jsonb_build_object('action',ev->'meta'->>'action');end if;
  -- 공지·문의 열람은 기존 표를 읽고 새 표에 중복 저장하지 않음.
  if ev->>'target' in('notice_reads','consultation_inbox_views') then continue;end if;
  if used+n>=300 then continue;end if;
  insert into public.hub_activity_log(user_id,kind,target,target_id,meta,session_id,user_agent_short)
   values(uid,ev->>'kind',ev->>'target',ev->>'target_id',m,ev->>'session_id',ev->>'user_agent_short');
  n:=n+1;
 end loop;
 return n;
end;$$;
revoke all on function public.log_hub_activity(jsonb) from public,anon,authenticated;
grant execute on function public.log_hub_activity(jsonb) to authenticated;

create or replace function public.hub_activity_page(
 p_from timestamptz default date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul',
 p_to timestamptz default now()+interval '1 second',p_user uuid default null,p_kind text default null,p_offset integer default 0)
returns table(event_id text,user_id uuid,occurred_at timestamptz,kind text,target text,target_id text,user_agent_short text,source text)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.employee_hub_access_allowed() or public.my_role() is distinct from 'owner' then raise exception 'owner_only';end if;
 if p_from is null or p_to is null or p_from>=p_to or p_offset<0 then raise exception 'invalid_filter';end if;
 return query
 with events as(
  select 'activity:'||a.id::text event_id,a.user_id,a.occurred_at,a.kind,a.target,a.target_id,a.user_agent_short,'activity'::text source from public.hub_activity_log a
  union all select 'notice:'||r.notice_id::text||':'||r.user_id::text,r.user_id,r.read_at,'view','notice',r.notice_id::text,null::text,'notice' from public.notice_reads r
  union all select 'inbox:'||v.id::text,v.viewer_id,v.viewed_at,'view','consultation_inbox',v.inbox_id::text,null::text,'inbox' from public.consultation_inbox_views v
  union all select 'reply:'||r.id::text,r.author_id,r.created_at,'write','consultation_inbox_reply',r.inbox_id::text,null::text,'inbox_reply' from public.consultation_inbox_replies r
  union all select 'handled:'||i.id::text,i.handled_by,i.handled_at,'write','consultation_inbox_handled',i.id::text,null::text,'inbox_handled' from public.consultation_inbox i where i.handled_by is not null and i.handled_at is not null
 )select e.* from events e where e.occurred_at>=p_from and e.occurred_at<p_to
 and(p_user is null or e.user_id=p_user) and(p_kind is null or p_kind='' or e.kind=p_kind)
 order by e.occurred_at desc,e.event_id desc limit 200 offset p_offset;
end;$$;
revoke all on function public.hub_activity_page(timestamptz,timestamptz,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.hub_activity_page(timestamptz,timestamptz,uuid,text,integer) to authenticated;

create or replace function public.hub_activity_summary()
returns table(user_id uuid,first_enter timestamptz,last_activity timestamptz,month_days bigint)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.employee_hub_access_allowed() or public.my_role() is distinct from 'owner' then raise exception 'owner_only';end if;
 return query with events as(
 select a.user_id,a.occurred_at,a.kind from public.hub_activity_log a
 union all select r.user_id,r.read_at,'view' from public.notice_reads r
 union all select v.viewer_id,v.viewed_at,'view' from public.consultation_inbox_views v
 union all select r.author_id,r.created_at,'write' from public.consultation_inbox_replies r
 union all select i.handled_by,i.handled_at,'write' from public.consultation_inbox i where i.handled_by is not null and i.handled_at is not null
 )select a.user_id,
 min(a.occurred_at) filter(where a.kind='enter' and (a.occurred_at at time zone 'Asia/Seoul')::date=(now() at time zone 'Asia/Seoul')::date),
 max(a.occurred_at),count(distinct (a.occurred_at at time zone 'Asia/Seoul')::date) filter(where a.kind='enter' and a.occurred_at>=date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
 from events a group by a.user_id;
end;$$;
revoke all on function public.hub_activity_summary() from public,anon,authenticated;
grant execute on function public.hub_activity_summary() to authenticated;

create or replace function public.prune_hub_activity_log() returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare days integer:=1095;n integer;raw text;
begin
 select value into raw from public.app_settings where key='activity_log.retention_days';
 if raw~'^[0-9]{1,5}$' and raw::integer between 1 and 36500 then days:=raw::integer;end if;
 delete from public.hub_activity_log where occurred_at<now()-make_interval(days=>days);
 get diagnostics n=row_count;return n;
end;$$;
revoke all on function public.prune_hub_activity_log() from public,anon,authenticated;
do $$
declare cron_zone text:=coalesce(nullif(current_setting('cron.timezone',true),''),'UTC');cron_at timestamp;cron_expression text;
begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  cron_at:=timestamptz '2000-01-02 04:10:00+09' at time zone cron_zone;
  cron_expression:=extract(minute from cron_at)::integer||' '||extract(hour from cron_at)::integer||' * * *';
  execute 'select cron.schedule($1,$2,$3)' using 'hub-activity-retention',cron_expression,'select public.prune_hub_activity_log();';
 else raise notice 'pg_cron unavailable: approved daily DB scheduler required at 04:10 Asia/Seoul';end if;
end;$$;
commit;
