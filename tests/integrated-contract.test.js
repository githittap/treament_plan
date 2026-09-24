const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('hr.html','utf8');
const sql=fs.readFileSync('db/integrated_contract_three_signatures_draft.sql','utf8');
const edge=fs.readFileSync('supabase/functions/contract-pdf-sign/index.ts','utf8');
const block=html.match(/\/\* integrated-contract:test-start \*\/([\s\S]*?)\/\* integrated-contract:test-end \*\//);
assert.ok(block);

test('직원허브 인라인 스크립트 구문이 유효하다',()=>{
  for(const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1]);
});

function helpers(dirty){
  const canvases=new Map(['employment','medical','privacy'].map(part=>[part,{dataset:{dirty:dirty[part]?'true':'false',signatureId:part==='medical'?'7':''},toDataURL:()=>`png-${part}`} ]));
  const context={document:{querySelector:selector=>canvases.get(selector.match(/data-contract-signature="1-([a-z]+)"/)?.[1])||null}};
  vm.runInNewContext(`${block[1]};this.h={integratedContract,integratedContractReady,integratedContractPayload};`,context);
  return context.h;
}

test('세 서명 가운데 하나라도 비어 있으면 완료할 수 없다',()=>{
  const full={employment:true,medical:true,privacy:true};
  assert.equal(helpers(full).integratedContractReady(1),true);
  for(const part of Object.keys(full))assert.equal(helpers({...full,[part]:false}).integratedContractReady(1),false,part);
  assert.equal(helpers(full).integratedContract({merged_html:'<span data-sign-slot="employment"></span><span data-sign-slot="medical"></span><span data-sign-slot="privacy"></span>'}),true);
  assert.equal(helpers(full).integratedContract({merged_html:'<span data-sign-slot="employee"></span>'}),false);
});

test('각 구역 서명은 독립 payload로 전송하고 보관 서명 ID도 해당 구역에만 붙는다',()=>{
  const value=JSON.parse(JSON.stringify(helpers({employment:true,medical:true,privacy:true}).integratedContractPayload(1)));
  assert.deepEqual(value.map(row=>row.part),['employment','medical','privacy']);
  assert.deepEqual(value.map(row=>row.signature_png),['png-employment','png-medical','png-privacy']);
  assert.deepEqual(value.map(row=>row.signature_id),[null,7,null]);
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

test('통합 계약 완료는 서버의 3건 원자적 기록과 PDF 세 위치를 거친다',()=>{
  assert.match(html,/apply_integrated_contract_signatures/);
  assert.match(html,/id="contractComplete-\$\{row\.id\}" disabled/);
  assert.match(html,/confirm\('근로계약·의료정보 보안·개인정보 취급자 서약/);
  assert.match(sql,/create constraint trigger integrated_contract_parts_complete[\s\S]*deferrable initially deferred/);
  assert.match(sql,/if jsonb_typeof\(p_signatures\) is distinct from 'array' or jsonb_array_length\(p_signatures\)<>3/);
  assert.match(sql,/integrated contract requires three independent signatures/);
  assert.match(edge,/for \(const entry of entries\)[\s\S]*page\.drawImage/);
  assert.match(edge,/record_integrated_contract_pdf_signatures/);
});
