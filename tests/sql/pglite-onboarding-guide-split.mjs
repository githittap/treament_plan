import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// 입사 제출물 정리: 「신입 첫날 안내」 16문장(order_no 101~116)만 active=false로 내리고, 진짜 제출물·원장이 더한 항목·제출 기록은 그대로인지 본다.
// 다시 돌려도 안전한지, 16줄이 다 안 맞으면 아무것도 안 바꾸고 멈추는지, 되돌리기 SQL이 원래대로 올리는지도 본다.
const root=process.cwd(), pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg) throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href);
const up=fs.readFileSync(path.join(root,'db/onboarding_items_guide_split.sql'),'utf8');
const down=fs.readFileSync(path.join(root,'db/onboarding_items_guide_split_rollback.sql'),'utf8');
const seed=fs.readFileSync(path.join(root,'db/onboarding_g_hardening_draft.sql'),'utf8').match(/insert into public\.onboarding_items[\s\S]*?where i\.label=v\.label\);/g);
assert.equal(seed?.length,2,'G장 초안의 안내 문장 넣기 2묶음을 그대로 씀');
const fresh=async()=>{const db=new PGlite();await db.exec(`
 create table public.onboarding_items(id bigint generated always as identity primary key,label text not null,required boolean not null default true,order_no int default 0,active boolean not null default true,created_at timestamptz default now());
 create table public.onboarding_checks(id bigint generated always as identity primary key,user_id uuid not null,item_id bigint not null references public.onboarding_items(id) on delete cascade,status text not null default '미제출');
 insert into public.onboarding_items(label,required,order_no) values('급여 계좌번호 제출',true,1),('노션 가입',true,2),('지문 등록',true,3),('채용 신체검사서 제출 (잠복결핵 검사 포함)',true,4),('보안·개인정보 서약서',true,5);
 ${seed.join('\n')}
 insert into public.onboarding_items(label,required,order_no) values('원장이 더한 제출물',true,117);
 insert into public.onboarding_checks(user_id,item_id,status) select '11111111-1111-1111-1111-111111111111',id,'제출' from public.onboarding_items where order_no in (1,101,105);`);return db;};
const rows=async db=>(await db.query('select order_no,active from public.onboarding_items order by order_no')).rows;
const activeOrders=async db=>(await rows(db)).filter(r=>r.active).map(r=>r.order_no);
{
 const db=await fresh();
 assert.equal((await rows(db)).length,22);
 await db.exec(up);
 assert.deepEqual(await activeOrders(db),[1,2,3,4,5,117],'안내 16문장만 내려가고 진짜 제출물·원장 항목은 남음');
 assert.equal((await db.query('select count(*)::int n from public.onboarding_checks')).rows[0].n,3,'제출 기록은 지우지 않음');
 await db.exec(up);
 assert.deepEqual(await activeOrders(db),[1,2,3,4,5,117],'다시 돌려도 같음');
 await db.exec(down);
 assert.equal((await activeOrders(db)).length,22,'되돌리기 SQL이 16문장을 다시 올림');
 await db.close();
}
{
 const db=await fresh();
 await db.exec("update public.onboarding_items set label=label||' (고침)' where order_no=110");
 await assert.rejects(db.exec(up),/expected 16 guide rows, found 15/);
 assert.equal((await activeOrders(db)).length,22,'16줄이 다 안 맞으면 하나도 안 바뀜');
 await db.close();
}
console.log('PGlite onboarding guide split PASS');
