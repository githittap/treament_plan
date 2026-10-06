-- 요청 이력이 있으면 보존하고 롤백을 중단함.
begin;
do $$ begin
  if exists(select 1 from public.leave_change_requests) then raise exception 'leave change history exists; preserve data and stop rollback'; end if;
  if exists(select 1 from public.approval_docs where kind='물품구매') then raise exception 'purchase history exists; preserve data and stop rollback'; end if;
end $$;
do $$ declare original text; begin
  select definition into original from public.suggestion_asks_20261006_restore where name='storage_check';
  if original is null then raise exception 'original storage check required'; end if;
  execute 'alter policy employee_hub_storage_access_gate on storage.objects with check ('||original||')';
end $$;
drop function if exists public.pending_add_document(text,text,text);
drop function if exists public.pending_report_fingerprint();
drop function if exists public.pending_onboarding_info();
drop function if exists public.onboarding_self_access_allowed();
do $$ declare original text; begin
  select definition into original from public.suggestion_asks_20261006_restore where name='approval_kind';
  if original is null then raise exception 'original approval constraint required'; end if;
  alter table public.approval_docs drop constraint approval_docs_kind_check;
  execute 'alter table public.approval_docs add constraint approval_docs_kind_check '||original;
end $$;
drop trigger if exists queue_leave_change_push on public.leave_change_requests;
drop function if exists public.queue_leave_change_push();
drop function if exists public.process_leave_change(bigint,text);
drop function if exists public.request_leave_change(bigint,text,text,text);
drop table if exists public.leave_change_requests;
drop table if exists public.suggestion_asks_20261006_restore;
commit;
