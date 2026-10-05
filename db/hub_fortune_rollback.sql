-- hub_fortune.sql 되돌리기 — 운세 카드 표·함수를 지운다(뽑은 기록도 같이 사라짐: 필요하면 먼저 fortune_draws를 내려받을 것).
begin;
drop function if exists public.fortune_status();
drop function if exists public.fortune_draw();
drop function if exists public.fortune_admin_overview();
drop function if exists public.fortune_save_settings(boolean, int);
drop function if exists public.fortune_save_prizes(jsonb);
drop function if exists public.fortune_mark_paid(bigint, boolean);
drop table if exists public.fortune_draws;
drop table if exists public.fortune_prizes;
drop table if exists public.fortune_settings;
commit;
