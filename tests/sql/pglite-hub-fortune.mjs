import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// 운세 카드(db/hub_fortune.sql) — 직원은 함수로만 뽑음 · 하루 횟수 · 개수(전체·월·일) 한도 · 확률 합계 100 초과 거절 · 원장만 설정/상품/지급체크 · 두 번 적용 OK · 롤백.
const root=process.cwd(), pkg=process.env.PGLITE_PACKAGE_ROOT;
if(!pkg) throw new Error('PGLITE_PACKAGE_ROOT required');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href), db=new PGlite(), q=s=>db.query(s).then(x=>x.rows);
const owner='11111111-1111-1111-1111-111111111111', staff='22222222-2222-2222-2222-222222222222', staff2='33333333-3333-3333-3333-333333333333', blocked='55555555-5555-5555-5555-555555555555';
const setUser=async id=>db.exec(`reset role;set role authenticated;select set_config('app.test_uid','${id}',false);`), reset=async()=>db.exec('reset role;');
const call=async(sql)=>(await q(`select ${sql} as r`))[0].r;
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
 create table public.profiles(user_id uuid primary key,name text,role text,active boolean default true,approved boolean default true,account_access_status text default '활성');
 create function public.employee_hub_access_allowed() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.approved and p.account_access_status='활성')$$;
 create function public.my_role() returns text language sql stable security definer set search_path='' as $$select case when public.employee_hub_access_allowed() then coalesce((select p.role from public.profiles p where p.user_id=auth.uid()),'staff') else 'pending' end$$;
 grant usage on schema public to authenticated,anon;grant execute on function public.employee_hub_access_allowed(),public.my_role() to authenticated;
 insert into public.profiles(user_id,name,role,account_access_status) values('${owner}','원장','owner','활성'),('${staff}','직원A','staff','활성'),('${staff2}','직원B','staff','활성'),('${blocked}','차단','staff','차단');`);
 const sql=fs.readFileSync(path.join(root,'db/hub_fortune.sql'),'utf8');
 await db.exec(sql);
 await db.exec(sql); // 두 번 적용 OK
 assert.equal((await q(`select count(*)::int n from public.fortune_settings`))[0].n,1,'설정 한 줄만');

 // ── 직원: 표를 직접 못 읽고 못 씀, 함수로만 ──
 await setUser(staff);
 assert.equal((await q(`select count(*)::int n from public.fortune_prizes`))[0].n,0,'상품 표는 원장만 읽음(직원은 0행)');
 await assert.rejects(q(`insert into public.fortune_draws(user_id,draw_date,draw_no,seed) values('${staff}',current_date,1,1)`),/permission denied|row-level security/,'직접 기록 못 씀');
 await assert.rejects(q(`update public.fortune_settings set draws_per_day=20`),/permission denied|row-level security/);
 await assert.rejects(call(`public.fortune_admin_overview()`),/owner_only/);
 await assert.rejects(call(`public.fortune_save_prizes('[]'::jsonb)`),/owner_only/);
 await assert.rejects(call(`public.fortune_save_settings(true,5)`),/owner_only/);
 await assert.rejects(call(`public.fortune_mark_paid(1,true)`),/owner_only/);
 let st=await call(`public.fortune_status()`);
 assert.equal(st.enabled,true);assert.equal(st.draws_per_day,1);assert.equal(st.used_today,0);

 // ── 상품 없음 → 꽝, 하루 1번 ──
 let r=await call(`public.fortune_draw()`);
 assert.equal(r.ok,true);assert.equal(r.prize_name,null);assert.equal(r.draw_no,1);assert.ok(r.seed>=1);
 const again=await call(`public.fortune_draw()`);
 assert.equal(again.ok,false);assert.equal(again.reason,'limit');
 st=await call(`public.fortune_status()`);
 assert.equal(st.used_today,1);assert.equal(st.today[0].seed,r.seed,'재접속해도 같은 기록');
 // 내 기록만 보임
 assert.equal((await q(`select count(*)::int n from public.fortune_draws`))[0].n,1);
 await setUser(staff2);
 assert.equal((await q(`select count(*)::int n from public.fortune_draws`))[0].n,0,'남의 기록은 안 보임');
 await reset();

 // ── 차단된 계정은 못 뽑음 ──
 await setUser(blocked);
 await assert.rejects(call(`public.fortune_draw()`),/not_allowed/);
 await assert.rejects(call(`public.fortune_status()`),/not_allowed/);
 await reset();
 // anon 거절
 await db.exec(`reset role;set role anon;`);
 await assert.rejects(call(`public.fortune_draw()`),/permission denied/);
 await reset();

 // ── 원장: 설정·상품 저장 검증 ──
 await setUser(owner);
 await assert.rejects(call(`public.fortune_save_settings(true,0)`),/invalid_settings/);
 await assert.rejects(call(`public.fortune_save_settings(true,21)`),/invalid_settings/);
 await call(`public.fortune_save_settings(true,3)`);
 const bad=[
  [`'"not an array"'::jsonb`,/invalid_prizes/],
  [`'[{"name":"","probability_pct":1}]'::jsonb`,/이름/],
  [`'[{"name":"a","probability_pct":101}]'::jsonb`,/확률/],
  [`'[{"name":"a","probability_pct":-1}]'::jsonb`,/확률/],
  [`'[{"name":"a","probability_pct":1.23456}]'::jsonb`,/소수 넷째/],
  [`'[{"name":"a","amount_krw":-5,"probability_pct":1}]'::jsonb`,/금액/],
  [`'[{"name":"a","amount_krw":1.5,"probability_pct":1}]'::jsonb`,/금액/],
  [`'[{"name":"a","probability_pct":1,"stock_total":-1}]'::jsonb`,/개수/],
  [`'[{"name":"a","probability_pct":60},{"name":"b","probability_pct":41}]'::jsonb`,/100/],
 ];
 for(const [arg,re] of bad) await assert.rejects(call(`public.fortune_save_prizes(${arg})`),re,arg);
 // 꺼 둔 상품은 합계에서 뺌
 await call(`public.fortune_save_prizes('[{"name":"큰상","probability_pct":99,"active":false},{"name":"작은상","probability_pct":60}]'::jsonb)`);
 assert.equal((await q(`select count(*)::int n from public.fortune_prizes`))[0].n,2);
 await reset();

 // ── 확률 100% 상품 + 개수 한도: 전체 2개 → 3번째부터 꽝 ──
 await setUser(owner);
 await call(`public.fortune_save_prizes('[{"name":"커피 쿠폰","amount_krw":5000,"probability_pct":100,"stock_total":2}]'::jsonb)`);
 await call(`public.fortune_save_settings(true,20)`);
 await reset();
 const wins=[];
 for(const uid of [staff2,staff2,staff2,staff2]){
  await setUser(uid);
  wins.push((await call(`public.fortune_draw()`)).prize_name);
 }
 await reset();
 assert.deepEqual(wins,['커피 쿠폰','커피 쿠폰',null,null],'전체 개수 2개가 차면 꽝');

 // ── 일일 한도 · 월 한도 ──
 await setUser(owner);
 await call(`public.fortune_save_prizes('[{"name":"일일한정","amount_krw":1000,"probability_pct":100,"stock_daily":1}]'::jsonb)`);
 await reset();
 await db.exec(`delete from public.fortune_draws`);
 await setUser(staff);
 const d1=await call(`public.fortune_draw()`), d2=await call(`public.fortune_draw()`);
 assert.equal(d1.prize_name,'일일한정');assert.equal(d2.prize_name,null,'오늘 1개 한도');
 await reset();
 await setUser(owner);
 await call(`public.fortune_save_prizes('[{"name":"월한정","amount_krw":1000,"probability_pct":100,"stock_monthly":1}]'::jsonb)`);
 await reset();
 await db.exec(`delete from public.fortune_draws`);
 await setUser(staff);
 const m1=await call(`public.fortune_draw()`), m2=await call(`public.fortune_draw()`);
 assert.equal(m1.prize_name,'월한정');assert.equal(m2.prize_name,null,'이번 달 1개 한도');
 await reset();

 // ── 확률 분포(0% = 절대 안 나옴, 50% 근처) ──
 await setUser(owner);
 await call(`public.fortune_save_prizes('[{"name":"절대안나옴","probability_pct":0},{"name":"반반","amount_krw":100,"probability_pct":50}]'::jsonb)`);
 await call(`public.fortune_save_settings(true,20)`);
 await reset();
 await db.exec(`delete from public.fortune_draws`);
 let hit=0,zero=0;
 await setUser(staff);
 for(let i=0;i<20;i++){const x=await call(`public.fortune_draw()`);if(x.prize_name==='반반')hit++;if(x.prize_name==='절대안나옴')zero++;}
 await reset();
 assert.equal(zero,0);
 await db.exec(`delete from public.fortune_draws`);
 // 시뮬레이션: 한도 20으로 날짜를 바꿔 가며 400번 — 50%에 가까운지 대략 확인
 await setUser(staff);
 let total=0,got=0;
 for(let day=0;day<20;day++){
  await reset();
  for(const row of await q(`select distinct draw_date::text d from public.fortune_draws order by 1`)) await db.exec(`update public.fortune_draws set draw_date = '${row.d}'::date - 1 where draw_date = '${row.d}'::date`); // 어제로 밀어 오늘 횟수를 비움(오래된 날부터 — 유일키 충돌 방지)
  await setUser(staff);
  for(let i=0;i<20;i++){const x=await call(`public.fortune_draw()`);total++;if(x.prize_name==='반반')got++;}
 }
 await reset();
 assert.ok(got/total>0.4&&got/total<0.6,`50% 근처여야 함: ${got}/${total}`);

 // ── 원장 한눈에 · 지급 체크 ──
 await setUser(owner);
 const ov=await call(`public.fortune_admin_overview()`);
 assert.equal(ov.prizes.length,2);assert.equal(ov.prizes[1].name,'반반');assert.ok(ov.prizes[1].used_total>0);
 assert.ok(ov.recent.length>0);assert.equal(ov.recent[0].name,'직원A');assert.equal(ov.recent[0].paid,false);
 assert.equal(ov.totals.wins,got);assert.ok(ov.totals.unpaid_count>0);
 const winId=ov.recent[0].id;
 await call(`public.fortune_mark_paid(${winId},true)`);
 let ov2=await call(`public.fortune_admin_overview()`);
 assert.equal(ov2.recent.find(x=>x.id===winId).paid,true);
 await call(`public.fortune_mark_paid(${winId},false)`);
 ov2=await call(`public.fortune_admin_overview()`);
 assert.equal(ov2.recent.find(x=>x.id===winId).paid,false,'지급 취소도 됨');
 await assert.rejects(call(`public.fortune_mark_paid(99999999,true)`),/not_found/);
 // 원장은 모든 기록을 읽음
 assert.ok((await q(`select count(*)::int n from public.fortune_draws`))[0].n>=got);
 // 상품을 지워도 뽑은 기록의 이름·금액은 남음
 await call(`public.fortune_save_prizes('[]'::jsonb)`);
 assert.equal((await q(`select count(*)::int n from public.fortune_prizes`))[0].n,0);
 assert.equal((await q(`select count(*)::int n from public.fortune_draws where prize_name='반반' and prize_amount_krw=100 and prize_id is null`))[0].n,got,'기록의 이름·금액 보존');
 // 꺼 두면 못 뽑음
 await call(`public.fortune_save_settings(false,1)`);
 await reset();
 await setUser(staff2);
 const off=await call(`public.fortune_draw()`);
 assert.equal(off.ok,false);assert.equal(off.reason,'disabled');
 await reset();

 // ── 롤백 ──
 await db.exec(fs.readFileSync(path.join(root,'db/hub_fortune_rollback.sql'),'utf8'));
 assert.equal((await q(`select count(*)::int n from pg_tables where schemaname='public' and tablename like 'fortune_%'`))[0].n,0);
 assert.equal((await q(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'fortune_%'`))[0].n,0);
 await db.exec(sql); // 롤백 뒤 다시 적용 OK
 console.log('pglite-hub-fortune: OK');
} finally { await db.close(); }
