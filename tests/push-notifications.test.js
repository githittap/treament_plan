const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),test=require('node:test');
const html=fs.readFileSync('hr.html','utf8'),sw=fs.readFileSync('sw.js','utf8'),sql=fs.readFileSync('db/push_subscriptions_draft.sql','utf8'),rollback=fs.readFileSync('db/push_subscriptions_rollback.sql','utf8');
for(const [v,re,msg] of [[html,/pushNotificationCard\(/,'카드'],[html,/PUSH_VAPID_PUBLIC_KEY/,'VAPID 보호'],[html,/발송키 준비 중/,'키 없을 때 안내'],[html,/subscribePushNotifications\(\)/,'구독 버튼 연결'],[html,/pushManager\.subscribe\(\{userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array\(PUSH_VAPID_PUBLIC_KEY\)\}\)/,'표준 구독 옵션'],[html,/upsert\(\{user_id:ME\.id,endpoint:subscription\.endpoint,subscription:subscription\.toJSON\(\)\},\{onConflict:'user_id,endpoint'\}\)/,'가입 upsert'],[html,/\.eq\('endpoint',subscription\.endpoint\)/,'현재 endpoint 삭제'],[sw,/addEventListener\('push'/,'push'],[sw,/addEventListener\('notificationclick'/,'click'],[sw,/new URL\(/,'origin 방어'],[sql,/constraint push_subscriptions_endpoint_key unique\(user_id,endpoint\)/i,'user별 endpoint UNIQUE'],[sql,/subscription->>'endpoint'=endpoint/i,'JSON endpoint'],[sql,/migration object collision; preserve state and stop/i,'apply fail-closed'],[rollback,/push subscription ownership manifest or schema snapshot mismatch; preserve state and stop rollback/i,'rollback fail-closed']])assert.match(v,re,msg);
function worker(){const events={},shown=[],opened=[],self={location:{origin:'https://jung-plant.com'},registration:{showNotification:async(...x)=>shown.push(x)},clients:{claim:async()=>{},matchAll:async()=>[]},skipWaiting(){},addEventListener:(n,f)=>events[n]=f};const c={self,clients:{matchAll:self.clients.matchAll,openWindow:async u=>opened.push(u)},fetch:async()=>{},Response,URL};vm.runInNewContext(sw,c);return{events,shown,opened,c};}
test('SW payload와 URL을 fail-closed로 정규화한다',async()=>{const x=worker(),wait=[];x.events.push({data:{json:()=>({url:'https://evil.example/a',title:'x'.repeat(201),body:{x:1}})},waitUntil:p=>wait.push(p)});await Promise.all(wait);assert.equal(x.shown[0][0].length,200);assert.equal(x.shown[0][1].body,'새 알림이 있습니다.');assert.equal(x.shown[0][1].data.url,'https://jung-plant.com/hr.html');const y=worker(),w=[];y.events.push({data:{json:()=>{throw Error('bad')}},waitUntil:p=>w.push(p)});await Promise.all(w);assert.equal(y.shown[0][1].data.url,'https://jung-plant.com/hr.html');});
test('SW click은 동일 origin hr 창만 focus한다',async()=>{const x=worker(),w=[],focused=[];x.c.clients.matchAll=async()=>[{url:'https://evil.example/hr.html',focus:async()=>focused.push('evil')},{url:'https://jung-plant.com/hr.html?x=1',focus:async()=>focused.push('ok')}];x.events.notificationclick({notification:{data:{url:'https://evil.example'},close(){}},waitUntil:p=>w.push(p)});await Promise.all(w);assert.deepEqual(focused,['ok']);assert.deepEqual(x.opened,[]);});
function ui(subscription,errors=[]){let text='',calls=[];const eq=(k,v)=>{calls.push([k,v]);return k==='endpoint'?Promise.resolve({error:errors.shift()||null}):{eq}};const c={navigator:{serviceWorker:{ready:Promise.resolve({pushManager:{getSubscription:async()=>subscription}})}},$:()=>({set textContent(v){text=v}}),ME:{id:'me'},sb:{from:()=>({delete:()=>({eq})})}};vm.runInNewContext(html.match(/async function unsubscribePushNotifications\(\)\{[\s\S]*?\n(?=function renderWorkDocuments)/)[0],c);return{run:()=>c.unsubscribePushNotifications(),get text(){return text},calls};}
test('UI는 현재 endpoint만 삭제하며 DB 실패 뒤 재시도에서만 browser 해제한다',async()=>{let unsub=0;const a=ui({endpoint:'https://push/a',unsubscribe:async()=>{unsub++;return true}},[{message:'DB'}]);await a.run();assert.equal(unsub,0);assert.match(a.text,/구독은 유지/);await a.run();assert.equal(unsub,1);assert.deepEqual(a.calls,[['user_id','me'],['endpoint','https://push/a'],['user_id','me'],['endpoint','https://push/a']]);assert.match(a.text,/해제했습니다/);const b=ui(null);await b.run();assert.deepEqual(b.calls,[]);assert.match(b.text,/일괄 삭제하지 않았습니다/);});

// subscribePushNotifications: urlBase64ToUint8Array 헬퍼와 함께 추출한다(같은 블록, unsubscribe 직전까지).
const SUBSCRIBE_SRC=html.match(/function urlBase64ToUint8Array\([\s\S]*?\n(?=async function unsubscribePushNotifications)/)[0];
function subscribeUi({vapidKey='BFAKEVAPIDKEY',existingSubscription=null,newSubscription=null,permission='granted',upsertError=null,supported=true}={}){
  let text='',permissionCalls=0;const subscribeCalls=[],upsertCalls=[];
  const registration={pushManager:{getSubscription:async()=>existingSubscription,subscribe:async(opts)=>{subscribeCalls.push(opts);return newSubscription;}}};
  const c={
    PUSH_VAPID_PUBLIC_KEY:vapidKey,
    navigator:supported?{serviceWorker:{ready:Promise.resolve(registration)}}:{},
    window:{PushManager:function(){}},
    Notification:{requestPermission:async()=>{permissionCalls++;return permission;}},
    $:()=>({set textContent(v){text=v;}}),
    ME:{id:'me'},
    sb:{from:()=>({upsert:async(row,opts)=>{upsertCalls.push([row,opts]);return {error:upsertError};}})},
    atob:(s)=>Buffer.from(s,'base64').toString('binary'),
  };
  vm.runInNewContext(SUBSCRIBE_SRC,c);
  return {run:()=>c.subscribePushNotifications(),get text(){return text;},get permissionCalls(){return permissionCalls;},subscribeCalls,upsertCalls};
}
test('구독 등록: 발송키가 없으면 권한도 묻지 않고 준비중 안내만 한다',async()=>{
  const a=subscribeUi({vapidKey:''});
  await a.run();
  assert.equal(a.permissionCalls,0);
  assert.equal(a.subscribeCalls.length,0);
  assert.match(a.text,/준비 중/);
});
test('구독 등록: 이 브라우저가 지원하지 않으면 즉시 안내한다',async()=>{
  const a=subscribeUi({supported:false});
  await a.run();
  assert.equal(a.permissionCalls,0);
  assert.match(a.text,/지원하지 않습니다/);
});
test('구독 등록: 권한이 거부되면 구독을 시도하지 않는다',async()=>{
  const a=subscribeUi({permission:'denied'});
  await a.run();
  assert.equal(a.permissionCalls,1);
  assert.equal(a.subscribeCalls.length,0);
  assert.match(a.text,/권한이 거부/);
});
test('구독 등록: 새 구독은 표준 applicationServerKey로 생성하고 user_id+endpoint로 upsert한다',async()=>{
  const newSubscription={endpoint:'https://fcm.googleapis.com/new',toJSON:()=>({endpoint:'https://fcm.googleapis.com/new',keys:{p256dh:'p',auth:'a'}})};
  const a=subscribeUi({newSubscription});
  await a.run();
  assert.equal(a.subscribeCalls.length,1);
  assert.equal(a.subscribeCalls[0].userVisibleOnly,true);
  assert.ok(ArrayBuffer.isView(a.subscribeCalls[0].applicationServerKey),'applicationServerKey must be a typed array (vm 컨텍스트가 달라 instanceof 대신 ArrayBuffer.isView로 확인)');
  assert.equal(a.upsertCalls.length,1);
  // vm 컨텍스트에서 만들어진 객체라 deepEqual이 realm 간 reference-equal을 요구해 실패한다 — JSON 비교로 우회.
  assert.equal(JSON.stringify(a.upsertCalls[0]),JSON.stringify([{user_id:'me',endpoint:'https://fcm.googleapis.com/new',subscription:{endpoint:'https://fcm.googleapis.com/new',keys:{p256dh:'p',auth:'a'}}},{onConflict:'user_id,endpoint'}]));
  assert.match(a.text,/등록했습니다/);
});
test('구독 등록: 이미 브라우저 구독이 있으면 재구독 없이 그대로 upsert만 한다(멱등)',async()=>{
  const existingSubscription={endpoint:'https://fcm.googleapis.com/existing',toJSON:()=>({endpoint:'https://fcm.googleapis.com/existing',keys:{p256dh:'p',auth:'a'}})};
  const a=subscribeUi({existingSubscription});
  await a.run();
  assert.equal(a.subscribeCalls.length,0,'이미 구독이 있으면 pushManager.subscribe를 다시 부르지 않는다');
  assert.equal(a.upsertCalls.length,1);
  assert.equal(a.upsertCalls[0][0].endpoint,'https://fcm.googleapis.com/existing');
});
test('구독 등록: 저장 실패는 실패로 안내하고 예외를 던지지 않는다',async()=>{
  const newSubscription={endpoint:'https://fcm.googleapis.com/new',toJSON:()=>({endpoint:'https://fcm.googleapis.com/new',keys:{p256dh:'p',auth:'a'}})};
  const a=subscribeUi({newSubscription,upsertError:{message:'DB down'}});
  await a.run();
  assert.match(a.text,/등록 실패/);
  assert.match(a.text,/DB down/);
});

console.log('PUSH_NOTIFICATIONS_STATIC_AND_VM_PASS');
