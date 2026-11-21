import {createDentwebHandler} from './payload.mjs';

Deno.serve(createDentwebHandler({
  getSecret:()=>Deno.env.get('DENTWEB_SYNC_KEY'),
  async save(rpc: string,args: {p_rows: unknown[]}){
    const url=Deno.env.get('SUPABASE_URL');
    const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url || !key)throw new Error('Supabase configuration missing');

    const response=await fetch(new URL('/rest/v1/rpc/'+rpc,url),{
      method:'POST',
      headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify(args)
    });
    await response.body?.cancel();
    if(!response.ok)throw new Error('DentWeb RPC rejected');
  }
}));
