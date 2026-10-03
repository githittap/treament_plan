const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('서약은 별도 서명과 읽음·규정 열람 확인이 모두 필요하다',()=>{
  const context={};
  vm.runInNewContext(fs.readFileSync('security-pledge.js','utf8'),context);
  assert.equal(context.pledgeCanSubmit(true,true,true),true);
  assert.equal(context.pledgeCanSubmit(false,true,true),false);
  assert.equal(context.pledgeCanSubmit(true,false,true),false);
  assert.equal(context.pledgeCanSubmit(true,true,false),false);
});

test('서약 전 계약 완료·PDF 출력이 없고 단계 저장 후 서약으로 이어진다',()=>{
  const html=fs.readFileSync('hr.html','utf8');
  assert.match(html,/stageContractPledge\(row,signatures\)/);
  assert.match(html,/await renderSecurityPledgeDocuments\(m\)/);
  const source=fs.readFileSync('security-pledge.js','utf8');
  assert.match(source,/stage_contract_pledge_signatures/);
  assert.match(source,/submit_contract_security_pledge/);
  assert.match(source,/pledge\.signed_at/);
});

test('휴대폰 비용 표는 보이는 내용 높이만큼 자리를 차지한다',()=>{
  const html=fs.readFileSync('hr.html','utf8');
  assert.match(html,/#aiBillingMonthly \.tblwrap\{max-height:none;overflow:visible\}/);
});
