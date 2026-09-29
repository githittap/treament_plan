// Deploy only with verify_jwt:true (supabase/config.toml). The only caller is hr_owner_boards_uploader.py.
// X-Sync-Token is checked by SHA-256 against webhook_secrets(name='ai_usage_sync_sha256'); token and HTML are never stored or logged.
import { createClient } from "npm:@supabase/supabase-js@2";
import { MAX_BODY_BYTES,OWNER_BOARD_SLUGS,parseOwnerBoardHtml,sameHex,sha256Hex,validSourceMtime } from "./payload.mjs";
function response(status:number,extra:Record<string,unknown>={}){return new Response(JSON.stringify({ok:status<400,...extra}),{status,headers:{'content-type':'application/json'}});}
async function readLimited(req:Request,max:number):Promise<Uint8Array|null>{
  const reader=req.body?.getReader();if(!reader)return new Uint8Array();
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();return null;}chunks.push(value);}
  const all=new Uint8Array(size);let at=0;for(const c of chunks){all.set(c,at);at+=c.byteLength;}return all;
}
Deno.serve(async req=>{
  if(req.method!=='POST')return response(405);
  const slug=new URL(req.url).searchParams.get('slug')||'';
  if(!OWNER_BOARD_SLUGS.has(slug))return response(400,{error:'unknown_slug'});
  const contentLength=req.headers.get('content-length');
  if(contentLength!==null&&(!/^\d+$/.test(contentLength)||Number(contentLength)>MAX_BODY_BYTES))return response(413);
  const token=req.headers.get('x-sync-token')||'';
  if(token.length<32||token.length>256)return response(401);
  const url=Deno.env.get('SUPABASE_URL')||'',serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!serviceKey)return response(500);
  const sb=createClient(url,serviceKey,{auth:{persistSession:false},global:{headers:{Authorization:`Bearer ${serviceKey}`}}});
  const {data:secret,error:secretError}=await sb.from('webhook_secrets').select('value').eq('name','ai_usage_sync_sha256').maybeSingle();
  if(secretError||!secret?.value||!sameHex(await sha256Hex(token),String(secret.value)))return response(401);
  const raw=await readLimited(req,MAX_BODY_BYTES);if(raw===null)return response(413);
  const parsed=parseOwnerBoardHtml(raw);if(!parsed.ok)return response(parsed.error==='too_large'?413:400,{error:parsed.error});
  const mtime=validSourceMtime(req.headers.get('x-source-mtime'));
  if(!mtime.ok)return response(400,{error:'invalid_source_mtime'});
  const sha256=await sha256Hex(parsed.html);
  const {error}=await sb.rpc('owner_board_put',{p_slug:slug,p_html:parsed.html,p_sha256:sha256,p_source_mtime:mtime.value});
  return error?response(500,{error:'save_failed'}):response(200,{slug,bytes:parsed.bytes,sha256});
});
