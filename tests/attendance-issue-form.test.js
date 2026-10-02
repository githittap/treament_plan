const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),hr=fs.readFileSync(path.join(root,'hr.html'),'utf8'),texts=fs.readFileSync(path.join(root,'hub-texts.js'),'utf8');
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
  for(const key of ['att.diff.threshold_min','att.diff.show_staff','att.issue.reason_min','att.issue.evidence_required','att.issue.evidence_max','att.myissue_list_limit'])assert.match(texts,new RegExp("key:'"+key.replaceAll('.','\\.')+"'"));
  assert.match(texts,/key:'list\.att_issue_kinds'[\s\S]*addable:false[\s\S]*code:'지문인식오류'[\s\S]*code:'입력오류'[\s\S]*code:'기타'/);
  assert.match(hr,/createSignedUrl\(file\.storage_path,600\)/);assert.match(hr,/\$\{attendanceIssueMyCardHtml\(myIssueRows\|\|\[\]\)\}/);
});
