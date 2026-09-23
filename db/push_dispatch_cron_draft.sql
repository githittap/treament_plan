-- 1분마다 push-dispatcher 를 부르는 예약(pg_cron).
-- push_notifications_draft.sql 과 push-dispatcher Edge Function 이 먼저 반영된 뒤에 적용한다.
--
-- 먼저 vault 비밀 3개를 넣어 둔다(이 파일에는 실제 값을 절대 적지 않는다):
--   select vault.create_secret('<service_role 키>',            'push_dispatch_bearer');
--   select vault.create_secret('<Edge 의 PUSH_DISPATCH_SECRET 과 같은 값>','push_dispatch_secret');
--   select vault.create_secret('https://<프로젝트>.supabase.co/functions/v1/push-dispatcher','push_dispatch_url');
--
-- ⚠️ 2026-09-23 운영 반영 중 실제로 겪은 것 — 고쳐 둔 이유:
--   ① 예전 판은 `create extension` 보다 **먼저** cron.job 을 조회해서, pg_cron 이 없는 DB 에서
--      `42P01: relation "cron.job" does not exist` 로 죽었다. PL/pgSQL 은 OR/AND 를 짧게 끊어도
--      식 전체를 미리 계획하므로 cron.job 이 없으면 그 자리에서 실패한다.
--      → 확장을 먼저 만들고, 조회는 EXECUTE 로 미뤘다.
--   ② 보내는 주소가 파일에 박혀 있어, 복제본·시험용 DB 에 그대로 적용하면
--      **시험 DB 가 운영 발송기를 두드린다.** → 주소도 vault 에서 읽는다.
--   ③ vault 비밀이 하나라도 없으면 매분 401 로 조용히 실패한다. → 미리 막는다.
--
-- 되돌리기: db/push_dispatch_cron_rollback.sql

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare missing text; already integer;
begin
  -- 필요한 vault 비밀이 "있고 비어 있지 않은지"까지 본다.
  -- ⚠️ 이름만 세면 빈 문자열·공백도 통과해서, 예약은 등록되고 매분 조용히 401 이 난다.
  -- ⚠️ btrim(x) 는 ASCII 공백 하나만 지운다 — 탭·줄바꿈·NBSP(\u00A0)·전각공백(\u3000) 만 든 값이
  --    그대로 통과하는 것을 실제로 재현했다(4개 중 4개 통과). 그래서 지울 문자를 직접 지정한다.
  --    값 자체는 화면에 내보내지 않고 비었는지·형식만 본다.
  select string_agg(n, ', ') into missing
  from unnest(array['push_dispatch_bearer','push_dispatch_secret','push_dispatch_url']) n
  where not exists (
    select 1 from vault.decrypted_secrets s
    where s.name = n
      and coalesce(btrim(s.decrypted_secret, E' \t\r\n\u00A0\u3000'), '') <> ''
  );
  if missing is not null then
    raise exception 'vault 비밀이 없거나 비어 있다: % — 파일 맨 위 안내대로 먼저 넣어라', missing;
  end if;

  -- 보내는 주소가 정말 발송기 주소인지도 본다(오타·엉뚱한 주소로 매분 두드리는 것 방지).
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'push_dispatch_url'
      and btrim(decrypted_secret, E' \t\r\n\u00A0\u3000')
          ~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/push-dispatcher$'
  ) then
    raise exception 'push_dispatch_url 이 https://<프로젝트참조 20자>.supabase.co/functions/v1/push-dispatcher 모양이 아니다';
  end if;

  -- pg_cron 을 방금 만들었을 수도 있으므로 조회는 EXECUTE 로 미룬다.
  execute $q$select count(*) from cron.job where jobname = 'push-dispatcher-every-minute'$q$ into already;
  if already > 0 then
    raise exception 'push-dispatcher-every-minute 예약이 이미 있다; 상태를 보존하고 멈춘다';
  end if;

  perform cron.schedule(
    'push-dispatcher-every-minute',
    '* * * * *',
    $cron$
    select net.http_post(
      url := (select btrim(decrypted_secret, E' \t\r\n\u00A0\u3000')
                from vault.decrypted_secrets where name = 'push_dispatch_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_bearer'),
        'x-push-dispatch-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
    $cron$
  );
end $$;

commit;

-- 잘 돌아가는지 보는 법(적용 1~2분 뒤):
--   select status, return_message, start_time from cron.job_run_details r
--     join cron.job j on j.jobid = r.jobid
--    where j.jobname = 'push-dispatcher-every-minute' order by start_time desc limit 3;
--   select status_code, left(content, 200), created from net._http_response order by created desc limit 3;
-- 200 이면 정상, 401 이면 vault 의 push_dispatch_secret 과 Edge 의 PUSH_DISPATCH_SECRET 이 다른 것이다.
