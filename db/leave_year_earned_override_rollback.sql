-- Export saved overrides from a database administrator session before running this rollback. The leave ledger is independent.
begin;
drop function if exists public.clear_leave_year_earned(uuid,integer);
drop function if exists public.set_leave_year_earned(uuid,integer,numeric,text);
drop table if exists public.leave_year_earned_override;
commit;
