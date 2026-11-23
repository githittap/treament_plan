import {createDentwebHandler} from './payload.mjs';

Deno.serve(createDentwebHandler({
  getSecret:()=>Deno.env.get('DENTWEB_SYNC_KEY'),
  async save(rpc: string,args: {p_rows: unknown[]}): Promise<unknown>{
    const url=Deno.env.get('SUPABASE_URL');
    const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url || !key)throw new Error('Supabase configuration missing');

    const response=await fetch(new URL('/rest/v1/rpc/'+rpc,url),{
      method:'POST',
      headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify(args)
    });
    if(!response.ok)throw new Error('DentWeb RPC rejected');
    if(rpc==='consultation_inbox_ingest_kakao_bookings'){
      const accepted: unknown=await response.json();
      if(!Number.isInteger(accepted))throw new Error('DentWeb RPC response invalid');
      return accepted;
    }
    await response.body?.cancel();
  }
}));
