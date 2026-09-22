begin;
do $$begin if exists(select 1 from public.consultation_inbox) then raise exception 'consultation_inbox contains data; rollback stopped to preserve records';end if;end$$;
drop trigger if exists consultation_inbox_set_updated_at on public.consultation_inbox;
drop function if exists public.set_consultation_inbox_updated_at();
drop function if exists public.consultation_inbox_convert_to_journal(uuid);
drop function if exists public.consultation_inbox_ingest_service(text,text,timestamptz,text,text,text,text);
drop table if exists public.consultation_inbox;
commit;
