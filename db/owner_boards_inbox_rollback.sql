-- 되돌리기(문제 때만 · 원장 판단): 인박스 경고 판 행을 지우고 slug 검사를 세 판으로 되돌린다.
-- 화면(hr.html)과 Edge를 먼저 되돌린 뒤 돌린다 — 인박스 판은 PC 원본에서 다시 만들 수 있는 스냅샷이라 지워도 원본은 남는다.
delete from public.owner_boards where slug='inbox';
alter table public.owner_boards drop constraint if exists owner_boards_slug_check;
alter table public.owner_boards add constraint owner_boards_slug_check check(slug in('busd_ledger','pin_board','wordbook'));
