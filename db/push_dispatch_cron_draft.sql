-- 별도 적용본 — push_notifications_draft.sql과 push-dispatcher Edge Function이 먼저 배포되고,
-- 아래 두 vault 비밀이 채워진 뒤에만 적용한다(이 파일 자체에는 비밀값을 절대 넣지 않는다).
--   1) push_dispatch_bearer — Edge Function 게이트웨이(verify_jwt=true) 통과용. 프로젝트 service_role 키.
--   2) push_dispatch_secret — push-dispatcher 내부 애플리케이션 보호용. Edge Function 환경변수
--      PUSH_DISPATCH_SECRET과 반드시 같은 값이어야 한다(다르면 매 실행마다 401로 계속 실패한다).
-- 배포 시 실제 값으로 1회만 실행하고 이 파일에는 남기지 않는다. 예:
--   select vault.create_secret('<service_role_key>','push_dispatch_bearer');
--   select vault.create_secret('<PUSH_DISPATCH_SECRET과 동일한 값>','push_dispatch_secret');
begin;
do $$ begin
  if exists(select 1 from cron.job where jobname='push-dispatcher-every-minute') then
    raise exception 'push-dispatcher-every-minute cron job already exists; preserve state and stop';
  end if;
end $$;
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'push-dispatcher-every-minute',
  '* * * * *',
  $cron$
  select net.http_post(
    url:='https://texevhsxttfoqkrucfzl.supabase.co/functions/v1/push-dispatcher',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='push_dispatch_bearer'),
      'x-push-dispatch-secret',(select decrypted_secret from vault.decrypted_secrets where name='push_dispatch_secret')
    ),
    body:='{}'::jsonb,
    timeout_milliseconds:=15000
  );
  $cron$
);
commit;
