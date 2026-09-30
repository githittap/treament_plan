const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {parseNaverAdSms}=require('../supabase/functions/ai-billing-webhook/naver_ads.mjs');
const edge=fs.readFileSync('supabase/functions/ai-billing-webhook/webhook_core.ts','utf8');
const sql=fs.readFileSync('db/ai_billing_alerts_draft.sql','utf8');
const rollback=fs.readFileSync('db/ai_billing_alerts_rollback.sql','utf8');
const html=fs.readFileSync('hr.html','utf8');
const dispatcher=fs.readFileSync('supabase/functions/push-dispatcher/transport.ts','utf8');

test('실제 네이버 광고 SMS 4형식을 구분하고 링크와 계정 정보를 뽑는다',()=>{
  const balance=parseNaverAdSms('[Web발신]\n제목: [네이버 광고] 잔액 안내\n지역+파워컨텐츠 키워드(모바일)(2410390) 잔액 100,000원 이하 알림\nhttps://ads.naver.com/');
  assert.deepEqual(balance,{kind:'low_balance',amount_krw:0,note:'NAVER_AD_LOW_BALANCE',account_id:'2410390',account_name:'지역+파워컨텐츠 키워드(모바일)',threshold_krw:100000});
  for(const phrase of ['검색광고 광고그룹 노출중단 예산변경','검색광고 캠페인 노출 중단 예산변경']){
    const stop=parseNaverAdSms(`[Web발신]\n[네이버 광고] ${phrase}\nhttps://ads.naver.com/`);
    assert.equal(stop.note,'NAVER_AD_STOP');assert.equal(stop.amount_krw,0);
  }
  const charge=parseNaverAdSms('[Web발신]\n제목: [네이버 광고] 충전 안내\n아산정_플레이스_파워링크A_파워컨텐츠(1970043)비즈머니 현금충전 500,000원 완료되었습니다.');
  assert.deepEqual(charge,{kind:'cash_charge',amount_krw:500000,note:'NAVER_AD_CHARGE',account_id:'1970043',account_name:'아산정_플레이스_파워링크A_파워컨텐츠',threshold_krw:null});
});

test('unknown 네이버 광고 문자는 0원 기록 표식, 무관 SMS는 null',()=>{
  assert.equal(parseNaverAdSms('[네이버 광고] 새로운 유형 안내').note,'NAVER_AD_UNKNOWN');
  assert.equal(parseNaverAdSms('[네이버 광고] 새로운 유형 안내').amount_krw,0);
  assert.equal(parseNaverAdSms('카드 승인 100원'),null);
});

test('webhook trusts parser only for naver_ads and rejects foreign marker injection',()=>{
  assert.match(edge,/platform === 'naver_ads'[\s\S]*?parseNaverAdSms\(rawText\)/);
  assert.match(edge,/note\?\.startsWith\('NAVER_AD_'\)/);
  assert.match(edge,/account_id: naverAd\?\.account_id/);
  assert.match(edge,/threshold_krw: naverAd\?\.threshold_krw/);
  assert.match(edge,/\.eq\('name', 'ai_billing_webhook'\)/);
  assert.match(edge,/status: 405/);assert.match(edge,/}, 401\)/);assert.match(edge,/}, 400\)/);assert.match(edge,/}, 200\)/);
});

test('RLS, charged SECURITY DEFINER guard, recipient default, and rollback preserve live data',()=>{
  assert.match(sql,/can_view_ai_billing_alerts\(\)[\s\S]*security definer[\s\S]*set search_path=public,pg_temp/i);
  assert.match(sql,/coalesce\(v_enabled,true\)/);
  assert.match(sql,/note in \('NAVER_AD_STOP','NAVER_AD_LOW_BALANCE','NAVER_AD_CHARGE'\)/);
  assert.match(sql,/note in \('NAVER_AD_STOP','NAVER_AD_LOW_BALANCE'\)/);
  assert.match(sql,/raise warning 'ai billing push enqueue failed/);
  assert.match(rollback,/my_role\(\) not in \('owner','manager'\)/);
  assert.match(rollback,/note='NAVER_AD_STOP'/);
  assert.match(rollback,/recipient table\/data remain/);
});

test('hub alerts cover stop and low balance and exclude ads from AI cost totals and history',()=>{
  assert.match(html,/NAVER_AD_STOP/);assert.match(html,/NAVER_AD_LOW_BALANCE/);
  assert.match(html,/ai_billing_alert_recipients/);
  assert.match(html,/threshold_krw/);
  assert.match(html,/isNaverAdBillingEvent/);
  assert.match(html,/AI_BILLING_ALERT_HTML=aiBillingAlertCard/);
});

test('existing push dispatcher allows three generic same-origin advertising notices',()=>{
  for(const type of ['ai_billing_stop','ai_billing_low_balance','ai_billing_charge'])assert.match(dispatcher,new RegExp(type));
  assert.match(dispatcher,/\/hr\.html\?tab=inbox/);
  assert.match(fs.readFileSync('db/push_notifications_draft.sql','utf8'),/ai_billing_stop','ai_billing_low_balance','ai_billing_charge/);
  assert.match(dispatcher,/account_id/);assert.match(dispatcher,/amount\.toLocaleString/);
  assert.match(sql,/can_dispatch_ai_billing_push\(p_event_id bigint,p_claim_token uuid\)/);
});

test('role, preflight, push isolation and rollback PGlite test is wired',()=>{
  const pglite=fs.readFileSync('tests/sql/pglite-ai-billing-alerts.mjs','utf8');
  for(const marker of ['ids.owner','ids.manager','ids.off','ids.staff','ids.chief','ids.deputy','ids.blocked','drifted schema','push failure does not roll back','preserves owner choices'])assert.match(pglite,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});
