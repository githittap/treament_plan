const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('hr.html','utf8');
const schema=fs.readFileSync('db/hr_schema.sql','utf8');
const policies=fs.readFileSync('db/hr_policies.sql','utf8');
const sql=fs.readFileSync('db/onboarding_g_hardening_draft.sql','utf8');
const rollback=fs.readFileSync('db/onboarding_g_hardening_rollback.sql','utf8');

test('G 온보딩 안내는 원본 코드블록의 고유 항목을 모두 포함하고 직원·관리자에게 보인다',()=>{
  const block=html.match(/\/\* onboarding-guide:test-start \*\/([\s\S]*?)\/\* onboarding-guide:test-end \*\//);
  assert.ok(block);
  const c={};vm.runInNewContext(`${block[1]};this.h={onboardingGuideItems,onboardingGuideVisibleForRole};`,c);
  const expected=['병원 시설을 둘러보고 식당·출퇴근 기록 장치 등 기본 시설 사용법을 안내받는다.','조직도, 호칭, 기본 예절, 업무 분장, 근로계약과 복리후생 설명을 듣는다.','무전기를 지급받으면 담당자에게 사용법과 업무용 대화 범위를 확인한다.','소속 부서의 담당자, 보고 라인, 당일 교육 항목을 확인한다.','무전은 들었다는 뜻으로 최초 1회 응답한다.','진료실·데스크에서 큰 소리의 사담을 피하고, 환자 앞에서 치료계획 변경이나 내부 판단을 논의하지 않는다.','환자가 언제 어떻게 납부하기로 했는지, 비급여 차감 등 금액 관련 사항이 있으면 상담·데스크 기록을 일치시킨다.','대기시간과 환자 동선을 안내하고 접수 후 어디에서 기다리는지 분명히 설명한다.','컴플레인은 말을 끊지 않고 듣고, 담당자에게 즉시 보고한 뒤 단독으로 확정 약속하지 않는다.','신환은 구강포토와 상담 차트를 준비하고 지정 위치에 기록·스캔한다.','임플란트 식립 후 1차 내원은 s/o 또는 드레싱, 2차 내원은 3주 후, 3차 내원은 6주 후로 안내한다.','사용한 기구와 재료는 원래 위치에 정리하고 오픈·마감 시 정리 항목을 체크한다.','치료 후 다음 계획 또는 정기검진·불편 시 내원 등 후속 계획을 기록한다.'];
  expected.splice(4,0,'기본 도구와 오픈·마감 절차를 확인한다.');
  expected[6]='진료실·데스크에서 큰 소리의 사담을 피하고, 환자 앞에서 치료계획 변경이나 내부 판단을 논의하지 않으며 필요한 설명과 양해를 먼저 제공한다.';
  expected.splice(10,0,'상담 전 최신 수가표와 내부 설명 자료의 사용 범위를 담당자에게 확인한다.');
  assert.deepEqual(JSON.parse(JSON.stringify(c.h.onboardingGuideItems())),expected);
  for(const role of ['staff','manager','chief'])assert.equal(c.h.onboardingGuideVisibleForRole(role),true);
  assert.match(html,/undone\.length&&onboardingGuideVisibleForRole\(ME\.role\)\?onboardingGuideCard\(\)/);
  assert.match(html,/onboardingGuideItems\(\)/);
  assert.match(html,/BADGE\.onbo\+=\(fp\|\|\[\]\)\.length/);assert.match(html,/fpManagerAlert/);
  c.ME={role:'chief'};assert.equal(vm.runInNewContext('function canApproveFingerprintRegistration(){return ME.role===\'manager\'||ME.role===\'owner\'};canApproveFingerprintRegistration()',c),false);
});

test('업무자료는 현재 직원의 직무 매뉴얼만 반환한다',()=>{
  const block=html.match(/\/\* work-documents:test-start \*\/([\s\S]*?)\/\* work-documents:test-end \*\//);assert.ok(block);
  const c={};vm.runInNewContext(`${block[1]};this.h={workDocumentsForProfile};`,c);
  const docs=[{title:'진료 매뉴얼',manual:true,depts:['진료실','상담']}];
  assert.deepEqual(c.h.workDocumentsForProfile(docs,{dept:'진료실'}).map(x=>x.title),['진료 매뉴얼']);
  assert.deepEqual(c.h.workDocumentsForProfile(docs,{dept:'상담'}).map(x=>x.title),['진료 매뉴얼']);
  assert.deepEqual(c.h.workDocumentsForProfile(docs,{dept:'기공'}),[]);
  assert.deepEqual(c.h.workDocumentsForProfile(docs,{job_group:'clinical_consult',dept:'기공'}).map(x=>x.title),['진료 매뉴얼']);
  assert.deepEqual(c.h.workDocumentsForProfile(docs,{job_group:'lab',dept:'진료실'}),[]);
});

test('보관 서명을 선택하면 계약 서명 저장 payload에 signature_id와 근로계약서 사용기록이 포함된다',async()=>{
  const block=html.match(/\/\* contract-signature:test-start \*\/([\s\S]*?)\/\* contract-signature:test-end \*\//);assert.ok(block);
  const c={};vm.runInNewContext(`${block[1]};this.h={contractSignatureUsePayload};`,c);assert.deepEqual(JSON.parse(JSON.stringify(c.h.contractSignatureUsePayload(3,'2026-09-24T00:00:00Z'))),{signature_id:3,document_kind:'근로계약서',confirmed_at:'2026-09-24T00:00:00Z'});assert.match(html,/apply_employee_contract_signature/);assert.match(html,/signature_id:canvas\.dataset\.signatureId\?Number\(canvas\.dataset\.signatureId\):null/);assert.match(html,/contract-pdf-sign.*signature_id/s);
});

test('대기 계약 캔버스만 저장 서명 자동 불러오기를 시작한다',async()=>{
  const block=html.match(/\/\* contract-signature:test-start \*\/([\s\S]*?)\/\* contract-signature:test-end \*\//);assert.ok(block);
  const c={};vm.runInNewContext(`${block[1]};this.h={autoLoadStoredContractSignatures};`,c);
  const calls=[];c.useStoredContractSignature=async(id,options)=>calls.push([id,options]);
  c.h.autoLoadStoredContractSignatures([{id:11,status:'대기'},{id:12,status:'서명완료'},{id:13,status:'취소'}]);
  await Promise.resolve();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[[11,{automatic:true}]]);
  const render=html.slice(html.indexOf('async function renderContractEmployee'),html.indexOf('async function renderContract(m)'));
  assert.match(render,/initContractSignatures\(\);\s*autoLoadStoredContractSignatures\(ownRows\)/);
});

test('자동 불러온 서명은 원문 확인·명시적 저장 전에는 저장되지 않고 id가 캔버스에 붙는다',async()=>{
  const block=html.match(/\/\* contract-signature:test-start \*\/([\s\S]*?)\/\* contract-signature:test-end \*\//);assert.ok(block);
  const drawn=[];const canvas={width:720,height:180,dataset:{dirty:'false'},getContext:()=>({clearRect:(...args)=>drawn.push(['clear',...args]),drawImage:(...args)=>drawn.push(['draw',...args])})};
  const msg={textContent:''},calls=[];let imageUrl='';
  class TestImage{set src(value){imageUrl=value;this.onload();}}
  const c={ME:{id:'staff-1'},document:{querySelector:()=>canvas},$:()=>msg,
    sb:{from(table){assert.equal(table,'employee_signature_vault');return {select(columns){assert.equal(columns,'id,storage_path');return this;},eq(column,value){calls.push(['eq',column,value]);return this;},is(column,value){calls.push(['is',column,value]);return this;},order(column,options){calls.push(['order',column,options]);return this;},limit(value){assert.equal(value,1);return this;},maybeSingle:async()=>({data:{id:21,storage_path:'staff-1/signature.png'},error:null})};},storage:{from(bucket){assert.equal(bucket,'employee-signatures');return {download:async path=>{assert.equal(path,'staff-1/signature.png');return {data:{image:true},error:null};}};}}},
    URL:{createObjectURL:()=> 'blob:signature',revokeObjectURL:url=>assert.equal(url,'blob:signature')},Image:TestImage};
  vm.runInNewContext(`${block[1]};this.h={useStoredContractSignature};`,c);
  await c.h.useStoredContractSignature(77,{automatic:true});
  assert.equal(imageUrl,'blob:signature');assert.deepEqual(drawn[0],['clear',0,0,720,180]);assert.equal(drawn[1][0],'draw');
  assert.equal(canvas.dataset.signatureId,'21');assert.equal(canvas.dataset.dirty,'true');assert.equal(canvas.dataset.confirmed,'false');
  assert.match(msg.textContent,/원문 확인 후 저장/);
  assert.equal(calls.some(call=>call[0]==='order'&&call[1]==='created_at'&&call[2].ascending===false),true);
  assert.match(html,/if\(!confirm\('원본 PDF를 확인했고/);
  assert.match(html,/onclick="saveContractSignature\(/);
  assert.match(html,/onclick="signContractPdf\(/);
  assert.match(html,/canvas\.dataset\.signatureId\?Number\(canvas\.dataset\.signatureId\):null/);
});

test('활성 보관 서명이 없거나 취소되면 저장하지 않고 수기 서명 캔버스를 유지한다',async()=>{
  const block=html.match(/\/\* contract-signature:test-start \*\/([\s\S]*?)\/\* contract-signature:test-end \*\//);assert.ok(block);
  const canvas={dataset:{dirty:'false'}},msg={textContent:''};
  const c={ME:{id:'staff-1'},document:{querySelector:()=>canvas},$:()=>msg,
    sb:{from:()=>({select(){return this;},eq(){return this;},is(column,value){assert.equal(column,'revoked_at');assert.equal(value,null);return this;},order(){return this;},limit(){return this;},maybeSingle:async()=>({data:null,error:null})})}};
  vm.runInNewContext(`${block[1]};this.h={useStoredContractSignature};`,c);
  await c.h.useStoredContractSignature(77,{automatic:true});
  assert.equal(canvas.dataset.dirty,'false');assert.match(msg.textContent,/사용할 보관 서명이 없습니다/);
  assert.match(html,/data-contract-signature="\$\{r\.id\}"/);assert.match(html,/onclick="saveContractSignature\(/);
});

test('지우기와 직원 수기 서명은 저장 보관서명의 id를 해제한다',()=>{
  const start=html.indexOf('function clearContractSignature'),end=html.indexOf('async function saveContractSignature',start);assert.ok(start>=0&&end>start);
  const canvas={width:720,height:180,dataset:{dirty:'true',signatureId:'21'},getContext:()=>({clearRect(){}})},c={document:{querySelector:()=>canvas}};
  vm.runInNewContext(html.slice(start,end)+';this.clearContractSignature=clearContractSignature;',c);c.clearContractSignature(77);
  assert.equal(canvas.dataset.dirty,'false');assert.equal(canvas.dataset.signatureId,undefined);
  assert.match(html,/canvas\.dataset\.dirty='true';delete canvas\.dataset\.signatureId/);
});

test('서명 migration은 중복 재시도와 사용기록 존재 시 rollback 차단을 선언한다',()=>{
  const signatureSql=fs.readFileSync('db/employee_signature_vault_draft.sql','utf8');
  const signatureRollback=fs.readFileSync('db/employee_signature_contract_rpc_rollback.sql','utf8');
  const pdfSql=fs.readFileSync('db/employee_signature_pdf_rpc_draft.sql','utf8'),pdfRollback=fs.readFileSync('db/employee_signature_pdf_rpc_rollback.sql','utf8'),edge=fs.readFileSync('supabase/functions/contract-pdf-sign/index.ts','utf8'),snapshot=fs.readFileSync('db/contract_pdf_signing_production_snapshot.sql','utf8');
  assert.match(signatureSql,/contract_id bigint references public\.contracts/);assert.match(signatureSql,/on conflict \(contract_id,signature_id,document_kind\) where contract_id is not null/);assert.doesNotMatch(signatureSql,/grant select,insert on table public\.employee_signature_uses/);assert.match(signatureSql,/security definer set search_path=public,pg_temp/);assert.match(signatureSql,/status='대기'/);assert.match(pdfSql,/record_contract_pdf_signature_with_use/);assert.match(pdfSql,/grant execute on function public\.record_contract_pdf_signature_with_use.*service_role/s);assert.match(edge,/record_contract_pdf_signature_with_use/);assert.match(edge,/p_signature_id: signatureId/);assert.doesNotMatch(snapshot,/create or replace function public\.record_contract_pdf_signature_with_use/);assert.match(pdfRollback,/rollback blocked: contract signature use records exist/);assert.match(pdfRollback,/drop function if exists public\.record_contract_pdf_signature_with_use/);assert.match(signatureRollback,/rollback blocked: contract signature use records exist/);assert.match(signatureRollback,/drop function if exists public\.apply_employee_contract_signature/);
  const pglite=fs.readFileSync('tests/sql/pglite-employee-signature.mjs','utf8'),pdfRpc=fs.readFileSync('db/employee_signature_pdf_rpc_draft.sql','utf8');assert.match(pglite,/create role service_role bypassrls/);assert.match(pglite,/insert into public\.employee_signature_vault[\s\S]*returning id/);assert.match(pglite,/insert into public\.contracts\(id,user_id,merged_html,status\) values \(10/);assert.match(pglite,/const asAdmin = async \(\) => \{ await db\.exec\('reset role'\); \}/);assert.match(pglite,/const asAuthenticated = async userId/);assert.match(pglite,/recordPdfSignatureWithUse[\s\S]*p_signature_id => \$\{signatureId\}::bigint/);assert.match(pdfRpc,/p_signature_id bigint default null/);assert.match(pglite,/forced signature use failure/);assert.match(pglite,/PGLITE_EMPLOYEE_SIGNATURE_SKIP/);
});

test('지문 요청은 매니저 승인 전에는 완료가 아니며 승인 후 완료가 된다',async()=>{
  const block=html.match(/\/\* fingerprint-registration:test-start \*\/([\s\S]*?)\/\* fingerprint-registration:test-end \*\//);assert.ok(block);
  const calls=[];const c={ME:{id:'u1',role:'staff'},setStatus:()=>{},render:()=>{},refreshBadges:()=>{},$:(id)=>({textContent:''}),sb:{from:table=>({upsert:async p=>{calls.push(['upsert',table,p]);return {error:null};},update:p=>({eq:()=>({eq:async()=>{calls.push(['update',table,p]);return {error:null};}})})})}};
  vm.runInNewContext(`${block[1]};this.h={submitFingerprintRegistration,approveFingerprintRegistration};`,c);await c.h.submitFingerprintRegistration();assert.equal(calls[0][2].status,'요청');c.ME={id:'m1',role:'manager'};await c.h.approveFingerprintRegistration('u1');assert.equal(calls[1][2].status,'완료');const before=calls.length;await c.h.approveFingerprintRegistration('m1');assert.equal(calls.length,before);
});

test('G 로컬 migration은 지문 요청 상태·역할 경계와 rollback을 선언한다',()=>{
  assert.match(sql,/fingerprint_registration_requests/);assert.match(sql,/status in \('요청','완료','반려'\)/);assert.match(sql,/user_id<>auth\.uid\(\)/);assert.match(sql,/manager_id=auth\.uid\(\)/);assert.match(sql,/manager/);assert.match(rollback,/rollback blocked: fingerprint registration request data exists/);assert.match(rollback,/rollback blocked: onboarding seed rows exist/);assert.match(rollback,/delete from public\.onboarding_items/);assert.match(rollback,/drop table if exists public\.fingerprint_registration_requests/);for(const seed of ['병원 시설을 둘러보고 식당·출퇴근 기록 장치 등 기본 시설 사용법을 안내받는다.','조직도, 호칭, 기본 예절, 업무 분장, 근로계약과 복리후생 설명을 듣는다.','무전기를 지급받으면 담당자에게 사용법과 업무용 대화 범위를 확인한다.','소속 부서의 담당자, 보고 라인, 당일 교육 항목을 확인한다.','무전은 들었다는 뜻으로 최초 1회 응답한다.','진료실·데스크에서 큰 소리의 사담을 피하고, 환자 앞에서 치료계획 변경이나 내부 판단을 논의하지 않는다.','환자가 언제 어떻게 납부하기로 했는지, 비급여 차감 등 금액 관련 사항이 있으면 상담·데스크 기록을 일치시킨다.','대기시간과 환자 동선을 안내하고 접수 후 어디에서 기다리는지 분명히 설명한다.','컴플레인은 말을 끊지 않고 듣고, 담당자에게 즉시 보고한 뒤 단독으로 확정 약속하지 않는다.','신환은 구강포토와 상담 차트를 준비하고 지정 위치에 기록·스캔한다.','임플란트 식립 후 1차 내원은 s/o 또는 드레싱, 2차 내원은 3주 후, 3차 내원은 6주 후로 안내한다.','사용한 기구와 재료는 원래 위치에 정리하고 오픈·마감 시 정리 항목을 체크한다.','치료 후 다음 계획 또는 정기검진·불편 시 내원 등 후속 계획을 기록한다.']){assert.ok(sql.includes(`'${seed}'`),seed);assert.ok(rollback.includes(`'${seed}'`),seed);}assert.match(schema,/onboarding_items/);assert.match(policies,/onboarding_checks/);
});
