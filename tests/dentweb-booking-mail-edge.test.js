const {test}=require('node:test');
const assert=require('node:assert/strict');

const feature=import('../supabase/functions/dentweb-sync/payload.mjs');
const secret='synthetic-booking-mail-key';
const request=body=>new Request('https://unit.invalid/dentweb-sync',{
  method:'POST',
  headers:{'x-dentweb-sync-key':secret,'content-type':'application/json'},
  body:JSON.stringify(body)
});
const event=(state,minutesAgo=1)=>({
  booking_number:'123456789',state,
  event_at:new Date(Date.now()-minutesAgo*60_000+9*60*60_000).toISOString().replace('Z','+09:00'),
  visit_at:'2026-11-25T14:30:00+09:00',name:'합성 예약자',
  contact_digits:'01012345678',product:'합성 진료'
});

test('match version is carried through and malformed versions are rejected',async()=>{
  const {createDentwebHandler}=await feature;
  const saved=[];
  const handler=createDentwebHandler({getSecret:()=>secret,save:async(rpc,args)=>{saved.push([rpc,args]);}});
  const row={inbox_id:'00000000-0000-4000-8000-000000000001',booking_version:3,appointment_found:false,appointment_at:null,visited:false,visited_at:null,match_basis:'no_match',checked_at:new Date().toISOString()};
  assert.equal((await handler(request({kind:'inbox_match',rows:[row]}))).status,200);
  assert.equal(saved[0][1].p_rows[0].booking_version,3);
  for(const version of [-1,1.2,'3',null]){
    assert.equal((await handler(request({kind:'inbox_match',rows:[{...row,booking_version:version}]}))).status,400);
  }
  assert.equal(saved.length,1);
});

test('accepts a validated booking mail batch through the real Edge handler',async()=>{
  const {createDentwebHandler}=await feature;
  const calls=[];
  const handler=createDentwebHandler({getSecret:()=>secret,save:async(...args)=>{
    calls.push(args);
    return args[1].p_rows.length;
  }});
  const rows=[event('requested')];
  const response=await handler(request({kind:'kakao_booking_mail',rows}));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,accepted:1});
  assert.deepEqual(calls,[['consultation_inbox_ingest_kakao_bookings',{p_rows:rows}]]);
});

test('keeps distinct state events for one booking in the same batch',async()=>{
  const {createDentwebHandler}=await feature;
  let saved;
  const handler=createDentwebHandler({getSecret:()=>secret,save:async(_rpc,args)=>{
    saved=args.p_rows;return saved.length;
  }});
  const rows=[event('requested',3),event('confirmed',2)];
  const response=await handler(request({kind:'kakao_booking_mail',rows}));
  assert.equal(response.status,200);
  assert.equal(saved.length,2);
  assert.equal(saved[0].booking_number,saved[1].booking_number);
});

test('rejects malformed or identifying batch fields without a database call',async()=>{
  const {createDentwebHandler}=await feature;
  let calls=0;
  const handler=createDentwebHandler({getSecret:()=>secret,save:async()=>{calls++;return 1;}});
  for(const row of [
    {...event('requested'),contact_digits:'123456789'},
    {...event('requested'),event_at:'2026-02-30T14:30:00+09:00'},
    {...event('requested'),debug:'unexpected'},
    {...event('requested'),booking_number:'12x'}
  ]){
    const response=await handler(request({kind:'kakao_booking_mail',rows:[row]}));
    assert.equal(response.status,400);
  }
  assert.equal(calls,0);
});

test('returns only a generic error when the booking RPC fails',async()=>{
  const {createDentwebHandler}=await feature;
  const handler=createDentwebHandler({getSecret:()=>secret,save:async()=>{
    throw new Error('synthetic contact 01012345678 '+secret);
  }});
  const response=await handler(request({kind:'kakao_booking_mail',rows:[event('requested')]}));
  const body=await response.text();
  assert.equal(response.status,502);
  assert.doesNotMatch(body,/01012345678|synthetic-booking-mail-key/);
});
