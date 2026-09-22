import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
// push_subscriptions_draft.sql(Task 7)의 포터블 카탈로그 자기검증은 PGlite 버전별 카탈로그 표현 차이로
// 이 환경에서 이미 실패가 알려져 있다(기준선 known failure). 그 파일은 건드리지 않고, 여기서는 그 실제 컬럼
// 모양(id uuid, user_id uuid, endpoint text, subscription jsonb, unique(user_id,endpoint))만 그대로 복제한
// 최소 fixture로 outbox(push_notifications_draft.sql)만 검증한다.
// push_events/push_event_deliveries/push_subscriptions는 어느 role에도 직접 GRANT가 없으므로(RPC 전용,
// 최소권한), 테스트 셋업/검증용 원시 SELECT·UPDATE는 반드시 'set role none'(소유자 문맥)에서 실행한다.
const root=process.env.PGLITE_PACKAGE_ROOT;if(!root)throw Error('PGLITE_PACKAGE_ROOT is required');
const {PGlite}=await import(pathToFileURL(path.join(root,'dist/index.js')).href);
const draft=fs.readFileSync('db/push_notifications_draft.sql','utf8'),rollback=fs.readFileSync('db/push_notifications_rollback.sql','utf8');
assert.match(draft,/references public\.profiles\(user_id\) on delete cascade/i);
assert.match(draft,/role in \('chief','owner'\)/i);
assert.doesNotMatch(draft,/set active=false/i,'live push_subscriptions has no active column; expiry must delete');
assert.match(draft,/grant execute on function public\.claim_push_events\(uuid,integer\) to service_role/i);
assert.doesNotMatch(draft,/grant select|grant insert|grant update|grant delete/i,'dispatcher must reach tables only through SECURITY DEFINER RPCs, not raw grants');

const staff='11111111-1111-1111-1111-111111111111',chief='22222222-2222-2222-2222-222222222222',owner='33333333-3333-3333-3333-333333333333',manager='44444444-4444-4444-4444-444444444444',inactiveChief='55555555-5555-5555-5555-555555555555';

async function fresh(){
  const db=new PGlite(),q=s=>db.query(s).then(x=>x.rows);
  await db.exec(`
    create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_uid',true),'')::uuid $$;
    grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
    create table public.profiles(user_id uuid primary key,role text not null default 'staff',active boolean not null default true,approved boolean not null default true);
    create table public.leave_requests(id bigint generated always as identity primary key,user_id uuid not null references public.profiles(user_id),status text not null default '대기');
    create table public.push_subscriptions(id uuid primary key,user_id uuid not null references public.profiles(user_id) on delete cascade,endpoint text not null,subscription jsonb not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,endpoint));
    grant select,insert,update,delete on public.profiles,public.leave_requests,public.push_subscriptions to authenticated;
    grant usage,select on all sequences in schema public to authenticated;
  `);
  await db.exec(draft);
  await q(`insert into public.profiles(user_id,role,active,approved) values
    ('${staff}','staff',true,true),
    ('${chief}','chief',true,true),
    ('${owner}','owner',true,true),
    ('${manager}','manager',true,true),
    ('${inactiveChief}','chief',false,true)`);
  return {db,q};
}
const sub=(endpoint,p256dh='p',auth='a')=>`'${JSON.stringify({endpoint,keys:{p256dh,auth}})}'::jsonb`;
// owner(기본 role, 'set role none' 상태) 문맥에서만 쓰는 raw 조회 — 테스트 셋업/검증 전용, 앱 경로가 아니다.
const eventIdFor=async(q,recipientId)=>(await q(`select id from public.push_events where recipient_id='${recipientId}' order by id desc limit 1`))[0].id;

// 1) 신청 제출: chief+owner(활성+승인)만 outbox에 쌓인다. manager/비활성 chief는 제외.
{const {db,q}=await fresh();try{
  await q(`insert into public.leave_requests(user_id,status) values ('${staff}','대기')`);
  const rows=await q('select event_type,recipient_id from public.push_events order by recipient_id');
  assert.equal(rows.length,2,'chief+owner만 큐에 쌓여야 함');
  assert.deepEqual(rows.map(r=>r.recipient_id).sort(),[chief,owner].sort());
  assert.ok(rows.every(r=>r.event_type==='leave_submitted'));
  const payload=(await q('select payload from public.push_events limit 1'))[0].payload;
  assert.equal(payload.title,'연차 신청 알림');assert.ok(!JSON.stringify(payload).includes(staff),'개인 사유 등 비공개 정보 없음');
}finally{await db.close()}}

// 2) 상태 변경: 신청 직원에게만, 승인된 활성 프로필일 때만 큐에 쌓인다.
{const {db,q}=await fresh();try{
  await q(`insert into public.leave_requests(user_id,status) values ('${staff}','대기')`);
  await q(`update public.leave_requests set status='승인' where user_id='${staff}'`);
  const changed=await q(`select event_type,recipient_id from public.push_events where event_type='leave_status_changed'`);
  assert.equal(changed.length,1);assert.equal(changed[0].recipient_id,staff);
  // 같은 상태로 재저장(무변화 UPDATE)은 추가 적재하지 않는다.
  await q(`update public.leave_requests set status='승인' where user_id='${staff}'`);
  assert.equal((await q('select count(*)::int n from public.push_events'))[0].n,3);
  // 비활성 신청자로 상태만 바꾸면(예: 퇴사 후 정정) 큐에 쌓이지 않는다.
  await q(`insert into public.leave_requests(user_id,status) values ('${inactiveChief}','대기')`);
  const beforeInactiveUpdate=(await q('select count(*)::int n from public.push_events'))[0].n;
  await q(`update public.leave_requests set status='반려' where user_id='${inactiveChief}'`);
  assert.equal((await q('select count(*)::int n from public.push_events'))[0].n,beforeInactiveUpdate,'비활성 프로필에는 발송 큐를 쌓지 않는다');
}finally{await db.close()}}

// 3) enqueue_push_event는 event_key 기준으로 멱등이다(중복 적재 없음). 이 함수는 트리거 전용이라
// service_role에도 EXECUTE가 없다 — 트리거처럼 별도 SET ROLE 없이(=SECURITY DEFINER owner 문맥) 호출한다.
{const {db,q}=await fresh();try{
  await q(`select public.enqueue_push_event('dup-key','${staff}','leave_submitted','{}'::jsonb)`);
  await q(`select public.enqueue_push_event('dup-key','${staff}','leave_submitted','{}'::jsonb)`);
  assert.equal((await q("select count(*)::int n from public.push_events where event_key='dup-key'"))[0].n,1);
  await q('set role service_role');
  await assert.rejects(q(`select public.enqueue_push_event('dup-key-2','${staff}','leave_submitted','{}'::jsonb)`),/permission denied/i,'트리거 전용 함수는 service_role도 직접 호출할 수 없다');
  await q('set role none');
}finally{await db.close()}}

// 4) claim_push_events: SKIP LOCKED로 서로 다른 claim이 같은 이벤트를 집지 않고, attempts>=5 + 만료 lease는 failed로 회수한다.
{const {db,q}=await fresh();try{
  await q(`insert into public.leave_requests(user_id,status) values ('${staff}','대기')`);
  await q('set role service_role');
  const c1=await q("select id,attempts from public.claim_push_events('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',1)");
  const c2=await q("select id,attempts from public.claim_push_events('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',1)");
  assert.equal(c1.length,1);assert.equal(c2.length,1);assert.notEqual(c1[0].id,c2[0].id);assert.equal(c1[0].attempts,1);
  await q('set role none');
  // push_events에는 service_role에게도 직접 테이블 권한이 없다(RPC 경유만 허용) — 여기서부터는 만료
  // lease 상태를 재현하려는 테스트 셋업이라 owner 문맥에서 직접 갱신/검증한다.
  await q(`update public.push_events set attempts=5,claimed_at=now()-interval '11 minutes',next_attempt_at=null where id=${c1[0].id}`);
  await q('set role service_role');
  const recovered=await q("select id from public.claim_push_events('cccccccc-cccc-cccc-cccc-cccccccccccc',5)");
  await q('set role none');
  assert.equal(recovered.find(r=>r.id===c1[0].id),undefined,'attempts>=5 + 만료 lease는 재청구되지 않고 failed로 회수됨');
  assert.equal((await q(`select status from public.push_events where id=${c1[0].id}`))[0].status,'failed');
}finally{await db.close()}}

// 5) 권한: service_role만 claim/record 계열 RPC를 실행할 수 있고 authenticated/anon은 거부된다(최소권한).
{const {db,q}=await fresh();try{
  await q(`insert into public.leave_requests(user_id,status) values ('${staff}','대기')`);
  await q('set role authenticated');
  await assert.rejects(q("select * from public.claim_push_events('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',1)"),/permission denied/i);
  await q('set role anon');
  await assert.rejects(q("select * from public.claim_push_events('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',1)"),/permission denied/i);
  await q('set role none');
}finally{await db.close()}}

// 6) 발송 대상 조회는 claim 소유권이 있을 때만 통과하고, 그 외에는 'push delivery claim lost'로 막힌다.
{const {db,q}=await fresh();try{
  await q(`insert into public.leave_requests(user_id,status) values ('${staff}','대기')`);
  await q('set role authenticated');
  await q(`select set_config('app.test_uid','${chief}',false)`);
  await q(`insert into public.push_subscriptions(id,user_id,endpoint,subscription) values ('a0000000-0000-0000-0000-000000000001','${chief}','https://fcm.googleapis.com/x',${sub('https://fcm.googleapis.com/x')})`);
  await q('set role none');
  const evId=await eventIdFor(q,chief);
  await q('set role service_role');
  const claimToken='dddddddd-dddd-dddd-dddd-dddddddddddd';
  await q(`select public.claim_push_events('${claimToken}',10)`);
  const status=await q(`select active,approved from public.get_push_event_recipient_status(${evId},'${claimToken}')`);
  assert.deepEqual(status[0],{active:true,approved:true});
  const subs=await q(`select subscription_id,endpoint from public.get_push_event_subscriptions(${evId},'${claimToken}')`);
  assert.equal(subs.length,1);assert.equal(subs[0].endpoint,'https://fcm.googleapis.com/x');
  await assert.rejects(q(`select * from public.get_push_event_subscriptions(${evId},'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')`),/push delivery claim lost/);
  await q('set role none');
}finally{await db.close()}}

// 7) seed/get deliveries + record_push_delivery: sent는 상태만 갱신, expired는 구독행을 삭제(active 컬럼이 없으므로 삭제=해제).
{const {db,q}=await fresh();try{
  await q(`insert into public.leave_requests(user_id,status) values ('${staff}','대기')`);
  await q('set role authenticated');await q(`select set_config('app.test_uid','${chief}',false)`);
  await q(`insert into public.push_subscriptions(id,user_id,endpoint,subscription) values
    ('a0000000-0000-0000-0000-000000000002','${chief}','https://fcm.googleapis.com/ok',${sub('https://fcm.googleapis.com/ok')}),
    ('a0000000-0000-0000-0000-000000000003','${chief}','https://fcm.googleapis.com/expired',${sub('https://fcm.googleapis.com/expired')})`);
  await q('set role none');
  const evId=await eventIdFor(q,chief);
  await q('set role service_role');
  const claimToken='11111111-2222-3333-4444-555555555555';
  await q(`select public.claim_push_events('${claimToken}',10)`);
  await q(`select public.seed_push_event_deliveries(${evId},'${claimToken}',array['a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003']::uuid[])`);
  await q(`select public.seed_push_event_deliveries(${evId},'${claimToken}',array['a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003']::uuid[])`);
  const seeded=await q(`select subscription_id,status from public.get_push_event_deliveries(${evId},'${claimToken}') order by subscription_id`);
  assert.equal(seeded.length,2,'중복 seed는 무시되고 두 건만 남는다');
  await q(`select public.record_push_delivery(${evId},'a0000000-0000-0000-0000-000000000002','${claimToken}','sent',1)`);
  await q(`select public.record_push_delivery(${evId},'a0000000-0000-0000-0000-000000000003','${claimToken}','expired',1)`);
  await assert.rejects(q(`select public.record_push_delivery(${evId},'a0000000-0000-0000-0000-000000000002','99999999-9999-9999-9999-999999999999','sent',1)`),/push delivery claim lost/,'오래된/다른 claim_token으로는 delivery를 기록할 수 없다');
  await q('set role none');
  assert.equal((await q("select status from public.push_event_deliveries where subscription_id='a0000000-0000-0000-0000-000000000002'"))[0].status,'sent');
  assert.equal((await q("select count(*)::int n from public.push_subscriptions where id='a0000000-0000-0000-0000-000000000003'"))[0].n,0,'만료 구독은 삭제되어야 함');
  assert.equal((await q("select count(*)::int n from public.push_subscriptions where id='a0000000-0000-0000-0000-000000000002'"))[0].n,1,'정상 발송된 구독은 남아있어야 함');
}finally{await db.close()}}

// 8) delete_push_event_subscription: 소유자가 다른 구독은 지울 수 없다(owner mismatch).
{const {db,q}=await fresh();try{
  await q(`insert into public.leave_requests(user_id,status) values ('${staff}','대기')`);
  await q('set role authenticated');await q(`select set_config('app.test_uid','${staff}',false)`);
  await q(`insert into public.push_subscriptions(id,user_id,endpoint,subscription) values ('a0000000-0000-0000-0000-000000000009','${staff}','https://fcm.googleapis.com/other',${sub('https://fcm.googleapis.com/other')})`);
  await q('set role none');
  const evId=await eventIdFor(q,chief);
  await q('set role service_role');
  const claimToken='66666666-7777-8888-9999-000000000000';
  await q(`select public.claim_push_events('${claimToken}',10)`);
  await assert.rejects(q(`select public.delete_push_event_subscription(${evId},'${claimToken}','a0000000-0000-0000-0000-000000000009')`),/push subscription owner mismatch/,'chief 이벤트로 staff 구독을 지울 수 없다');
  await q('set role none');
  assert.equal((await q("select count(*)::int n from public.push_subscriptions where id='a0000000-0000-0000-0000-000000000009'"))[0].n,1,'거부된 삭제 시도는 구독을 지우지 않는다');
}finally{await db.close()}}

// 9) release_push_event: claim 소유권이 있어야 상태를 되돌릴 수 있고, 되돌리면 claim이 즉시 풀린다.
{const {db,q}=await fresh();try{
  await q(`insert into public.leave_requests(user_id,status) values ('${staff}','대기')`);
  const evId=await eventIdFor(q,chief);
  await q('set role service_role');
  const claimToken='77777777-7777-7777-7777-777777777777';
  await q(`select public.claim_push_events('${claimToken}',10)`);
  await assert.rejects(q(`select public.release_push_event(${evId},'88888888-8888-8888-8888-888888888888','failed','no safe active subscription')`),/push event claim lost/);
  await q(`select public.release_push_event(${evId},'${claimToken}','failed','no safe active subscription')`);
  await q('set role none');
  const row=(await q(`select status,last_error,claim_token,claimed_at from public.push_events where id=${evId}`))[0];
  assert.equal(row.status,'failed');assert.equal(row.last_error,'no safe active subscription');assert.equal(row.claim_token,null);assert.equal(row.claimed_at,null);
}finally{await db.close()}}

// 10) 롤백은 fail-closed: 데이터가 남아있으면 보존하고 멈추고, 비어있으면 걷어내고, 이미 없으면 그렇게 알린다.
async function rollbackError(db){try{await db.exec(rollback);return null}catch(e){await db.exec('rollback');return e.message}}
{const {db,q}=await fresh();try{
  await q(`insert into public.leave_requests(user_id,status) values ('${staff}','대기')`);
  assert.equal(await rollbackError(db),'push events exist; preserve data and stop rollback');
  assert.notEqual((await q("select to_regclass('public.push_events') r"))[0].r,null,'데이터가 있으면 테이블을 지우지 않는다');
}finally{await db.close()}}
{const {db,q}=await fresh();try{
  assert.equal(await rollbackError(db),null);
  assert.equal((await q("select to_regclass('public.push_events') r"))[0].r,null);
  assert.equal((await q("select to_regclass('public.push_event_deliveries') r"))[0].r,null);
  assert.equal((await q("select count(*)::int n from pg_trigger where tgname='queue_leave_push_event'"))[0].n,0);
}finally{await db.close()}}
{const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;`);
  assert.equal(await rollbackError(db),'push notification outbox tables missing; nothing to roll back or already rolled back');
}finally{await db.close()}}

console.log('PGLITE_PUSH_NOTIFICATIONS_PASS: outbox enqueue/claim/deliver/expire, least-privilege RPC-only access, fail-closed rollback');
