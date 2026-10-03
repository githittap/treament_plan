-- 시급제 추가 기능 (초안; 운영 적용은 별도 승인 후).
-- 운영 적용 전 확인 조회:
-- select user_id,name,active,approved from public.profiles where name='이소연'; -- 한 명인지 확인
-- select user_id,effective_from,wage_type,base_wage from public.wage_info order by effective_from;
-- select to_regclass('public.attendance_manual_entries'),to_regclass('public.attendance_manual_revisions'),
--        to_regclass('public.manual_attendance_status_history'),to_regclass('public.attendance_issue_resolutions');
-- select public.employee_hub_access_allowed(); -- 기존 계정 접근 차단 함수 필수
-- 기존 payroll_rows / payslips / 월급제 함수·정책·지문 원본은 변경하지 않음.
-- 선행: payroll.sql, attendance_issue_resolution_release.sql, 기존 app_settings.
begin;
alter table public.wage_info
  add column if not exists hourly_enabled boolean not null default false,
  add column if not exists hourly_rates jsonb not null default '{}'::jsonb,
  add column if not exists hourly_insured boolean not null default false;
alter table public.attendance_manual_entries
  add column if not exists hourly_correction boolean not null default false;

insert into public.app_settings(key,value) values
 ('wage.hourly.categories','[{"code":"weekday","label":"평일","days":[1,2,3,4,5],"dates":[]},{"code":"weekend","label":"주말","days":[0,6],"dates":[]}]'),
 ('wage.hourly.deductions','{"pension":0.0475,"health":0.03595,"ltc_health":0.1314,"employment":0.009,"local_income":0.1}'),
 ('wage.hourly.income_tax','[]') on conflict(key) do nothing;
insert into public.app_settings(key,value) values('wage.hourly.enabled','true')
 on conflict(key) do update set value=excluded.value;
-- 이름이 정확히 한 명일 때만 기본 대상 생성. 시급은 추측하지 않고 미입력으로 둠.
insert into public.wage_info(user_id,wage_type,effective_from,hourly_enabled,hourly_rates,hourly_insured,memo)
select p.user_id,'hourly','2026-10-01',true,'{"weekday":null,"weekend":null}',false,'시급제 초기 설정: 세후 시급 입력 필요'
from public.profiles p where p.name='이소연' and p.active and p.approved
and (select count(*) from public.profiles where name='이소연' and active and approved)=1
and not exists(select 1 from public.wage_info w where w.user_id=p.user_id and w.hourly_enabled)
on conflict(user_id,effective_from) do nothing;

create or replace function public.wage_hourly_require(p_owner boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.employee_hub_access_allowed(),false)
    or coalesce(public.my_role(),'') not in ('owner','chief','manager','staff') then raise exception 'hourly access denied'; end if;
 if p_owner and public.my_role()<>'owner' then raise exception 'owner required'; end if;
 if not exists(select 1 from public.app_settings where key='wage.hourly.enabled' and value='true') then raise exception 'hourly feature disabled'; end if;
end; $$;

create or replace function public.wage_hourly_config()
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 perform public.wage_hourly_require(true);
 select jsonb_build_object('categories',(select value::jsonb from public.app_settings where key='wage.hourly.categories'),
  'deductions',(select value::jsonb from public.app_settings where key='wage.hourly.deductions'),
  'income_tax',(select value::jsonb from public.app_settings where key='wage.hourly.income_tax')) into r;
 return jsonb_build_object('settings',r,'employees',coalesce((select jsonb_agg(to_jsonb(x)) from (
  select p.user_id,p.name,w.effective_from,coalesce(w.hourly_enabled,false) enabled,coalesce(w.hourly_rates,'{}') rates,
   coalesce(w.hourly_insured,false) insured from public.profiles p
  left join lateral (select * from public.wage_info w where w.user_id=p.user_id order by w.effective_from desc limit 1) w on true
  where p.active and p.approved order by p.name) x),'[]'::jsonb));
end; $$;

create or replace function public.wage_hourly_save_config(p_settings jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare c jsonb; b jsonb; d jsonb:=p_settings->'deductions'; n int; prev numeric:=0; upper_bound numeric; k text;
begin
 perform public.wage_hourly_require(true);
 if jsonb_typeof(p_settings->'categories') is distinct from 'array' or jsonb_array_length(p_settings->'categories')<2
 or jsonb_typeof(d) is distinct from 'object' or jsonb_typeof(p_settings->'income_tax') is distinct from 'array' then raise exception 'invalid hourly settings'; end if;
 for c in select value from jsonb_array_elements(p_settings->'categories') loop
  if coalesce(c->>'code','')!~'^[a-z][a-z0-9_]{0,30}$' or coalesce(trim(c->>'label'),'')=''
   or jsonb_typeof(c->'days') is distinct from 'array' or jsonb_typeof(c->'dates') is distinct from 'array'
   or exists(select 1 from jsonb_array_elements_text(c->'days') x where x::int not between 0 and 6)
   or exists(select 1 from jsonb_array_elements_text(c->'dates') x where x::date::text<>x) then raise exception 'invalid hourly category'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_settings->'categories') j group by j.value->>'code' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(p_settings->'categories') j cross join lateral jsonb_array_elements_text(j.value->'dates') x group by x having count(*)>1)
 then raise exception 'invalid duplicate category'; end if;
 for n in 0..6 loop
  if (select count(*) from jsonb_array_elements(p_settings->'categories') j cross join lateral jsonb_array_elements_text(j.value->'days') x where x::int=n)<>1 then raise exception 'invalid weekday coverage'; end if;
 end loop;
 foreach k in array array['pension','health','ltc_health','employment','local_income'] loop
  if jsonb_typeof(d->k) is distinct from 'number' or (d->>k)::numeric<0 or (d->>k)::numeric>=1 then raise exception 'invalid deduction rate'; end if;
 end loop;
 if (d->>'pension')::numeric+(d->>'health')::numeric*(1+(d->>'ltc_health')::numeric)+(d->>'employment')::numeric>=1 then raise exception 'invalid total deduction rate'; end if;
 for b in select value from jsonb_array_elements(p_settings->'income_tax') loop
  if jsonb_typeof(b->'min') is distinct from 'number' or jsonb_typeof(b->'amount') is distinct from 'number'
   or (b->>'min')::numeric is distinct from prev or (b->>'amount')::numeric<0 then raise exception 'invalid income tax brackets'; end if;
  upper_bound:=(b->>'max')::numeric;
  if upper_bound is not null and upper_bound<=(b->>'min')::numeric then raise exception 'invalid income tax upper bound'; end if;
  prev:=upper_bound;
 end loop;
 if jsonb_array_length(p_settings->'income_tax')>0 and prev is not null then raise exception 'invalid income tax coverage'; end if;
 insert into public.app_settings(key,value) values
  ('wage.hourly.categories',(p_settings->'categories')::text),('wage.hourly.deductions',d::text),('wage.hourly.income_tax',(p_settings->'income_tax')::text)
 on conflict(key) do update set value=excluded.value;
end; $$;

create or replace function public.wage_hourly_save_employee(p_user_id uuid,p_effective_from date,p_enabled boolean,p_rates jsonb,p_insured boolean)
returns void language plpgsql security definer set search_path='' as $$
declare c jsonb;
begin
 perform public.wage_hourly_require(true);
 if p_effective_from is null or p_enabled is null or p_insured is null or jsonb_typeof(p_rates) is distinct from 'object'
 or not exists(select 1 from public.profiles where user_id=p_user_id and active and approved) then raise exception 'invalid hourly employee'; end if;
 for c in select value from jsonb_array_elements((select value::jsonb from public.app_settings where key='wage.hourly.categories')) loop
  if p_enabled and (jsonb_typeof(p_rates->(c->>'code')) is distinct from 'number' or (p_rates->>(c->>'code'))::numeric<0) then raise exception 'invalid or missing hourly rate'; end if;
 end loop;
 -- 기존 월급 항목을 바꾸지 않고 적용일별 wage_info에 추가 설정을 저장함.
 insert into public.wage_info(user_id,effective_from,hourly_enabled,hourly_rates,hourly_insured,updated_by,updated_at)
 values(p_user_id,p_effective_from,p_enabled,p_rates,p_insured,(select name from public.profiles where user_id=auth.uid()),now())
 on conflict(user_id,effective_from) do update set hourly_enabled=excluded.hourly_enabled,hourly_rates=excluded.hourly_rates,
 hourly_insured=excluded.hourly_insured,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
end; $$;

create or replace function public.wage_hourly_correct(p_user_id uuid,p_work_date date,p_clock_in time,p_clock_out time,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attendance; prior record; entry_id bigint; actor text; before_value jsonb;
begin
 perform public.wage_hourly_require();
 if public.my_role() not in ('owner','chief') then raise exception 'owner or chief required'; end if;
 if p_work_date is null or p_clock_in is null or p_clock_out is null or coalesce(trim(p_reason),'')='' then raise exception 'invalid hourly correction'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||'|'||p_work_date::text,0));
 if not coalesce((select hourly_enabled from public.wage_info where user_id=p_user_id and effective_from<=p_work_date order by effective_from desc limit 1),false)
 then raise exception 'hourly employee required'; end if;
 select * into a from public.attendance where user_id=p_user_id and work_date=p_work_date;
 if not found then raise exception 'attendance required'; end if;
 select x.clock_in,x.clock_out into prior from (
  select clock_in,clock_out,created_at t,id from public.attendance_manual_entries where user_id=p_user_id and work_date=p_work_date and hourly_correction and status='원장확정'
  union all select clock_in,clock_out,approved_at,id from public.attendance_issue_resolutions where user_id=p_user_id and work_date=p_work_date
 ) x order by t desc,id desc limit 1;
 before_value:=jsonb_build_object('clock_in',case when found then prior.clock_in else a.clock_in end,'clock_out',case when found then prior.clock_out else a.clock_out end,'source',a.source);
 select name into actor from public.profiles where user_id=auth.uid();
 insert into public.attendance_manual_entries(user_id,work_date,clock_in,clock_out,reason,reason_required,status,hourly_correction,
  chief_by,chief_at,owner_by,owner_at)
 values(p_user_id,p_work_date,p_clock_in,p_clock_out,p_reason,true,'원장확정',true,
  case when public.my_role()='chief' then actor end,case when public.my_role()='chief' then now() end,
  case when public.my_role()='owner' then actor end,case when public.my_role()='owner' then now() end) returning id into entry_id;
 insert into public.attendance_manual_revisions(entry_id,user_id,work_date,payload,recorded_by)
 values(entry_id,p_user_id,p_work_date,jsonb_build_object('kind','hourly_correction','before',before_value,
  'after',jsonb_build_object('clock_in',p_clock_in,'clock_out',p_clock_out),'reason',p_reason),auth.uid());
 insert into public.manual_attendance_status_history(entry_id,from_status,to_status,actor_id,actor_name,reason)
 values(entry_id,null,'원장확정',auth.uid(),actor,p_reason);
 return jsonb_build_object('entry_id',entry_id,'work_date',p_work_date); -- 실장에게 금액을 반환하지 않음.
end; $$;

create or replace function public.wage_hourly_correction_targets(p_work_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.wage_hourly_require();
 if public.my_role() not in ('owner','chief') then raise exception 'owner or chief required';end if;
 if p_work_date is null then raise exception 'invalid work date';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
  select p.user_id,p.name,case when r.present then r.clock_in else a.clock_in end clock_in,
   case when r.present then r.clock_out else a.clock_out end clock_out
  from public.profiles p
  join lateral (select hourly_enabled from public.wage_info where user_id=p.user_id and effective_from<=p_work_date order by effective_from desc limit 1) w on w.hourly_enabled
  left join public.attendance a on a.user_id=p.user_id and a.work_date=p_work_date
  left join lateral (select clock_in,clock_out,true present from (
   select clock_in,clock_out,created_at t,id from public.attendance_manual_entries where user_id=p.user_id and work_date=p_work_date and hourly_correction and status='원장확정'
   union all select clock_in,clock_out,approved_at,id from public.attendance_issue_resolutions where user_id=p.user_id and work_date=p_work_date
  ) v order by t desc,id desc limit 1) r on true
  where p.active and p.approved order by p.name) x),'[]'::jsonb);
end; $$;

create or replace function public.wage_hourly_month(p_month text,p_user_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare start_day date; end_day date; p record; a record; w public.wage_info; corr record;
 cats jsonb; deductions jsonb; tax jsonb; b jsonb; cat jsonb; users jsonb:='[]'; days jsonb;
 t1 timestamp; t2 timestamp; segment_end timestamp; segment_day date; ci time; co time; minutes int;
 total_min int; total_net numeric; amount numeric; rate numeric; code text; gross numeric; candidate numeric;
 burden numeric; insured boolean; complete boolean; has_correction boolean;
begin
 perform public.wage_hourly_require();
 if p_month is null or p_month!~'^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid month'; end if;
 if public.my_role()<>'owner' and p_user_id is distinct from auth.uid() then raise exception 'hourly access denied'; end if;
 start_day:=(p_month||'-01')::date;end_day:=(start_day+interval '1 month')::date;
 select value::jsonb into cats from public.app_settings where key='wage.hourly.categories';
 select value::jsonb into deductions from public.app_settings where key='wage.hourly.deductions';
 select value::jsonb into tax from public.app_settings where key='wage.hourly.income_tax';
 burden:=(deductions->>'pension')::numeric+(deductions->>'health')::numeric*(1+(deductions->>'ltc_health')::numeric)+(deductions->>'employment')::numeric;
 for p in select pr.user_id,pr.name from public.profiles pr where pr.active and pr.approved
 and (p_user_id is null or pr.user_id=p_user_id)
 and exists(select 1 from public.wage_info wi where wi.user_id=pr.user_id and wi.hourly_enabled and wi.effective_from<end_day) order by pr.name loop
  days:='[]';total_min:=0;total_net:=0;complete:=true;
  for a in select * from public.attendance where user_id=p.user_id and work_date>=start_day-1 and work_date<end_day order by work_date loop
   select * into w from public.wage_info where user_id=p.user_id and effective_from<=a.work_date order by effective_from desc limit 1;
   if not found or not w.hourly_enabled then continue; end if;
   select x.clock_in,x.clock_out into corr from (
    select clock_in,clock_out,created_at t,id from public.attendance_manual_entries where user_id=p.user_id and work_date=a.work_date and hourly_correction and status='원장확정'
    union all select clock_in,clock_out,approved_at,id from public.attendance_issue_resolutions where user_id=p.user_id and work_date=a.work_date
   ) x order by t desc,id desc limit 1;
   has_correction:=found;
   ci:=case when has_correction then corr.clock_in else a.clock_in end;co:=case when has_correction then corr.clock_out else a.clock_out end;
   if ci is null or co is null then
    if a.work_date>=start_day then days:=days||jsonb_build_array(jsonb_build_object('date',a.work_date,'work_date',a.work_date,'needs_review',true,'minutes',null,'net',null));complete:=false;end if;
    continue;
   end if;
   t1:=date_trunc('minute',a.work_date+ci);t2:=date_trunc('minute',a.work_date+co);
   if co<ci then t2:=t2+interval '1 day';end if;
   while t1<t2 loop
    segment_day:=t1::date;segment_end:=least(t2,segment_day+interval '1 day');
    if segment_day>=start_day and segment_day<end_day then
     select * into w from public.wage_info where user_id=p.user_id and effective_from<=segment_day order by effective_from desc limit 1;
     if w.hourly_enabled then
      select value into cat from jsonb_array_elements(cats) where (value->'dates') ? segment_day::text limit 1;
      if not found then select value into cat from jsonb_array_elements(cats) where (value->'days') @> to_jsonb(array[extract(dow from segment_day)::int]) limit 1;end if;
      code:=cat->>'code';rate:=(w.hourly_rates->>code)::numeric;
      minutes:=extract(epoch from segment_end-t1)::int/60;
      amount:=round(minutes*rate/60);
      if rate is null then complete:=false;end if;
      days:=days||jsonb_build_array(jsonb_build_object('date',segment_day,'work_date',a.work_date,'clock_in',ci,'clock_out',co,
       'minutes',minutes,'category',code,'label',cat->>'label','rate',rate,'net',amount,'corrected',has_correction,'needs_review',rate is null));
      total_min:=total_min+minutes;total_net:=total_net+coalesce(amount,0);
     end if;
    end if;
    t1:=segment_end;
   end loop;
  end loop;
  select coalesce(hourly_insured,false) into insured from public.wage_info where user_id=p.user_id and effective_from<end_day order by effective_from desc limit 1;
  gross:=null;
  if insured and complete then
   if jsonb_array_length(tax)=0 then gross:=round(total_net/(1-burden));
   else
    for b in select value from jsonb_array_elements(tax) loop
     candidate:=(total_net+(b->>'amount')::numeric*(1+(deductions->>'local_income')::numeric))/(1-burden);
     if candidate>=(b->>'min')::numeric and (b->>'max' is null or candidate<(b->>'max')::numeric) then gross:=round(candidate);exit;end if;
    end loop;
    if gross is null then raise exception 'income tax bracket missing';end if;
   end if;
  end if;
  users:=users||jsonb_build_array(jsonb_build_object('user_id',p.user_id,'name',p.name,'days',days,'minutes',total_min,
   'net',case when complete then total_net else null end,'gross_estimate',gross,'insured',insured,
   'income_tax_included',jsonb_array_length(tax)>0,'needs_review',not complete));
 end loop;
 return jsonb_build_object('month',p_month,'users',users);
end; $$;

revoke all on function public.wage_hourly_require(boolean) from public,anon,authenticated;
revoke all on function public.wage_hourly_config(),public.wage_hourly_save_config(jsonb),
 public.wage_hourly_save_employee(uuid,date,boolean,jsonb,boolean),public.wage_hourly_correct(uuid,date,time,time,text),
 public.wage_hourly_month(text,uuid),public.wage_hourly_correction_targets(date) from public,anon,authenticated;
grant execute on function public.wage_hourly_config(),public.wage_hourly_save_config(jsonb),
 public.wage_hourly_save_employee(uuid,date,boolean,jsonb,boolean),public.wage_hourly_correct(uuid,date,time,time,text),
 public.wage_hourly_month(text,uuid),public.wage_hourly_correction_targets(date) to authenticated;
commit;
