const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),hr=fs.readFileSync(path.join(root,'hr.html'),'utf8'),texts=fs.readFileSync(path.join(root,'hub-texts.js'),'utf8');
const hub3=require('./fixtures/hub3-harness.cjs');
test('근무일 안내 기본 글은 날짜 형식을 중복 표기하지 않는다',()=>{
  assert.ok(hr.includes("hubT('att.issue.p_date','소명할 근무일')"));
  assert.ok(texts.includes("'소명할 근무일'"));
  assert.ok(!hr.includes('소명할 근무일 (YYYY-MM-DD):'));
});
function helpers(){const block=hr.match(/\/\* attendance-issue-form:test-start \*\/[\s\S]*?\/\* attendance-issue-form:test-end \*\//)?.[0];assert.ok(block);const c={hubList:(key,def)=>def};vm.createContext(c);vm.runInContext(block+';this.h={attendanceIssueFormProblem,attendanceIssueStaffReason,attendanceIssueKindLabel,attendanceIssueInitialRpc,attendanceIssueUnlinkedUploads,attendanceIssueFailedFileCount};',c);return c.h;}
const draft=(overrides={})=>({workDate:'2026-10-02',kind:'기타',reason:'기기가 꺼져 있어 출근 기록이 남지 않았습니다.',files:[],existingCount:0,reasonMin:10,evidenceMax:5,evidenceRequired:true,...overrides});
function saveHarness({rpcImpl,uploadImpl=async()=>({}),removeImpl=async()=>({})}){
  const fn=hr.slice(hr.indexOf('async function submitAttendanceIssueForm(){'),hr.indexOf('\n}',hr.indexOf('async function submitAttendanceIssueForm(){'))+2),close=hr.slice(hr.indexOf('function closeAttendanceIssueForm(){'),hr.indexOf('\n}',hr.indexOf('function closeAttendanceIssueForm(){'))+2),open=hr.slice(hr.indexOf('async function openIssue('),hr.indexOf('\n}',hr.indexOf('async function openIssue('))+2),els={attIssueFormMsg:{textContent:''},attIssueSaveBtn:{disabled:false},attIssueCloseBtn:{},attIssueFormTitle:{},attIssueFormBody:{},attIssueFiles:{files:[{name:'proof.pdf',type:'application/pdf',size:100}],value:''},attIssueDate:{value:'2026-10-02'},attIssueKind:{value:'기타'},attIssueReason:{value:'기기가 꺼져 있어 출근 기록이 남지 않았습니다.'}},calls={rpc:[],rpcArgs:[],upload:[],remove:[],hide:0},timers=[],h=helpers();
  let uuid=0;const c={ATT_ISSUE_FORM:{mode:'new',issue:null,existingFiles:[],presetDate:null,busy:false},ATT_ISSUE_EVIDENCE:{},ME:{id:'u1'},$:(id)=>els[id.slice(1)]||null,hubN:(k,d)=>d,hubT:(k,d,args)=>args?d.replace('{n}',args.n).replace('{detail}',args.detail||''):d,setStatus(){},refreshBadges:async()=>{},renderNav(){},...h,crypto:{randomUUID:()=>`${String(++uuid).padStart(8,'0')}-1234-1234-1234-000000000000`},setTimeout:(f)=>timers.push(f),hide(){},render(){},Date,console, sb:{rpc:async(name,args)=>{calls.rpc.push(name);calls.rpcArgs.push(args);return rpcImpl(name,args);},storage:{from:()=>({upload:async(...a)=>{calls.upload.push(a);return uploadImpl(...a);},remove:async(a)=>{calls.remove.push(a);return removeImpl(a);}})}}};
  vm.createContext(c);vm.runInContext(fn+'\n'+close+'\n'+open+';this.run=submitAttendanceIssueForm;this.close=closeAttendanceIssueForm;this.open=openIssue;',c);c.hide=()=>calls.hide++;return {c,els,calls,timers,run:c.run,close:c.close,open:c.open};
}

test('소명 양식 필수 입력·글자 수·종류·날짜 검사를 한다',()=>{
  const h=helpers();assert.equal(h.attendanceIssueFormProblem(draft({evidenceRequired:false})),'');
  assert.equal(h.attendanceIssueFormProblem(draft({workDate:''})),'date');
  assert.equal(h.attendanceIssueFormProblem(draft({workDate:'2026-99-99'})),'date');
  assert.equal(h.attendanceIssueFormProblem(draft({kind:'자동'})),'kind');
  assert.equal(h.attendanceIssueFormProblem(draft({reason:'짧음'})),'reason');
  assert.equal(h.attendanceIssueFormProblem(draft({reason:'가'.repeat(1001)})),'reason');
  assert.equal(h.attendanceIssueFormProblem(draft({files:[{type:'text/plain',size:100}]})),'type');
  assert.equal(h.attendanceIssueFormProblem(draft({files:[{type:'application/pdf',size:10485761}]})),'size');
  assert.equal(h.attendanceIssueFormProblem(draft({files:[{type:'application/pdf',size:10485760}],evidenceRequired:false})),'' );
});

test('증거 필수 설정과 기존+새 파일 최대 개수를 함께 계산한다',()=>{
  const h=helpers();assert.equal(h.attendanceIssueFormProblem(draft()),'required');
  assert.equal(h.attendanceIssueFormProblem(draft({evidenceRequired:false})),'');
  assert.equal(h.attendanceIssueFormProblem(draft({existingCount:4,files:[{type:'application/pdf',size:100}]})),'');
  assert.equal(h.attendanceIssueFormProblem(draft({existingCount:5,files:[{type:'application/pdf',size:100}]})),'count');
});

test('새 소명 재시도는 응답 RPC를 사용하고 연결된 파일만 남긴다',()=>{
  const h=helpers();assert.equal(h.attendanceIssueInitialRpc(null),'submit_attendance_issue_v2');
  assert.equal(h.attendanceIssueInitialRpc({id:7}),'respond_attendance_issue');
  assert.deepEqual(Array.from(h.attendanceIssueUnlinkedUploads(['a','b','c'],[{storage_path:'a'},{storage_path:'c'}])),['b']);
  assert.equal(h.attendanceIssueFailedFileCount(3,2),1);
});

test('성공 직후에는 저장 잠금과 파일 입력 비우기로 재업로드를 막고 닫힌 뒤 재저장이 가능하다',async()=>{
  const h=saveHarness({rpcImpl:async name=>name==='submit_attendance_issue_v2'?{data:{id:44}}:{data:null}});await h.run();assert.equal(h.calls.upload.length,1);assert.equal(h.els.attIssueFiles.value,'');assert.equal(h.c.ATT_ISSUE_FORM.busy,true);assert.equal(h.els.attIssueSaveBtn.disabled,true);h.els.attIssueFiles.files=[{name:'proof.pdf',type:'application/pdf',size:100}];await h.run();assert.equal(h.calls.upload.length,1);assert.equal(h.calls.rpc.filter(x=>x==='submit_attendance_issue_v2').length,1);assert.equal(h.c.ATT_ISSUE_FORM.existingFiles.length,1);assert.equal(h.timers.length,1);await h.close();await h.open(99);assert.equal(h.calls.hide,0);assert.equal(h.c.ATT_ISSUE_FORM.issue.id,44);h.timers[0]();assert.equal(h.c.ATT_ISSUE_FORM.busy,false);assert.equal(h.els.attIssueSaveBtn.disabled,false);h.els.attIssueFiles.files=[{name:'again.pdf',type:'application/pdf',size:100}];await h.run();assert.equal(h.calls.rpc.filter(x=>x==='submit_attendance_issue_v2').length,1);assert.equal(h.calls.rpc.filter(x=>x==='respond_attendance_issue').length,1);assert.equal(h.calls.upload.length,2);
});

test('파일 연결 RPC throw도 부분 실패로 기록하고 미연결 업로드를 정리하며 다음 파일은 처리한다',async()=>{
  const h=saveHarness({rpcImpl:async(name,args)=>{if(name==='submit_attendance_issue_v2')return {data:{id:45}};if(args.p_original_name==='proof.pdf')throw Error('connection lost');return {data:null};},uploadImpl:async()=>({})});h.els.attIssueFiles.files=[{name:'proof.pdf',type:'application/pdf',size:100},{name:'second.pdf',type:'application/pdf',size:101}];await h.run();assert.equal(h.calls.upload.length,2,'두 파일 모두 upload 시도');assert.equal(h.calls.remove.length,1,'연결 실패 경로 remove 시도; '+h.els.attIssueFormMsg.textContent+'; '+JSON.stringify(h.calls.rpc));assert.deepEqual(Array.from(h.calls.remove[0]),[h.calls.upload[0][0]]);assert.equal(h.calls.rpc.filter(x=>x==='submit_attendance_issue_v2').length,1,'초기 RPC 중복 없음');assert.equal(h.c.ATT_ISSUE_FORM.existingFiles.length,1,'연결 성공 행 상태 반영');assert.equal(h.c.ATT_ISSUE_EVIDENCE[45].length,1,'증거 조회 캐시 반영');assert.match(h.els.attIssueFormMsg.textContent,/파일 1개가 안 올라갔습니다/);assert.equal(h.els.attIssueFiles.value,'');assert.equal(h.c.ATT_ISSUE_FORM.busy,false);assert.equal(h.els.attIssueSaveBtn.disabled,false);
});

test('업로드 실패도 저장된 소명과 분리해 정리·재시도 가능한 상태로 남긴다',async()=>{
  const h=saveHarness({rpcImpl:async(name)=>name==='submit_attendance_issue_v2'?{data:{id:46}}:{data:null},uploadImpl:async()=>{throw Error('upload lost');}});await h.run();assert.equal(h.calls.upload.length,1);assert.equal(h.calls.remove.length,1);assert.equal(h.calls.rpc.filter(x=>x==='submit_attendance_issue_v2').length,1);assert.equal(h.calls.rpc.filter(x=>x==='attendance_issue_add_evidence').length,0);assert.equal(h.c.ATT_ISSUE_FORM.issue.id,46);assert.equal(h.c.ATT_ISSUE_FORM.mode,'edit');assert.equal(h.c.ATT_ISSUE_FORM.existingFiles.length,0);assert.match(h.els.attIssueFormMsg.textContent,/파일 1개가 안 올라갔습니다/);h.els.attIssueFiles.files=[{name:'proof.pdf',type:'application/pdf',size:100}];await h.run();assert.equal(h.calls.rpc.filter(x=>x==='submit_attendance_issue_v2').length,1);assert.equal(h.calls.rpc.filter(x=>x==='respond_attendance_issue').length,1);
});

test('소명 화면의 저장 순서·정리·배지와 설정·글 등록을 연결한다',()=>{
  const submit=hr.slice(hr.indexOf('async function submitAttendanceIssueForm(){'),hr.indexOf('\n}',hr.indexOf('async function submitAttendanceIssueForm(){'))+2);
  assert.ok(submit.indexOf('submit_attendance_issue_v2')<submit.indexOf(".upload(path,file")&&submit.indexOf(".upload(path,file")<submit.indexOf('attendance_issue_add_evidence'));
  assert.match(submit,/ATT_ISSUE_FORM\.issue=row[\s\S]*ATT_ISSUE_FORM\.mode='edit'/,'RPC 저장 성공 뒤 재시도 상태를 보존해야 함');
  assert.match(submit,/attendanceIssueUnlinkedUploads\(uploaded,linked\)/);
  const open=hr.slice(hr.indexOf('async function openIssue('),hr.indexOf('\n}',hr.indexOf('async function openIssue('))+2);
  assert.match(open,/mode='new'/);assert.match(open,/mode='edit'/);assert.match(open,/attendance_issue_evidence/);assert.doesNotMatch(open,/prompt\(/);
  assert.match(submit,/\.remove\(cleanup\)/,'업로드됐지만 연결 실패한 파일을 정리해야 함');
  const badge=hr.slice(hr.indexOf('async function refreshBadges(){'),hr.indexOf('\n}',hr.indexOf('async function refreshBadges(){'))+2);
  assert.match(badge,/count:'exact',head:true/);assert.match(badge,/eq\('rule_label','자동'\)[\s\S]*eq\('status','대기'\)[\s\S]*is\('staff_responded_at',null\)/);assert.doesNotMatch(badge,/limit\(/);
  for(const key of ['att.diff.gap_min','att.diff.show_staff','att.issue.reason_min','att.issue.evidence_required','att.issue.evidence_max','att.myissue_list_limit'])assert.match(texts,new RegExp("key:'"+key.replaceAll('.','\\.')+"'"));
  assert.match(texts,/key:'list\.att_issue_kinds'[\s\S]*addable:false[\s\S]*code:'지문인식오류'[\s\S]*code:'입력오류'[\s\S]*code:'기타'/);
  assert.match(hr,/createSignedUrl\(file\.storage_path,600\)/);assert.match(hr,/attendanceIssueMyCardHtml\(myIssueRows\|\|\[\],ME\.role==='owner'\?\[\]:await fetchStaffAttDiff\(\)\)/);assert.match(hr,/attendanceIssueMyCardHtml\(myIssueRows\|\|\[\],await fetchStaffAttDiff\(\)\)/);
});

test('관측 하네스가 직원·관리자 화면, 세 양식 상태, 실제 증거 행을 렌더한다',async()=>{
  const P=await hub3.renderAll(hr,{probe:true}),issue={id:71,user_id:'u1',work_date:'2026-10-02',type:'종업누락',rule_label:'자동',reason:'지문 단일 인식(자동 감지)',status:'대기',staff_kind:null,staff_reason:null,staff_responded_at:null},file={id:8,issue_id:71,storage_path:'u1/71/abcdefgh1234.pdf',original_name:'퇴근기록.pdf',mime_type:'application/pdf',size_bytes:1024};
  const makeForm=async(mode,formIssue,files=[])=>{const r=await P.makeCtx();r.ctx.ME={id:'u1',name:'김직원',role:'staff',department:'진료실'};r.api.setState('ATT_ISSUE_FORM',{mode,issue:formIssue,existingFiles:files,presetDate:'2026-10-02',busy:false});return r.api.attendanceIssueFormHtml();};
  const fresh=await makeForm('new',null),answer=await makeForm('answer',issue),edit=await makeForm('edit',{...issue,rule_label:'기타',type:'정정',staff_kind:'기타',staff_reason:'기기가 꺼져 있어 기록되지 않았습니다.'},[file]);
  assert.match(fresh,/새 소명을 올립니다\./);assert.match(fresh,/id="attIssueDate"/);
  assert.match(answer,/자동 감지된 소명에 사유를 적습니다\./);assert.match(answer,/퇴근 지문 없음\(자동 감지\)/);
  assert.match(edit,/대기 중인 내 소명을 고칩니다\./);assert.match(edit,/value="2026-10-02" readonly/);assert.match(edit,/퇴근기록\.pdf/);
  const staff=await P.makeCtx();staff.ctx.ME={id:'u1',name:'김직원',role:'staff'};staff.api.setState('ATT_ISSUE_EVIDENCE',{71:[file]});const staffCard=staff.api.attendanceIssueMyCardHtml([{...issue,staff_kind:'기타',staff_reason:'기기 오류로 기록되지 않았습니다.',status:'대기'}]);assert.match(staffCard,/<div class="att-myissue-list"><div class="att-myissue-item"><div class="att-myissue-main">/);assert.doesNotMatch(staffCard,/<table[^>]*att-myissue/,'내 소명은 표 대신 세 줄 목록으로 렌더함');assert.match(staffCard,/종류 ·<\/strong> .*기타/);assert.match(staffCard,/사유 ·<\/strong> 기기 오류로 기록되지 않았습니다/);assert.match(staffCard,/📎 1/);assert.match(staffCard,/고치기/);assert.match(staff.api.attendanceIssueMyCardHtml([issue]),/사유 쓰기/);
  const manager=await P.makeCtx();manager.ctx.ME={id:'u1',name:'김직원',role:'manager'};assert.match(manager.api.attendanceIssueMyCardHtml([issue]),/내 소명/);
  const owner=await P.makeCtx();owner.ctx.ME={id:'u1',name:'원장',role:'owner'};assert.equal(owner.api.attendanceIssueMyCardHtml([issue]),'');
  const observed=await P.makeCtx();observed.ctx.ME={id:'u1',name:'김직원',role:'staff'};
  const clockIn=observed.api.attendanceIssueMyCardHtml([{...issue,type:'시업누락'}]);assert.match(clockIn,/출근 지문 없음\(자동 감지\)/);
  for(const role of ['manager','chief','owner','staff']){const r=await P.asMgr(role);assert.equal(r.ctx.ME.role,role,'실제 역할 컨텍스트');}
  const r=await P.asMgr('chief',null,{tables:{attendance_manual_entries:{list:[]},attendance:{list:[]},attendance_issues:{list:[issue]},attendance_issue_evidence:{list:[file]},attendance_issue_resolutions:{list:[]}}});
  const view={innerHTML:''};await r.api.renderAtt(view);assert.match(view.innerHTML,/퇴근기록\.pdf|onclick="openAttendanceIssueEvidence\(71\)"|📎 1/);
  r.api.setState('ATT_ISSUE_EVIDENCE',{71:[file]});await r.api.openAttendanceIssueEvidence(71);assert.match(r.ctx.$('#attEvidenceList').innerHTML,/퇴근기록\.pdf/);
});
