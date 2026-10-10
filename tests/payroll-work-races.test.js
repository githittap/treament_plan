const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const hr=fs.readFileSync('hr.html','utf8');
function screen(){
 const calls=[],uploads=[],readers=[],locks=[{disabled:false,dataset:{}},{disabled:true,dataset:{}}];
 const c={ME:{id:'owner',name:'원장',role:'owner'},PAY_MONTH:'2026-09',PAY_ROWS:[{user_id:'u',name:'가짜',items:{net_pay:100}}],PAY_COLUMNS:[],PAY_EXTRA_PREVIEW:[],PAY_SOURCE_FILE:{name:'9월.xlsx'},PAY_BUSY:'',PAY_SAVING:false,PAY_READ_ID:0,PAY_MESSAGE:'',SETTINGS:{},PROFILES:[{user_id:'u'}],payrollActiveProfiles:p=>p,hubT:(k,d,v)=>d.replace(/\{([a-z_]+)\}/g,(m,k)=>v?.[k]??m),setStatus:()=>{},render:()=>{},confirm:()=>true,$:()=>({value:'2026-10'}),document:{querySelectorAll:()=>locks},FileReader:class{constructor(){readers.push(this);}readAsArrayBuffer(){}},XLSX:{read:data=>data},payrollSheetAoa:ws=>ws,payrollParseMain:aoa=>({columns:[],rows:aoa,headerMap:{}}),payrollParseExtra:()=>[],sb:{rpc:async(name,args)=>{calls.push({name,args});return {data:1};},from:()=>({upsert:async()=>({})})}};
 vm.createContext(c);vm.runInContext(hr.slice(hr.indexOf('function setPayMonth('),hr.indexOf('/* ── 명세서')),c);c.uploadPayrollOriginal=async(f,m)=>uploads.push({file:f.name,month:m});
 return {c,calls,uploads,readers,locks};
}
test('연결 기억 지연 중 월 옮기기·보관·복구·엑셀 읽기·재저장 모두 거절',{timeout:5000},async()=>{
 const {c,calls,uploads,readers,locks}=screen();let release;c.sb.from=()=>({upsert:()=>new Promise(r=>release=r)});
 const saving=c.savePayrollRows();await new Promise(r=>setImmediate(r));
 await c.movePayrollMonth();await c.archivePayrollMonth();await c.restorePayrollMonth();c.parsePayrollXls({target:{files:[{name:'새파일.xlsx'}]}});await c.savePayrollRows();
 assert.deepEqual(calls.map(r=>r.name),['payroll_save_month']);assert.equal(readers.length,0);assert.equal(c.PAY_MONTH,'2026-09');assert.ok(locks.every(el=>el.disabled));
 release({});await saving;assert.deepEqual(uploads,[{file:'9월.xlsx',month:'2026-09'}]);assert.equal(c.PAY_BUSY,'');assert.equal(locks[0].disabled,false);assert.equal(locks[1].disabled,true);
});
test('월 옮기기·보관·복구 각각 진행 중 다른 작업 거절, 응답 오류·예외에도 해제',{timeout:5000},async()=>{
 for(const operation of ['movePayrollMonth','archivePayrollMonth','restorePayrollMonth'])for(const thrown of [false,true]){
  const {c,calls}=screen();let resolve,reject;c.sb.rpc=(name,args)=>{calls.push({name,args});return new Promise((yes,no)=>{resolve=yes;reject=no;});};
  const pending=c[operation]();await c.savePayrollRows();await c.movePayrollMonth();await c.archivePayrollMonth();await c.restorePayrollMonth();c.setPayMonth('2026-11');
  assert.equal(calls.length,1);assert.equal(c.PAY_MONTH,'2026-09');
  if(thrown)reject(Error('가짜 오류'));else resolve({error:{message:'가짜 오류'}});await pending;assert.equal(c.PAY_BUSY,'');
 }
});

function readFile(c,name){c.parsePayrollXls({target:{files:[{name}]}});}
function workbook(value){return {SheetNames:['급여대장'],Sheets:{'급여대장':[{user_id:'u',name:'가짜',items:{net_pay:value}}]}};}
test('9월 엑셀 읽기 중 10월 선택: 이전 파일 결과 버리고 저장 호출 0건',{timeout:5000},async()=>{
 const {c,calls,readers}=screen();readFile(c,'9월.xlsx');await c.savePayrollRows();assert.equal(calls.length,0);
 c.setPayMonth('2026-10');assert.equal(c.PAY_MONTH,'2026-10');
 await readers[0].onload({target:{result:workbook(100)}});await c.savePayrollRows();
 assert.equal(calls.length,0);assert.equal(c.PAY_ROWS.length,0);assert.equal(c.PAY_SOURCE_FILE,null);assert.equal(c.PAY_BUSY,'');assert.match(c.PAY_MESSAGE,/월|저장할/);
});
test('열 매핑 저장 대기 중 월 변경도 미리보기·원본 파일을 되살리지 않음',{timeout:5000},async()=>{
 const {c,calls,readers}=screen();let release;c.sb.from=()=>({upsert:()=>new Promise(r=>release=r)});
 readFile(c,'9월.xlsx');const loading=readers[0].onload({target:{result:workbook(100)}});await new Promise(r=>setImmediate(r));
 c.setPayMonth('2026-10');release({});await loading;await c.savePayrollRows();
 assert.equal(c.PAY_MONTH,'2026-10');assert.equal(calls.length,0);assert.equal(c.PAY_ROWS.length,0);assert.equal(c.PAY_SOURCE_FILE,null);
});
test('파일 A 읽는 중 B 선택: A가 늦게 끝나도 B 결과·잠금을 건드리지 않음',{timeout:5000},async()=>{
 const {c,readers}=screen();readFile(c,'A.xlsx');readFile(c,'B.xlsx');assert.equal(readers.length,2);
 await readers[0].onload({target:{result:workbook(100)}});assert.equal(c.PAY_BUSY,'read');assert.equal(c.PAY_ROWS.length,0);
 await readers[1].onload({target:{result:workbook(200)}});assert.equal(c.PAY_SOURCE_FILE.name,'B.xlsx');assert.equal(c.PAY_ROWS[0].items.net_pay,200);assert.equal(c.PAY_BUSY,'');
});
test('파일 A 열 매핑 대기 중 B 선택: 응답 순서가 뒤집혀도 B 파일·행 유지',{timeout:5000},async()=>{
 const {c,readers}=screen();const releases=[];c.sb.from=()=>({upsert:()=>new Promise(r=>releases.push(r))});
 readFile(c,'A.xlsx');const a=readers[0].onload({target:{result:workbook(100)}});
 readFile(c,'B.xlsx');const b=readers[1].onload({target:{result:workbook(200)}});
 releases[1]({});await b;releases[0]({});await a;
 assert.equal(c.PAY_SOURCE_FILE.name,'B.xlsx');assert.equal(c.PAY_ROWS[0].items.net_pay,200);assert.equal(c.PAY_BUSY,'');
});
test('파일 읽기 오류·잘못된 파일에도 읽기 잠금 해제',{timeout:5000},async()=>{
 for(const kind of ['onerror','onabort','onload']){
  const {c,readers}=screen();readFile(c,'실패.xlsx');
  await readers[0][kind]({target:{result:null}});assert.equal(c.PAY_BUSY,'');assert.equal(c.PAY_SOURCE_FILE,null);assert.equal(c.PAY_ROWS.length,0);
 }
});

test('수정한 화면 JS의 캐시와 급여 작업 버튼·읽기 중 월/파일 변경 연결',()=>{
 for(const name of ['payroll-bonus','payroll-reply','hub-texts'])assert.ok(hr.includes(name+'.js?v='+'2026101110'));
 for(const operation of ['movePayrollMonth','archivePayrollMonth','restorePayrollMonth'])assert.match(hr,new RegExp('data-pay-save-lock onclick="'+operation+'\\(\\)"'));
 assert.ok(hr.includes('data-pay-save-lock data-pay-read-keep'));assert.ok(hr.includes('pay.extra.xls_reading'));
});
