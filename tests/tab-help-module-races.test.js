const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {fnSrc}=require('./fixtures/hub7-harness.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/\r\n/g,'\n');
test('수정한 화면 모듈은 같은 최신 캐시 번호로 참조한다',()=>{
 const hr=read('hr.html');for(const name of ['card-ledger-ui','payroll-bonus','payroll-reply','payroll-compare','hub-help','hub-texts','hub-activity','wage-hourly','ai-assistants'])assert.ok(hr.includes(name+'.js?v=2026101110'),name);
});
test('실제 지출 점검은 같은 탭 재진입 뒤 분리된 옛 루트에 조회 결과를 그리지 않는다',async()=>{
 const c={Intl,Date};vm.createContext(c);vm.runInContext(read('card-ledger-ui.js'),c);
 let release;const held=new Promise(r=>release=r),target={isConnected:true,innerHTML:'',querySelector(){return {addEventListener(){}};}};
 const sb={from(){const q=new Proxy({},{get(_,k){if(k==='then')return (ok,bad)=>Promise.resolve({data:[],error:null}).then(ok,bad);return ()=>q;}});return q;}};
 const job=c.CardLedgerUi.render(target,{me:{role:'owner'},sb,fetchAll:()=>held,isActive:()=>true},{});const before=target.innerHTML;target.isConnected=false;
 release({data:[],error:null});await job;assert.equal(target.innerHTML,before);
});
test('실제 AI 목록 지연은 탭 재진입의 새 루트를 다시 그리지 않는다',async()=>{
 let release,draws=0;const old={isConnected:true},next={isConnected:true},c={AI_ROOT:old,reloadAssistants:()=>new Promise(r=>release=r),aiTextsLoadInto:async()=>{},SB:{},renderShell(){draws++;}};
 vm.createContext(c);vm.runInContext(fnSrc(read('ai-assistants.js'),'loadAndRenderShell'),c);
 const job=c.loadAndRenderShell();old.isConnected=false;c.AI_ROOT=next;release();await job;assert.equal(draws,0);
});
test('실제 AI 관리 지연은 분리된 하위 화면과 새 공유 목록을 바꾸지 않는다',async()=>{
 let release;const root={isConnected:true,innerHTML:''},c={AI_ASSISTANT_EDIT_GENERATION:0,AI_ADMIN_ASSISTANTS:['현재 목록'],AI_ADMIN_MODELS:[],escAi:String,drawManageSection(){throw Error('분리된 화면 그리기');},SB:{from(){return {select(){return this;},order(){return new Promise(r=>release=r);}};}}};
 // 두 조회를 동시에 보류하고 모두 같은 응답으로 완료합니다.
 const done=[];c.SB.from=()=>({select(){return this;},order(){return new Promise(r=>done.push(r));}});
 vm.createContext(c);vm.runInContext(fnSrc(read('ai-assistants.js'),'renderManageSection'),c);
 const job=c.renderManageSection(root),before=root.innerHTML;root.isConnected=false;for(const r of done)r({data:['이전 목록'],error:null});await job;
 assert.equal(root.innerHTML,before);assert.deepEqual(c.AI_ADMIN_ASSISTANTS,['현재 목록']);
});
test('실제 허브 글 하위 화면은 분리된 뒤 조회 결과를 그리지 않는다',async()=>{
 let release,draws=0;const sec={isConnected:true,innerHTML:''},c={HUB_SB:{},hubTextsFetch:()=>new Promise(r=>release=r),hubTextSetOverrides(){},hubEsc:String,hubDrawTextsSection(){draws++;}};
 vm.createContext(c);vm.runInContext(fnSrc(read('hub-texts.js'),'hubRenderTextsSection'),c);
 const job=c.hubRenderTextsSection(sec);sec.isConnected=false;release([]);await job;assert.equal(draws,0);
});
test('실제 시급 지급액은 분리된 루트의 늦은 조회로 공유 설정을 바꾸지 않는다',async()=>{
 const done=[],m={isConnected:true,innerHTML:''},c={ME:{role:'owner'},WH_MONTH:'2026-10',WH_DATA:{current:true},WH_CONFIG:{current:true},sb:{rpc:()=>new Promise(r=>done.push(r))},payTop:()=>'',esc:String,wageT:(k,d)=>d,wageHourlyPanelHtml:()=>'',wageHourlyConfigHtml:()=>'',WH_MESSAGE:''};
 vm.createContext(c);vm.runInContext(fnSrc(read('wage-hourly.js'),'renderWageHourly'),c);
 const job=c.renderWageHourly(m);m.isConnected=false;for(const r of done)r({data:{old:true},error:null});await job;
 assert.equal(m.innerHTML,'');assert.deepEqual(c.WH_CONFIG,{current:true});assert.deepEqual(c.WH_DATA,{current:true});
});
