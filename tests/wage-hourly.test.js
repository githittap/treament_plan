const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function ctx(role='staff'){
 const c={ME:{id:'self',role},esc:s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
 hubT:(k,d,v)=>String(d).replace(/\{([a-z_]+)\}/g,(m,k)=>v&&k in v?v[k]:m),today:()=> '2026-10-04'};
 vm.createContext(c);vm.runInContext(read('wage-hourly.js')+';this.api={wageHourlyPanelHtml,wageHourlyCsv,wageHourlyConfigHtml};',c);return c;
}
const result={month:'2026-10',users:[{user_id:'self',name:'합성직원',minutes:61,net:10167,gross_estimate:null,insured:false,income_tax_included:false,days:[{date:'2026-10-05',work_date:'2026-10-05',minutes:61,rate:10000,net:10167,label:'평일',corrected:true}]}]};
test('직원은 본인 분 단위 시간·실수령액·정정 여부를 볼 수 있고 미가입자는 세전 추정치가 없다',()=>{
 const h=ctx().api.wageHourlyPanelHtml(result,false);assert.match(h,/61/);assert.match(h,/10,167/);assert.match(h,/정정/);assert.doesNotMatch(h,/참고용 세전/);
});
test('등록되지 않은 다른 직원 금액은 직원 화면에 들어가지 않는다',()=>{
 const other={...result.users[0],user_id:'other',name:'보이면안됨',net:9999999};
 const h=ctx().api.wageHourlyPanelHtml({...result,users:[other,...result.users]},false);assert.doesNotMatch(h,/보이면안됨|9,999,999/);
});
test('실장은 본인 외 금액을 그릴 수 없고 원장에게만 전체 월 표·CSV가 나온다',()=>{
 const other={...result.users[0],user_id:'other',name:'타인'};
 assert.doesNotMatch(ctx('chief').api.wageHourlyPanelHtml({...result,users:[other]},true),/타인/);
 assert.match(ctx('owner').api.wageHourlyPanelHtml(result,true),/CSV/);
});
test('가입자만 참고용 추정치와 소득세 미반영 표시를 받는다',()=>{
 const u={...result.users[0],insured:true,gross_estimate:11262};
 assert.match(ctx().api.wageHourlyPanelHtml({...result,users:[u]},false),/참고용 세전/);
 assert.match(ctx().api.wageHourlyPanelHtml({...result,users:[u]},false),/소득세 미반영/);
});
test('누락 기록이나 미입력 시급은 0원 대신 확인 필요로 표시한다',()=>{
 const u={...result.users[0],needs_review:true,net:null,days:[{date:'2026-10-05',minutes:null,net:null,needs_review:true}]};
 assert.match(ctx().api.wageHourlyPanelHtml({...result,users:[u]},false),/확인 필요/);
});
test('CSV는 이름의 수식 실행을 막고 쉼표·따옴표·줄바꿈을 보존한다',()=>{
 const csv=ctx('owner').api.wageHourlyCsv({...result,users:[{...result.users[0],name:'=1,"테스트"\n새줄'}]});
 assert.match(csv,/"'=1,""테스트""\n새줄"/);assert.match(csv,/10167/);
});
test('새 시급 문구는 모두 기존 허브 설정에 등록되며 캐시 번호와 실제 진입점이 연결된다',()=>{
 const js=read('wage-hourly.js'),texts=read('hub-texts.js'),hr=read('hr.html');
 const keys=[...js.matchAll(/wageT\('([^']+)'/g)].map(m=>m[1]);
 keys.forEach(k=>assert.ok(texts.includes("'wh."+k+"'"),k));
 assert.match(hr,/wage-hourly.js\?v=20261004/);assert.match(hr,/await wageHourlyHome\(/);assert.match(hr,/await renderWageHourly\(/);
 assert.match(hr,/hub-texts.js\?v=20261004/);
});
test('설정 화면은 평일·주말 시급·가입 여부·공제율을 입력할 수 있다',()=>{
 const config={settings:{categories:[{code:'weekday',label:'평일',days:[1,2,3,4,5],dates:[]},{code:'weekend',label:'주말',days:[0,6],dates:[]}],deductions:{pension:0.0475,health:0.03595,ltc_health:0.1314,employment:0.009,local_income:0.1},income_tax:[]},employees:[{user_id:'self',name:'합성직원',enabled:true,rates:{weekday:10000,weekend:12000},insured:false,effective_from:'2026-10-01'}]};
 const h=ctx('owner').api.wageHourlyConfigHtml(config);assert.match(h,/10000/);assert.match(h,/12000/);assert.match(h,/4.75/);assert.match(h,/4대보험/);
});
