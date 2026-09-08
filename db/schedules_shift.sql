alter table public.schedules drop constraint if exists schedules_shift_check;
alter table public.schedules add constraint schedules_shift_check check (shift in ('work','off','evening','etc'));
