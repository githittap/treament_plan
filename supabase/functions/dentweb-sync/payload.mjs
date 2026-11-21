import {createHash,timingSafeEqual} from 'node:crypto';

const MATCH_RPC='dentweb_inbox_match_upsert';
const MONTHLY_RPC='dentweb_monthly_first_visits_replace';
const MAX_ROWS=50;
const MAX_BODY_BYTES=64*1024;
const MAX_CLOCK_SKEW_MS=10*60*1000;
const MATCH_KEYS=['inbox_id','appointment_found','appointment_at','visited','visited_at','match_basis','checked_at'];
const MONTH_KEYS=['month','source','count','checked_at'];
const MATCH_BASIS=new Set(['phone8_date','ambiguous','no_match','insufficient']);
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const MONTH=/^\d{4}-(?:0[1-9]|1[0-2])$/;
const PATH=/^[a-z][a-z0-9_-]{0,39}$/;
const TIMESTAMP=/^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,7})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/;

function exactKeys(value,keys){
  return value!==null && typeof value==='object' && !Array.isArray(value)
    && Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key));
}

function validTimestamp(value){
  const match=typeof value==='string' && value.match(TIMESTAMP);
  if(!match || match[1].startsWith('0000-') || !Number.isFinite(Date.parse(value)))return false;
  // Date.parse can normalize impossible dates such as February 30.
  const date=match[1];
  return new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
}

function timestampNanoseconds(value){
  const match=value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?(Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/);
  if(!match)return null;
  const wholeSecond=Date.parse(match[1]+match[3]);
  if(!Number.isFinite(wholeSecond))return null;
  return BigInt(wholeSecond)*1_000_000n+BigInt((match[2]||'').padEnd(9,'0'));
}

function visitsObservedByCheckedAt(visitedAt,checkedAt){
  return timestampNanoseconds(visitedAt)<=timestampNanoseconds(checkedAt);
}

function validatedMatch(row){
  if(!exactKeys(row,MATCH_KEYS) || typeof row.inbox_id!=='string' || !UUID.test(row.inbox_id)
    || typeof row.appointment_found!=='boolean' || typeof row.visited!=='boolean'
    || !MATCH_BASIS.has(row.match_basis) || !validTimestamp(row.checked_at)
    || row.appointment_found!==(row.match_basis==='phone8_date')
    || (row.visited&&!row.appointment_found)
    || !(row.appointment_found?validTimestamp(row.appointment_at):row.appointment_at===null)
    || !(row.visited?validTimestamp(row.visited_at):row.visited_at===null)
    || (row.visited&&(!visitsObservedByCheckedAt(row.visited_at,row.checked_at)
      || timestampNanoseconds(row.visited_at)<timestampNanoseconds(row.appointment_at))))return null;
  return {...row,inbox_id:row.inbox_id.toLowerCase()};
}

function validatedMonth(row){
  if(!exactKeys(row,MONTH_KEYS)
    || typeof row.month!=='string' || !MONTH.test(row.month) || row.month.startsWith('0000-')
    || typeof row.source!=='string' || !PATH.test(row.source)
    || !Number.isInteger(row.count) || row.count<0 || row.count>2147483647
    || !validTimestamp(row.checked_at))return null;
  return {month:row.month+'-01',path:row.source,first_visit_count:row.count,checked_at:row.checked_at};
}

export function validateDentwebPayload(kind,body){
  if(kind!=='inbox_match' && kind!=='monthly_first_visits')return null;
  if(!exactKeys(body,['kind','rows']) || body.kind!==kind || !Array.isArray(body.rows)
    || body.rows.length===0 || body.rows.length>MAX_ROWS)return null;
  const matches=kind==='inbox_match';
  const checked=[];
  const keys=new Set();
  const monthTimes=new Map();
  const latestAllowed=Date.now()+MAX_CLOCK_SKEW_MS;
  for(const row of body.rows){
    const result=matches?validatedMatch(row):validatedMonth(row);
    if(!result || Date.parse(result.checked_at)>latestAllowed)return null;
    if(!matches){
      const monthTime=monthTimes.get(result.month);
      if(monthTime!==undefined && monthTime!==result.checked_at)return null;
      monthTimes.set(result.month,result.checked_at);
    }
    const key=matches?result.inbox_id:result.month+'/'+result.path;
    if(keys.has(key))return null;
    keys.add(key);
    checked.push(result);
  }
  return {p_rows:checked};
}

function keysMatch(given,expected){
  const digest=value=>createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given),digest(expected));
}

async function readDentwebBody(request){
  if(Number(request.headers.get('content-length'))>MAX_BODY_BYTES)return {status:413};
  if(!request.body)return {status:400};
  const reader=request.body.getReader();
  const buffer=new Uint8Array(MAX_BODY_BYTES);
  let length=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      if(length+value.byteLength>MAX_BODY_BYTES){
        void reader.cancel().catch(()=>{});
        return {status:413};
      }
      buffer.set(value,length);
      length+=value.byteLength;
    }
    return {status:200,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,length)))};
  }catch{
    return {status:400};
  }finally{
    reader.releaseLock();
  }
}

export function createDentwebHandler({getSecret,save}){
  return async request=>{
    if(request.method!=='POST')return Response.json({error:'method not allowed'},{status:405,headers:{Allow:'POST'}});
    const expected=getSecret();
    if(!expected)return Response.json({error:'unavailable'},{status:503});
    const supplied=request.headers.get('x-dentweb-sync-key');
    if(!supplied || !keysMatch(supplied,expected))return Response.json({error:'unauthorized'},{status:401});

    const {status,body}=await readDentwebBody(request);
    if(status===413)return Response.json({error:'body too large'},{status});
    const args=validateDentwebPayload(body?.kind,body);
    if(!args)return Response.json({error:'invalid payload'},{status:400});
    try{
      await save(body.kind==='inbox_match'?MATCH_RPC:MONTHLY_RPC,args);
      return Response.json({ok:true});
    }catch{
      return Response.json({error:'could not save'},{status:500});
    }
  };
}
