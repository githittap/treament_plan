const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const feature=import('../supabase/functions/dentweb-sync/payload.mjs');
const inboxId='00000000-0000-4000-8000-000000000001';
const inbox={
  inbox_id:inboxId,appointment_found:true,appointment_at:'2026-11-03T14:30:00+09:00',
  visited:true,visited_at:'2026-11-03T14:30:00+09:00',match_basis:'phone8_date',checked_at:'2026-11-21T02:00:00.1234567Z'
};
const ambiguous={
  ...inbox,appointment_found:false,appointment_at:null,visited:false,visited_at:null,match_basis:'ambiguous'
};
const month={month:'2026-11',source:'all',count:7,checked_at:'2026-11-21T02:00:00.1234567Z'};
const batch=(kind,row)=>({kind,rows:[row]});

test('validates actual server batch for matches without losing precision or offsets',async()=>{
  const {validateDentwebPayload}=await feature;
  for(const row of [inbox,ambiguous,{...ambiguous,match_basis:'insufficient'},{...ambiguous,match_basis:'no_match'}]){
    assert.deepEqual(validateDentwebPayload('inbox_match',batch('inbox_match',row)),{p_rows:[row]});
  }
});

test('future reservations remain valid but reception facts must be observed by checked_at',async()=>{
  const {validateDentwebPayload}=await feature;
  const futureAppointment={...inbox,appointment_at:'2026-11-25T14:30:00+09:00',
    visited:false,visited_at:null,checked_at:'2026-11-20T04:00:00.0000000Z'};
  assert.deepEqual(validateDentwebPayload('inbox_match',batch('inbox_match',futureAppointment)),
    {p_rows:[futureAppointment]},'a future appointment is allowed');
  const afterObservation={...inbox,checked_at:'2026-11-21T02:00:00.1234560Z',
    visited_at:'2026-11-21T02:00:00.1234561Z'};
  assert.equal(validateDentwebPayload('inbox_match',batch('inbox_match',afterObservation)),null,
    '100ns-later reception cannot be reported as observed');
});

test('unlinked receptions before the appointment are rejected at 100ns precision',async()=>{
  const {validateDentwebPayload}=await feature;
  const appointment_at='2026-11-03T14:30:00.1234567+09:00';
  const check=visited_at=>validateDentwebPayload('inbox_match',batch('inbox_match',{...inbox,appointment_at,visited_at}));
  assert.equal(check('2026-11-03T05:30:00.1234566Z'),null);
  assert.ok(check('2026-11-03T05:30:00.1234567Z'));
  assert.ok(check('2026-11-03T05:30:00.1234568Z'));
});

test('passes the publisher snapshot time through to the monthly RPC losslessly',async()=>{
  const {validateDentwebPayload}=await feature;
  const body={kind:'monthly_first_visits',rows:[month,{...month,source:'naver',count:0}]};
  assert.deepEqual(validateDentwebPayload(body.kind,body),{p_rows:[
    {month:'2026-11-01',path:'all',first_visit_count:7,checked_at:'2026-11-21T02:00:00.1234567Z'},
    {month:'2026-11-01',path:'naver',first_visit_count:0,checked_at:'2026-11-21T02:00:00.1234567Z'}
  ]});
});

test('rejects malformed, contradictory and identifying match content',async()=>{
  const {validateDentwebPayload}=await feature;
  const invalid=[
    {inbox_id:'wrong'}, {visited:'true'}, {appointment_at:null}, {visited_at:'2026-11-31T12:00:00Z'},
    {checked_at:'2026-11-21T02:00:00'}, {checked_at:'2026-11-21T02:00:00+14:01'},
    {checked_at:'2026-11-21T24:00:00Z'}, {match_basis:'unknown'}, {match_basis:'ambiguous'},
    {appointment_found:false,appointment_at:null}, {patient_name:'합성 사용자'}, {chart_id:'synthetic'}
  ];
  for(const update of invalid){
    assert.equal(validateDentwebPayload('inbox_match',batch('inbox_match',{...inbox,...update})),null,JSON.stringify(update));
  }
  const missing={...inbox};delete missing.appointment_at;
  assert.equal(validateDentwebPayload('inbox_match',batch('inbox_match',missing)),null);
});

test('rejects unexpected kinds, batch size, duplicates, and invalid month rows',async()=>{
  const {validateDentwebPayload}=await feature;
  for(const invalid of [
    {month:'2026-11-01'},{month:'2026-13'},{month:'0000-11'},
    {count:-1},{count:0.5},{count:'7'},{count:2147483648},{source:'../all'},
    {checked_at:null},{checked_at:'2026-11-31T02:00:00Z'},{checked_at:'2026-11-21T02:00:00'}
  ]){
    assert.equal(validateDentwebPayload('monthly_first_visits',batch('monthly_first_visits',{...month,...invalid})),null);
  }
  for(const body of [
    null, {kind:'other',rows:[month]}, {kind:'monthly_first_visits',rows:[]},
    {kind:'monthly_first_visits',rows:Array(51).fill(month)}, {kind:'monthly_first_visits',rows:[month,month]},
    {kind:'monthly_first_visits',rows:[month],debug:true}
  ]){
    assert.equal(validateDentwebPayload('monthly_first_visits',body),null);
  }
  assert.equal(validateDentwebPayload('other',batch('other',month)),null);
  const otherId='00000000-0000-4000-8000-00000000000A';
  assert.equal(validateDentwebPayload('inbox_match',{kind:'inbox_match',rows:[
    {...inbox,inbox_id:otherId},{...inbox,inbox_id:otherId.toLowerCase()}
  ]}),null);
  const maxMonth={kind:'monthly_first_visits',rows:Array.from({length:50},(_,index)=>({...month,source:'path_'+index}))};
  assert.equal(validateDentwebPayload(maxMonth.kind,maxMonth).p_rows.length,50);
});

test('requires snapshot time on every month row and a shared timestamp within each month',async()=>{
  const {validateDentwebPayload}=await feature;
  assert.equal(validateDentwebPayload('monthly_first_visits',batch('monthly_first_visits',{
    month:'2026-11',source:'all',count:7
  })),null);
  assert.equal(validateDentwebPayload('monthly_first_visits',{kind:'monthly_first_visits',rows:[
    month,{...month,source:'naver',checked_at:'2026-11-21T02:00:00.1239999Z'}
  ]}),null);
});

test('limits observation clock skew for both publisher kinds to ten minutes',async t=>{
  const {validateDentwebPayload}=await feature;
  t.mock.method(Date,'now',()=>Date.parse('2026-11-21T14:00:00Z'));
  for(const [kind,row] of [['inbox_match',inbox],['monthly_first_visits',month]]){
    assert.ok(validateDentwebPayload(kind,batch(kind,{...row,checked_at:'2026-11-21T14:10:00Z'})));
    assert.equal(validateDentwebPayload(kind,batch(kind,{...row,checked_at:'2026-11-21T14:10:00.001Z'})),null);
  }
});

const fakeSecret='synthetic-testing-credential-with-no-privileges';
const makeRequest=(body,opts={})=>new Request('https://unit.invalid/dentweb-sync',{
  method:'POST',
  headers:{'x-dentweb-sync-key':fakeSecret,'Content-Type':'application/json',...opts.headers},
  body,duplex:'half'
});

test('authenticates before accessing the body or calling the database and keeps OPTIONS closed',async()=>{
  const {createDentwebHandler}=await feature;
  let bodyReads=0,dbCalls=0;
  const makeHandler=expected=>createDentwebHandler({getSecret:()=>expected,save:()=>{dbCalls++;}});
  const unreadableRequest=(key,method='POST')=>({
    method,headers:new Headers(key?{'x-dentweb-sync-key':key}:{}),get body(){bodyReads++;throw new Error('unreadable');}
  });
  for(const bad of [null,'other',fakeSecret+'1']){
    assert.equal((await makeHandler(fakeSecret)(unreadableRequest(bad))).status,401);
  }
  assert.equal((await makeHandler(undefined)(unreadableRequest(fakeSecret))).status,503);
  const options=await makeHandler(fakeSecret)(unreadableRequest(null,'OPTIONS'));
  assert.equal(options.status,405);
  assert.equal(options.headers.get('access-control-allow-origin'),null);
  assert.equal(bodyReads,0);
  assert.equal(dbCalls,0);
});

test('bounds actual bytes without trusting Content-Length and does not write invalid data',async()=>{
  const {createDentwebHandler}=await feature;
  let dbCalls=0;
  const handler=createDentwebHandler({getSecret:()=>fakeSecret,save:()=>{dbCalls++;}});
  const body=JSON.stringify(batch('monthly_first_visits',month));
  assert.equal((await handler(makeRequest(body,{headers:{'content-length':'65537'}}))).status,413);
  const chunks=new ReadableStream({start(controller){
    controller.enqueue(Buffer.alloc(40000,32));
    controller.enqueue(Buffer.alloc(25537,32));
    controller.close();
  }});
  assert.equal((await handler(makeRequest(chunks))).status,413);
  assert.equal((await handler(makeRequest('not json'))).status,400);
  assert.equal((await handler(makeRequest(JSON.stringify(batch('monthly_first_visits',{...month,count:-1}))))).status,400);
  assert.equal(dbCalls,0);
});

test('valid save uses only the expected RPC and a backend error never echoes its contents',async()=>{
  const {createDentwebHandler}=await feature;
  const calls=[];
  const handler=createDentwebHandler({getSecret:()=>fakeSecret,save:async(...args)=>{calls.push(args);}});
  assert.equal((await handler(makeRequest(JSON.stringify(batch('inbox_match',inbox))))).status,200);
  assert.equal((await handler(makeRequest(JSON.stringify(batch('monthly_first_visits',month))))).status,200);
  assert.deepEqual(calls,[
    ['dentweb_inbox_match_upsert',{p_rows:[inbox]}],
    ['dentweb_monthly_first_visits_replace',{p_rows:[{month:'2026-11-01',path:'all',first_visit_count:7,checked_at:'2026-11-21T02:00:00.1234567Z'}]}]
  ]);
  const failure=createDentwebHandler({getSecret:()=>fakeSecret,save:async()=>{throw new Error('private-data '+fakeSecret);}});
  const result=await failure(makeRequest(JSON.stringify(batch('inbox_match',inbox))));
  assert.equal(result.status,500);
  assert.doesNotMatch(await result.text(),/private-data|synthetic-testing-credential/);
});

test('the function alone allows the apikey-only sender through the gateway and wires the server secret',()=>{
  const root=path.resolve(__dirname,'..');
  const config=fs.readFileSync(path.join(root,'supabase/config.toml'),'utf8');
  assert.match(config,/\[functions\.dentweb-sync\]\s+verify_jwt\s*=\s*false/);
  const edge=fs.readFileSync(path.join(root,'supabase/functions/dentweb-sync/index.ts'),'utf8');
  assert.match(edge,/Deno\.serve\(/);
  assert.match(edge,/DENTWEB_SYNC_KEY/);
  assert.doesNotMatch(edge,/\bconsole\./);
});
