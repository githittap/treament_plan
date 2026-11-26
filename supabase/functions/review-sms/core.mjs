// review-sms 순수 함수 — Deno 배포본(index.ts)과 node 시험(tests/review-sms-core.test.mjs)이 같이 쓴다.
// 네트워크·환경변수에 기대지 않는다. 솔라피 인증 서명은 Web Crypto(subtle)를 받아서 만든다.

export const ALLOWED_ORIGINS=['https://jung-plant.com','https://www.jung-plant.com','https://githittap.github.io'];
export const MAX_BODY_BYTES=4096;
export const SOLAPI_SEND_URL='https://api.solapi.com/messages/v4/send-many/detail';

/** @param {string|null} origin @returns {Record<string,string>} */
export function corsHeaders(origin){
  if(!origin||!ALLOWED_ORIGINS.includes(origin))return {};
  return {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
}

// 화면이 보내는 몸통: {phones:[문자열 1~20개], name?:문자열(20자 이하)}. 번호 형식은 DB 함수가 다시 검사한다.
export function validateRequest(body){
  if(!body||typeof body!=='object'||Array.isArray(body))return null;
  if(Object.keys(body).some(k=>!['phones','name'].includes(k)))return null;
  const {phones,name}=body;
  if(!Array.isArray(phones)||phones.length<1||phones.length>20)return null;
  if(phones.some(p=>typeof p!=='string'||p.length>20||!/^[0-9 ()+-]+$/.test(p)))return null;
  if(name!=null&&(typeof name!=='string'||name.length>20||/[\r\n{}]/.test(name)))return null;
  return {phones,name:name==null||name.trim()===''?null:name.trim()};
}

const hex=buf=>Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join('');

// 솔라피 인증: HMAC-SHA256(apiSecret, date+salt)를 16진수로.
export async function solapiAuthHeader(apiKey,apiSecret,date,salt,subtle=globalThis.crypto.subtle){
  if(!apiKey||!apiSecret)throw new Error('SOLAPI key missing');
  if(!/^[0-9a-zA-Z]{12,64}$/.test(salt))throw new Error('salt invalid');
  const enc=new TextEncoder(),key=await subtle.importKey('raw',enc.encode(apiSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=hex(await subtle.sign('HMAC',key,enc.encode(date+salt)));
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

// 보낼 줄(DB가 pending으로 정한 것)만 솔라피 몸통으로. 종류(SMS·LMS)는 솔라피가 길이로 정한다.
export function solapiRequestBody(pending){
  return {messages:pending.map(r=>({to:r.to_number,from:r.sender,text:r.message_text})),showMessageList:true};
}

const short=s=>s==null?null:String(s).slice(0,500);

// 솔라피 응답을 줄마다 sent/failed로. 응답이 실패(HTTP 2xx 아님)면 모두 failed.
// 접수된 줄(messageList)에는 받는 번호가 없어서(2026-11-27 실제 응답) 실패가 없고 개수가 같으면 보낸 순서로 맞춘다.
export function mapSolapiResult(pending,httpStatus,body){
  if(!(httpStatus>=200&&httpStatus<300)||!body||typeof body!=='object'){
    const why=short(body&&typeof body==='object'?[body.errorCode,body.errorMessage].filter(Boolean).join(' '):`HTTP ${httpStatus}`)||`HTTP ${httpStatus}`;
    return pending.map(r=>({log_id:r.log_id,status:'failed',provider_id:null,error:why}));
  }
  const failed=Array.isArray(body.failedMessageList)?body.failedMessageList:[],sent=Array.isArray(body.messageList)?body.messageList:[];
  const gi=body.groupInfo&&typeof body.groupInfo==='object'?body.groupInfo:{},groupId=typeof gi.groupId==='string'?gi.groupId:typeof gi._id==='string'?gi._id:null;
  const byOrder=!failed.length&&sent.length===pending.length,used=new Set();
  return pending.map((r,idx)=>{
    const f=failed.find((x,i)=>!used.has('f'+i)&&x&&x.to===r.to_number&&used.add('f'+i));
    if(f)return {log_id:r.log_id,status:'failed',provider_id:typeof f.messageId==='string'?f.messageId.slice(0,120):null,error:short([f.statusCode,f.statusMessage].filter(Boolean).join(' '))||'failed'};
    const m=sent.find((x,i)=>!used.has('m'+i)&&x&&x.to===r.to_number&&used.add('m'+i))||(byOrder&&!used.has('m'+idx)&&used.add('m'+idx)?sent[idx]:null);
    const id=m&&typeof m.messageId==='string'?m.messageId:groupId;
    return {log_id:r.log_id,status:'sent',provider_id:id?String(id).slice(0,120):null,error:null};
  });
}

// 화면에 돌려줄 줄: 번호 원문·문구는 빼고 결과만.
export function publicRows(rows,results){
  const byId=new Map((results||[]).map(r=>[r.log_id,r]));
  return (rows||[]).map(r=>{const x=byId.get(r.log_id);return {log_id:r.log_id,status:x?x.status:r.status,phone_tail:r.phone_tail,mode:r.mode,error:x?x.error:null};});
}

// 보내는 길: 'edge'일 때만 서버 함수가 솔라피로 바로 보낸다. 값이 없거나 읽지 못하면 병원 PC 중계(pc)로 본다
// — 솔라피는 문자 발송을 고정 IP에서만 받아서 클라우드에서 바로 보내면 막힌다(db/review_sms_relay_20261127.sql).
export function sendsDirect(transport){return transport==='edge';}

// DB 함수가 낸 오류를 화면 안내로.
export function mapPrepareError(message){
  const m=String(message||'');
  if(/access required/.test(m))return {status:403,error:'access_denied'};
  if(/invalid phone/.test(m))return {status:400,error:'invalid_phone'};
  if(/name invalid/.test(m))return {status:400,error:'invalid_name'};
  if(/1-20/.test(m))return {status:400,error:'too_many'};
  return {status:502,error:'prepare_failed'};
}
