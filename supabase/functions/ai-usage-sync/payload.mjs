export const MAX_BODY_BYTES=65_536,MAX_DATES=60,MAX_MODELS=50,MAX_TOKENS=1e15,MAX_TURNS=1e9,PAST_DAYS=90;
// 모델명은 SQL CHECK와 같은 규칙: 인쇄 가능한 ASCII 1~64자, 앞뒤 공백 없음(판정이 어긋나 DB가 통째로 거절하는 일을 막는다).
const DATE=/^\d{4}-\d{2}-\d{2}$/,HEX=/^[0-9a-f]+$/,MODEL=/^[!-~](?:[ -~]{0,62}[!-~])?$/;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function dayNumber(s){if(typeof s!=='string'||!DATE.test(s))return null;const [y,m,d]=s.split('-').map(Number),t=Date.UTC(y,m-1,d),c=new Date(t);return c.getUTCFullYear()===y&&c.getUTCMonth()===m-1&&c.getUTCDate()===d?t/86_400_000:null;}
const validModel=k=>MODEL.test(k);
const validCount=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
export function kstToday(nowMs){return new Date(nowMs+9*3_600_000).toISOString().slice(0,10);}
// codex_model_usage.json 모양({날짜:{모델:{tokens,turns}}})만 받는다. 날짜는 서울 기준 오늘+1일~90일 전, 값은 0 이상 정수.
// 모델명이 __proto__ 같은 이름이어도 데이터로 남도록 프로토타입 없는 객체에 담는다.
export function validateUsagePayload(body,today){
  if(!plain(body))return {ok:false,error:'payload_not_object'};
  const dates=Object.keys(body),todayN=dayNumber(today);
  if(!dates.length||dates.length>MAX_DATES)return {ok:false,error:'date_count'};
  if(todayN===null)return {ok:false,error:'server_date'};
  const usage=Object.create(null);let rows=0;
  for(const date of dates){
    const n=dayNumber(date);if(n===null)return {ok:false,error:'invalid_date'};
    if(n>todayN+1||n<todayN-PAST_DAYS)return {ok:false,error:'date_out_of_range'};
    const models=body[date];if(!plain(models))return {ok:false,error:'invalid_day'};
    const names=Object.keys(models);if(names.length>MAX_MODELS)return {ok:false,error:'model_count'};
    const day=Object.create(null);
    for(const name of names){
      const v=models[name];
      if(!validModel(name))return {ok:false,error:'invalid_model'};
      if(!plain(v)||Object.keys(v).length!==2||!validCount(v.tokens,MAX_TOKENS)||!validCount(v.turns,MAX_TURNS))return {ok:false,error:'invalid_counts'};
      day[name]={tokens:v.tokens,turns:v.turns};rows++;
    }
    usage[date]=day;
  }
  return {ok:true,value:{usage,dates:[...dates].sort(),rows}};
}
export async function sha256Hex(text){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
// PC 상황판 스냅샷(다른 세션의 생성기가 만든 파일): 모르는 필드는 버리고, 아는 필드는 길이·개수를 자르고 DB가 못 받는 값(NUL, 짝 없는 서로게이트,
// 긴 지수 표기가 되는 아주 작은 수)을 정리해 받아들인다. 생성기가 바뀌어도 동기화가 멈추지 않게 하되, 정리 후 JSON이 64KB를 넘으면 거절한다.
// 그러면 jsonb 표기로 공백이 늘어도 DB 한도(128KB) 안에 항상 들어간다.
export const MAX_FLAGGED=30;
const PERIOD=/^\d{4}-\d{2}(-\d{2})?$/,AGENT=/^[a-z0-9_-]{1,32}$/,NUL=String.fromCharCode(0);
// 글자 칸은 문자열·숫자·참거짓만 받는다. 객체·배열 같은 값은 변환하다 예외가 날 수 있어 빈 글자로 둔다(그 값만 비우고 항목은 살린다).
const text=(v,max)=>(typeof v==='string'?v:typeof v==='number'||typeof v==='boolean'?String(v):'').split(NUL).join('').slice(0,max).toWellFormed();
const amount=(v,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max?Math.round(v*1e6)/1e6:0;
const count=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max?v:0;
const bad=error=>({ok:false,error});
const sized=value=>new TextEncoder().encode(JSON.stringify(value)).length<=MAX_BODY_BYTES?{ok:true,value}:bad('too_large');
export function validatePlatformCost(b){
  if(!plain(b)||typeof b.fx!=='number'||!Number.isFinite(b.fx)||b.fx<=0||b.fx>100_000||typeof b.generated!=='string'||!plain(b.agents))return bad('invalid_cost');
  const agents=Object.create(null);
  for(const [k,a] of Object.entries(b.agents).slice(0,10)){
    if(!AGENT.test(k)||!plain(a))continue;
    const months=(Array.isArray(a.months)?a.months:[]).filter(m=>plain(m)&&typeof m.m==='string'&&(m.m==='?'||PERIOD.test(m.m))).slice(0,60).map(m=>({m:m.m,usd:amount(m.usd,1e9)}));
    agents[k]={cumUSD:amount(a.cumUSD,1e9),months,inTok:count(a.inTok,MAX_TOKENS),outTok:count(a.outTok,MAX_TOKENS),ok:a.ok!==false};
  }
  if(!Object.keys(agents).length)return bad('invalid_cost');
  const month_usd=Object.create(null);
  if(plain(b.month_usd))for(const [k,v] of Object.entries(b.month_usd).slice(0,120))if(k==='?'||PERIOD.test(k))month_usd[k]=amount(v,1e9);
  return sized({fx:Math.round(b.fx*1e6)/1e6,fx_src:b.fx_src==null?null:text(b.fx_src,64),generated:text(b.generated,32),total_usd:amount(b.total_usd,1e9),
    this_month:typeof b.this_month==='string'&&PERIOD.test(b.this_month)?b.this_month:null,this_usd:amount(b.this_usd,1e9),agents,month_usd});
}
export function validateSessionHealth(b){
  if(!plain(b)||typeof b.generated!=='string'||!Array.isArray(b.flagged))return bad('invalid_sessions');
  const flagged=b.flagged.filter(plain).slice(0,MAX_FLAGGED).map(f=>({name:text(f.name,120),thread:text(f.thread,64),sev:text(f.sev,16),active:f.active===true,
    tok_today:count(f.tok_today,MAX_TOKENS),won_today:amount(f.won_today,1e12),share:amount(f.share,100),
    reasons:(Array.isArray(f.reasons)?f.reasons:[]).filter(r=>typeof r==='string').slice(0,6).map(r=>text(r,200))}));
  return sized({generated:text(b.generated,32),won_today_total:amount(b.won_today_total,1e12),tok_today_total:count(b.tok_today_total,MAX_TOKENS),flagged});
}
export function sameHex(a,b){a=String(a||'').toLowerCase();b=String(b||'').toLowerCase();if(!a||a.length!==b.length||!HEX.test(a)||!HEX.test(b))return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
