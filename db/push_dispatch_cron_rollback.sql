-- push_dispatch_cron_draft.sql 전용 되돌리기. 이 작업이 만든 예약 하나만 지운다.
-- pg_cron/pg_net 확장 자체는 다른 기능이 같이 쓸 수 있으므로 여기서 지우지 않는다.
-- vault 비밀 3개도 남긴다(다시 적용할 때 그대로 쓴다). 지우려면 따로:
--   select vault.delete_secret(id) from vault.secrets
--    where name in ('push_dispatch_bearer','push_dispatch_secret','push_dispatch_url');
--
-- ⚠️ 예전 판은 `not exists(select 1 from cron.job ...)` 를 그냥 썼는데, pg_cron 이 없는 DB 에서는
--    OR 로 앞을 막아도 식 전체를 미리 계획하느라 42P01 이 난다(draft 쪽과 같은 함정).
--    → 조회를 EXECUTE 로 미뤄 "예약이 없다"는 안내가 제대로 나오게 했다.

begin;

do $$
declare already integer;
begin
  if to_regnamespace('cron') is null then
    raise exception 'pg_cron 이 없다 — 되돌릴 예약이 없다(이미 되돌렸거나 적용된 적이 없다)';
  end if;

  execute $q$select count(*) from cron.job where jobname = 'push-dispatcher-every-minute'$q$ into already;
  if already = 0 then
    raise exception 'push-dispatcher-every-minute 예약이 없다 — 되돌릴 것이 없다(이미 되돌렸다)';
  end if;

  perform cron.unschedule('push-dispatcher-every-minute');
end $$;

commit;
