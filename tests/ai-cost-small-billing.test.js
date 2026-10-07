const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'hr.html'),'utf8');
const seed=JSON.parse(fs.readFileSync(path.join(root,'db/ai_cost_settings.sql'),'utf8').split('$aicost$')[1]);
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function context(data={},config=seed){
  const calls=[],settings={aicost_config:JSON.stringify(config)};
  const hubT=(k,d,v)=>String(d).replace(/\{([a-z_]+)\}/g,(m,n)=>v?.[n]??m);
  const c={SETTINGS:settings,ME:{role:'owner',name:'합성'},esc,today:()=> '2026-10-06',md:x=>x,setStatus:()=>{},render:async()=>{},$:()=>null,hubT,hubTE:(...args)=>esc(hubT(...args)),hubN:(k,d)=>d,formatLeaveMonth:x=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(new Date(x)),formatLeaveTimestamp:x=>x};
  c.sb={from(table){const q={};for(const method of ['select','eq','order','gte','limit','in','range'])q[method]=(...args)=>{calls.push([table,method,...args]);return q;};q.then=(yes,no)=>Promise.resolve({data:data[table]||[],error:null}).then(yes,no);q.upsert=async value=>{calls.push([table,'upsert',value]);return {error:data.writeError||null};};return q;}};
  vm.createContext(c);vm.runInContext(html.slice(html.indexOf('/* aicost-platform:test-start */'),html.indexOf('/* ── 급여 ── */'))+';this.h={aicostConfig,aicostPlatformKey,aicostSettingsHtml,renderAicost,saveAicostSettings,saveAicost,billingAiRows};',c);
  c.renderMarketingExpensePanel=async()=>'<div>기존 광고비 화면</div>';
  return {c,h:c.h,calls,settings};
}

test('플랫폼 목록·화면 이름·문구는 app_settings 초안에서 읽고 기존 기타 저장 이름을 유지함',()=>{
  const {h}=context(),config=h.aicostConfig();
  assert.deepEqual([...config.platforms].map(p=>p.key),['Claude','Codex(OpenAI)','Kimi','DeepSeek','StepFun','Higgsfield','Typecast','기타']);
  assert.equal(config.platforms.at(-1).label,'기타 AI');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname,'ai-cost-config.fixture.json'),'utf8')),seed);
  assert.throws(()=>h.aicostConfig(''),/설정/);
});

test('가맹점 연결은 DB 값·대소문자·앞뒤 공백을 적용하며 미등록은 기타 AI로 모음',()=>{
  const {h}=context();
  for(const [input,key] of [[' deepseek ','DeepSeek'],[' STEPFUN ','StepFun'],['힉스필드','Higgsfield'],['HIGGSFIELDINC.','Higgsfield'],['TYPECAST.AI','Typecast'],['삼성 타입캐스트','Typecast'],['처음보는AI','기타'],[null,'기타']])assert.equal(h.aicostPlatformKey(input),key);
  const raw='삼성0000승인 합성\n12,000원 일시불\n10/06 12:00 TYPECAST.AI\n누적0원';
  assert.equal(h.aicostPlatformKey('기타',raw),'Typecast');
  const changed=structuredClone(seed);changed.merchants=[{contains:'NEW_AI',platform:'Higgsfield'}];
  assert.equal(h.aicostPlatformKey('기타',raw.replace('TYPECAST.AI','NEW_AI'),changed),'Higgsfield');
  assert.equal(h.aicostPlatformKey('기타',raw,changed),'기타');
  assert.equal(h.aicostPlatformKey('Claude',raw.replace('TYPECAST.AI','NEW_AI'),changed),'Higgsfield','문자 가맹점 연결을 고치면 기존 플랫폼 이름보다 우선 적용함');
  assert.equal(h.aicostPlatformKey('기타',raw.replace('TYPECAST.AI','가맹점').replace('합성','TYPECAST.AI')),'기타','이름 줄로 가맹점을 판단하지 않음');
});

test('실제 renderAicost는 새 플랫폼·합계·메모·설정을 그리고 문자 원문과 자동 메모는 노출하지 않음',async()=>{
  const secretText='개인표식-테스트전용';
  const {h,calls}=context({ai_billing:[{ym:'2026-10',platform:'기타',amount_krw:5000,note:'미등록AI 충전'}],ai_billing_events:[
    {received_at:'2026-10-06T12:00:00',platform:'기타',amount_krw:12000,raw_text:'삼성0000승인 '+secretText+'\n12,000원 일시불\n10/06 12:00 TYPECAST.AI\n누적0원',note:secretText},
    {received_at:'2026-10-06T12:01:00',platform:'HIGGSFIELDINC.',amount_krw:30000,raw_text:secretText},
    {received_at:'2026-10-06T12:02:00',platform:'미등록AI',amount_krw:2000,raw_text:secretText}
  ]});
  const target={innerHTML:''};await h.renderAicost(target);
  for(const s of ['힉스필드','타입캐스트','기타 AI','DeepSeek','StepFun','가맹점 연결','₩49,000','미등록AI 충전'])assert.ok(target.innerHTML.includes(s),s);
  assert.doesNotMatch(target.innerHTML,new RegExp(secretText+'|삼성0000|TYPECAST.AI|원문'));
  assert.ok(calls.some(x=>x[0]==='ai_billing_events'&&x[1]==='select'));
  assert.ok(!calls.some(x=>x[1]==='upsert'));
});

test('화면 이름·안내 문구·가맹점 수정은 owner일 때 app_settings에 저장하고 다시 적용됨',async()=>{
  const {h,c,calls,settings}=context();const msg={textContent:''};
  c.$=id=>id==='#aiSettingsMsg'?msg:{value:'변경 '+id.split('-').at(-1)};
  c.document={querySelectorAll(selector){return selector==='[data-aicost-merchant]'?[{querySelector:s=>({value:s==='[data-merchant-contains]'?'NEW_AI':'Typecast'})}]:[{dataset:{aicostText:'settings_title'},value:'새 분류 제목'}];}};
  await h.saveAicostSettings();const saved=JSON.parse(settings.aicost_config);
  assert.equal(saved.texts.settings_title,'새 분류 제목');assert.equal(saved.platforms[0].label,'변경 0');
  assert.equal(h.aicostPlatformKey('NEW_AI'),'Typecast');assert.match(h.aicostSettingsHtml(saved),/새 분류 제목/);
  assert.equal(calls.filter(x=>x[0]==='app_settings'&&x[1]==='upsert').length,1);
  c.ME.role='manager';await h.saveAicostSettings();assert.equal(calls.filter(x=>x[1]==='upsert').length,1);
});

test('설정 저장 실패는 기존 DB 설정을 바꾸지 않으며 잘못된 연결과 중복은 저장하지 않음',async()=>{
  const {h,c,settings}=context({writeError:{message:'합성 실패'}});const original=settings.aicost_config;
  c.$=id=>id==='#aiSettingsMsg'?{textContent:''}:{value:seed.platforms[Number(id.split('-').at(-1))].label};
  c.document={querySelectorAll:()=>[]};await h.saveAicostSettings();assert.equal(settings.aicost_config,original);
  const bad=structuredClone(seed);bad.merchants.push({...bad.merchants[0]});assert.throws(()=>h.aicostConfig(JSON.stringify(bad)));
  bad.merchants=[{contains:'x',platform:'없는 플랫폼'}];assert.throws(()=>h.aicostConfig(JSON.stringify(bad)));
});

test('비원장은 AI비용 조회·쓰기 전에 반환하고 사용자 설정은 HTML 이스케이프됨',async()=>{
  const {h,c,calls}=context();c.ME.role='staff';await h.renderAicost({innerHTML:''});await h.saveAicost(0);assert.equal(calls.length,0);
  c.ME.role='manager';const target={innerHTML:''};await h.renderAicost(target);assert.match(target.innerHTML,/기존 광고비 화면/);await h.saveAicost(0);assert.equal(calls.length,0);
  const evil=structuredClone(seed);evil.platforms[0].label='<img onerror=x>';evil.merchants[0].contains='"><svg onload=x>';evil.texts.settings_title='<script>x</script>';
  const out=h.aicostSettingsHtml(evil);assert.doesNotMatch(out,/<img|<svg|<script/);assert.match(out,/&lt;script&gt;/);
});

test('가맹점 설정 변경은 월·연간 내보내기에도 적용하고 광고비 이벤트는 AI비용에서 제외함',async()=>{
  const events=[{received_at:'2026-09-30T15:00:00Z',platform:'기타',amount_krw:12000,raw_text:'삼성0000승인 합성\n12,000원 일시불\n10/01 00:00 TYPECAST.AI\n누적0원'},
    {received_at:'2026-10-01T00:00:00Z',platform:'naver_ads',amount_krw:900000,note:'NAVER_AD_CHARGE'}];
  const {h,c}=context({ai_billing_events:events});const target={innerHTML:''};await h.renderAicost(target);
  assert.match(target.innerHTML,/₩12,000/);assert.doesNotMatch(target.innerHTML,/900,000|912,000|NAVER_AD_CHARGE/);
  const rows=h.billingAiRows([],events,'2026-10');assert.equal(rows.length,1);assert.equal(rows[0].category,'Typecast');assert.equal(rows[0].date,'2026-10-01');
  const changed=structuredClone(seed);changed.merchants=[{contains:'TYPECAST.AI',platform:'Higgsfield'}];c.SETTINGS.aicost_config=JSON.stringify(changed);
  assert.equal(h.billingAiRows([],events,'2026-10')[0].category,'Higgsfield');
  assert.match(target.innerHTML,/기존 광고비 화면/);assert.match(target.innerHTML,/saveAiMonthBudget|exportBilling\('ai'/);
});

test('새 설정 SQL 적용 전에도 기존 비용 화면과 사용량·내보내기가 실행되고 결제 원문은 숨겨짐',async()=>{
  const {h,c}=context({ai_billing_events:[{received_at:'2026-10-06T12:00:00Z',platform:'DeepSeek',amount_krw:1000,raw_text:'원문-표시금지'}]});
  delete c.SETTINGS.aicost_config;const target={innerHTML:''};await h.renderAicost(target);
  assert.match(target.innerHTML,/DeepSeek|StepFun/);assert.match(target.innerHTML,/₩1,000/);assert.match(target.innerHTML,/기존 광고비 화면/);
  assert.doesNotMatch(target.innerHTML,/원문-표시금지|<th>원문<\/th>/);
});

test('원문을 없앤 새 결제도 구조화 가맹점으로 같은 AI 분류·합계·내보내기에 들어감',async()=>{
 const {h}=context({ai_billing_events:[{received_at:'2026-10-06T12:00:00',platform:'AI',amount_krw:12000,raw_text:null,card_merchant:'TYPECAST.AI'}]});
 assert.equal(h.aicostPlatformKey('AI','',undefined,'TYPECAST.AI'),'Typecast');
 const target={innerHTML:''};await h.renderAicost(target);assert.match(target.innerHTML,/12,000/);
 assert.equal(h.billingAiRows([], [{received_at:'2026-10-06T12:00:00',platform:'AI',amount_krw:12000,raw_text:null,card_merchant:'TYPECAST.AI'}],'2026-10')[0].category,'Typecast');
});
