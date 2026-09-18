alter table public.contracts add column if not exists archive_path text;
drop policy if exists contracts_select_scoped on public.contracts;
create policy contracts_select_scoped on public.contracts for select to authenticated
using (public.my_role() in ('manager','chief','owner') or (user_id = auth.uid() and (status = '대기' or (status = '서명완료' and signed_at > now() - interval '5 days'))));
