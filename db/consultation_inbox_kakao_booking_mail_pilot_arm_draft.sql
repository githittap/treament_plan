-- LOCAL DRAFT. Privileged, parameterized call only: $1 = 64 lowercase hex SHA-256 of
-- the exact official number, $2 = the exact confirmed event timestamptz.
-- Returns one row only if paused, no pilot is armed, and that number is not in the inbox.
-- Never log a raw booking number and never use generic resume for a one-booking pilot.
update dentweb_private.kakao_mail_control c
set pilot_booking_hash=decode($1,'hex'),
    pilot_event_at=$2::timestamptz,
    pilot_expires_at=clock_timestamp()+interval '2 minutes'
where c.singleton=true and c.enabled=false and c.pilot_booking_hash is null
  and $1 ~ '^[0-9a-f]{64}$'
  and $2::timestamptz is not null and isfinite($2::timestamptz)
  and not exists(select 1 from public.consultation_inbox i
    where i.kakao_booking_number is not null
      and extensions.digest(i.kakao_booking_number,'sha256')=decode($1,'hex'))
returning true as armed,c.pilot_expires_at;
