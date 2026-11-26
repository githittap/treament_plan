import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {corsHeaders,validateRequest,solapiAuthHeader,solapiRequestBody,mapSolapiResult,publicRows,mapPrepareError} from '../supabase/functions/review-sms/core.mjs';

const pending=[{log_id:'a',status:'pending',phone_tail:'2222',to_number:'01011112222',message_text:'문구 https://g.page/r/x/review',sender:'0415551234',mode:'test'},{log_id:'b',status:'pending',phone_tail:'4444',to_number:'01033334444',message_text:'문구',sender:'0415551234',mode:'test'}];

test('솔라피 인증 서명은 HMAC-SHA256(secret, date+salt) 16진수이고 키가 없으면 보내지 않는다',async()=>{
  const date='2026-11-27T01:02:03.000Z',salt='0123456789abcdef0123456789abcdef';
  const header=await solapiAuthHeader('KEYKEY',`sec'ret`,date,salt);
  const expect=createHmac('sha256',`sec'ret`).update(date+salt).digest('hex');
  assert.equal(header,`HMAC-SHA256 apiKey=KEYKEY, date=${date}, salt=${salt}, signature=${expect}`);
  await assert.rejects(solapiAuthHeader('','x',date,salt),/key missing/);
  await assert.rejects(solapiAuthHeader('k','x',date,'짧'),/salt/);
});

test('요청 몸통은 번호 1~20개와 20자 이하 이름만 받는다',()=>{
  assert.deepEqual(validateRequest({phones:['010-1111-2222'],name:' 홍길동 '}),{phones:['010-1111-2222'],name:'홍길동'});
  assert.deepEqual(validateRequest({phones:['01011112222']}),{phones:['01011112222'],name:null});
  for(const bad of [null,[],{},{phones:[]},{phones:Array(21).fill('01011112222')},{phones:['0101111abcd']},{phones:['01011112222'],name:'{link}'},{phones:['01011112222'],extra:1},{phones:['01011112222'],name:'가'.repeat(21)}])assert.equal(validateRequest(bad),null,JSON.stringify(bad));
});

test('솔라피 몸통은 pending 줄의 받는 번호·발신번호·문구만 담는다',()=>{
  assert.deepEqual(solapiRequestBody(pending),{messages:[{to:'01011112222',from:'0415551234',text:'문구 https://g.page/r/x/review'},{to:'01033334444',from:'0415551234',text:'문구'}],showMessageList:true});
});

test('솔라피 응답을 줄마다 보냄·실패로 나누고 HTTP 오류면 모두 실패로 적는다',()=>{
  const ok=mapSolapiResult(pending,200,{groupInfo:{groupId:'G1'},messageList:[{to:'01011112222',messageId:'M1'}],failedMessageList:[{to:'01033334444',statusCode:'1062',statusMessage:'발신번호 미등록'}]});
  assert.deepEqual(ok,[{log_id:'a',status:'sent',provider_id:'M1',error:null},{log_id:'b',status:'failed',provider_id:null,error:'1062 발신번호 미등록'}]);
  assert.equal(mapSolapiResult(pending,200,{groupInfo:{groupId:'G2'}})[1].provider_id,'G2','no message list falls back to group id');
  const bad=mapSolapiResult(pending,401,{errorCode:'InvalidAPIKey',errorMessage:'잘못된 키'});
  assert.ok(bad.every(r=>r.status==='failed'&&r.error==='InvalidAPIKey 잘못된 키'));
  assert.ok(mapSolapiResult(pending,500,null).every(r=>r.status==='failed'&&r.error==='HTTP 500'));
});

test('화면에 돌려주는 줄에는 번호 원문과 문구가 없다',()=>{
  const out=publicRows([...pending,{log_id:'c',status:'blocked_test_only',phone_tail:'5555',to_number:null,message_text:null,sender:null,mode:'test'}],[{log_id:'a',status:'sent',provider_id:'M1',error:null}]);
  assert.deepEqual(out.map(r=>r.status),['sent','pending','blocked_test_only']);
  assert.ok(out.every(r=>!('to_number' in r)&&!('message_text' in r)&&!('sender' in r)));
});

test('허용 출처만 CORS를 열고 DB 오류를 화면 오류 코드로 옮긴다',()=>{
  assert.equal(corsHeaders('https://jung-plant.com')['Access-Control-Allow-Origin'],'https://jung-plant.com');
  assert.deepEqual(corsHeaders('https://evil.example'),{});
  assert.equal(mapPrepareError('review sms access required').status,403);
  assert.equal(mapPrepareError('review sms invalid phone').error,'invalid_phone');
  assert.equal(mapPrepareError('boom').status,502);
});
