-- AI 사용량 현황판 되돌리기: 파생 기록이라 보존 게이트 없이 교체 함수·표·수신 토큰 해시만 지운다(다른 webhook_secrets 행은 그대로 둔다).
begin;
drop function if exists public.ai_model_usage_replace(jsonb);
drop table if exists public.ai_model_usage_daily;
delete from public.webhook_secrets where name='ai_usage_sync_sha256';
commit;
