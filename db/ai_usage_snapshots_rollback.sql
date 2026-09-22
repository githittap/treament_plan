-- AI 사용량 현황판 통합분 되돌리기: 파생 스냅샷이라 보존 게이트 없이 저장 함수·표만 지운다(수신 토큰 해시는 ai_model_usage_daily_rollback.sql이 지운다).
begin;
drop function if exists public.ai_usage_snapshot_put(text,jsonb);
drop table if exists public.ai_usage_snapshots;
commit;
