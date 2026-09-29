-- 원장 보기판의 새 저장 객체만 되돌린다.
drop function if exists public.owner_board_put(text,text,text,timestamptz);
drop table if exists public.owner_boards;
