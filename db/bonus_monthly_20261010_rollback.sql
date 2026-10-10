-- 빈 표만 되돌린다. 상여·기준·변경 기록이 있으면 자료를 남기고 중단한다.
begin;
do $$begin
 if exists(select 1 from public.bonus_entries) or exists(select 1 from public.bonus_criteria) or exists(select 1 from public.bonus_defaults) or exists(select 1 from public.bonus_history) then
 raise exception 'bonus data exists; rollback stopped without deleting data';end if;
end;$$;
drop function public.bonus_copy_previous(text);
drop function public.bonus_apply_defaults(text);
drop function public.bonus_import_suggestions(jsonb);
drop function public.bonus_confirm(text,text[]);
drop table public.bonus_entries,public.bonus_criteria,public.bonus_defaults,public.bonus_history;
drop function public.bonus_guard_confirmation(),public.bonus_set_audit(),public.bonus_write_history();
commit;
