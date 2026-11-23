-- Administrative candidate: GENERAL intake, only after separate later approval. Never use for a one-booking pilot.
begin;
set local lock_timeout='5s';
update dentweb_private.kakao_mail_control
  set enabled=true,pilot_booking_hash=null,pilot_event_at=null,pilot_expires_at=null where singleton=true;
do $$ begin if not exists(select 1 from dentweb_private.kakao_mail_control where singleton=true and enabled=true) then raise exception 'resume not confirmed'; end if; end $$;
commit;
