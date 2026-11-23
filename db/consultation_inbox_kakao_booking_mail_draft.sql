-- LOCAL DRAFT ONLY. Do not apply to an operational database without the project approval gate.
begin;

-- Keep the existing immutable parser as a legacy fallback while canonical mail facts
-- feed the generated fields consumed by DentWeb matching and both Hub screens.
do $$
declare column_count integer;
begin
  select count(*) into column_count from pg_catalog.pg_attribute a
    where a.attrelid='public.consultation_inbox'::regclass and not a.attisdropped
      and a.attname in ('kakao_booking_name','kakao_booking_contact_digits','kakao_booking_schedule','kakao_booking_product')
      and a.atttypid='text'::regtype and a.attgenerated='s';
  if column_count<>4 then raise exception 'booking normalization schema mismatch'; end if;
  if exists(select 1 from pg_catalog.pg_attribute a where a.attrelid='public.consultation_inbox'::regclass
      and not a.attisdropped and a.attname in ('kakao_mail_name','kakao_mail_contact','kakao_mail_schedule_text','kakao_mail_product'))
    then raise exception 'booking normalization draft already applied'; end if;
end $$;

alter table public.consultation_inbox
  add column kakao_mail_name text,
  add column kakao_mail_contact text,
  add column kakao_mail_schedule_text text,
  add column kakao_mail_product text;

alter table public.consultation_inbox
  drop column kakao_booking_name,
  drop column kakao_booking_contact_digits,
  drop column kakao_booking_schedule,
  drop column kakao_booking_product;

alter table public.consultation_inbox
  add column kakao_booking_name text generated always as
    (coalesce(kakao_mail_name,public.dentweb_kakao_booking_value(source,external_event_id,message,'name'))) stored,
  add column kakao_booking_contact_digits text generated always as
    (coalesce(kakao_mail_contact,public.dentweb_kakao_booking_value(source,external_event_id,message,'contact'))) stored,
  add column kakao_booking_schedule text generated always as
    (coalesce(kakao_mail_schedule_text,public.dentweb_kakao_booking_value(source,external_event_id,message,'schedule'))) stored,
  add column kakao_booking_product text generated always as
    (coalesce(kakao_mail_product,public.dentweb_kakao_booking_value(source,external_event_id,message,'product'))) stored;


alter table public.consultation_inbox
  add column kakao_booking_number text,
  add column kakao_booking_version bigint not null default 0,
  add column kakao_booking_state text check (kakao_booking_state in ('requested','confirmed','cancelled','review_required')),
  add column kakao_event_at timestamptz,
  add column kakao_list_at timestamptz generated always as (coalesce(kakao_event_at,received_at)) stored,
  add column kakao_requested_at timestamptz,
  add column kakao_mail_schedule timestamptz,
  add column dentweb_claimed_by uuid,
  add column dentweb_claimed_at timestamptz,
  add column dentweb_claim_version bigint,
  add column dentweb_cancel_ack boolean not null default false,
  add constraint kakao_booking_identity check (
    (kakao_booking_number is null and kakao_booking_state is null and kakao_event_at is null)
    or (source = 'kakao' and kakao_booking_number ~ '^[0-9]{6,24}$'
        and kakao_booking_state is not null and kakao_event_at is not null)
  );

create unique index consultation_inbox_kakao_booking_number_key
  on public.consultation_inbox(kakao_booking_number) where kakao_booking_number is not null;

create schema if not exists dentweb_private;
revoke all on schema dentweb_private from public, anon, authenticated;
grant usage on schema dentweb_private to service_role;

-- Singleton is private; receipt may lock/read but cannot toggle enabled.
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

alter table public.dentweb_inbox_matches add column booking_version bigint;

alter table public.dentweb_inbox_matches enable row level security;
alter table public.dentweb_monthly_first_visits enable row level security;
revoke all on public.dentweb_inbox_matches,public.dentweb_monthly_first_visits
  from public,anon,authenticated,service_role;
grant select on public.dentweb_inbox_matches,public.dentweb_monthly_first_visits to authenticated;

drop policy if exists dentweb_inbox_matches_select on public.dentweb_inbox_matches;
create policy dentweb_inbox_matches_select on public.dentweb_inbox_matches
  for select to authenticated using (
    exists(select 1 from public.consultation_inbox i where i.id=dentweb_inbox_matches.inbox_id
      and i.kakao_booking_number is not null
      and i.kakao_booking_version=dentweb_inbox_matches.booking_version)
  );
drop policy if exists dentweb_monthly_first_visits_select on public.dentweb_monthly_first_visits;
create policy dentweb_monthly_first_visits_select on public.dentweb_monthly_first_visits
  for select to authenticated using (
    (select public.employee_hub_access_allowed())
    and ((select public.my_role())='owner' or (select public.marketing_manager_view_enabled()))
  );

-- Capture the actual deployed function body (including its stored whitespace)
-- before replacing it, so rollback restores that exact definition.
create table dentweb_private.kakao_mail_restore_definition (
  singleton boolean primary key default true check (singleton),
  match_upsert_definition text not null
);
alter table dentweb_private.kakao_mail_restore_definition enable row level security;
revoke all on dentweb_private.kakao_mail_restore_definition from public,anon,authenticated,service_role;
insert into dentweb_private.kakao_mail_restore_definition(singleton,match_upsert_definition)
  select true,pg_get_functiondef('public.dentweb_inbox_match_upsert(jsonb)'::regprocedure);

create or replace function public.dentweb_inbox_match_upsert(p_rows jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'invalid match rows'; end if;
  if jsonb_array_length(p_rows) not between 1 and 50 then raise exception 'invalid match batch size'; end if;

  if exists(select 1 from jsonb_array_elements(p_rows) as e(value)
    where e.value ? 'booking_version' and jsonb_typeof(e.value->'booking_version') not in ('number','null'))
  then raise exception 'invalid booking match version'; end if;

  -- Serialize version checks with receipt updates in a stable order.
  perform i.id from public.consultation_inbox i
    join jsonb_to_recordset(p_rows) as r(inbox_id uuid) on r.inbox_id=i.id
    order by i.id for update of i;
  if exists(select 1 from jsonb_to_recordset(p_rows) as r(inbox_id uuid,booking_version bigint)
    join public.consultation_inbox i on i.id=r.inbox_id
    where r.booking_version is not null and
      (i.kakao_booking_number is null or r.booking_version is distinct from i.kakao_booking_version))
  then raise exception 'stale booking match'; end if;

  if exists(
    select 1 from jsonb_to_recordset(p_rows) as r(inbox_id uuid)
    left join public.consultation_inbox i on i.id=r.inbox_id
    where i.source is distinct from 'kakao' or left(i.external_event_id,6) is distinct from 'kbook-'
  ) then raise exception 'match requires an existing Kakao booking'; end if;

  if exists(
    select 1 from jsonb_to_recordset(p_rows) as r(inbox_id uuid,appointment_found boolean,booking_version bigint)
    join public.consultation_inbox i on i.id=r.inbox_id
    where i.kakao_booking_number is not null and r.booking_version is not null
      and r.appointment_found and (i.kakao_booking_contact_digits is null or i.kakao_booking_schedule is null)
  ) then raise exception 'positive match requires canonical booking contact and schedule'; end if;

  if exists(
    with expected as (
      select r.inbox_id,r.appointment_found,r.appointment_at,r.visited,r.visited_at,r.checked_at,
        public.dentweb_kakao_booking_date(i.kakao_booking_schedule,i.received_at) as booking_day
      from jsonb_to_recordset(p_rows) as r(
        inbox_id uuid,appointment_found boolean,appointment_at timestamptz,visited boolean,visited_at timestamptz,checked_at timestamptz,booking_version bigint
      ) join public.consultation_inbox i on i.id=r.inbox_id where i.kakao_booking_number is not null and r.booking_version is not null
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
    inbox_id,appointment_found,appointment_at,visited,visited_at,match_basis,checked_at,booking_version
  )
  select r.inbox_id,r.appointment_found,r.appointment_at,r.visited,r.visited_at,r.match_basis,r.checked_at,r.booking_version
  from jsonb_to_recordset(p_rows) as r(
    inbox_id uuid,appointment_found boolean,appointment_at timestamptz,visited boolean,
    visited_at timestamptz,match_basis text,checked_at timestamptz,booking_version bigint
  )
  -- Old clients provide no version; accept but never persist their untrusted observations.
  join public.consultation_inbox i on i.id=r.inbox_id and i.kakao_booking_number is not null and r.booking_version is not null
  order by r.inbox_id
  on conflict (inbox_id) do update set
    appointment_found=excluded.appointment_found,appointment_at=excluded.appointment_at,
    visited=excluded.visited,visited_at=excluded.visited_at,match_basis=excluded.match_basis,
    checked_at=excluded.checked_at,booking_version=excluded.booking_version
  where excluded.booking_version is distinct from current_match.booking_version or excluded.checked_at>current_match.checked_at;
end $$;

create table dentweb_private.kakao_mail_control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  lock_token smallint not null default 0 check (lock_token=0),
  pilot_booking_hash bytea,
  pilot_event_at timestamptz,
  pilot_expires_at timestamptz,
  constraint kakao_mail_pilot_complete check (
    (pilot_booking_hash is null and pilot_event_at is null and pilot_expires_at is null)
    or (pilot_booking_hash is not null and octet_length(pilot_booking_hash)=32
      and pilot_event_at is not null and isfinite(pilot_event_at)
      and pilot_expires_at is not null and isfinite(pilot_expires_at) and not enabled))
);
alter table dentweb_private.kakao_mail_control enable row level security;
revoke all on dentweb_private.kakao_mail_control from public,anon,authenticated,service_role;
grant select, update(lock_token) on dentweb_private.kakao_mail_control to service_role;
insert into dentweb_private.kakao_mail_control(singleton,enabled) values(true,false);

-- Service code may consume a pre-authorized pilot but cannot arm it.
-- The row lock serializes consumption, pause, and explicit general resume.
create function dentweb_private.kakao_mail_take_authorization(p_rows jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  control dentweb_private.kakao_mail_control%rowtype;
  pilot jsonb;
begin
  select c.* into control from dentweb_private.kakao_mail_control c where c.singleton=true for update;
  if not found then raise exception 'booking intake paused or unavailable' using errcode='55000'; end if;
  if control.enabled then return; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)<>1
    then raise exception 'booking intake paused or unavailable' using errcode='55000'; end if;
  pilot := p_rows->0;
  if control.pilot_booking_hash is null
    or control.pilot_expires_at<=clock_timestamp()
    or control.pilot_expires_at>clock_timestamp()+interval '10 minutes'
    or pilot->>'state' is distinct from 'confirmed'
    or coalesce(pilot->>'booking_number','') !~ '^[0-9]{6,24}$'
    or extensions.digest(pilot->>'booking_number','sha256') is distinct from control.pilot_booking_hash
    or (pilot->>'event_at')::timestamptz is distinct from control.pilot_event_at
    then raise exception 'booking intake paused or unavailable' using errcode='55000'; end if;
  update dentweb_private.kakao_mail_control set pilot_booking_hash=null,pilot_event_at=null,pilot_expires_at=null
    where singleton=true;
end $$;
revoke all on function dentweb_private.kakao_mail_take_authorization(jsonb) from public,anon,authenticated,service_role;
grant execute on function dentweb_private.kakao_mail_take_authorization(jsonb) to service_role;

create table dentweb_private.kakao_booking_events (
  inbox_id uuid not null references public.consultation_inbox(id),
  state text not null check (state in ('requested','confirmed','cancelled')),
  event_at timestamptz not null,
  visit_at timestamptz,
  name text,
  contact_digits text,
  product text,
  recorded_at timestamptz not null default now(),
  primary key (inbox_id, state, event_at)
);

alter table dentweb_private.kakao_booking_events enable row level security;
revoke all on dentweb_private.kakao_booking_events from public, anon, authenticated;
grant insert, select, update (visit_at,name,contact_digits,product) on dentweb_private.kakao_booking_events to service_role;

create function public.consultation_inbox_ingest_kakao_bookings(p_rows jsonb)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  event record;
  target public.consultation_inbox%rowtype;
  new_state_rank integer;
  old_state_rank integer;
  promote_state boolean;
  ambiguous boolean;
  event_inserted integer;
  event_enriched integer;
  event_changed boolean;
  preferred_visit timestamptz;
  preferred_name text;
  preferred_contact text;
  preferred_product text;
  accepted integer := 0;
begin
  if current_user <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'invalid booking batch' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) not between 1 and 50 then
    raise exception 'invalid booking batch size' using errcode = '22023';
  end if;
  perform dentweb_private.kakao_mail_take_authorization(p_rows);

  for event in
    select e.*
    from jsonb_to_recordset(p_rows) as e(
      booking_number text, state text, event_at timestamptz, visit_at timestamptz,
      name text, contact_digits text, product text)
    order by booking_number, event_at, state
  loop
    if event.booking_number is null or event.booking_number !~ '^[0-9]{6,24}$'
       or event.state is null or event.state not in ('requested','confirmed','cancelled')
       or event.event_at is null or not isfinite(event.event_at)
       or event.event_at > now() + interval '10 minutes'
       or (event.visit_at is not null and not isfinite(event.visit_at))
       or length(event.name) > 80 or length(event.product) > 120
       or event.name ~ E'[\r\n]' or event.product ~ E'[\r\n]'
       or (event.contact_digits is not null and event.contact_digits !~ '^0[0-9]{8,10}$') then
      raise exception 'invalid booking event' using errcode = '22023';
    end if;

    -- The legacy phone ingress uses epoch IDs. Only the separate kbook-r- namespace is canonical.
    insert into public.consultation_inbox(
      source, external_event_id, received_at, sender_name, contact, subject, message, created_via,
      kakao_booking_number, kakao_booking_state, kakao_event_at, kakao_requested_at, kakao_mail_schedule, kakao_mail_product
    ) values (
      'kakao', 'kbook-r-' || event.booking_number, now(), null,
      null, '카카오톡 예약하기', '카카오톡 예약하기', 'service_ingest',
      event.booking_number, event.state, event.event_at,
      case when event.state = 'requested' then event.event_at end, event.visit_at, nullif(btrim(event.product),'')
    )
    on conflict (source, external_event_id) do nothing;

    select i.* into strict target from public.consultation_inbox i
      where i.source = 'kakao' and i.external_event_id = 'kbook-r-' || event.booking_number
      for update;
    if target.kakao_booking_number is distinct from event.booking_number then
      raise exception 'occupied booking identifier' using errcode = '23505';
    end if;

    -- Preserve contradictory events but hold the booking for a human decision.
    ambiguous := target.kakao_booking_state='review_required' or exists(
      select 1 from dentweb_private.kakao_booking_events h where h.inbox_id=target.id and
      ((array_position(array['requested','confirmed','cancelled'],event.state)
          < array_position(array['requested','confirmed','cancelled'],h.state) and event.event_at>=h.event_at)
       or (array_position(array['requested','confirmed','cancelled'],event.state)
          > array_position(array['requested','confirmed','cancelled'],h.state) and event.event_at<=h.event_at)));

    insert into dentweb_private.kakao_booking_events(inbox_id,state,event_at,visit_at,name,contact_digits,product)
    values(target.id,event.state,event.event_at,event.visit_at,nullif(btrim(event.name),''),event.contact_digits,nullif(btrim(event.product),''))
    on conflict (inbox_id,state,event_at) do nothing;
    get diagnostics event_inserted = row_count;
    if exists(select 1 from dentweb_private.kakao_booking_events h
      where h.inbox_id=target.id and h.state=event.state and h.event_at=event.event_at and (
        (h.visit_at is not null and event.visit_at is not null and h.visit_at is distinct from event.visit_at)
        or (h.name is not null and nullif(btrim(event.name),'') is not null and h.name is distinct from nullif(btrim(event.name),''))
        or (h.contact_digits is not null and event.contact_digits is not null and h.contact_digits is distinct from event.contact_digits)
        or (h.product is not null and nullif(btrim(event.product),'') is not null and h.product is distinct from nullif(btrim(event.product),''))
      )) then raise exception 'conflicting duplicate booking event' using errcode='22023'; end if;
    update dentweb_private.kakao_booking_events h set
      visit_at=coalesce(h.visit_at,event.visit_at),name=coalesce(h.name,nullif(btrim(event.name),'')),
      contact_digits=coalesce(h.contact_digits,event.contact_digits),product=coalesce(h.product,nullif(btrim(event.product),''))
    where h.inbox_id=target.id and h.state=event.state and h.event_at=event.event_at
      and ((h.visit_at is null and event.visit_at is not null) or (h.name is null and nullif(btrim(event.name),'') is not null)
        or (h.contact_digits is null and event.contact_digits is not null) or (h.product is null and nullif(btrim(event.product),'') is not null));
    get diagnostics event_enriched = row_count;
    event_changed := event_inserted>0 or event_enriched>0;

    new_state_rank := array_position(array['requested','confirmed','cancelled'], event.state);
    old_state_rank := array_position(array['requested','confirmed','cancelled'], target.kakao_booking_state);
    promote_state := coalesce(new_state_rank > old_state_rank
      or (new_state_rank = old_state_rank and event.event_at > target.kakao_event_at),false);
    select h.visit_at into preferred_visit from dentweb_private.kakao_booking_events h
      where h.inbox_id=target.id and h.visit_at is not null
      order by array_position(array['requested','confirmed','cancelled'], h.state) desc, h.event_at desc
      limit 1;
    select h.name into preferred_name from dentweb_private.kakao_booking_events h
      where h.inbox_id=target.id and h.name is not null
      order by array_position(array['requested','confirmed','cancelled'],h.state) desc,h.event_at desc limit 1;
    select h.contact_digits into preferred_contact from dentweb_private.kakao_booking_events h
      where h.inbox_id=target.id and h.contact_digits is not null
      order by array_position(array['requested','confirmed','cancelled'],h.state) desc,h.event_at desc limit 1;
    select h.product into preferred_product from dentweb_private.kakao_booking_events h
      where h.inbox_id=target.id and h.product is not null
      order by array_position(array['requested','confirmed','cancelled'],h.state) desc,h.event_at desc limit 1;
    update public.consultation_inbox i set
      kakao_booking_version = i.kakao_booking_version + case when event_changed then 1 else 0 end,
      kakao_requested_at = case when event.state='requested'
        then least(i.kakao_requested_at,event.event_at) else i.kakao_requested_at end,
      kakao_booking_state = case when ambiguous then 'review_required' when promote_state then event.state else i.kakao_booking_state end,
      kakao_event_at = case when ambiguous then greatest(i.kakao_event_at,event.event_at) when promote_state then event.event_at else i.kakao_event_at end,
      kakao_mail_schedule = preferred_visit,
      kakao_mail_name = preferred_name,
      kakao_mail_contact = preferred_contact,
      kakao_mail_schedule_text = case when preferred_visit is null then null
        else to_char(preferred_visit at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
      kakao_mail_product = preferred_product
    where i.id = target.id and (
      event_changed or promote_state or (ambiguous and (i.kakao_booking_state is distinct from 'review_required' or event.event_at>i.kakao_event_at))
      or (event.state = 'requested' and (i.kakao_requested_at is null or event.event_at < i.kakao_requested_at))
      or (i.kakao_mail_schedule is distinct from preferred_visit)
      or (i.kakao_mail_name is distinct from preferred_name)
      or (i.kakao_mail_contact is distinct from preferred_contact)
      or (i.kakao_mail_product is distinct from preferred_product)
    );
    accepted := accepted + 1;
  end loop;
  return accepted;
end;
$$;

revoke all on function public.consultation_inbox_ingest_kakao_bookings(jsonb) from public, anon, authenticated;
grant execute on function public.consultation_inbox_ingest_kakao_bookings(jsonb) to service_role;

-- The old stamp RPC still honors its existing row policy. Impose the same claim
-- check on direct writes and on RPCs so concurrent sessions cannot bypass the hold.
create function public.consultation_inbox_guard_kakao_registration()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  actor uuid;
begin
  if new.kakao_booking_version is distinct from old.kakao_booking_version and current_user <> 'service_role' then
    raise exception 'booking version is server controlled' using errcode = '42501';
  end if;
  if new.dentweb_claimed_by is not distinct from old.dentweb_claimed_by
     and new.dentweb_claim_version is not distinct from old.dentweb_claim_version
     and new.dentweb_cancel_ack is not distinct from old.dentweb_cancel_ack
     and new.dentweb_entered_at is not distinct from old.dentweb_entered_at
     and new.dentweb_entered_by is not distinct from old.dentweb_entered_by then
    return new;
  end if;
  actor := auth.uid();
  if old.source <> 'kakao' or coalesce(old.external_event_id,'') not like 'kbook-%' then
    if new.dentweb_claimed_by is distinct from old.dentweb_claimed_by then
      raise exception 'booking only' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.kakao_booking_number is null then
    if new.dentweb_claimed_by is distinct from old.dentweb_claimed_by or new.dentweb_claim_version is distinct from old.dentweb_claim_version or new.dentweb_cancel_ack is distinct from old.dentweb_cancel_ack then
      raise exception 'legacy booking claim denied' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.dentweb_claimed_by is distinct from old.dentweb_claimed_by then
    if actor is null or not public.employee_hub_access_allowed()
       or coalesce(public.my_role(),'') not in ('owner','chief','manager')
       or old.kakao_booking_number is null or old.dentweb_entered_at is not null
       or old.journal_id is not null then
      raise exception 'booking claim denied' using errcode = '42501';
    end if;
    if new.dentweb_claimed_by is not null then
      if old.dentweb_claimed_by is not null or new.dentweb_claimed_by is distinct from actor
         or old.kakao_booking_state is distinct from 'confirmed' then
        raise exception 'booking already claimed or unconfirmed' using errcode = '42501';
      end if;
      if exists(select 1 from public.dentweb_inbox_matches m where m.inbox_id=old.id
        and m.booking_version=old.kakao_booking_version and m.appointment_found) then
        raise exception 'current booking already matched' using errcode='42501';
      end if;
      new.dentweb_claimed_at := now();
      new.dentweb_claim_version := old.kakao_booking_version;
    else
      if old.dentweb_claimed_by is distinct from actor and public.my_role() is distinct from 'owner' then
        raise exception 'booking release denied' using errcode = '42501';
      end if;
      new.dentweb_claimed_at := null;
      new.dentweb_claim_version := null;
    end if;
  end if;
  if (new.dentweb_claim_version is distinct from old.dentweb_claim_version
      or new.dentweb_cancel_ack is distinct from old.dentweb_cancel_ack)
     and new.dentweb_claimed_by is not distinct from old.dentweb_claimed_by
     and new.dentweb_entered_at is not distinct from old.dentweb_entered_at then
    raise exception 'booking acknowledgement requires first entry' using errcode='42501';
  end if;
  if new.dentweb_entered_at is distinct from old.dentweb_entered_at
     or new.dentweb_entered_by is distinct from old.dentweb_entered_by then
    if old.dentweb_entered_at is null and new.dentweb_entered_at is not null then
      if new.dentweb_claim_version is distinct from old.kakao_booking_version then
        raise exception 'booking changed since claimed' using errcode='40001';
      end if;
      if old.kakao_booking_state='cancelled' and new.dentweb_cancel_ack is distinct from true then
        raise exception 'cancelled booking requires explicit confirmation' using errcode='42501';
      end if;
      new.dentweb_cancel_ack := false;
    end if;
    if old.kakao_booking_state='review_required' and new.dentweb_entered_at is not null then
      raise exception 'booking needs review before entry' using errcode = '42501';
    end if;
    if new.dentweb_entered_at is not null and (
         old.kakao_booking_number is null or actor is null or old.dentweb_claimed_by is distinct from actor
         or old.dentweb_entered_at is not null) then
      raise exception 'claim required for booking entry' using errcode = '42501';
    end if;
    if new.dentweb_entered_at is null and actor is distinct from old.dentweb_entered_by
       and public.my_role() is distinct from 'owner' then
      raise exception 'booking entry undo denied' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.consultation_inbox_guard_kakao_registration() from public, anon, authenticated;
grant execute on function public.consultation_inbox_guard_kakao_registration() to authenticated, service_role;
create trigger consultation_inbox_guard_kakao_registration
before update on public.consultation_inbox
for each row execute function public.consultation_inbox_guard_kakao_registration();

grant update (dentweb_claimed_by,dentweb_claim_version,dentweb_cancel_ack) on public.consultation_inbox to authenticated;

-- Exact observed version/state is matched in the same RLS-governed UPDATE as the first stamp.
create function public.consultation_inbox_enter_kakao_booking(p_inbox_id uuid,p_version bigint,p_state text,p_cancel_confirmed boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null or not public.employee_hub_access_allowed() or p_version is null
     or p_state not in ('confirmed','cancelled') or p_cancel_confirmed is null
     or (p_state='cancelled' and p_cancel_confirmed is distinct from true) then
    raise exception 'booking entry denied' using errcode='42501';
  end if;
  update public.consultation_inbox i set
    dentweb_claim_version=p_version,dentweb_cancel_ack=p_cancel_confirmed,
    dentweb_entered_at=now(),dentweb_entered_by=auth.uid()
  where i.id=p_inbox_id and i.kakao_booking_number is not null and i.journal_id is null
    and i.dentweb_entered_at is null and i.dentweb_claimed_by=auth.uid()
    and i.kakao_booking_version=p_version and i.kakao_booking_state=p_state;
  return found;
end $$;
revoke all on function public.consultation_inbox_enter_kakao_booking(uuid,bigint,text,boolean) from public,anon;
grant execute on function public.consultation_inbox_enter_kakao_booking(uuid,bigint,text,boolean) to authenticated;

create function public.consultation_inbox_claim_kakao_booking(p_inbox_id uuid, p_claim boolean)
returns boolean
language plpgsql security invoker set search_path = ''
as $$
begin
  if auth.uid() is null or p_claim is null or not public.employee_hub_access_allowed()
    or coalesce(public.my_role(),'') not in ('owner','chief','manager') then
    raise exception 'booking claim denied' using errcode = '42501';
  end if;
  update public.consultation_inbox i
  set dentweb_claimed_by = case when p_claim then auth.uid() else null end
  where i.id=p_inbox_id and i.kakao_booking_number is not null
    and i.dentweb_entered_at is null and i.journal_id is null
    and ((p_claim and i.kakao_booking_state='confirmed'
          and (i.dentweb_claimed_by is null or i.dentweb_claimed_by=auth.uid()))
         or (not p_claim and (i.dentweb_claimed_by=auth.uid() or public.my_role()='owner')));
  return found;
end;
$$;
revoke all on function public.consultation_inbox_claim_kakao_booking(uuid,boolean) from public,anon;
grant execute on function public.consultation_inbox_claim_kakao_booking(uuid,boolean) to authenticated;


insert into public.hub_ui_texts(key,value) values
  ('inbox.booking_requested','신청'),
  ('inbox.booking_confirmed','확정'),
  ('inbox.booking_cancelled','취소'),
  ('inbox.booking_review','확인 필요'),
  ('inbox.booking_review_required','확인 필요'),
  ('inbox.booking_state','카카오 예약 상태'),
  ('inbox.booking_state_unknown','상태 미확인'),
  ('inbox.booking_claim','덴트웹 등록 맡기'),
  ('inbox.booking_release','등록 맡기 해제'),
  ('inbox.booking_check_duplicate','덴트웹에 같은 예약이 없는지 확인했나요?'),
  ('inbox.booking_claim_failed','맡기 결과를 확인하지 못했습니다. 다시 불러와 확인하세요.'),
  ('inbox.booking_cancel_record','취소 전에 실제 등록한 건만 기록합니다. 이미 등록했나요?'),
  ('inbox.booking_stale','예약이 바뀌었거나 권한이 없습니다. 새로 확인하고 다시 결정하세요.'),
  ('inbox.booking_number_label','예약번호'),
  ('inbox.booking_find','예약번호로 찾기'),
  ('inbox.booking_number_invalid','예약번호를 숫자로 입력하세요.'),
  ('inbox.booking_not_found','예약을 찾지 못했습니다. 번호와 접근 권한을 확인하세요.'),
  ('dentweb.operations.booking_one_found','예약 1건'),
  ('dentweb.operations.kakaosearchlabel','예약번호'),
  ('dentweb.operations.kakaosearchbutton','예약번호로 찾기')
on conflict (key) do nothing;
commit;



