import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(path.join(process.env.PGLITE_PACKAGE_ROOT,'dist/index.js')).href);
const db=new PGlite();let checks=0;
const rows=async(sql,args)=>(await db.query(sql,args)).rows;
try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create function public.my_role() returns text language sql stable as $$select coalesce(current_setting('test.role',true),'owner')$$;
    create table public.ai_billing_events(id bigint primary key,raw_text text);
    create table public.hub_ui_texts(key text primary key,value text not null);`);
  await db.exec(fs.readFileSync('db/hr_settings.sql','utf8'));
  await db.exec('grant select,insert,update on public.app_settings to authenticated');
  await db.exec(fs.readFileSync('db/card_ledger_v1.sql','utf8'));
  const sql=fs.readFileSync('db/card_ledger_ui_v2.sql','utf8');
  await db.exec(sql);await db.exec(sql);checks++;
  const subs=JSON.parse((await rows("select value from app_settings where key='ledger.subscriptions'"))[0].value);
  assert.equal(subs.length,61);assert.equal(subs.find(s=>s.service.startsWith('ImagineArt')).status,'해지 완료');assert.equal(subs.find(s=>s.service==='미리캔버스 Pro').status,'해지 완료');checks++;
  await db.exec("update app_settings set value='[]' where key='ledger.subscriptions';update hub_ui_texts set value='내 결제' where key='ledger.title';");
  await db.exec(sql);assert.equal((await rows("select value from app_settings where key='ledger.subscriptions'"))[0].value,'[]');assert.equal((await rows("select value from hub_ui_texts where key='ledger.title'"))[0].value,'내 결제');checks++;
  await db.exec(`insert into card_sms_failed_raw(dedupe_hash,body,fail_reason,received_at,expires_at) values
    ('${'a'.repeat(64)}','synthetic current','parser',now(),now()+interval '1 day'),
    ('${'b'.repeat(64)}','synthetic expired','parser',now()-interval '31 days',now()-interval '1 day');`);
  for(const role of ['staff','manager','chief','deputy']){
    await db.exec(`set role authenticated;select set_config('test.role','${role}',false);`);
    assert.equal((await rows('select * from card_sms_failed_raw')).length,0);
    assert.equal((await rows('select * from card_merchants')).length,0);
    assert.equal((await rows('select * from card_transactions')).length,0);checks++;
    assert.equal((await rows("update app_settings set value='staff edit' where key='ledger.subscriptions' returning key")).length,0);checks++;
    await db.exec('reset role');
  }
  await db.exec("set role authenticated;select set_config('test.role','owner',false)");
  const failures=await rows('select body from card_sms_failed_raw');assert.equal(failures.length,1);assert.equal(failures[0].body,'synthetic current');checks++;
  assert.equal((await rows("update app_settings set value='[]' where key='ledger.subscriptions' returning key")).length,1);checks++;
  await assert.rejects(()=>db.exec("update card_sms_failed_raw set body='changed'"),/permission denied/);checks++;
  await assert.rejects(()=>db.exec('delete from card_sms_failed_raw'),/permission denied/);checks++;
  await db.exec('reset role;set role anon');await assert.rejects(()=>rows('select body from card_sms_failed_raw'),/permission denied/);checks++;
  console.log('PASS card ledger UI SQL checks: '+checks);
}finally{await db.close();}
