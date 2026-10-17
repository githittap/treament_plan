-- 모음판에 일곱째~아홉째 판 「🛠️ 학습 도구 사용법」(slug tool_guide)·「🧑‍⚕️ 원장 종합판」(slug owner_summary)·「🔤 신호어 모음」(slug signal_words)을 허용한다 — slug 검사 제약만 아홉 판으로 바꾼다.
-- 표의 다른 칸·RLS 정책·owner_board_put 함수·이미 올라온 판 자료는 그대로. 다시 돌려도 같은 결과.
-- 올리는 쪽: PC 업로더(hr_owner_boards_uploader.py)가 완결 HTML을 Edge owner-board-sync로 보냄.
begin;
alter table public.owner_boards drop constraint if exists owner_boards_slug_check;
alter table public.owner_boards add constraint owner_boards_slug_check check(slug in('busd_ledger','pin_board','wordbook','inbox','rules_map','codex_flow','tool_guide','owner_summary','signal_words'));
commit;
