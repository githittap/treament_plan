begin;

-- 생성 열은 기존 예약을 채울 때 문의함 업데이트·알림 트리거를 실행하지 않는다.
create or replace function public.dentweb_kakao_booking_value(
  p_source text, p_event_id text, p_message text, p_field text
) returns text
language plpgsql immutable strict set search_path='' as $$
declare
  labels constant text := '^(예약자[[:space:]]+연락처|예약자명|예약자|연락처|전화번호|예약[[:space:]]*일시|방문일시|예약일|일정|예약[[:space:]]*상품|상품명|상품|옵션명|옵션)(?:[[:space:]]*[:：][[:space:]]*|[[:space:]]+|$)(.*)$';
  schedule_pattern constant text := '^(?:(20[0-9]{2})[[:space:]]*[./년-][[:space:]]*)?([0-9]{1,2})[[:space:]]*[./월-][[:space:]]*([0-9]{1,2})[[:space:]]*일?[[:space:]]*(?:\([월화수목금토일]\))?[[:space:]]*(?:(오전|오후)[[:space:]]*)?([0-9]{1,2}):([0-9]{2})$';
  zoned_schedule_pattern constant text := '^(20[0-9]{2})-([0-9]{2})-([0-9]{2})T(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\.[0-9]{1,7})?)?(?:Z|[+-](?:(?:0[0-9]|1[0-3]):[0-5][0-9]|14:00))$';
  lines text[];
  parsed text[];
  value text;
  matches text[];
  i integer;
  field_label text;
  contact_value text;
  contact_digits text;
  normalized_contact text;
  first_contact_digits text;
  first_normalized_contact text;
  saw_schedule boolean := false;
begin
  if p_source <> 'kakao' or left(p_event_id,6) <> 'kbook-' then return null; end if;
  field_label := case p_field
    when 'name' then '^(예약자명|예약자)$'
    when 'contact' then '^(예약자[[:space:]]+연락처|연락처|전화번호)$'
    when 'schedule' then '^(예약[[:space:]]*일시|방문일시|예약일|일정)$'
    when 'product' then '^(예약[[:space:]]*상품|상품명|상품)$'
  end;
  if field_label is null then return null; end if;

  select array_agg(trimmed order by pos) into lines
  from (
    select regexp_replace(line,'^[[:space:]]+|[[:space:]]+$','','g') as trimmed, pos
    from regexp_split_to_table(p_message,E'\\r?\\n') with ordinality as parts(line,pos)
  ) cleaned
  where p_field = 'schedule' or trimmed <> '';

  for i in 1..coalesce(cardinality(lines),0) loop
    parsed := regexp_match(lines[i],labels);
    if parsed[1] ~ field_label then
      if p_field = 'contact' then
        contact_value := nullif(parsed[2],'');
        if contact_value is null and lines[i+1] !~ labels then contact_value := nullif(lines[i+1],''); end if;
        if contact_value is null or contact_value !~ '^(?:\+82|[(). -]*0)[0-9[:space:]().-]+$' then return null; end if;
        contact_digits := regexp_replace(contact_value,'[^0-9]','','g');
        if length(contact_digits) not between 9 and 12 then return null; end if;
        normalized_contact := case when left(contact_digits,2)='82' then '0'||substr(contact_digits,3) else contact_digits end;
        if first_normalized_contact is null then
          first_normalized_contact := normalized_contact;
          first_contact_digits := contact_digits;
        elsif first_normalized_contact is distinct from normalized_contact then
          return null;
        end if;
        continue;
      end if;
      -- 일정 표지가 여럿이면 어느 것이 확정 일정인지 판단을 보류한다.
      if p_field = 'schedule' and saw_schedule then return null; end if;
      value := nullif(parsed[2],'');
      if value is null and lines[i+1] !~ labels then value := nullif(lines[i+1],''); end if;
      exit when p_field <> 'schedule';
      saw_schedule := true;
    end if;
  end loop;

  if p_field = 'contact' then
    -- Repeated contacts are normalized together; distinct numbers stay unknown for matching.
    return first_contact_digits;
  elsif p_field = 'schedule' then
    matches := regexp_match(value,schedule_pattern);
    if matches is null then
      matches := regexp_match(value,zoned_schedule_pattern);
      if matches is null then return null; end if;
    elsif matches[6]::integer > 59
      or (matches[4] is null and matches[5]::integer > 23)
      or (matches[4] is not null and matches[5]::integer not between 1 and 12) then
      return null;
    end if;
    begin
      -- 연도를 생략한 양식은 가능한 월·일인지 먼저 검사하고 정확한 연도는 발행기가 판정한다.
      perform make_date(coalesce(matches[1]::integer,2000),matches[2]::integer,matches[3]::integer);
    exception when datetime_field_overflow then
      return null;
    end;
  end if;
  return value;
end $$;

revoke all on function public.dentweb_kakao_booking_value(text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.dentweb_kakao_booking_value(text,text,text,text) to authenticated,service_role;

alter table public.consultation_inbox
  add column if not exists kakao_booking_name text generated always as
    (public.dentweb_kakao_booking_value(source,external_event_id,message,'name')) stored,
  add column if not exists kakao_booking_contact_digits text generated always as
    (public.dentweb_kakao_booking_value(source,external_event_id,message,'contact')) stored,
  add column if not exists kakao_booking_schedule text generated always as
    (public.dentweb_kakao_booking_value(source,external_event_id,message,'schedule')) stored,
  add column if not exists kakao_booking_product text generated always as
    (public.dentweb_kakao_booking_value(source,external_event_id,message,'product')) stored;

create or replace function public.dentweb_kakao_booking_date(p_schedule text, p_received_at timestamptz)
returns date
language plpgsql stable strict set search_path=''
as $$
declare
  zoned_pattern constant text := '^(20[0-9]{2})-([0-9]{2})-([0-9]{2})T(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\.[0-9]{1,7})?)?(?:Z|[+-](?:(?:0[0-9]|1[0-3]):[0-5][0-9]|14:00))$';
  schedule_pattern constant text := '^(?:(20[0-9]{2})[[:space:]]*[./년-][[:space:]]*)?([0-9]{1,2})[[:space:]]*[./월-][[:space:]]*([0-9]{1,2})[[:space:]]*일?[[:space:]]*(?:\([월화수목금토일]\))?[[:space:]]*(?:(오전|오후)[[:space:]]*)?([0-9]{1,2}):([0-9]{2})$';
  matches text[];
  received_day date;
  candidate date;
  best_day date;
  best_distance integer;
  distance integer;
  center_year integer;
  year_value integer;
begin
  matches := regexp_match(p_schedule,zoned_pattern);
  if matches is not null then
    begin
      return (p_schedule::timestamptz at time zone 'Asia/Seoul')::date;
    exception when datetime_field_overflow or invalid_datetime_format then
      return null;
    end;
  end if;

  matches := regexp_match(p_schedule,schedule_pattern);
  if matches is null then return null; end if;
  if matches[1] is not null then
    begin
      return make_date(matches[1]::integer,matches[2]::integer,matches[3]::integer);
    exception when datetime_field_overflow or invalid_text_representation then
      return null;
    end;
  end if;

  received_day := (p_received_at at time zone 'Asia/Seoul')::date;
  center_year := extract(year from received_day)::integer;
  for year_value in (center_year-1)..(center_year+1) loop
    candidate := null;
    begin
      candidate := make_date(year_value,matches[2]::integer,matches[3]::integer);
    exception when datetime_field_overflow or invalid_text_representation then
      candidate := null;
    end;
    if candidate is not null then
      distance := abs(candidate-received_day);
      if distance<=180 and (best_distance is null or distance<best_distance or
          (distance=best_distance and candidate<best_day)) then
        best_day := candidate;
        best_distance := distance;
      end if;
    end if;
  end loop;
  return best_day;
end
$$;

revoke all on function public.dentweb_kakao_booking_date(text,timestamptz) from public,anon,authenticated,service_role;

create table if not exists public.dentweb_inbox_matches (
  inbox_id uuid primary key references public.consultation_inbox(id) on delete cascade,
  appointment_found boolean not null,
  appointment_at timestamptz,
  visited boolean not null,
  visited_at timestamptz,
  match_basis text not null check (match_basis in ('phone8_date','ambiguous','no_match','insufficient')),
  checked_at timestamptz not null check (isfinite(checked_at)),
  constraint dentweb_inbox_match_facts check (
    appointment_found = (match_basis = 'phone8_date')
    and appointment_found = (appointment_at is not null)
    and visited = (visited_at is not null)
    and (not visited or appointment_found)
    and (appointment_at is null or isfinite(appointment_at))
    and (visited_at is null or isfinite(visited_at))
  )
);

create table if not exists public.dentweb_monthly_first_visits (
  month date not null check (isfinite(month) and extract(day from month)=1),
  path text not null check (path ~ '^[a-z][a-z0-9_-]{0,39}$'),
  first_visit_count integer not null check (first_visit_count >= 0),
  checked_at timestamptz not null check (isfinite(checked_at)),
  primary key (month,path)
);

alter table public.dentweb_inbox_matches enable row level security;
alter table public.dentweb_monthly_first_visits enable row level security;
revoke all on public.dentweb_inbox_matches,public.dentweb_monthly_first_visits
  from public,anon,authenticated,service_role;
grant select on public.dentweb_inbox_matches,public.dentweb_monthly_first_visits to authenticated;

drop policy if exists dentweb_inbox_matches_select on public.dentweb_inbox_matches;
create policy dentweb_inbox_matches_select on public.dentweb_inbox_matches
  for select to authenticated using (
    exists(select 1 from public.consultation_inbox i where i.id=dentweb_inbox_matches.inbox_id)
  );
drop policy if exists dentweb_monthly_first_visits_select on public.dentweb_monthly_first_visits;
create policy dentweb_monthly_first_visits_select on public.dentweb_monthly_first_visits
  for select to authenticated using (
    (select public.employee_hub_access_allowed())
    and ((select public.my_role())='owner' or (select public.marketing_manager_view_enabled()))
  );

create or replace function public.dentweb_inbox_match_upsert(p_rows jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'invalid match rows'; end if;
  if jsonb_array_length(p_rows) not between 1 and 50 then raise exception 'invalid match batch size'; end if;

  if exists(
    select 1 from jsonb_to_recordset(p_rows) as r(inbox_id uuid)
    left join public.consultation_inbox i on i.id=r.inbox_id
    where i.source is distinct from 'kakao' or left(i.external_event_id,6) is distinct from 'kbook-'
  ) then raise exception 'match requires an existing Kakao booking'; end if;

  if exists(
    select 1 from jsonb_to_recordset(p_rows) as r(inbox_id uuid,appointment_found boolean)
    join public.consultation_inbox i on i.id=r.inbox_id
    where r.appointment_found and (i.kakao_booking_contact_digits is null or i.kakao_booking_schedule is null)
  ) then raise exception 'positive match requires canonical booking contact and schedule'; end if;

  if exists(
    with expected as (
      select r.inbox_id,r.appointment_found,r.appointment_at,r.visited,r.visited_at,r.checked_at,
        public.dentweb_kakao_booking_date(i.kakao_booking_schedule,i.received_at) as booking_day
      from jsonb_to_recordset(p_rows) as r(
        inbox_id uuid,appointment_found boolean,appointment_at timestamptz,visited boolean,visited_at timestamptz,checked_at timestamptz
      ) join public.consultation_inbox i on i.id=r.inbox_id
    )
    select 1 from expected e where
      (e.appointment_found and (e.booking_day is null or e.appointment_at is null or
        (e.appointment_at at time zone 'Asia/Seoul')::date is distinct from e.booking_day))
      or (e.visited and (not e.appointment_found or e.booking_day is null or e.visited_at is null or
        (e.visited_at at time zone 'Asia/Seoul')::date is distinct from e.booking_day or e.visited_at<e.appointment_at or e.visited_at>e.checked_at))
  ) then raise exception 'positive match date or visit observation does not match canonical booking schedule'; end if;

  if exists(select 1 from jsonb_to_recordset(p_rows) as r(checked_at timestamptz)
    where r.checked_at is null or not isfinite(r.checked_at) or r.checked_at>statement_timestamp()+interval '10 minutes')
  then raise exception 'invalid match checked_at'; end if;

  if exists(select 1 from jsonb_to_recordset(p_rows) as r(inbox_id uuid)
    group by r.inbox_id having count(*)>1)
  then raise exception 'duplicate inbox match'; end if;

  insert into public.dentweb_inbox_matches as current_match (
    inbox_id,appointment_found,appointment_at,visited,visited_at,match_basis,checked_at
  )
  select r.inbox_id,r.appointment_found,r.appointment_at,r.visited,r.visited_at,r.match_basis,r.checked_at
  from jsonb_to_recordset(p_rows) as r(
    inbox_id uuid,appointment_found boolean,appointment_at timestamptz,visited boolean,
    visited_at timestamptz,match_basis text,checked_at timestamptz
  )
  order by r.inbox_id
  on conflict (inbox_id) do update set
    appointment_found=excluded.appointment_found,appointment_at=excluded.appointment_at,
    visited=excluded.visited,visited_at=excluded.visited_at,match_basis=excluded.match_basis,
    checked_at=excluded.checked_at
  where excluded.checked_at>current_match.checked_at;
end $$;

-- 한 배치에 명시된 월만 전체 교체한다. 같은 월의 복수 경로는 잠금 한 번으로 교체한다.
create or replace function public.dentweb_monthly_first_visits_replace(p_rows jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare
  month_key date;
  observed_at timestamptz;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'invalid monthly rows'; end if;
  if jsonb_array_length(p_rows) not between 1 and 50 then raise exception 'invalid monthly batch size'; end if;

  if exists(
    select 1 from jsonb_to_recordset(p_rows) as r(month date,path text,first_visit_count integer)
    where r.month is null or not isfinite(r.month) or extract(day from r.month)<>1
      or r.path is null or r.path !~ '^[a-z][a-z0-9_-]{0,39}$'
      or r.first_visit_count is null or r.first_visit_count<0
  ) then raise exception 'invalid month, path or first visit count'; end if;

  if exists(select 1 from jsonb_to_recordset(p_rows) as r(checked_at timestamptz)
    where r.checked_at is null or not isfinite(r.checked_at) or r.checked_at>statement_timestamp()+interval '10 minutes')
  then raise exception 'invalid monthly checked_at'; end if;

  if exists(select 1 from jsonb_to_recordset(p_rows) as r(month date,checked_at timestamptz)
    group by r.month having min(r.checked_at)<>max(r.checked_at))
  then raise exception 'one checked_at is required per monthly snapshot'; end if;

  if exists(select 1 from jsonb_to_recordset(p_rows) as r(month date,path text)
    group by r.month,r.path having count(*)>1)
  then raise exception 'duplicate month and path'; end if;

  for month_key,observed_at in
    select r.month,min(r.checked_at) from jsonb_to_recordset(p_rows) as r(month date,checked_at timestamptz)
    group by r.month order by r.month
  loop
    perform pg_advisory_xact_lock(20261121,month_key-date '2000-01-01');
    -- 같은 시각의 재전송과 뒤늦게 도착한 이전 집계는 현재 월 자료를 덮지 않는다.
    if exists(select 1 from public.dentweb_monthly_first_visits d
      where d.month=month_key and d.checked_at>=observed_at) then continue; end if;

    delete from public.dentweb_monthly_first_visits d where d.month=month_key;
    insert into public.dentweb_monthly_first_visits(month,path,first_visit_count,checked_at)
    select r.month,r.path,r.first_visit_count,observed_at
    from jsonb_to_recordset(p_rows) as r(month date,path text,first_visit_count integer)
    where r.month=month_key;
  end loop;
end $$;

revoke all on function public.dentweb_inbox_match_upsert(jsonb),public.dentweb_monthly_first_visits_replace(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.dentweb_inbox_match_upsert(jsonb),public.dentweb_monthly_first_visits_replace(jsonb)
  to service_role;

commit;
