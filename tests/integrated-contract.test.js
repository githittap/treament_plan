const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {edgeSigningAttempt}=require('./contract-pdf-sign-edge-helper.cjs');

const html=fs.readFileSync('hr.html','utf8');
const sql=fs.readFileSync('db/integrated_contract_three_signatures_draft.sql','utf8');
const edge=fs.readFileSync('supabase/functions/contract-pdf-sign/index.ts','utf8');
const block=html.match(/\/\* integrated-contract:test-start \*\/([\s\S]*?)\/\* integrated-contract:test-end \*\//);
assert.ok(block);

test('직원허브 인라인 스크립트 구문이 유효하다',()=>{
  for(const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1]);
});

function helpers(dirty,confirmed=dirty){
  const canvases=new Map(['employment','medical','privacy'].map(part=>[part,{dataset:{dirty:dirty[part]?'true':'false',confirmed:confirmed[part]?'true':'false',signatureId:part==='medical'?'7':''},toDataURL:()=>`png-${part}`} ]));
  const context={document:{querySelector:selector=>canvases.get(selector.match(/data-contract-signature="1-([a-z]+)"/)?.[1])||null}};
  vm.runInNewContext(`${block[1]};this.h={integratedContract,integratedContractReady,integratedContractPayload};`,context);
  return context.h;
}

test('세 서명 가운데 하나라도 비어 있으면 완료할 수 없다',()=>{
  const full={employment:true,medical:true,privacy:true};
  assert.equal(helpers(full).integratedContractReady(1),true);
  for(const part of Object.keys(full))assert.equal(helpers({...full,[part]:false}).integratedContractReady(1),false,part);
  for(const part of Object.keys(full))assert.equal(helpers(full,{...full,[part]:false}).integratedContractReady(1),false,`${part} 확인 없음`);
  assert.equal(helpers(full).integratedContract({merged_html:'<span data-sign-slot="employment"></span><span data-sign-slot="medical"></span><span data-sign-slot="privacy"></span>'}),true);
  assert.equal(helpers(full).integratedContract({merged_html:'<span data-sign-slot="employee"></span>'}),false);
});

test('각 구역 서명은 독립 payload로 전송하고 보관 서명 ID도 해당 구역에만 붙는다',()=>{
  const value=JSON.parse(JSON.stringify(helpers({employment:true,medical:true,privacy:true}).integratedContractPayload(1)));
  assert.deepEqual(value.map(row=>row.part),['employment','medical','privacy']);
  assert.deepEqual(value.map(row=>row.signature_png),['png-employment','png-medical','png-privacy']);
  assert.deepEqual(value.map(row=>row.signature_id),[null,7,null]);
  assert.deepEqual(value.map(row=>row.confirmed),[true,true,true]);
});

test('보안서약 체크리스트는 본인 계약 세 서명 완료 또는 서약서 파일로 충족된다',()=>{
  const evidence=html.match(/\/\* onboarding-evidence:test-start \*\/([\s\S]*?)\/\* onboarding-evidence:test-end \*\//);
  assert.ok(evidence);
  const c={};vm.runInNewContext(`${evidence[1]};this.done=onboardingEvidenceComplete;`,c);
  const slots=['employment','medical','privacy'].map(part=>({part,signed:true}));
  assert.equal(c.done('보안서약',{},[],[{user_id:'a',status:'서명완료',sign_slots:slots}],'a'),true);
  assert.equal(c.done('보안서약',{},[],[{user_id:'b',status:'서명완료',sign_slots:slots}],'a'),false);
  assert.equal(c.done('보안서약',{},[],[{user_id:'a',status:'대기',sign_slots:slots}],'a'),false);
  assert.equal(c.done('보안서약',{},[],[{user_id:'a',status:'서명완료',sign_slots:slots.slice(0,2)}],'a'),false);
  assert.equal(c.done('보안서약',{},[{document_type:'보안서약서'}],[],'a'),true);
});

test('서로 다른 원본의 기간·임금은 직원별 입력으로 남고 공용 숫자로 고정되지 않는다',()=>{
  const terms=html.match(/\/\* contract-integrated-terms:test-start \*\/([\s\S]*?)\/\* contract-integrated-terms:test-end \*\//);
  assert.ok(terms);
  const c={esc:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;')};
  vm.runInNewContext(`${terms[1]};this.h={contractWageHtml,fixedTermClause};`,c);
  const result=c.h.contractWageHtml({기본급:'2,000,000',기본급산정시간:'209',식대:'',포괄연차수당:'80,000',포괄연차시간:'8'});
  assert.match(result,/기본급 \(산정: 209\)/);assert.match(result,/포괄연차수당 \(산정: 8\)/);
  assert.doesNotMatch(result,/식대/);
  assert.equal(c.h.fixedTermClause({계약종료:'기간의 정함 없음'}),'');
  assert.match(c.h.fixedTermClause({계약종료:'2026-12-31'}),/기간 만료/);
  assert.match(sql,/사직서제출기한[\s\S]*'3주 전','4주 전'/);
  assert.match(sql,/퇴직임금지급기준/);
  assert.doesNotMatch(sql,/27,216,720|2,268,060|3,165,680/);
});

test('통합 계약 완료는 서버의 3건 원자적 기록과 PDF 세 위치를 거친다',()=>{
  assert.match(html,/apply_integrated_contract_signatures/);
  assert.match(html,/id="contractComplete-\$\{row\.id\}" disabled/);
  assert.match(html,/confirm\('근로계약·의료정보 보안·개인정보 취급자 서약/);
  assert.match(sql,/create constraint trigger integrated_contract_parts_complete[\s\S]*deferrable initially deferred/);
  assert.match(sql,/if jsonb_typeof\(p_signatures\) is distinct from 'array' or jsonb_array_length\(p_signatures\)<>3/);
  assert.match(sql,/integrated contract requires three independent signatures/);
  assert.match(sql,/old\.integrated_signature_required/);
  assert.match(sql,/each contract part must be confirmed/);
  assert.match(html,/data-contract-confirm="\$\{row\.id\}-\$\{part\}"/);
  assert.match(edge,/for \(const entry of entries\)[\s\S]*page\.drawImage/);
  assert.match(edge,/record_integrated_contract_pdf_signatures/);
});

test('Edge는 세 구역 확인을 검증하고 실제 PDF 기록 RPC에 전달한다',async()=>{
  const success=await edgeSigningAttempt();
  assert.equal(success.status,200);
  assert.deepEqual(success.rpcCalls.map(call=>call.name),['begin_contract_pdf_signing','record_integrated_contract_pdf_signatures']);
  const signatures=success.rpcCalls[1].params.p_signatures;
  assert.deepEqual(signatures.map(row=>row.part),['employment','medical','privacy']);
  assert.deepEqual(signatures.map(row=>row.confirmed),[true,true,true]);
  assert.ok(signatures.every(row=>/^[0-9a-f]{64}$/.test(row.signature_hash)));
  for(const value of [false,undefined,'true']){
    const attempt=await edgeSigningAttempt([true,value,true]);
    assert.equal(attempt.status,400);
    assert.match(attempt.response.error,/each contract part must be confirmed/);
    assert.equal(attempt.rpcCalls.length,0);
  }
  const legacy=await edgeSigningAttempt([],false);
  assert.equal(legacy.status,200);
  assert.deepEqual(legacy.rpcCalls.map(call=>call.name),['begin_contract_pdf_signing','record_contract_pdf_signature_with_use']);
  assert.equal(legacy.rpcCalls[1].params.p_signatures,undefined);
});

test('employee sees signed integrated HTML read-only while pending and legacy contract views stay intact',async()=>{
  const render=html.match(/async function renderContractEmployee\(m,options=\{\}\)\{[\s\S]*?(?=async function renderContract\(m\))/)?.[0];assert.ok(render);
  const rows=[
    {id:'signed-integrated',status:'\uC11C\uBA85\uC644\uB8CC',merged_html:'<article>signed body <img alt="signature" src="sig.png"></article>'},
    {id:'pending-integrated',status:'\uB300\uAE30',merged_html:'<span data-sign-slot="employment"></span><span data-sign-slot="medical"></span><span data-sign-slot="privacy"></span>'},
    {id:'signed-legacy',status:'\uC11C\uBA85\uC644\uB8CC',merged_html:'<article>legacy signed body</article>'},
    {id:'pending-legacy',status:'\uB300\uAE30',merged_html:'<article>legacy pending body</article>'}
  ];
  const makeQuery=table=>{const result=table==='contracts'?{data:rows,error:null}:{data:[],error:null};const q={select(){return q;},eq(){return q;},order(){return q;},then(resolve,reject){return Promise.resolve(result).then(resolve,reject);}};return q;};
  const c={sb:{from:makeQuery},ME:{id:'staff'},CONTRACT_ROWS:[],CONTRACT_TEMPLATES:[],CONTRACT_SHOW_CANCELLED:false,esc:v=>String(v??''),contractVisibleRows:r=>r,contractExpired:()=>false,contractTitle:r=>r.id,contractStatusClass:()=>'',contractDisplayStatus:r=>r.status,contractDate:()=>'',integratedContractPage:()=>'<canvas data-contract-signature="pending"></canvas><button id="contractComplete-pending">sign</button>',initContractSignatures(){},autoLoadStoredContractSignatures(){}};
  vm.createContext(c);vm.runInContext(block[1]+';'+render+';this.render=renderContractEmployee;',c);const target={innerHTML:''};await c.render(target);
  const signedStart=target.innerHTML.indexOf('id="integratedContract-signed-integrated"'),pendingStart=target.innerHTML.indexOf('id="integratedContract-pending-integrated"',signedStart),signedIntegrated=target.innerHTML.slice(signedStart,pendingStart);
  assert.ok(signedStart>=0&&pendingStart>signedStart);assert.match(signedIntegrated,/<div class="contract-doc"[\s\S]*signed body[\s\S]*signature/);assert.doesNotMatch(signedIntegrated,/data-contract-signature|contractComplete-|saveContractSignature/);
  assert.match(target.innerHTML,/id="integratedContract-pending-integrated"[\s\S]*data-contract-signature/);assert.match(target.innerHTML,/id="integratedContract-signed-legacy"[\s\S]*legacy signed body/);assert.match(target.innerHTML,/id="integratedContract-pending-legacy"[\s\S]*legacy pending body[\s\S]*data-contract-signature/);
});
