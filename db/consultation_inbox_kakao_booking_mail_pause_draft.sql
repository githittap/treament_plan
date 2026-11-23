-- Administrative candidate: stop the hospital sender first. Success means prior intake locks have drained.
begin;
set local lock_timeout='5s';
update dentweb_private.kakao_mail_control
  set enabled=false,pilot_booking_hash=null,pilot_event_at=null,pilot_expires_at=null where singleton=true;
do $$ begin if not exists(select 1 from dentweb_private.kakao_mail_control where singleton=true and enabled=false
  and pilot_booking_hash is null and pilot_event_at is null and pilot_expires_at is null) then raise exception 'pause not confirmed'; end if; end $$;
commit;
