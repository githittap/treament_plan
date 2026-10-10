const test=require('node:test'),assert=require('node:assert/strict');
const b=require('../payroll-bonus.js');
test('직전 N달은 연말을 넘어 월별 순서로 나온다',()=>assert.deepEqual(b.bonusPreviousMonths('2026-01',3),['2025-12','2025-11','2025-10']));
test('지난달 가져오기는 이번 달의 금액 0과 메모·체크도 덮지 않는다',()=>{
 const prev=[{person_key:'a',amount:500,memo:'이전',selections:{x:true},criteria_snapshot:[{id:'x',name:'옛 이름',value:500}]},{person_key:'b',amount:100}];
 assert.deepEqual(b.bonusCopyBlank('2026-10',[{person_key:'a',amount:0}],prev),[{...prev[1],month:'2026-10',criteria_snapshot:[]}]);
 assert.equal(b.bonusCopyBlank('2026-10',[{person_key:'a',amount:null,memo:'작성중'},{person_key:'b',selections:{x:2}}],prev).length,0);
});
test('지난달 확정 상태는 새 달로 복사되지 않고 확정한 빈 줄은 덮지 않음',()=>{
 const previous=[{person_key:'a',amount:100,confirmed:true,confirmed_at:'2026-10-10',confirmed_by:'owner'},{person_key:'b',amount:200}];
 const copied=b.bonusCopyBlank('2026-10',[{person_key:'b',amount:null,confirmed:true}],previous);
 assert.equal(copied.length,1);assert.equal(copied[0].person_key,'a');assert.ok(!copied[0].confirmed);assert.ok(!copied[0].confirmed_at);assert.ok(!copied[0].confirmed_by);
});
test('기준 합계는 금액 체크와 배점·1점 금액을 합치되 꺼진 항목을 제외한다',()=>{
 const criteria=[{id:'a',kind:'amount',value:1000,active:true},{id:'p',kind:'points',value:4,active:true},{id:'off',kind:'amount',value:9000,active:false},{id:'rate',kind:'point_rate',value:200,active:true}];
 assert.equal(b.bonusCriteriaTotal(criteria,{a:true,p:3,off:true}),1600);
 assert.equal(b.bonusCriteriaTotal(criteria,{p:9}),800);
});
test('상여 인원은 차단·비활성을 제외하고 계정 없는 대장 인원 및 과거 기록을 포함한다',()=>{
 const profiles=[{user_id:'a',name:'동명',active:true},{user_id:'old',name:'동명',account_access_status:'차단'},{user_id:'off',name:'동명',active:false}];
 const roster=b.bonusRoster(profiles,[{source_name:'계정없음',source_sheet:'급여대장',items:{bonus:400}}],[{person_key:'past',source_name:'퇴사자',user_id:'past'}]);
 assert.deepEqual(roster.map(p=>p.person_key),['a','name:계정없음','past']);
});
test('상여 차이는 대장 미입력과 0원을 구분한다',()=>{
 assert.equal(b.bonusDifference(100,null),null);assert.equal(b.bonusDifference(0,0),0);assert.equal(b.bonusDifference(100,0),100);
});

test('저장 당시 이름·값을 유지하면서 새 기준만 직원 줄에 추가한다',()=>{const old=[{id:'a',name:'옛 기준',kind:'amount',value:100,active:true}],current=[{id:'a',name:'고친 기준',kind:'amount',value:900,active:true},{id:'b',name:'추가 기준',kind:'amount',value:200,active:true},{id:'off',active:false}];const snapshot=b.bonusCriteriaSnapshotFor(old,current);assert.equal(snapshot[0].name,'옛 기준');assert.equal(snapshot[0].value,100);assert.equal(snapshot.length,2);assert.equal(b.bonusCriteriaTotal(snapshot,{a:true,b:true}),300);assert.equal(old.length,1);});

test('상여 행의 대장·차이·직전 달 금액과 수정 직후 차이에 쉼표 표시',()=>{const fs=require('node:fs'),vm=require('node:vm'),nodes={'#bonus-month-total':{},'#bonus-diff-0':{classList:{toggle:()=>{}}}},c={ME:{role:'owner'},hubT:(k,d)=>d,hubN:()=>1,esc:String,$:k=>nodes[k]};vm.createContext(c);vm.runInContext(fs.readFileSync('payroll-bonus.js','utf8'),c);vm.runInContext(`BONUS.month='2026-09';BONUS.people=[{person_key:'u',user_id:'u',source_name:'가짜'}];BONUS.entries=[{person_key:'u',amount:2000000}];BONUS.payroll=[{user_id:'u',items:{bonus:1000000}}];BONUS.previous=[{person_key:'u',month:'2026-08',amount:3000000}];`,c);const html=c.bonusRowHtml({person_key:'u',user_id:'u',source_name:'가짜'},0);assert.ok(html.includes('<td>1,000,000</td>'));assert.ok(html.includes('>1,000,000</td>'));assert.ok(html.includes('<td>3,000,000</td>'));c.bonusRefreshTotals(0);assert.equal(nodes['#bonus-diff-0'].textContent,'1,000,000');vm.runInContext('BONUS.entries[0].amount=0',c);c.bonusRefreshTotals(0);assert.equal(nodes['#bonus-diff-0'].textContent,'-1,000,000');});

test('지난달 조회 도중 월 변경: 아무 줄도 저장하지 않고 안내',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),message={},writes=[];let resolve;
 const c={ME:{role:'owner'},hubT:(k,d)=>d,confirm:()=>true,render:()=>{},$:()=>message,sb:{from:()=>({select:()=>({eq:()=>new Promise(r=>resolve=r)}),upsert:async rows=>{writes.push(rows);return {};}})}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('payroll-bonus.js','utf8'),c);vm.runInContext("BONUS.month='2026-09'",c);
 const pending=c.bonusCopyPrevious();vm.runInContext("BONUS.month='2026-10';BONUS.generation++",c);resolve({data:[{person_key:'u',amount:100,month:'2026-08'}]});await pending;
 assert.equal(writes.length,0);assert.match(message.textContent,/월/);
});

test('새 달 가져오기는 현재 기준 500을 사용하고 지난달 100·확정 상여 보존',()=>{
 const old={month:'2026-09',person_key:'u',amount:700,memo:'그대로',selections:{a:true},criteria_snapshot:[{id:'a',kind:'amount',value:100,active:true}]};
 const copied=b.bonusCopyBlank('2026-10',[],[old])[0],current=[{id:'a',kind:'amount',value:500,active:true}];
 assert.equal(b.bonusCriteriaTotal(b.bonusCriteriaSnapshotFor(copied.criteria_snapshot,current),copied.selections),500);
 assert.equal(b.bonusCriteriaTotal(old.criteria_snapshot,old.selections),100);assert.equal(copied.amount,700);assert.equal(copied.memo,'그대로');
 assert.equal(b.bonusCriteriaSnapshotFor(copied.criteria_snapshot,[{...current[0],active:false}]).length,0);
});


test('가져오기 진행 중 입력·자동저장·중복 가져오기 잠금과 실패 후 해제',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),message={},writes=[],locks=[{disabled:false,dataset:{}}];let release,rpcCalls=0;
 const c={ME:{role:'owner'},hubT:(k,d)=>d,hubN:()=>1,esc:String,confirm:()=>true,render:()=>{},$:()=>message,document:{querySelectorAll:()=>locks},sb:{from:()=>({select:()=>({eq:async()=>({data:[{person_key:'u',amount:100}]})}),upsert:async rows=>{writes.push(rows);return {};}}),rpc:()=>{rpcCalls++;return new Promise(r=>release=r);}}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('payroll-bonus.js','utf8'),c);vm.runInContext("BONUS.month='2026-09';BONUS.people=[{person_key:'u',source_name:'가짜'}]",c);
 const pending=c.bonusCopyPrevious();await new Promise(r=>setImmediate(r));
 assert.equal(vm.runInContext('BONUS.copying',c),true);assert.ok(locks[0].disabled);
 c.bonusEdit(0,'amount','999');await c.bonusSave(0);await c.bonusCopyPrevious();await c.bonusSetMonth('2026-10');
 assert.equal(writes.length,0);assert.equal(rpcCalls,1);assert.equal(vm.runInContext('BONUS.drafts.size',c),0);assert.equal(vm.runInContext('BONUS.month',c),'2026-09');
 release({error:{message:'가짜 실패'}});await pending;
 assert.equal(vm.runInContext('BONUS.copying',c),false);assert.equal(locks[0].disabled,false);assert.ok(message.textContent.includes('저장 실패'));
});
