-- 되돌리기(문제 때만 · 원장 판단): slug 검사를 네 판으로 되돌린다. 화면(hr.html)과 Edge를 먼저 되돌린 뒤 돌린다.
-- 안전장치: rules_map·codex_flow 행이 하나라도 남아 있으면 아무것도 바꾸지 않고 중단한다(여기서는 행을 지우지 않는다).
-- 지우려면 원장이 판단해 따로 지운 뒤 다시 돌린다. 판 자료는 PC 원본에서 다시 만들 수 있는 스냅샷이다.
begin;
do $$
begin
  if exists(select 1 from public.owner_boards where slug in('rules_map','codex_flow')) then
    raise exception 'owner_boards에 rules_map 또는 codex_flow 행이 남아 있어 되돌리기를 중단합니다 — 행은 이 파일이 지우지 않습니다';
  end if;
end $$;
alter table public.owner_boards drop constraint if exists owner_boards_slug_check;
alter table public.owner_boards add constraint owner_boards_slug_check check(slug in('busd_ledger','pin_board','wordbook','inbox'));
commit;
