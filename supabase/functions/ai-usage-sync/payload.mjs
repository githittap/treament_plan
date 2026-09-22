export const MAX_BODY_BYTES=65_536,MAX_DATES=60,MAX_MODELS=50,MAX_TOKENS=1e15,MAX_TURNS=1e9,PAST_DAYS=90;
// 모델명은 SQL CHECK와 같은 규칙: 인쇄 가능한 ASCII 1~64자, 앞뒤 공백 없음(판정이 어긋나 DB가 통째로 거절하는 일을 막는다).
const DATE=/^\d{4}-\d{2}-\d{2}$/,HEX=/^[0-9a-f]+$/,MODEL=/^[!-~](?:[ -~]{0,62}[!-~])?$/;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function dayNumber(s){if(typeof s!=='string'||!DATE.test(s))return null;const [y,m,d]=s.split('-').map(Number),t=Date.UTC(y,m-1,d),c=new Date(t);return c.getUTCFullYear()===y&&c.getUTCMonth()===m-1&&c.getUTCDate()===d?t/86_400_000:null;}
const validModel=k=>MODEL.test(k);
const validCount=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
export function kstToday(nowMs){return new Date(nowMs+9*3_600_000).toISOString().slice(0,10);}
// codex_model_usage.json 모양({날짜:{모델:{tokens,turns}}})만 받는다. 날짜는 서울 기준 오늘+1일~90일 전, 값은 0 이상 정수.
export function validateUsagePayload(body,today){
  if(!plain(body))return {ok:false,error:'payload_not_object'};
  const dates=Object.keys(body),todayN=dayNumber(today);
  if(!dates.length||dates.length>MAX_DATES)return {ok:false,error:'date_count'};
  if(todayN===null)return {ok:false,error:'server_date'};
  const usage={};let rows=0;
  for(const date of dates){
    const n=dayNumber(date);if(n===null)return {ok:false,error:'invalid_date'};
    if(n>todayN+1||n<todayN-PAST_DAYS)return {ok:false,error:'date_out_of_range'};
    const models=body[date];if(!plain(models))return {ok:false,error:'invalid_day'};
    const names=Object.keys(models);if(names.length>MAX_MODELS)return {ok:false,error:'model_count'};
    const day={};
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
// PC 상황판 스냅샷: 모르는 필드는 버리고(생성기가 늘어나도 동기화가 멈추지 않게) 화면에 쓰는 필드만 형식·범위를 검사한다.
export const MAX_FLAGGED=30;
const MONTH=/^(\d{4}-\d{2}|\?)$/,YM=/^\d{4}-\d{2}$/,AGENT=/^[a-z0-9_-]{1,32}$/,SEV=new Set(['red','orange']);
const num=(v,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
const str=(v,max)=>typeof v==='string'&&v.length<=max;
const bad=error=>({ok:false,error});
export function validatePlatformCost(b){
  if(!plain(b)||!num(b.fx,100_000)||b.fx<=0||!str(b.generated,32)||!plain(b.agents))return bad('invalid_cost');
  if((b.fx_src!==undefined&&!str(b.fx_src,64))||(b.total_usd!==undefined&&!num(b.total_usd,1e9))||(b.this_usd!==undefined&&!num(b.this_usd,1e9))||(b.this_month!=null&&!(typeof b.this_month==='string'&&YM.test(b.this_month))))return bad('invalid_cost');
  const keys=Object.keys(b.agents);if(keys.length>10)return bad('invalid_cost');
  const agents={};
  for(const k of keys){
    const a=b.agents[k];
    if(!AGENT.test(k)||!plain(a)||!num(a.cumUSD,1e9)||!Array.isArray(a.months)||a.months.length>60||!validCount(a.inTok,MAX_TOKENS)||!validCount(a.outTok,MAX_TOKENS)||(a.ok!==undefined&&typeof a.ok!=='boolean'))return bad('invalid_cost');
    const months=[];for(const m of a.months){if(!plain(m)||typeof m.m!=='string'||!MONTH.test(m.m)||!num(m.usd,1e9))return bad('invalid_cost');months.push({m:m.m,usd:m.usd});}
    agents[k]={cumUSD:a.cumUSD,months,inTok:a.inTok,outTok:a.outTok,ok:a.ok!==false};
  }
  const month_usd={};
  if(b.month_usd!==undefined){if(!plain(b.month_usd)||Object.keys(b.month_usd).length>120)return bad('invalid_cost');for(const [k,v] of Object.entries(b.month_usd)){if(!MONTH.test(k)||!num(v,1e9))return bad('invalid_cost');month_usd[k]=v;}}
  return {ok:true,value:{fx:b.fx,fx_src:b.fx_src??null,generated:b.generated,total_usd:b.total_usd??0,this_month:b.this_month??null,this_usd:b.this_usd??0,agents,month_usd}};
}
export function validateSessionHealth(b){
  if(!plain(b)||!str(b.generated,32)||!num(b.won_today_total,1e12)||(b.tok_today_total!==undefined&&!num(b.tok_today_total,MAX_TOKENS))||!Array.isArray(b.flagged)||b.flagged.length>MAX_FLAGGED)return bad('invalid_sessions');
  const flagged=[];
  for(const f of b.flagged){
    if(!plain(f)||!SEV.has(f.sev)||typeof f.active!=='boolean'||!str(f.name??'',120)||!str(f.thread??'',64)||!num(f.won_today,1e12)||!num(f.tok_today??0,MAX_TOKENS)||!num(f.share??0,100)||!Array.isArray(f.reasons)||f.reasons.length>6||f.reasons.some(r=>!str(r,200)))return bad('invalid_sessions');
    flagged.push({name:f.name??'',thread:f.thread??'',sev:f.sev,active:f.active,tok_today:f.tok_today??0,won_today:f.won_today,share:f.share??0,reasons:[...f.reasons]});
  }
  return {ok:true,value:{generated:b.generated,won_today_total:b.won_today_total,tok_today_total:b.tok_today_total??0,flagged}};
}
export function sameHex(a,b){a=String(a||'').toLowerCase();b=String(b||'').toLowerCase();if(!a||a.length!==b.length||!HEX.test(a)||!HEX.test(b))return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
