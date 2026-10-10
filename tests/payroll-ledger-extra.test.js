const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function ctx(){const c={SETTINGS:{},PROFILES:[],hubT:(k,d,v)=>String(d).replace(/\{([a-z_]+)\}/g,(m,k)=>v?.[k]??m)};vm.createContext(c);const hr=fs.readFileSync('hr.html','utf8');vm.runInContext(hr.slice(hr.indexOf('const PAY_ALIASES='),hr.indexOf('function payWageTypeLabel('))+fs.readFileSync('payroll-bonus.js','utf8')+fs.readFileSync('payroll-ledger-extra.js','utf8'),c);return c;}
function fixture(){const a=Array.from({length:9},()=>[]);Object.assign(a[5],{0:'연번',1:'성  명',4:'주민등록번호',8:'지급',25:'공제',36:'차인지급액',37:'비고',38:'세후',39:'상여',40:'세후기본+상여',43:'급여구성',50:'OT시간\n(시간)',51:'근태횟수\n(시간)',52:'휴일근로\n(시간)',53:'휴일연장\n(분)'});Object.assign(a[6],{8:'기 본 급',9:'식    대',14:'상여금(세후)',24:'지급액계',25:'소득세',35:'공제액계',43:'기본급',44:'식대',49:'세전'});Object.assign(a[7],{0:1,1:'합성직원',4:'900101-1234567',8:3000000,9:200000,14:100000,24:3300000,25:100000,35:100000,36:3200000,37:'메모',38:3100000,39:100000,40:3200000,41:999,42:888,43:3000000,44:200000,49:3300000,50:0.5,51:0.25,52:8,53:10});a[8][1]='총합계';return a;}
test('가짜 양식 오른쪽 칸은 side에만; 주민·제목 없는 AP/AQ 제외; 왼쪽 명세서 불변',()=>{const c=ctx(),f=fixture(),r=c.payrollParseMain(f).rows[0];assert.equal(r.items.base_pay,3000000);assert.equal(r.items.bonus,100000);assert.equal(r.items.net_pay,3200000);assert.equal(r.side['급여구성·기본급'],3000000);assert.equal(r.side['OT시간(시간)'],0.5);assert.equal(r.side['상여'],100000);assert.equal(r.side['비고'],'메모');assert.ok(!JSON.stringify(r).includes('900101'));assert.ok(!JSON.stringify(r.side).includes('999'));assert.ok(!Object.keys(r.items).includes('세전'));});
test('주민번호 모양은 모든 칸에서 제거하고 주민 제목은 숫자도 제외한다',()=>{const c=ctx(),f=fixture();f[7][37]='참고 900101-1234567';f[7][14]='900101-1234567';f[7][4]=9001011234567;const r=c.payrollParseMain(f).rows[0];assert.ok(!JSON.stringify(r).includes('900101'));assert.equal(r.items.bonus,undefined);});
test('활성 동명 1명만 연결하고 원장이 선택한 연결 기억을 사용한다',()=>{const c=ctx();c.PROFILES=[{user_id:'a',name:'합성직원',active:true},{user_id:'old',name:'합성직원',active:false},{user_id:'blocked',name:'합성직원',account_access_status:'차단'}];assert.equal(c.payrollParseMain(fixture()).rows[0].user_id,'a');c.PROFILES.push({user_id:'b',name:'합성직원'});assert.equal(c.payrollParseMain(fixture()).rows[0].user_id,'');assert.match(c.payrollParseMain(fixture()).rows[0].reason,/2/);c.SETTINGS.payroll_name_map='{"합성직원":"b"}';assert.equal(c.payrollParseMain(fixture()).rows[0].user_id,'b');});
test('일용·사업소득 시트 읽기는 제목 있는 칸만 저장하고 주민번호를 제거한다',()=>{const c=ctx(),a=Array.from({length:9},()=>[]);Object.assign(a[5],{1:'성명',3:'주민등록번호',4:'근무일수',5:'지급액',6:'공제',17:'차인지급액',20:'시간(1일)'});Object.assign(a[6],{6:'소득세',7:'지방소득세'});Object.assign(a[7],{1:'가짜일용',3:'900101-1234567',4:2,5:200000,6:500,7:50,17:199450,20:8});const r=c.payrollParseExtra(a,'일용대장')[0];assert.equal(r.source_sheet,'일용대장');assert.equal(r.items.net_pay,199450);assert.equal(r.side['근무일수'],2);assert.ok(!JSON.stringify(r).includes('900101'));});

test('보관 수는 최근 묶음의 직원·계정 없는 줄만, 저장 수는 두 종류 합계',()=>{const c=ctx(),old='2026-09-01T00:00:00+00:00',latest='2026-09-02T00:00:00+00:00';const counts=c.payrollArchiveCounts([{}],[{},{}],[{archived_at:old},{archived_at:latest}],[{archived_at:old},{archived_at:latest},{archived_at:latest}]);assert.equal(counts.saved,3);assert.equal(counts.archived,3);assert.equal(c.payrollArchiveCounts([],[],[],[]).archived,0);});

function saveCtx(){
  const hr=fs.readFileSync('hr.html','utf8'),calls=[],live=new Map(),statuses=[];
  const c={ME:{id:'owner',name:'원장',role:'owner'},PAY_MONTH:'2026-09',PAY_EXTRA_PREVIEW:[],PAY_ROWS:[],PAY_SOURCE_FILE:null,SETTINGS:{},PROFILES:[{user_id:'u'}],payrollActiveProfiles:p=>p,hubT:(k,d)=>d,setStatus:s=>statuses.push(s),render:()=>{},uploadPayrollOriginal:async()=>{},sb:{from:table=>({upsert:async rows=>{calls.push({table,rows});return {};}}),rpc:async(name,args)=>{
    calls.push({table:'payroll_rows',rows:args.p_rows});
    calls.push({name,args:JSON.parse(JSON.stringify(args))});
    if(args.p_replace!==false)live.clear();
    for(const r of args.p_extra_rows)live.set(r.source_sheet+':'+r.source_name,JSON.parse(JSON.stringify(r)));
    return {data:args.p_rows.length+args.p_extra_rows.length};
  }}};
  vm.createContext(c);vm.runInContext(hr.slice(hr.indexOf('async function savePayrollRows()'),hr.indexOf('async function uploadPayrollOriginal(')),c);
  return {c,calls,live,statuses};
}
test('새 엑셀의 계정 연결된 재저장도 빈 목록으로 교체하고 상여 기록은 건드리지 않는다',async()=>{
  const {c,calls,live}=saveCtx();live.set('급여대장:가나다',{source_name:'가나다'});
  c.PAY_ROWS=[{user_id:'u',name:'가나다',items:{bonus:1000}}];c.PAY_SOURCE_FILE={name:'가짜.xlsx'};
  await c.savePayrollRows();
  assert.equal(calls.find(v=>v.name)?.args.p_month,'2026-09');assert.deepEqual(calls.find(v=>v.name)?.args.p_extra_rows,[]);assert.equal(calls.find(v=>v.name)?.args.p_replace,true);assert.equal(calls.filter(v=>v.name).length,1);
  assert.equal(calls.find(v=>v.name)?.name,'payroll_save_month');assert.equal(live.size,0);
  assert.ok(!calls.some(v=>v.table==='payroll_extra_rows'||v.table==='bonus_entries'));
});
test('hr 저장 4단계: 엑셀 3줄 → 연결 수기 보존 → 미연결 수기 추가 → 새 엑셀 통째 교체',async()=>{
  const {c,calls,live}=saveCtx();
  const excel=[{source_sheet:'일용대장',source_name:'가짜일용',items:{net_pay:200}},{source_sheet:'사업소득대장',source_name:'가짜사업',items:{net_pay:300}}];
  c.PAY_SOURCE_FILE={name:'가짜1.xlsx'};c.PAY_EXTRA_PREVIEW=excel;c.PAY_ROWS=[{name:'계정없음',items:{bonus:100}}];
  await c.savePayrollRows();assert.equal(live.size,3);assert.equal(c.PAY_SOURCE_FILE,null);
  const original=JSON.stringify([...live]);
  c.PAY_EXTRA_PREVIEW=[];c.PAY_ROWS=[{user_id:'u',name:'연결수기',items:{bonus:400},manual:true}];
  await c.savePayrollRows();assert.equal(live.size,3);assert.equal(JSON.stringify([...live]),original);
  c.PAY_ROWS=[{name:'가짜수기',items:{bonus:500},manual:true}];await c.savePayrollRows();
  assert.equal(live.size,4);assert.equal(live.get('급여대장:가짜수기').items.bonus,500);
  c.PAY_SOURCE_FILE={name:'가짜2.xlsx'};c.PAY_EXTRA_PREVIEW=excel;c.PAY_ROWS=[{name:'새계정없음',items:{bonus:600}}];
  await c.savePayrollRows();assert.equal(live.size,3);assert.ok(!live.has('급여대장:가짜수기'));assert.ok(!live.has('급여대장:계정없음'));
  assert.deepEqual(calls.filter(v=>v.name).map(v=>v.args.p_replace),[true,false,false,true]);
});
test('파일 없는 저장은 남은 엑셀 별도 미리보기를 다시 쓰지 않고 동일 수기 줄만 갱신한다',async()=>{
  const {c,live}=saveCtx();c.PAY_EXTRA_PREVIEW=[{source_sheet:'일용대장',source_name:'가짜일용',items:{net_pay:200}}];
  c.PAY_SOURCE_FILE={name:'가짜.xlsx'};c.PAY_ROWS=[{name:'가짜수기',items:{bonus:100}}];await c.savePayrollRows();
  live.get('일용대장:가짜일용').items.net_pay=999;
  c.PAY_ROWS=[{name:'가짜수기',items:{bonus:600},manual:true}];await c.savePayrollRows();
  assert.equal(live.size,2);assert.equal(live.get('일용대장:가짜일용').items.net_pay,999);assert.equal(live.get('급여대장:가짜수기').items.bonus,600);
});
test('저장 실패는 새 엑셀을 남겨 재시도 때 교체하고 성공 뒤에는 추가로 돌아간다',async()=>{
  const {c,calls,statuses}=saveCtx(),rpc=c.sb.rpc;c.PAY_SOURCE_FILE={name:'가짜.xlsx'};c.PAY_ROWS=[{name:'가짜',items:{bonus:100}}];
  c.sb.rpc=async()=>({error:{message:'가짜 실패'}});await c.savePayrollRows();assert.ok(c.PAY_SOURCE_FILE);assert.equal(statuses.at(-1),'error');
  c.sb.rpc=rpc;await c.savePayrollRows();assert.equal(calls.at(-2).args.p_replace,true);assert.equal(c.PAY_SOURCE_FILE,null);
  await c.savePayrollRows();assert.equal(calls.filter(v=>v.name).at(-1).args.p_replace,false);
});

test('저장 시작 월·파일·행 고정: 응답 중 10월로 바뀌어도 쓰기는 9월만',async()=>{
  const {c,calls}=saveCtx();c.PAY_ROWS=[{user_id:'u',name:'가짜',items:{net_pay:100}}];const file={name:'9월.xlsx'};c.PAY_SOURCE_FILE=file;
  const rpc=c.sb.rpc;c.sb.rpc=async(name,args)=>{if(name==='payroll_save_month'){calls.push({table:'payroll_rows',rows:args.p_rows});c.PAY_MONTH='2026-10';c.PAY_ROWS=[];c.PAY_SOURCE_FILE={name:'10월.xlsx'};return rpc(name,args);}return rpc(name,args);};
  const uploads=[];c.uploadPayrollOriginal=async(f,m)=>uploads.push([f.name,m]);
  await c.savePayrollRows();assert.equal(calls.find(v=>v.name).args.p_month,'2026-09');assert.deepEqual(uploads,[['9월.xlsx','2026-09']]);assert.equal(c.PAY_SOURCE_FILE.name,'10월.xlsx');
});
test('저장 중 월 변경·중복 저장 거절, 실패 뒤 잠금 풀림',async()=>{
  const {c,calls}=saveCtx();const hr=fs.readFileSync('hr.html','utf8');vm.runInContext(hr.slice(hr.indexOf('function setPayMonth('),hr.indexOf('function setPayRowUser(')),c);
  c.PAY_ROWS=[{user_id:'u',name:'가짜',items:{net_pay:100}}];let release;const rpc=c.sb.rpc;c.sb.rpc=(name,args)=>name==='payroll_save_month'?new Promise(r=>release=r):rpc(name,args);
  const saving=c.savePayrollRows();c.setPayMonth('2026-10');assert.equal(c.PAY_MONTH,'2026-09');await c.savePayrollRows();release({error:{message:'실패'}});await saving;
  c.setPayMonth('2026-10');assert.equal(c.PAY_MONTH,'2026-10');assert.equal(calls.filter(v=>v.name).length,0);
});

test('실제 수기 행 추가→직원 선택은 이름을 채우고 빈 칸과 0을 구분',()=>{
 const {c}=saveCtx(),hr=fs.readFileSync('hr.html','utf8');c.PAY_COLUMNS=[];c.PROFILES=[{user_id:'u',name:'선택직원'}];c.payNumber=v=>v===''?null:Number(v);
 vm.runInContext(hr.slice(hr.indexOf('function setPayRowUser('),hr.indexOf('function parsePayrollXls(')),c);
 c.addPayRow();c.setPayRowUser(0,'u');c.setPayItem(0,0,'');c.setPayItem(0,1,'0');assert.equal(c.PAY_ROWS[0].name,'선택직원');assert.equal(c.PAY_ROWS[0].items.base_pay,undefined);assert.equal(c.PAY_ROWS[0].items.meal_allow,0);
});
