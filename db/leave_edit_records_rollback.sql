begin;
do $$ begin
  if exists(select 1 from public.leave_edit_audit) or exists(select 1 from public.leave_ledger where effective_date is not null) then
    raise exception 'rollback stopped: leave edits exist';
  end if;
end $$;
drop function public.edit_approved_leave_dates(bigint,jsonb,text,text,date,date);
drop function public.update_leave_ledger_entry(bigint,jsonb,text,numeric,date,text);
drop function public.leave_protected_ledger_ids();
drop table public.leave_edit_audit;
alter table public.leave_ledger drop column effective_date;
commit;
