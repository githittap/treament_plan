const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('supabase/functions/push-dispatcher/index.ts', 'utf8');
const transport = fs.readFileSync('supabase/functions/push-dispatcher/transport.ts', 'utf8');
const core = fs.readFileSync('supabase/functions/push-dispatcher/dispatcher_core.ts', 'utf8');
const integration = fs.readFileSync('supabase/functions/push-dispatcher/dispatcher_integration_test.ts', 'utf8');
const draft = fs.readFileSync('db/push_notifications_draft.sql', 'utf8');
const rollback = fs.readFileSync('db/push_notifications_rollback.sql', 'utf8');
const configToml = fs.readFileSync('supabase/config.toml', 'utf8');

test('Push dispatcher claims atomically through RPC and releases a lease', () => {
  assert.match(index, /rpc\("claim_push_events"/);
  assert.match(index, /processClaimedEvent/);
  assert.match(index, /rpc\("renew_push_event_claim"/);
  assert.match(index, /rpc\("release_push_event"/);
  assert.match(core, /recordDelivery/);
});

test('Push dispatcher never reaches push_events/push_subscriptions/push_event_deliveries through raw table grants', () => {
  // least-privilege 설계: service_role은 claim/record 계열 RPC만 EXECUTE 권한을 받고, 테이블 직접
  // 권한(.from('push_events') 등)은 전혀 없다. dispatcher가 raw table 접근으로 되돌아가지 않았는지 고정한다.
  assert.doesNotMatch(index, /\.from\(["']push_events["']\)/);
  assert.doesNotMatch(index, /\.from\(["']push_subscriptions["']\)/);
  assert.doesNotMatch(index, /\.from\(["']push_event_deliveries["']\)/);
  for (const rpcName of ['claim_push_events', 'renew_push_event_claim', 'get_push_event_recipient_status', 'get_push_event_subscriptions', 'delete_push_event_subscription', 'seed_push_event_deliveries', 'get_push_event_deliveries', 'record_push_delivery', 'release_push_event']) {
    assert.match(index, new RegExp(`rpc\\(["']${rpcName}["']`), `index.ts should call ${rpcName} via rpc()`);
    assert.match(draft, new RegExp(`grant execute on function public\\.${rpcName}\\([^)]*\\) to service_role`, 'i'), `${rpcName} should grant execute to service_role`);
  }
  assert.doesNotMatch(draft, /grant select|grant insert|grant update|grant delete/i, 'outbox tables must stay reachable only through SECURITY DEFINER RPCs');
});

test('Push dispatcher reconciles with the live push_subscriptions schema (uuid id, subscription jsonb, no active column)', () => {
  assert.match(index, /subscription_id: string/, 'RPC rows key subscriptions by subscription_id (uuid), matching db/push_subscriptions_draft.sql');
  assert.match(index, /row\.subscription\?\.keys\?\.p256dh/, 'p256dh/auth must be read out of the subscription jsonb column, not flat columns');
  assert.match(index, /row\.subscription\?\.keys\?\.auth/);
  assert.doesNotMatch(draft, /set active=false/i, 'live push_subscriptions has no active column; expiry must delete the row');
  assert.match(draft, /delete from public\.push_subscriptions where id=p_subscription_id and user_id=locked_event\.recipient_id/i);
});

test('Push dispatcher retains partial failures for retry and times out network sends', () => {
  assert.match(core, /result\.sent \+ result\.expired >= pendingSubscriptions\.length/);
  assert.match(core, /status === "queued"/);
  assert.match(index, /timeout: 8_000/);
  assert.match(core, /profile lookup failed|subscription lookup failed/);
  assert.match(transport, /fcm\.googleapis\.com/);
  assert.match(transport, /web\.push\.apple\.com/);
  assert.doesNotMatch(transport, /host\.startsWith\("fc"\)/);
});

test('Dispatcher integration exercises auth, DB error, partial success, and retry', () => {
  assert.match(core, /isAuthorizedPushRequest/);
  assert.match(core, /recordDelivery/);
  assert.match(integration, /temporary profile DB failure/);
  assert.match(integration, /partial success was not persisted immediately/);
  assert.match(integration, /failed device was not retried/);
  assert.match(integration, /claim loss reached send or delivery recording/);
  assert.match(core, /DispatchAbortError/);
  assert.match(core, /recordDelivery\(event, subscription, outcome, claimToken\)/);
  assert.match(fs.readFileSync('db/push_notifications_draft.sql', 'utf8'), /record_push_delivery/);
  assert.match(index, /unsafe subscription delete failed/);
});

test('Leave-request outbox targets chief+owner on submit and the requester on status change, with no personal data in the payload', () => {
  assert.match(draft, /role in \('chief','owner'\) and active=true and approved=true/);
  assert.match(draft, /tg_op='UPDATE' and old\.status is distinct from new\.status/);
  assert.match(draft, /requester\.active is true and requester\.approved is true/, '상태변경 알림도 신청자 활성/승인 여부를 다시 확인한다');
  assert.doesNotMatch(draft, /new\.reason|new\.special_reason|new\.contact/i, '연차 사유 등 개인정보는 payload에 담지 않는다');
});

test('Migration is fail-closed on both apply and rollback', () => {
  assert.match(draft, /migration object collision; preserve state and stop/);
  assert.match(rollback, /preserve data and stop rollback/);
  assert.match(rollback, /nothing to roll back or already rolled back/);
});

test('supabase/config.toml declares push-dispatcher with verify_jwt on', () => {
  assert.match(configToml, /\[functions\.push-dispatcher\]\s*\nverify_jwt = true/);
});

console.log('PUSH_DISPATCHER_STATIC_PASS');
