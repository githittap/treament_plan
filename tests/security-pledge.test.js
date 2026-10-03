const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {edgeSigningAttempt}=require('./contract-pdf-sign-edge-helper.cjs');

test('Edge는 서약 미서명·확인 누락·다른 직원·단계 서명 바꿔치기에서 PDF를 만들지 않는다',async()=>{
  for(const options of [
    {pledge:null},{pledge:{signed_at:null}},{pledge:{read_confirmed:false}},
    {pledge:{rules_confirmed:false}},{pledge:{user_id:'other-user'}},{tamperSignature:true},
  ]){
    const r=await edgeSigningAttempt(undefined,true,{pledgeRequired:true,...options});
    assert.equal(r.status,400);
    assert.equal(r.rpcCalls.length,0);
    assert.equal(r.uploadedBytes,null);
  }
});

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

test('단일·통합 PDF 계약 모두 서약 페이지를 붙이고 각 기록 함수로 완료한다',async()=>{
  for(const integrated of [false,true]){
    const r=await edgeSigningAttempt(undefined,integrated,{pledgeRequired:true});
    assert.equal(r.status,200,JSON.stringify(r.response));
    assert.ok(r.appendedPages>0);
    assert.equal(r.rpcCalls.at(-1).name,integrated?'record_integrated_contract_pdf_signatures':'record_contract_pdf_signature_with_use');
  }
});

test('PDF 미리 검사는 서약 서명 전 실제 페이지·경계·PNG를 검사하고 완료본을 만들지 않는다',async()=>{
  for(const integrated of [false,true]){
    const valid=await edgeSigningAttempt(undefined,integrated,{pledgeRequired:true,pledge:{signed_at:null},validate:true});
    assert.equal(valid.status,200,JSON.stringify(valid.response));
    assert.equal(valid.response.validated,true);
    assert.deepEqual(valid.rpcCalls.map(c=>c.name),['validate_contract_pledge_pdf']);
    assert.equal(valid.uploadedBytes,null);
    for(const change of [{page_no:999},{x:999999}]){
      const base=valid.body.coordinates.map(c=>({...c,...change}));
      const bad=await edgeSigningAttempt(undefined,integrated,{pledgeRequired:true,pledge:{signed_at:null},validate:true,body:{coordinates:base}});
      assert.equal(bad.status,400);assert.equal(bad.rpcCalls.length,0);assert.equal(bad.uploadedBytes,null);
    }
    const png=await edgeSigningAttempt(undefined,integrated,{pledgeRequired:true,pledge:{signed_at:null},validate:true,invalidImage:true});
    assert.equal(png.status,400);assert.equal(png.rpcCalls.length,0);
  }
});

test('서약 서명 뒤 좌표를 고쳐 미리 검사할 때 기존 서명을 보존한다',async()=>{
  const r=await edgeSigningAttempt(undefined,false,{pledgeRequired:true,validate:true,body:{coordinates:[{part:'employment',page_no:1,x:90,y:72,width:150,height:50}]}});
  assert.equal(r.status,200,JSON.stringify(r.response));
  assert.equal(r.rpcCalls[0].params.p_coordinates[0].x,90);assert.equal(r.uploadedBytes,null);
});

test('서약 완료 PDF 재시도는 기존 파일 해시가 같을 때만 기록한다',async()=>{
  for(const integrated of [false,true]){
    const same=await edgeSigningAttempt(undefined,integrated,{pledgeRequired:true,uploadConflict:true});
    assert.equal(same.status,200,JSON.stringify(same.response));assert.equal(same.rpcCalls.length,2);
    const different=await edgeSigningAttempt(undefined,integrated,{pledgeRequired:true,uploadConflict:true,existingPdfMismatch:true});
    assert.equal(different.status,400);assert.match(different.response.error,/existing signed PDF differs/);
    assert.equal(different.rpcCalls.length,1);
  }
});
