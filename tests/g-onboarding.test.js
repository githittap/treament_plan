const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('hr.html','utf8');
const schema=fs.readFileSync('db/hr_schema.sql','utf8');
const policies=fs.readFileSync('db/hr_policies.sql','utf8');
const sql=fs.readFileSync('db/onboarding_g_hardening_draft.sql','utf8');
const rollback=fs.readFileSync('db/onboarding_g_hardening_rollback.sql','utf8');

test('G 온보딩 안내는 원본 코드블록 13항을 모두 포함하고 직원·관리자에게 보인다',()=>{
  const block=html.match(/\/\* onboarding-guide:test-start \*\/([\s\S]*?)\/\* onboarding-guide:test-end \*\//);
  assert.ok(block);
  const c={};vm.runInNewContext(`${block[1]};this.h={onboardingGuideItems,onboardingGuideVisibleForRole};`,c);
  assert.equal(c.h.onboardingGuideItems().length,13);
  for(const role of ['staff','manager','chief'])assert.equal(c.h.onboardingGuideVisibleForRole(role),true);
  for(const word of ['병원 시설','조직도','무전기','보고 라인','최초 1회 응답','사담','납부','대기시간','컴플레인','구강포토','임플란트','기구','후속 계획'])assert.ok(c.h.onboardingGuideItems().some(item=>item.includes(word)),word);
  assert.match(html,/onboardingGuideItems\(\)/);
  assert.match(html,/BADGE\.onbo\+=\(fp\|\|\[\]\)\.length/);assert.match(html,/fpManagerAlert/);
});

test('업무자료는 현재 직원의 직무 매뉴얼만 반환한다',()=>{
  const block=html.match(/\/\* work-documents:test-start \*\/([\s\S]*?)\/\* work-documents:test-end \*\//);assert.ok(block);
  const c={};vm.runInNewContext(`${block[1]};this.h={workDocumentsForProfile};`,c);
  const docs=[{title:'진료 매뉴얼',manual:true,depts:['진료실']},{title:'상담 매뉴얼',manual:true,depts:['상담']},{title:'공통 안내',manual:false}];
  assert.deepEqual(c.h.workDocumentsForProfile(docs,{dept:'진료실'}).map(x=>x.title),['진료 매뉴얼','공통 안내']);
});

test('보관 서명을 선택하면 계약 서명 저장 payload에 signature_id와 근로계약서 사용기록이 포함된다',async()=>{
  const block=html.match(/\/\* contract-signature:test-start \*\/([\s\S]*?)\/\* contract-signature:test-end \*\//);assert.ok(block);
  const c={};vm.runInNewContext(`${block[1]};this.h={contractSignatureUsePayload};`,c);assert.deepEqual(JSON.parse(JSON.stringify(c.h.contractSignatureUsePayload(3,'2026-09-24T00:00:00Z'))),{signature_id:3,document_kind:'근로계약서',confirmed_at:'2026-09-24T00:00:00Z'});assert.match(html,/employee_signature_uses.*contractSignatureUsePayload/);
});

test('지문 요청은 매니저 승인 전에는 완료가 아니며 승인 후 완료가 된다',async()=>{
  const block=html.match(/\/\* fingerprint-registration:test-start \*\/([\s\S]*?)\/\* fingerprint-registration:test-end \*\//);assert.ok(block);
  const calls=[];const c={ME:{id:'u1',role:'staff'},setStatus:()=>{},render:()=>{},refreshBadges:()=>{},$:(id)=>({textContent:''}),sb:{from:table=>({upsert:async p=>{calls.push(['upsert',table,p]);return {error:null};},update:p=>({eq:()=>({eq:async()=>{calls.push(['update',table,p]);return {error:null};}})})})}};
  vm.runInNewContext(`${block[1]};this.h={submitFingerprintRegistration,approveFingerprintRegistration};`,c);await c.h.submitFingerprintRegistration();assert.equal(calls[0][2].status,'요청');c.ME={id:'m1',role:'manager'};await c.h.approveFingerprintRegistration('u1');assert.equal(calls[1][2].status,'완료');
});

test('G 로컬 migration은 지문 요청 상태·역할 경계와 rollback을 선언한다',()=>{
  assert.match(sql,/fingerprint_registration_requests/);assert.match(sql,/status in \('요청','완료','반려'\)/);assert.match(sql,/manager_id=auth\.uid\(\)/);assert.match(sql,/manager/);assert.match(rollback,/drop table if exists public\.fingerprint_registration_requests/);assert.match(schema,/onboarding_items/);assert.match(policies,/onboarding_checks/);
});
