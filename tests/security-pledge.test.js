const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {edgeSigningAttempt,signaturePng,pngChunk}=require('./contract-pdf-sign-edge-helper.cjs');

test('Edge는 서약 미서명·확인 누락·다른 직원·단계 서명 바꿔치기에서 PDF를 만들지 않는다',async()=>{
  for(const options of [
    {pledge:null},{pledge:{signed_at:null}},{pledge:{read_confirmed:false}},
    {pledge:{rules_confirmed:false}},{pledge:{user_id:'other-user'}},{pledge:{staged_at:'2026-10-02'}},{tamperSignature:true},
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

test('서약을 먼저 완료해야 마지막 계약 서명이 열린다',()=>{
  const html=fs.readFileSync('hr.html','utf8');
  assert.match(html,/stageContractPledge\(row,signatures\)/);
  assert.match(html,/await renderSecurityPledgeDocuments\(m\)/);
  const source=fs.readFileSync('security-pledge.js','utf8');
  assert.match(source,/stage_contract_pledge_signatures/);
  assert.match(source,/submit_contract_security_pledge/);
  assert.match(source,/pledge\.signed_at/);
  assert.match(html,/contractPledgeReady\(r\)/);
  assert.match(html,/contractPledgeCard\(r\)/);
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
    assert.equal(r.pageOrder[0],'pledge');assert.equal(r.pageOrder.at(-1),'contract');
    assert.equal(r.rpcCalls.at(-1).name,integrated?'record_integrated_contract_pdf_signatures':'record_contract_pdf_signature_with_use');
  }
});

test('계약 서명 직전 미리 검사는 서약 뒤 실제 페이지·경계·PNG를 검사하고 완료본을 저장하지 않는다',async()=>{
  for(const integrated of [false,true]){
    const valid=await edgeSigningAttempt(undefined,integrated,{pledgeRequired:true,validate:true});
    assert.equal(valid.status,200,JSON.stringify(valid.response));
    assert.equal(valid.response.validated,true);
    assert.deepEqual(valid.rpcCalls.map(c=>c.name),['validate_contract_pledge_pdf']);
    assert.equal(valid.uploadedBytes,null);
    for(const change of [{page_no:999},{x:999999}]){
      const base=valid.body.coordinates.map(c=>({...c,...change}));
      const bad=await edgeSigningAttempt(undefined,integrated,{pledgeRequired:true,validate:true,body:{coordinates:base}});
      assert.equal(bad.status,400);assert.equal(bad.rpcCalls.length,0);assert.equal(bad.uploadedBytes,null);
    }
    const png=await edgeSigningAttempt(undefined,integrated,{pledgeRequired:true,validate:true,invalidImage:true});
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

test('서약 이미지 검사 뒤 서약만 저장하며 계약 서명은 실행하지 않는다',async()=>{
  const calls=[],pledge={contract_id:1,version:'v1'},canvas={dataset:{dirty:'true'},toDataURL:()=> 'data:image/png;base64,fixture'},button={disabled:false};
  const context={hubText:(_k,d)=>d,CONTRACT_ROWS:[{id:1,status:'대기',source_pdf_path:'contracts/1/source.pdf'}],document:{querySelector:s=>s.includes('data-pledge-signature')?canvas:s.includes('pledgeSubmit')?button:s.includes('pledgeMsg')?{textContent:''}:{checked:true}},sb:{rpc:async(name)=>{calls.push(name);return {data:{...pledge,signed_at:'fixture'},error:null};},functions:{invoke:async(_name,{body})=>{calls.push(body.action);return {data:{validated:true},error:null};}}},setStatus:()=>{},render:async()=>{}};
  vm.runInNewContext(fs.readFileSync('security-pledge.js','utf8')+';P9_PLEDGES.set(1,'+JSON.stringify(pledge)+');',context);
  await context.submitSecurityPledge(1);assert.deepEqual(calls,['validate_pledge_signature','submit_contract_security_pledge']);
});

test('서약 PNG 청크·CRC·끝·압축 디코딩 실패는 검증 증명을 저장하지 않는다',async()=>{
  const bytes=Buffer.from(signaturePng.split(',')[1],'base64'),crc=Buffer.from(bytes);crc[29]^=1;
  const idat=Buffer.concat([bytes.subarray(0,33),pngChunk('IDAT',Buffer.from('bad-zlib')),pngChunk('IEND',Buffer.alloc(0))]);
  for(const broken of [Buffer.concat([bytes.subarray(0,8),Buffer.alloc(120)]),bytes.subarray(0,33),crc,Buffer.concat([bytes,Buffer.from([0])])]){
    const result=await edgeSigningAttempt(undefined,false,{validateSignature:true,signaturePng:'data:image/png;base64,'+broken.toString('base64')});
    assert.equal(result.status,400);assert.equal(result.rpcCalls.length,0);assert.equal(result.uploadedBytes,null);
  }
  const invalid=await edgeSigningAttempt(undefined,false,{validateSignature:true,signaturePng:'data:image/png;base64,'+idat.toString('base64'),invalidImage:true});
  assert.equal(invalid.status,400);assert.equal(invalid.rpcCalls.length,0);
  const valid=await edgeSigningAttempt(undefined,false,{validateSignature:true});
  assert.equal(valid.status,200,JSON.stringify(valid.response));assert.deepEqual(valid.rpcCalls.map(c=>c.name),['validate_contract_security_pledge_signature']);
  assert.equal(valid.uploadedBytes,null);
});

test('잘못된 확정 서약만 교체할 수 있고 다른 직원과 정상 서약은 거절한다',async()=>{
  const bad='data:image/png;base64,'+Buffer.alloc(128).toString('base64');
  const fixed=await edgeSigningAttempt(undefined,false,{validateSignature:true,recover:true,pledge:{signature_png:bad}});
  assert.equal(fixed.status,200,JSON.stringify(fixed.response));assert.equal(fixed.rpcCalls[0].params.p_previous_signature_png,bad);assert.equal(fixed.rpcCalls[0].params.p_previous_invalid,true);
  for(const pledge of [{signature_png:signaturePng},{signature_png:bad,user_id:'someone-else'}]){
    const denied=await edgeSigningAttempt(undefined,false,{validateSignature:true,recover:true,pledge});
    assert.equal(denied.status,400);assert.equal(denied.rpcCalls.length,0);
  }
});
test('서약 카드 준비 상태는 서명과 두 확인 모두 필요하다',()=>{
  const context={};vm.runInNewContext(fs.readFileSync('security-pledge.js','utf8'),context);
  for(const p of [null,{signed_at:null},{signed_at:'fixture',read_confirmed:false,rules_confirmed:true},{signed_at:'fixture',read_confirmed:true,rules_confirmed:false}]){
    vm.runInNewContext('P9_PLEDGES.set(1,'+JSON.stringify(p)+')',context);assert.equal(context.contractPledgeReady({id:1,pledge_required:true}),false);
  }
  vm.runInNewContext('P9_PLEDGES.set(1,{signed_at:"fixture",read_confirmed:true,rules_confirmed:true})',context);assert.equal(context.contractPledgeReady({id:1,pledge_required:true}),true);
});

test('기한 지난 계약은 Edge 계약 서명과 좌표 검사 모두 거절한다',async()=>{
  for(const integrated of [false,true])for(const validate of [false,true]){
    const r=await edgeSigningAttempt(undefined,integrated,{pledgeRequired:true,validate,preflight:{due_at:'2000-01-01'}});
    assert.equal(r.status,400);assert.equal(r.rpcCalls.length,0);assert.equal(r.uploadedBytes,null);
  }
});
