// 리뷰 요청 문자 — 환자 실제 발송 영구 중지(db/review_sms_stop_20261127.sql) 시험.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(path.join(process.env.PGLITE_PACKAGE_ROOT,'dist/index.js')).href);
const db=new PGlite(),q=sql=>db.query(sql).then(r=>r.rows);
const read=file=>fs.readFileSync(file,'utf8');
const val=async key=>(await q(`select value from public.app_settings where key='${key}'`))[0]?.value;
try{
 await db.exec(`create table public.app_settings(key text primary key,value text not null,label text,updated_at timestamptz default now());
 insert into public.app_settings(key,value,label) values('review_sms.live_enabled','true','옛 설명'),('review_sms.enabled','true','화면');`);
 const mig=read('db/review_sms_stop_20261127.sql');
 await db.exec(mig);await db.exec(mig); // 두 번 돌려도 같음
 assert.equal(await val('review_sms.live_enabled'),'false','켜져 있던 값도 끔');
 assert.match((await q(`select label from public.app_settings where key='review_sms.live_enabled'`))[0].label,/영구 중지/);
 assert.equal(await val('review_sms.relay_refresh_req'),'');
 await assert.rejects(q(`update public.app_settings set value='true' where key='review_sms.live_enabled'`),/review_sms_live_stopped/);
 await assert.rejects(q(`insert into public.app_settings(key,value) values('review_sms.live_enabled','true') on conflict(key) do update set value=excluded.value`),/review_sms_live_stopped/,'화면 upsert 길도 막힘');
 await q(`update public.app_settings set value='false' where key='review_sms.live_enabled'`);
 await q(`update public.app_settings set value='2026-11-27T13:00:00Z' where key='review_sms.relay_refresh_req'`);
 await q(`update public.app_settings set value='false' where key='review_sms.enabled'`);
 assert.equal(await val('review_sms.relay_refresh_req'),'2026-11-27T13:00:00Z','다른 칸은 그대로 고칠 수 있음');
 await db.exec(read('db/review_sms_stop_20261127_rollback.sql'));
 assert.equal(await val('review_sms.relay_refresh_req'),undefined);
 await q(`update public.app_settings set value='true' where key='review_sms.live_enabled'`);
 assert.equal(await val('review_sms.live_enabled'),'true','되돌리면 다시 켤 수 있음');
 console.log('PGLITE_REVIEW_SMS_STOP_PASS: idempotent, forces false, label, refresh key, update+upsert rejected, other keys free, rollback');
}catch(error){console.error('PGLITE_REVIEW_SMS_STOP_FAIL',error.message,error.stack);process.exitCode=1;}finally{await db.close();}
