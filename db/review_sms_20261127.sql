-- 리뷰 요청 문자(진료 끝난 환자에게 구글 리뷰 부탁 문자) — 2026-11-27 (T0 7차 A87 · T2 원장결정 결정 3 「리뷰 요청 문자를 직원허브에」)
-- 선행: app_settings · employee_hub_access_allowed() · recall_user_allowed()(리콜 명단과 같은 사람 = 데스크·매니저·실장·원장).
-- 처음 상태는 「시험 모드」: 원장이 허브 설정에 적은 내부 번호로만 나감. 환자에게 실제 발송은 원장이 「실제 발송 켬」을 켤 때만.
-- 번호 원문은 저장하지 않음(같은 번호 재발송 막기용 지문 + 끝 4자리만). 재적용 안전. 롤백은 기능만 끄고 기록을 보존함.
begin;

create table if not exists public.review_sms_log(
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sent_by uuid not null references auth.users(id),
  phone_hash text not null check(phone_hash ~ '^[0-9a-f]{32}$'),
  phone_tail text not null check(phone_tail ~ '^[0-9]{4}$'),
  patient_label text check(patient_label is null or char_length(patient_label) between 1 and 20),
  mode text not null check(mode in ('test','live')),
  status text not null check(status in ('pending','sent','failed','not_configured','blocked_test_only','blocked_recent','blocked_hours','blocked_wording')),
  message_text text check(message_text is null or char_length(message_text)<=2000),
  provider_id text check(provider_id is null or char_length(provider_id)<=120),
  error text check(error is null or char_length(error)<=500),
  finished_at timestamptz
);
create index if not exists review_sms_log_phone_idx on public.review_sms_log(phone_hash,created_at desc);
create index if not exists review_sms_log_created_idx on public.review_sms_log(created_at desc);
alter table public.review_sms_log enable row level security;
-- 표는 화면에서 직접 읽거나 쓰지 않음 — 아래 RPC(권한 검사 포함)와 서버 함수(service_role)만 씀.
revoke all on table public.review_sms_log from public,anon,authenticated;

insert into public.app_settings(key,value,label) values
 ('review_sms.enabled','true','리뷰 요청 문자 화면 사용'),
 ('review_sms.live_enabled','false','리뷰 요청 문자 — 환자에게 실제 발송(원장 승인 뒤 켬)'),
 ('review_sms.test_numbers','[]','리뷰 요청 문자 — 시험 모드에서 받을 수 있는 내부 번호(JSON 목록)'),
 ('review_sms.sender','','리뷰 요청 문자 — 솔라피에 등록한 발신번호'),
 ('review_sms.review_url','https://g.page/r/CUlwa4ajcDI0EBM/review','리뷰 요청 문자 — 구글 리뷰 쓰기 주소'),
 ('review_sms.cooldown_days','180','리뷰 요청 문자 — 같은 번호에 다시 보내지 않는 기간(일)'),
 ('review_sms.hours','09:00-20:00','리뷰 요청 문자 — 보낼 수 있는 시간(한국 시각)'),
 ('review_sms.template','[아산정플란트치과] {name}님, 오늘 진료 받으시느라 수고 많으셨습니다. 진료가 어떠셨는지 구글 리뷰로 솔직한 의견을 남겨 주시면 더 나은 병원을 만드는 데 큰 도움이 됩니다.
{link}','리뷰 요청 문자 — 문자 문구({name} 환자 이름 · {link} 리뷰 주소)')
on conflict(key) do nothing;

create or replace function public.review_sms_access_allowed()
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.employee_hub_access_allowed()
   and public.recall_user_allowed(auth.uid())
   and coalesce((select value from public.app_settings where key='review_sms.enabled'),'false')='true'
$$;
revoke all on function public.review_sms_access_allowed() from public,anon,authenticated;
grant execute on function public.review_sms_access_allowed() to authenticated;

-- 대가 제공·별점 유도 낱말(의료광고·후기 조작으로 문제 되는 것)이 문구에 있으면 아무에게도 보내지 않음. 화면(hr.html reviewSmsForbidden)과 같은 목록.
create or replace function public.review_sms_wording_blocked(p_text text)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_text,'') ~ '(할인|쿠폰|사은품|적립|경품|추첨|기프티콘|상품권|이벤트|별점|5점|만점|좋은 *리뷰|좋게 *써)'
$$;
revoke all on function public.review_sms_wording_blocked(text) from public,anon,authenticated;

-- 보낼 번호를 받아 한 명씩 「보낼지·막을지」를 정하고 기록을 남긴다. 보낼 줄(pending)만 받는 번호와 문구를 돌려준다.
-- 실제 발송은 서버 함수 review-sms가 솔라피로 하고 review_sms_finish로 결과를 적는다.
create or replace function public.review_sms_prepare(p_phones text[],p_name text default null)
returns table(log_id uuid,status text,phone_tail text,to_number text,message_text text,sender text,mode text)
language plpgsql security definer set search_path='' as $$
declare
 v_live boolean; v_tests text[]:='{}'; v_sender text; v_url text; v_days integer; v_hours text; v_tpl text;
 v_name text:=nullif(btrim(coalesce(p_name,'')),''); v_text text; v_now time; v_start time; v_end time;
 v_raw text; v_digits text; v_seen text[]:='{}'; v_status text; v_mode text; v_id uuid; v_hash text;
begin
 if not public.review_sms_access_allowed() then raise exception 'review sms access required'; end if;
 if p_phones is null or coalesce(cardinality(p_phones),0) not between 1 and 20 then raise exception 'review sms phones must be 1-20'; end if;
 if v_name is not null and (char_length(v_name)>20 or v_name ~ '[\r\n{}]') then raise exception 'review sms name invalid'; end if;
 select coalesce(max(value) filter(where key='review_sms.live_enabled'),'false')='true',
        coalesce(max(value) filter(where key='review_sms.sender'),''),
        coalesce(max(value) filter(where key='review_sms.review_url'),''),
        coalesce(max(value) filter(where key='review_sms.template'),'')
   into v_live,v_sender,v_url,v_tpl
   from public.app_settings where key in ('review_sms.live_enabled','review_sms.sender','review_sms.review_url','review_sms.template');
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
  log_id:=v_id; status:=v_status; phone_tail:=right(v_digits,4); mode:=v_mode;
  to_number:=case when v_status='pending' then v_digits end;
  message_text:=case when v_status='pending' then v_text end;
  sender:=case when v_status='pending' then v_sender end;
  return next;
 end loop;
end $$;
revoke all on function public.review_sms_prepare(text[],text) from public,anon,authenticated;
grant execute on function public.review_sms_prepare(text[],text) to authenticated;

-- 서버 함수(service_role)만: 솔라피 결과를 적는다. 아직 pending인 줄만 바뀐다(두 번 적어도 처음 결과 유지).
create or replace function public.review_sms_finish(p_results jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if jsonb_typeof(p_results)<>'array' then raise exception 'review sms results must be array'; end if;
 update public.review_sms_log l set status=r.status,provider_id=left(r.provider_id,120),error=left(r.error,500),finished_at=now()
  from jsonb_to_recordset(p_results) r(log_id uuid,status text,provider_id text,error text)
  where l.id=r.log_id and l.status='pending' and r.status in ('sent','failed','not_configured');
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function public.review_sms_finish(jsonb) from public,anon,authenticated;
grant execute on function public.review_sms_finish(jsonb) to service_role;

-- 최근 보낸 기록(번호는 끝 4자리만 · 문구 원문 없음).
create or replace function public.review_sms_recent(p_limit integer default 30)
returns table(id uuid,created_at timestamptz,sent_by uuid,phone_tail text,patient_label text,mode text,status text,error text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.review_sms_access_allowed() then raise exception 'review sms access required'; end if;
 return query select l.id,l.created_at,l.sent_by,l.phone_tail,l.patient_label,l.mode,l.status,l.error
  from public.review_sms_log l order by l.created_at desc,l.id desc limit least(greatest(coalesce(p_limit,30),1),100);
end $$;
revoke all on function public.review_sms_recent(integer) from public,anon,authenticated;
grant execute on function public.review_sms_recent(integer) to authenticated;

commit;
