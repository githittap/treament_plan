const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const hr=fs.readFileSync('hr.html','utf8'),js=fs.readFileSync('hub-texts.js','utf8');
function block(name){return hr.match(new RegExp('/\\* '+name+':test-start \\*/([\\s\\S]*?)/\\* '+name+':test-end \\*/'))[1];}
test('P7 신입 안내는 ISQ 가능 조건과 장비 세 가지를 표시하고 원장 문장으로 바뀐다',()=>{
 const c={esc:s=>s};vm.runInNewContext(block('onboarding-guide')+';this.items=onboardingGuideItems;',c);
 assert.match(c.items().join('\n'),/6주 후.*ISQ.*가능/);
 assert.match(c.items().join('\n'),/체어·컴프레서·무전기/);
 c.hubText=(k,d)=>k==='onbo.guide.items'?'원장 안내':d;assert.deepEqual([...c.items()],['원장 안내']);
});
test('P7 실장·매니저 상태 지정은 본인·원장·차단 계정을 제외하고 삭제 단추를 노출하지 않는다',()=>{
 const c={PROFILES:[{user_id:'s',name:'직원'},{user_id:'o',role:'owner'},{user_id:'c',role:'chief'},{user_id:'b',account_access_status:'차단'}],ME:{id:'c',role:'chief'},esc:s=>s,hubT:(k,d)=>d,today:()=> '2026-10-03'};
 vm.runInNewContext(block('employment-lead')+';this.targets=employmentLeadTargets;this.panel=employmentLeadPanel;',c);
 assert.deepEqual([...c.targets(c.PROFILES,c.ME)].map(p=>p.user_id),['s']);assert.match(c.panel(),/setEmploymentStatus/);assert.doesNotMatch(c.panel(),/hardDelete|disableEmployeeAccount/);
 assert.deepEqual([...c.targets(c.PROFILES,{id:'m',role:'manager'})].map(p=>p.user_id),['s','c']);assert.equal(c.targets(c.PROFILES,{id:'s',role:'staff'}).length,0);
});
test('P7 상태 저장 단추의 실제 함수는 상태·날짜·사유를 RPC로 보내고 새로고침한다',async()=>{
 const source=hr.match(/async function setEmploymentStatus\(uid\)\{[\s\S]*?\n\}/)[0],calls=[],errors=[],fields={'#employment-u-status':{value:'권고사직'},'#employment-u-effective':{value:'2026-10-03'},'#employment-u-reason':{value:'사유'}};
 const c={ME:{role:'chief'},$:s=>fields[s],hubT:(k,d)=>d,setStatus:s=>calls.push(s),showScheduleRosterError:m=>errors.push(m),sb:{rpc:async(name,payload)=>{calls.push({name,payload});return {error:null};}},loadProfiles:async()=>calls.push('profiles'),loadSchedulePeople:async()=>calls.push('roster'),render:()=>calls.push('render')};
 vm.runInNewContext(source+';this.save=setEmploymentStatus;',c);await c.save('u');
 const rpc=calls.find(x=>x&&x.name);assert.equal(rpc.name,'set_employment_status');assert.deepEqual(JSON.parse(JSON.stringify(rpc.payload)),{p_user_id:'u',p_employment_status:'권고사직',p_effective_date:'2026-10-03',p_reason:'사유'});assert.ok(calls.includes('profiles')&&calls.includes('roster')&&calls.includes('render'));
 calls.length=0;c.ME.role='staff';await c.save('u');assert.equal(calls.length,0);assert.match(errors.pop(),/권한/);
 c.ME.role='manager';c.sb.rpc=async()=>({error:{message:'서버 거절'}});await c.save('u');assert.ok(!calls.includes('render'));assert.match(errors.pop(),/서버 거절/);
});
test('P7 알림 40칸·매뉴얼 4주소는 설정으로 저장하며 실패하면 메모리를 바꾸지 않는다',async()=>{
 const c={};vm.runInNewContext(js.match(/\/\* hub-texts:test-start \*\/([\s\S]*?)\/\* hub-texts:test-end \*\//)[1]+';this.h={hubNotifyEnabled,hubNotifyWrite,hubManualWrite,hubP7SettingsHtml,hubSetting,hubSettingSetValues,hubTextDefs};',c);const h=c.h;
 assert.equal(h.hubNotifyEnabled('inquiry','chief'),false);assert.equal(h.hubNotifyEnabled('leave_request','chief'),true);
 assert.equal((h.hubP7SettingsHtml().match(/data-hub-notify=/g)||[]).length,40);assert.equal((h.hubP7SettingsHtml().match(/data-hub-manual=/g)||[]).length,4);
 const calls=[],sb={from:table=>({upsert:async row=>{calls.push({table,row});return {error:null};}})};
 assert.equal((await h.hubNotifyWrite(sb,'notify.inquiry.chief',true)).ok,true);assert.equal(h.hubNotifyEnabled('inquiry','chief'),true);
 assert.equal((await h.hubNotifyWrite(sb,'notify.leave_request.chief',false)).ok,true);assert.equal(h.hubNotifyEnabled('leave_request','chief'),false);
 assert.equal((await h.hubNotifyWrite(sb,'role.owner',true)).ok,false);
 assert.equal((await h.hubManualWrite(sb,'lab','https://lab.example/')).ok,true);assert.equal(h.hubSetting('manual.url.lab',''),'https://lab.example/');
 assert.equal((await h.hubManualWrite(sb,'lab','')).ok,true);assert.equal(h.hubSetting('manual.url.lab',''),'');
 assert.equal((await h.hubManualWrite(sb,'lab','javascript:bad')).ok,false);
 const fail={from:()=>({upsert:async()=>({error:{message:'offline'}})})};assert.equal((await h.hubNotifyWrite(fail,'notify.inquiry.chief',false)).ok,false);assert.equal(h.hubNotifyEnabled('inquiry','chief'),true);
 assert.ok(calls.every(x=>x.table==='app_settings'));
});
test('P7 직무별 주소는 비어 있으면 기존 공용 카드, 지정하면 해당 직무 카드만 변경한다',()=>{
 const c={hubSetting:(k,d)=>c.settings[k]??d,settings:{}};vm.runInNewContext(block('work-documents')+';this.docs=workDocumentsForProfile;',c);
 const docs=[{title:'공용',manual:true,depts:['진료실','상담'],url:'https://common.example/'},{title:'일반',url:'https://other.example/'}];
 assert.equal(c.docs(docs,{job_group:'clinical_consult'})[0].url,'https://common.example/');
 c.settings['manual.url.lab']='https://lab.example/';
 const lab=c.docs(docs,{job_group:'lab',dept:'진료실'});assert.equal(lab[0].url,'https://lab.example/');assert.equal(lab[0].title,'업무 매뉴얼');assert.equal(lab[1].title,'일반');
 assert.equal(c.docs(docs,{job_group:'clinical_consult'})[0].url,'https://common.example/');
 c.settings['manual.url.lab']='javascript:alert(1)';assert.deepEqual([...c.docs(docs,{job_group:'lab'})].map(x=>x.title),['일반']);
 c.settings['manual.url.desk']='https://desk.example/';assert.equal(c.docs(docs,{dept:'데스크'})[0].url,'https://desk.example/');
 assert.equal(docs[0].url,'https://common.example/','공용 카드 원본 보존');
});
