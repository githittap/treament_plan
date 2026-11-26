-- 리뷰 요청 문자 — 병원 PC 중계(2026-11-27 · T0 7차 「솔라피 가입 ㄱ」 뒤 확인).
-- 솔라피 권한 가이드: 문자(SMS·LMS·MMS) 발송 권한은 고정 IP를 지정한 키에서만 쓸 수 있고, 클라우드 공급사 대역은 고정 IP로 치지 않음.
-- → 서버 함수(Supabase 클라우드)는 솔라피에 바로 못 보냄. 보낼 줄을 잠깐 「대기함」(review_sms_outbox)에 넣고,
--   허용 IP인 병원 PC의 중계 프로그램(tools/review_sms_relay.py)이 꺼내 보낸 뒤 결과를 적고 대기함에서 번호를 지운다.
-- 선행: db/review_sms_20261127.sql. 재적용 안전. 되돌리기: db/review_sms_relay_20261127_rollback.sql(보내는 길만 서버 함수로 돌림).
begin;

-- 대기함: 보낼 번호 원문은 여기 잠깐만 있음(중계가 보내면 바로 지움 · 2시간 지나면 보내지 않고 지움). 화면·직원은 못 읽음.
create table if not exists public.review_sms_outbox(
  log_id uuid primary key references public.review_sms_log(id) on delete cascade,
  to_number text not null check(to_number ~ '^01[016789][0-9]{7,8}$'),
  message_text text not null check(char_length(message_text) between 1 and 2000),
  sender text not null check(sender ~ '^0[0-9]{7,10}$'),
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
alter table public.review_sms_outbox enable row level security;
revoke all on table public.review_sms_outbox from public,anon,authenticated;
grant select,insert,update,delete on table public.review_sms_outbox to service_role;

insert into public.app_settings(key,value,label) values
 ('review_sms.transport','pc','리뷰 요청 문자 — 보내는 길(pc: 병원 PC 중계 · edge: 서버 함수가 바로)'),
 ('review_sms.relay_status','','리뷰 요청 문자 — 병원 PC 중계 마지막 상태(중계가 자동으로 적음)')
on conflict(key) do nothing;

-- 앞 판과 같고, 보내는 길이 pc면 보낼 줄(pending)을 대기함에도 넣는다.
create or replace function public.review_sms_prepare(p_phones text[],p_name text default null)
returns table(log_id uuid,status text,phone_tail text,to_number text,message_text text,sender text,mode text)
language plpgsql security definer set search_path='' as $$
declare
 v_live boolean; v_tests text[]:='{}'; v_sender text; v_url text; v_days integer; v_hours text; v_tpl text; v_transport text;
 v_name text:=nullif(btrim(coalesce(p_name,'')),''); v_text text; v_now time; v_start time; v_end time;
 v_raw text; v_digits text; v_seen text[]:='{}'; v_status text; v_mode text; v_id uuid; v_hash text;
begin
 if not public.review_sms_access_allowed() then raise exception 'review sms access required'; end if;
 if p_phones is null or coalesce(cardinality(p_phones),0) not between 1 and 20 then raise exception 'review sms phones must be 1-20'; end if;
 if v_name is not null and (char_length(v_name)>20 or v_name ~ '[\r\n{}]') then raise exception 'review sms name invalid'; end if;
 select coalesce(max(value) filter(where key='review_sms.live_enabled'),'false')='true',
        coalesce(max(value) filter(where key='review_sms.sender'),''),
        coalesce(max(value) filter(where key='review_sms.review_url'),''),
        coalesce(max(value) filter(where key='review_sms.template'),''),
        coalesce(nullif(max(value) filter(where key='review_sms.transport'),''),'pc')
   into v_live,v_sender,v_url,v_tpl,v_transport
   from public.app_settings where key in ('review_sms.live_enabled','review_sms.sender','review_sms.review_url','review_sms.template','review_sms.transport');
 select case when value ~ '^[0-9]{1,4}$' and value::integer between 1 and 3650 then value::integer else 180 end into v_days
   from public.app_settings where key='review_sms.cooldown_days';
 v_days:=coalesce(v_days,180);
 select coalesce(max(value),'09:00-20:00') into v_hours from public.app_settings where key='review_sms.hours';
 begin
  select coalesce(array_agg(regexp_replace(x,'[^0-9]','','g')),'{}') into v_tests
    from jsonb_array_elements_text(coalesce((select value from public.app_settings where key='review_sms.test_numbers'),'[]')::jsonb) x;
 exception when others then v_tests:='{}';
 end;
 v_sender:=regexp_replace(v_sender,'[^0-9]','','g');
 if v_hours ~ '^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$' then
  v_start:=split_part(v_hours,'-',1)::time; v_end:=split_part(v_hours,'-',2)::time;
 else v_start:='09:00'; v_end:='20:00'; end if;
 v_now:=(now() at time zone 'Asia/Seoul')::time;
 v_url:=case when v_url ~ '^https://[^[:space:]]+$' then v_url else '' end;
 v_text:=replace(replace(v_tpl,'{name}',coalesce(v_name,'고객')),'{link}',v_url);
 v_mode:=case when v_live then 'live' else 'test' end;
 foreach v_raw in array p_phones loop
  v_digits:=regexp_replace(coalesce(v_raw,''),'[^0-9]','','g');
  if v_digits !~ '^01[016789][0-9]{7,8}$' then raise exception 'review sms invalid phone'; end if;
  if v_digits=any(v_seen) then continue; end if;
  v_seen:=v_seen||v_digits;
  v_hash:=md5('review_sms:'||v_digits);
  v_status:=case
   when btrim(v_tpl)='' or v_url='' or public.review_sms_wording_blocked(v_tpl) then 'blocked_wording'
   when v_sender !~ '^0[0-9]{7,10}$' then 'not_configured'
   when not (v_now>=v_start and v_now<v_end) then 'blocked_hours'
   when not v_live and not (v_digits=any(v_tests)) then 'blocked_test_only'
   when v_live and exists(select 1 from public.review_sms_log l where l.phone_hash=v_hash and l.mode='live'
        and l.status in ('pending','sent') and l.created_at>now()-make_interval(days=>v_days)) then 'blocked_recent'
   else 'pending' end;
  insert into public.review_sms_log(sent_by,phone_hash,phone_tail,patient_label,mode,status,message_text,finished_at)
   values(auth.uid(),v_hash,right(v_digits,4),v_name,v_mode,v_status,left(v_text,2000),case when v_status='pending' then null else now() end)
   returning id into v_id;
  if v_status='pending' and v_transport<>'edge' then
   insert into public.review_sms_outbox(log_id,to_number,message_text,sender) values(v_id,v_digits,left(v_text,2000),v_sender);
  end if;
  log_id:=v_id; status:=v_status; phone_tail:=right(v_digits,4); mode:=v_mode;
  to_number:=case when v_status='pending' then v_digits end;
  message_text:=case when v_status='pending' then v_text end;
  sender:=case when v_status='pending' then v_sender end;
  return next;
 end loop;
end $$;
revoke all on function public.review_sms_prepare(text[],text) from public,anon,authenticated;
grant execute on function public.review_sms_prepare(text[],text) to authenticated;

-- 중계(service_role)만: 보낼 줄을 꺼낸다(한 번 꺼낸 줄은 다시 안 꺼냄 — 두 번 나가는 것 막기).
-- 꺼내기 전에 정리: 2시간 넘게 대기한 줄(병원 PC가 꺼져 있었음) · 꺼낸 뒤 10분 넘게 결과가 안 온 줄은 보내지 않고 실패로 닫고 번호를 지운다.
-- 보낼 수 있는 시간(review_sms.hours) 밖이면 아무것도 안 꺼낸다.
create or replace function public.review_sms_relay_claim(p_limit integer default 10)
returns table(log_id uuid,to_number text,message_text text,sender text)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare v_hours text; v_start time; v_end time; v_now time:=(now() at time zone 'Asia/Seoul')::time;
begin
 with gone as (
  delete from public.review_sms_outbox o
   where (o.claimed_at is null and o.created_at<now()-interval '2 hours') or o.claimed_at<now()-interval '10 minutes'
   returning o.log_id,o.claimed_at)
 update public.review_sms_log l set status='failed',finished_at=now(),
   error=case when g.claimed_at is null then '병원 PC 중계가 2시간 넘게 응답이 없어 보내지 않음'
              else '병원 PC 중계가 보낸 결과를 받지 못함 — 솔라피 발송 내역 확인' end
  from gone g where l.id=g.log_id and l.status='pending';
 select coalesce(max(value),'09:00-20:00') into v_hours from public.app_settings where key='review_sms.hours';
 if v_hours ~ '^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$' then
  v_start:=split_part(v_hours,'-',1)::time; v_end:=split_part(v_hours,'-',2)::time;
 else v_start:='09:00'; v_end:='20:00'; end if;
 if not (v_now>=v_start and v_now<v_end) then return; end if;
 return query
  update public.review_sms_outbox o set claimed_at=now()
   where o.log_id in (select x.log_id from public.review_sms_outbox x where x.claimed_at is null
                       order by x.created_at limit least(greatest(coalesce(p_limit,10),1),20) for update skip locked)
   returning o.log_id,o.to_number,o.message_text,o.sender;
end $$;
revoke all on function public.review_sms_relay_claim(integer) from public,anon,authenticated;
grant execute on function public.review_sms_relay_claim(integer) to service_role;

-- 중계(service_role)만: 솔라피 결과를 적고 대기함에서 번호를 지운다.
create or replace function public.review_sms_relay_done(p_results jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 n:=public.review_sms_finish(p_results);
 delete from public.review_sms_outbox o using jsonb_to_recordset(p_results) r(log_id uuid) where o.log_id=r.log_id;
 return n;
end $$;
revoke all on function public.review_sms_relay_done(jsonb) from public,anon,authenticated;
grant execute on function public.review_sms_relay_done(jsonb) to service_role;

-- 중계(service_role)만: 살아 있음·잔액·발신번호 상태를 허브 설정에 적는다(화면이 「병원 PC 중계」 줄로 보여 줌).
create or replace function public.review_sms_relay_heartbeat(p_status jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if jsonb_typeof(p_status)<>'object' then raise exception 'review sms relay status must be object'; end if;
 insert into public.app_settings(key,value,label,updated_at)
  values('review_sms.relay_status',(p_status||jsonb_build_object('seen_at',now()))::text,'리뷰 요청 문자 — 병원 PC 중계 마지막 상태(중계가 자동으로 적음)',now())
  on conflict(key) do update set value=excluded.value,updated_at=now();
end $$;
revoke all on function public.review_sms_relay_heartbeat(jsonb) from public,anon,authenticated;
grant execute on function public.review_sms_relay_heartbeat(jsonb) to service_role;

commit;
