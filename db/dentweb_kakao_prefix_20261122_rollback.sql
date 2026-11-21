begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
lock table public.consultation_inbox in access exclusive mode;
-- A newer or unexpected parser must be reviewed before replacing it.
do $$ begin
  if not exists (select 1 from pg_proc p where p.oid='public.dentweb_kakao_booking_value(text,text,text,text)'::regprocedure
      and md5(replace(p.prosrc,E'\r\n',E'\n')) in ('123c7515268e2973b7707477c34b64c0','1e27329fc111a9863ba2f1420cffb21f')) then
    raise exception 'unexpected booking parser version';
  end if;
end $$;
-- Temporary, transaction-scoped comparison: no UPDATE or trigger changes on the source table.
create temporary table dentweb_prefix_refresh_before on commit drop as
select i.id, to_jsonb(i)-'kakao_booking_name'-'kakao_booking_contact_digits'-'kakao_booking_schedule'-'kakao_booking_product' as before_row,
  i.kakao_booking_name as name, i.kakao_booking_contact_digits as contact, i.kakao_booking_schedule as schedule,
  i.kakao_booking_product as product,
  coalesce(i.message ~ '(^|[\n\r])[[:space:]]*▸[[:space:]]+',false) as has_prefix
from public.consultation_inbox i;
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

-- PostgreSQL 17 SET EXPRESSION recomputes stored derived columns without UPDATE triggers.
alter table public.consultation_inbox
  alter column kakao_booking_name set expression as (public.dentweb_kakao_booking_value(source,external_event_id,message,'name')),
  alter column kakao_booking_contact_digits set expression as (public.dentweb_kakao_booking_value(source,external_event_id,message,'contact')),
  alter column kakao_booking_schedule set expression as (public.dentweb_kakao_booking_value(source,external_event_id,message,'schedule')),
  alter column kakao_booking_product set expression as (public.dentweb_kakao_booking_value(source,external_event_id,message,'product'));
do $$ begin
  if (select count(*) from public.consultation_inbox) <> (select count(*) from dentweb_prefix_refresh_before)
    or exists (select 1 from dentweb_prefix_refresh_before b left join public.consultation_inbox i on i.id=b.id
      where i.id is null or (to_jsonb(i)-'kakao_booking_name'-'kakao_booking_contact_digits'-'kakao_booking_schedule'-'kakao_booking_product') is distinct from b.before_row
        or (not b.has_prefix and (i.kakao_booking_name is distinct from b.name or i.kakao_booking_contact_digits is distinct from b.contact
          or i.kakao_booking_schedule is distinct from b.schedule or i.kakao_booking_product is distinct from b.product))) then
    raise exception 'inbox source, audit, or non-prefix derived value changed';
  end if;
end $$;
commit;
