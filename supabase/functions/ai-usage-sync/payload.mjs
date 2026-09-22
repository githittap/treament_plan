export const MAX_BODY_BYTES=65_536,MAX_DATES=60,MAX_MODELS=50,MAX_TOKENS=1e15,MAX_TURNS=1e9,PAST_DAYS=90;
const DATE=/^\d{4}-\d{2}-\d{2}$/,HEX=/^[0-9a-f]+$/,CONTROL=/[\x00-\x1f\x7f]/;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function dayNumber(s){if(typeof s!=='string'||!DATE.test(s))return null;const [y,m,d]=s.split('-').map(Number),t=Date.UTC(y,m-1,d),c=new Date(t);return c.getUTCFullYear()===y&&c.getUTCMonth()===m-1&&c.getUTCDate()===d?t/86_400_000:null;}
const validModel=k=>k.length>=1&&k.length<=64&&k===k.trim()&&!CONTROL.test(k);
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
export function sameHex(a,b){a=String(a||'').toLowerCase();b=String(b||'').toLowerCase();if(!a||a.length!==b.length||!HEX.test(a)||!HEX.test(b))return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
