const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const hr=fs.readFileSync('hr.html','utf8'),js=fs.readFileSync('hub-texts.js','utf8');
function block(name){return hr.match(new RegExp('/\\* '+name+':test-start \\*/([\\s\\S]*?)/\\* '+name+':test-end \\*/'))[1];}
test('P7 신입 안내는 ISQ 가능 조건과 장비 세 가지를 표시하고 원장 문장으로 바뀐다',()=>{
 const c={esc:s=>s};vm.runInNewContext(block('onboarding-guide')+';this.items=onboardingGuideItems;',c);
 assert.match(c.items().join('\n'),/6주 후.*ISQ.*가능/);
 assert.match(c.items().join('\n'),/체어·컴프레서·무전기/);
 c.hubText=(k,d)=>k==='onbo.guide.items'?'원장 안내':d;assert.deepEqual([...c.items()],['원장 안내']);
});
test('P7 직무별 주소는 비어 있으면 기존 공용 카드, 지정하면 해당 직무 카드만 변경한다',()=>{
 const c={hubSetting:(k,d)=>c.settings[k]??d,settings:{}};vm.runInNewContext(block('work-documents')+';this.docs=workDocumentsForProfile;',c);
 const docs=[{title:'공용',manual:true,depts:['진료실','상담'],url:'https://common.example/'},{title:'일반',url:'https://other.example/'}];
 assert.equal(c.docs(docs,{job_group:'clinical_consult'})[0].url,'https://common.example/');
 c.settings['manual.url.lab']='https://lab.example/';
 const lab=c.docs(docs,{job_group:'lab',dept:'진료실'});assert.equal(lab[0].url,'https://lab.example/');assert.equal(lab[1].title,'일반');
 assert.equal(c.docs(docs,{job_group:'clinical_consult'})[0].url,'https://common.example/');
 c.settings['manual.url.lab']='javascript:alert(1)';assert.deepEqual([...c.docs(docs,{job_group:'lab'})].map(x=>x.title),['일반']);
 c.settings['manual.url.desk']='https://desk.example/';assert.equal(c.docs(docs,{dept:'데스크'})[0].url,'https://desk.example/');
 assert.equal(docs[0].url,'https://common.example/','공용 카드 원본 보존');
});
