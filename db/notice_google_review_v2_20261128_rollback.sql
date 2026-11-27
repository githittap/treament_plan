-- 되돌리기: 구글 리뷰 공지 2판 교체(2026-11-28) 이전으로
begin;
delete from public.notices where title = '[공지] 구글 리뷰 — 직원이 환자분께 직접 부탁드리는 방법 (2판, 11/28)';
update public.notices set pinned = true, title = '[공지] 구글 리뷰 부탁드리는 방법 (진료 마친 환자분께)' where id = 4;
update public.notices set title = '리뷰 요청 안내 (진료 마친 환자분께 구글 리뷰 부탁드리기)' where id = 3;
commit;
