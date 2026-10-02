-- 원장 보기판에 넷째 판 「📥 인박스 경고」(slug inbox)를 허용한다 — slug 검사 제약만 바꾼다.
-- 표의 다른 칸·RLS 정책·owner_board_put 함수·이미 올라온 세 판 자료는 그대로. 다시 돌려도 같은 결과.
-- 올리는 쪽: PC 업로더(hr_owner_boards_uploader.py)가 총괄 인박스 맨 위 표를 HTML로 만들어 Edge owner-board-sync로 보냄.
alter table public.owner_boards drop constraint if exists owner_boards_slug_check;
alter table public.owner_boards add constraint owner_boards_slug_check check(slug in('busd_ledger','pin_board','wordbook','inbox'));
