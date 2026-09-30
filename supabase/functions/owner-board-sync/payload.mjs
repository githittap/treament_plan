export const MAX_BODY_BYTES=4*1024*1024;
export const OWNER_BOARD_SLUGS=new Set(['busd_ledger','pin_board','wordbook']);
export function validSourceMtime(value){
  if(value==null||value==='')return {ok:true,value:null};
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))return {ok:false};
  const [date]=value.split('T'),[y,m,d]=date.split('-').map(Number),calendar=new Date(Date.UTC(y,m-1,d));
  if(calendar.getUTCFullYear()!==y||calendar.getUTCMonth()!==m-1||calendar.getUTCDate()!==d)return {ok:false};
  return {ok:true,value:new Date(value).toISOString()};
}
export function parseOwnerBoardHtml(bytes){
  if(!(bytes instanceof Uint8Array))return {ok:false,error:'invalid_body'};
  if(bytes.byteLength>MAX_BODY_BYTES)return {ok:false,error:'too_large'};
  let html;try{html=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return {ok:false,error:'invalid_utf8'};}
  html=html.split(String.fromCharCode(0)).join('');
  if(!/<html\b|<!doctype\s+html\b/i.test(html))return {ok:false,error:'invalid_html'};
  const encoded=new TextEncoder().encode(html);
  if(!encoded.byteLength||encoded.byteLength>MAX_BODY_BYTES)return {ok:false,error:'too_large'};
  return {ok:true,html,bytes:encoded.byteLength};
}
export async function sha256Hex(text){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
export function sameHex(a,b){a=String(a||'').toLowerCase();b=String(b||'').toLowerCase();if(!a||a.length!==b.length||!/^[0-9a-f]+$/.test(a)||!/^[0-9a-f]+$/.test(b))return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
