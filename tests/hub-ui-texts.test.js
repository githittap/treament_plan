// 직원허브 「⚙️ 허브 설정」(차례 1) 시험 — 허브 글·숫자·목록을 원장이 화면에서 고치는 기능.
// 기본값만 있을 때 화면 글이 지금과 같음 · 표에 값이 있으면 그 글 · 표 읽기 실패해도 기본값 · 원장 아닌 사람에게 탭이 안 보임 · 저장/되돌리기/검사.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('hub-texts.js'),hr=read('hr.html');
const clone=x=>JSON.parse(JSON.stringify(x));
const norm=s=>s.replace(/\r\n/g,'\n');

/* ── 순수 함수 블록만 vm으로 ── */
function helpers(){
  const block=js.match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)?.[0];
  assert.ok(block,'hub-texts.js에 순수 helper 블록이 없습니다.');
  const c={};
  vm.createContext(c);
  vm.runInContext(block+';this.h={hubText,hubTextHtml,hubFill,hubTextSetOverrides,hubTextOverride,hubSetting,hubSettingNumber,hubSettingSetValues,hubList,hubListParse,hubTextDefs,hubTextDefByKey,hubTextMatches,hubTextsFetch,hubTextsLoadInto,hubTextsSave,hubTextsReset,hubSettingSave,hubSettingReset,hubSettingValidate,HUB_SETTING_DEFS,HUB_LIST_DEFS,hubListSave,hubListReset,hubListValidate,hubWriteErrorMessage,HUB_TAB_DEFAULTS,HUB_MENU_DEFAULTS,HUB_INVITE_DEFAULT,HUB_NEXT_BODY_DEFAULT};',c);
  return c.h;
}
// 표(hub_ui_texts·app_settings)를 흉내 내는 가짜 supabase.
function fakeSb(opts){
  const o=opts||{},state={texts:(o.texts||[]).map(r=>Object.assign({},r)),settings:(o.settings||[]).map(r=>Object.assign({},r)),calls:[]};
  function from(table){
    const q={table,op:null,payload:null,opts:null,filters:{}};
    const api={
      select(c){q.op='select';q.cols=c;return api;},
      upsert(row,op){q.op='upsert';q.payload=row;q.opts=op;return api;},
      delete(){q.op='delete';return api;},
      eq(k,v){q.filters[k]=v;return api;},
      then(res,rej){
        state.calls.push(q);
        const rows=table==='hub_ui_texts'?state.texts:state.settings;
        let out;
        if(table!=='hub_ui_texts'&&table!=='app_settings')out={data:[],error:null};
        else if(q.op==='select')out=o.failSelect?{data:null,error:{message:'boom'}}:{data:rows.map(r=>Object.assign({},r)),error:null};
        else if(o.failWrite)out={data:null,error:{code:'42501',message:'new row violates row-level security policy'}};
        else if(q.op==='upsert'){const i=rows.findIndex(r=>r.key===q.payload.key);if(i>=0)rows[i]=Object.assign({},rows[i],q.payload);else rows.push(Object.assign({},q.payload));out={data:null,error:null};}
        else if(q.op==='delete'){const keep=rows.filter(r=>r.key!==q.filters.key);rows.length=0;keep.forEach(r=>rows.push(r));out={data:null,error:null};}
        return Promise.resolve(out).then(res,rej);
      }};
    return api;
  }
  const sb={};
  if(!o.noFrom)sb.from=from;
  return {sb,state};
}

/* ───────────── 1. 기본값 ───────────── */
test('덮어쓴 글이 없으면 hubText는 코드의 기본값 그대로, {자리표시자}만 채운다',()=>{
  const h=helpers();
  assert.equal(h.hubText('tab.home','홈'),'홈');
  assert.equal(h.hubText('owner.unlinked.title','계정 없는 근무명부 ({n}명)',{n:3}),'계정 없는 근무명부 (3명)');
  assert.equal(h.hubText('x.y','{a}-{b}',{a:1}),'1-{b}','없는 자리표시자는 그대로');
  assert.equal(h.hubTextHtml('owner.next.body',h.HUB_NEXT_BODY_DEFAULT).includes('<br>— 백엔드(표)는'),true,'줄바꿈은 <br>');
  assert.equal(h.hubTextHtml('x.y','<b>&</b>'),'&lt;b&gt;&amp;&lt;/b&gt;','글은 이스케이프');
});

test('hubSetting·hubList: 값이 없거나 모양이 틀리면 기본값',()=>{
  const h=helpers();
  assert.equal(h.hubSetting('late_cut','09:40'),'09:40');
  h.hubSettingSetValues({late_cut:'09:50',ot_unit_min:'  ',bad:5});
  assert.equal(h.hubSetting('late_cut','09:40'),'09:50');
  assert.equal(h.hubSetting('ot_unit_min','10'),'10','빈 값은 기본값');
  assert.equal(h.hubSettingNumber('late_cut',9),9,'숫자가 아니면 기본 숫자');
  h.hubSettingSetValues({ot_unit_min:'15'});
  assert.equal(h.hubSettingNumber('ot_unit_min',10),15);
  const def=clone(h.HUB_LIST_DEFS[0].def);
  assert.deepEqual(clone(h.hubList('list.profile_depts',def)),def);
  for(const bad of ['not json','{"a":1}','[]','[{"code":"a"}]','[{"code":"데스크","label":""}]','[{"code":"a","label":"x"},{"code":"a","label":"y"}]','[null]']){
    h.hubSettingSetValues({'list.profile_depts':bad});
    assert.deepEqual(clone(h.hubList('list.profile_depts',def)),def,'틀린 모양은 기본 목록: '+bad);
  }
});

test('목록: 코드는 고정이라 이름만 바뀌고, 기본 코드가 빠져도 되살아나며, 새 항목은 뒤에 붙는다',()=>{
  const h=helpers(),def=clone(h.HUB_LIST_DEFS[0].def);
  h.hubSettingSetValues({'list.profile_depts':JSON.stringify([{code:'데스크',label:'프런트'},{code:'진료실',label:'진료실'},{code:'안내팀',label:'안내팀'}])});
  const got=clone(h.hubList('list.profile_depts',def));
  assert.deepEqual(got.map(x=>x.code),['진료실','데스크','기공팀','기타','안내팀'],'기본 코드 순서 유지 + 새 항목은 뒤');
  assert.equal(got.find(x=>x.code==='데스크').label,'프런트');
  assert.equal(got.find(x=>x.code==='기공팀').label,'기공팀','SQL로 빠진 기본 코드는 기본 이름으로 되살아남');
});

test('기본값 목록: 탭 이름·메뉴 묶음 이름이 hr.html의 TABS·MENU와 같다(기본값만 있을 때 화면 글이 지금과 같음)',()=>{
  const h=helpers();
  const tabs=new Function('return ['+hr.match(/const TABS=\[([\s\S]*?)\n\];/)[1]+'\n]')();
  const menu=new Function('return ['+hr.match(/const MENU=\[([\s\S]*?)\n\];/)[1]+'\n]')();
  const tabLabels=Object.fromEntries(tabs.map(t=>[t.key,t.label]));
  tabLabels.ownerboards='📒 원장 보기판';
  const m=hr.match(/const HUB_SETTINGS_TAB=\{key:'hubset',label:'([^']+)'/);assert.ok(m);tabLabels.hubset=m[1];
  assert.deepEqual(Object.fromEntries(clone(h.HUB_TAB_DEFAULTS)),tabLabels,'탭 이름 기본값 일치');
  const groups=menu.filter(e=>e.kind==='group').map(e=>[e.key.replace(/-/g,'_'),e.label]);
  assert.deepEqual(clone(h.HUB_MENU_DEFAULTS),groups,'묶음 이름 기본값 일치');
  // 키 규칙(DB check와 같음)과 중복 없음
  const keys=h.hubTextDefs().map(d=>d.key);
  assert.equal(new Set(keys).size,keys.length);
  keys.forEach(k=>assert.match(k,/^[a-z][a-z0-9_.]{1,80}$/,k));
});

test('화면 코드(hr.html)에 박힌 hubText 기본값이 기본값 목록과 글자까지 같다',()=>{
  const h=helpers(),text=norm(hr);
  const found=new Map();
  const re=/hubText(?:Html)?\(\s*'([a-z0-9_.]+)'\s*,\s*('(?:[^'\\\n]|\\.)*')/g;
  let m;
  while((m=re.exec(text))){
    const key=m[1];if(key.startsWith('tab.')&&!key.includes('.owner'))continue;
    found.set(key,vm.runInNewContext(m[2]));
  }
  const ownerKeys=h.hubTextDefs().filter(d=>d.key.startsWith('owner.'));
  assert.ok(ownerKeys.length>=19,'계정·권한 글 키 수');
  for(const d of ownerKeys){
    if(d.key==='owner.invite.message')continue; // 변수에 담아 쓰므로 아래에서 따로 비교
    assert.ok(found.has(d.key),d.key+' 키가 hr.html에서 안 쓰임');
    assert.equal(found.get(d.key),d.def,d.key+' 기본값이 화면 코드와 다름');
  }
  for(const [k,v] of found){const d=h.hubTextDefByKey(k);if(d)assert.equal(v,d.def,k);}
});

/* ───────────── 2. 표에서 읽기·덮어쓰기·읽기 실패 ───────────── */
test('표에 값이 있으면 그 글, 없으면 기본값, 읽기에 실패해도 기본값',async()=>{
  const h=helpers();
  const t=fakeSb({texts:[{key:'tab.home',value:'시작'},{key:'owner.title',value:'  '},{key:'menu.g_work',value:'🕘 근무 · 새이름'}]});
  assert.equal(await h.hubTextsLoadInto(t.sb),true);
  assert.equal(h.hubText('tab.home','홈'),'시작');
  assert.equal(h.hubText('menu.g_work','🕘 근무'),'🕘 근무 · 새이름');
  assert.equal(h.hubText('owner.title','🛡️ 계정·권한 관리'),'🛡️ 계정·권한 관리','빈 글은 무시');
  assert.equal(h.hubText('tab.att','출퇴근'),'출퇴근');
  // 읽기 실패 → 덮어쓰기 비우고 기본값
  const bad=fakeSb({failSelect:true});
  assert.equal(await h.hubTextsLoadInto(bad.sb),false);
  assert.equal(h.hubText('tab.home','홈'),'홈');
  // 표가 아예 없는 연결(from 없음)도 안전
  assert.equal(await h.hubTextsLoadInto(fakeSb({noFrom:true}).sb),false);
  assert.equal(h.hubText('tab.home','홈'),'홈');
  assert.equal(await h.hubTextsLoadInto(null),false);
});

test('글 저장: 다르면 upsert, 같거나 비면 행을 지워 기본으로, 모르는 키·너무 긴 글·권한 없음은 거절',async()=>{
  const h=helpers(),t=fakeSb({});
  let r=await h.hubTextsSave(t.sb,'tab.home','시작');
  assert.deepEqual(clone(r),{ok:true,action:'saved'});
  assert.deepEqual(clone(t.state.calls.filter(c=>c.op==='upsert')[0].payload),{key:'tab.home',value:'시작'});
  assert.deepEqual(clone(t.state.calls.filter(c=>c.op==='upsert')[0].opts),{onConflict:'key'});
  assert.equal(h.hubText('tab.home','홈'),'시작');
  r=await h.hubTextsSave(t.sb,'tab.home','홈'); // 기본 글과 같음 → 행 삭제
  assert.deepEqual(clone(r),{ok:true,action:'reset'});assert.equal(t.state.texts.length,0);
  assert.equal(h.hubText('tab.home','홈'),'홈');
  await h.hubTextsSave(t.sb,'tab.home','시작2');
  r=await h.hubTextsSave(t.sb,'tab.home','   '); // 빈 글 → 기본으로
  assert.equal(r.action,'reset');assert.equal(t.state.texts.length,0);
  assert.equal((await h.hubTextsSave(t.sb,'no.such.key','x')).reason,'unknown_key');
  assert.equal((await h.hubTextsSave(t.sb,'tab.home','가'.repeat(20001))).reason,'too_long');
  const multi='첫째 줄\r\n둘째 줄';
  await h.hubTextsSave(t.sb,'owner.invite.message',multi);
  assert.equal(t.state.texts[0].value,'첫째 줄\n둘째 줄','줄바꿈 정리');
  assert.equal((await h.hubTextsReset(t.sb,'owner.invite.message')).action,'reset');
  assert.equal((await h.hubTextsReset(t.sb,'zz.no')).reason,'unknown_key');
  // 쓰기 실패(원장 아님)
  const f=fakeSb({failWrite:true});
  r=await h.hubTextsSave(f.sb,'tab.home','고친 글');
  assert.equal(r.ok,false);assert.equal(r.reason,'write_failed');assert.equal(r.error.code,'42501');
  assert.equal(h.hubText('tab.home','홈'),'홈','실패하면 화면 글은 안 바뀜');
  assert.equal((await h.hubTextsReset(f.sb,'tab.home')).ok,false);
  assert.match(h.hubWriteErrorMessage('저장',r.error),/원장 계정으로 로그인/);
});

/* ───────────── 3. 숫자·목록 저장 ───────────── */
test('숫자 기준: 시각·분 검사, 저장은 app_settings upsert, 되돌리기는 기본값을 다시 적음, 근태 기준 7개',async()=>{
  const h=helpers();
  assert.deepEqual(clone(h.HUB_SETTING_DEFS.slice(0,7).map(d=>[d.key,d.def])),[['late_cut','09:40'],['siueop','10:00'],['jongeop_weekday_evening','20:00'],['jongeop_weekday_day','18:30'],['jongeop_sat','17:00'],['jongeop_sun','14:00'],['ot_unit_min','10']],'db/hr_settings.sql 기본값과 같은 7개');
  const sql=read('db/hr_settings.sql');
  for(const d of h.HUB_SETTING_DEFS.slice(0,7))assert.match(sql,new RegExp("\\('"+d.key+"',\\s*'"+d.def+"'"),d.key+' 기본값이 SQL과 같음');
  // hr.html SETTINGS 코드 기본값과도 같음
  for(const d of h.HUB_SETTING_DEFS.slice(0,7))assert.match(hr,new RegExp(d.key+":'"+d.def+"'"),d.key+' hr.html 기본값');
  const obj={};h.hubSettingSetValues(obj);
  const t=fakeSb({});
  for(const bad of ['9:40','24:00','09:60','abc','','09:4']){const r=await h.hubSettingSave(t.sb,'late_cut',bad);assert.equal(r.ok,false,bad);assert.equal(r.reason,'invalid');}
  for(const bad of ['0','61','-1','1.5','abc','']){const r=await h.hubSettingSave(t.sb,'ot_unit_min',bad);assert.equal(r.ok,false,bad);}
  assert.equal(t.state.calls.length,0,'검사에 걸리면 DB를 부르지 않음');
  let r=await h.hubSettingSave(t.sb,'late_cut',' 09:50 ');
  assert.deepEqual(clone(r),{ok:true,action:'saved',value:'09:50'});
  assert.deepEqual(clone(t.state.calls[0].payload),{key:'late_cut',value:'09:50'});
  assert.equal(obj.late_cut,'09:50','호스트 SETTINGS 객체에 바로 반영');
  assert.equal(h.hubSetting('late_cut','09:40'),'09:50');
  r=await h.hubSettingSave(t.sb,'ot_unit_min','15');assert.equal(r.value,'15');assert.equal(obj.ot_unit_min,'15');
  r=await h.hubSettingReset(t.sb,'late_cut');
  assert.deepEqual(clone(r),{ok:true,action:'reset',value:'09:40'});
  assert.equal(t.state.settings.find(x=>x.key==='late_cut').value,'09:40');
  assert.equal(t.state.calls.every(c=>c.op==='upsert'),true,'app_settings는 지우기 정책이 없어 지우지 않음');
  assert.equal((await h.hubSettingSave(t.sb,'hr_tab_roles','x')).reason,'unknown_key','목록에 없는 설정 키(탭 권한 등)는 못 고침');
  const f=fakeSb({failWrite:true});
  r=await h.hubSettingSave(f.sb,'late_cut','09:55');assert.equal(r.ok,false);assert.equal(r.reason,'write_failed');
  assert.equal(obj.late_cut,'09:40','실패하면 메모리 값도 안 바뀜');
});

test('목록 저장 검사: 기본 코드 유지·새 항목은 addable만·이름 중복/빈 값/특수문자 거절·JSON으로 저장',async()=>{
  const h=helpers(),def=h.HUB_LIST_DEFS[0],d=clone(def.def);
  const ok=h.hubListValidate(def,[{code:'진료실',label:'진료실'},{code:'데스크',label:'프런트'},{code:'기공팀',label:'기공팀'},{code:'기타',label:'기타'},{code:'안내팀',label:'안내팀'}]);
  assert.equal(ok.ok,true);assert.equal(JSON.parse(ok.value).length,5);
  for(const [name,items] of [
    ['빈 목록',[]],['기본 항목 삭제',d.slice(1)],['이름 빈 값',d.map((x,i)=>i?x:{code:x.code,label:' '})],
    ['이름 중복',d.map((x,i)=>i===1?{code:x.code,label:'진료실'}:x)],['코드 중복',d.concat([{code:'기타',label:'기타2'}])],
    ['너무 긴 이름',d.concat([{code:'새',label:'가'.repeat(21)}])],['특수문자',d.concat([{code:'a<b',label:'a<b'}])]
  ])assert.equal(h.hubListValidate(def,items).ok,false,name);
  assert.equal(h.hubListValidate({addable:false,def:d},d.concat([{code:'새',label:'새'}])).ok,false,'addable 아니면 새 항목 불가');
  const t=fakeSb({}),obj={};h.hubSettingSetValues(obj);
  const r=await h.hubListSave(t.sb,'list.profile_depts',[{code:'진료실',label:'진료실'},{code:'데스크',label:'프런트'},{code:'기공팀',label:'기공팀'},{code:'기타',label:'기타'}]);
  assert.equal(r.ok,true);
  assert.deepEqual(JSON.parse(t.state.settings[0].value).find(x=>x.code==='데스크'),{code:'데스크',label:'프런트'});
  assert.equal(clone(h.hubList('list.profile_depts',d)).find(x=>x.code==='데스크').label,'프런트');
  const rr=await h.hubListReset(t.sb,'list.profile_depts');
  assert.equal(rr.ok,true);assert.deepEqual(JSON.parse(t.state.settings[0].value),d);
  assert.equal((await h.hubListSave(t.sb,'list.nope',d)).reason,'unknown_key');
  assert.equal((await h.hubListSave(fakeSb({failWrite:true}).sb,'list.profile_depts',d)).reason,'write_failed');
});

test('검색칸: 키·위치 설명·기본 글·지금 글 어디든 낱말이 모두 들어 있으면 보임',()=>{
  const h=helpers(),d=h.hubTextDefByKey('owner.invite.message');
  assert.equal(h.hubTextMatches(d,'',null),true);
  assert.equal(h.hubTextMatches(d,'가입 안내',null),true);
  assert.equal(h.hubTextMatches(d,'OWNER.INVITE',null),true,'대소문자 무시');
  assert.equal(h.hubTextMatches(d,'카톡 승인',null),true,'낱말 AND');
  assert.equal(h.hubTextMatches(d,'급여명세',null),false);
  assert.equal(h.hubTextMatches(d,'새로고친글','새로고친글 들어감'),true,'지금 글도 검색');
});

/* ───────────── 4. 화면 코드: 메뉴·탭·계정 화면 ───────────── */
const menuBlock=hr.match(/\/\* menu-restructure:test-start \*\/([\s\S]*?)\/\* menu-restructure:test-end \*\//);
const tabsSource=hr.match(/const TABS=\[([\s\S]*?)\n\];/),menuSource=hr.match(/const MENU=\[([\s\S]*?)\n\];/);
const hubTabSource=hr.match(/const HUB_SETTINGS_TAB=[\s\S]*?installHubSettingsTab\(TABS,MENU\);/);
function menuHarness({role='staff',tabRoles={},tabOverrides={},tab='home',texts=null,withEngine=true}={}){
  assert.ok(menuBlock&&tabsSource&&menuSource&&hubTabSource);
  const nav={innerHTML:''},nav2={innerHTML:''};
  const ctx={ME:{id:'u1',role,confidAccess:true},TAB_ROLES:tabRoles,TAB_OVERRIDES:tabOverrides,BADGE:{},TAB:tab,$:s=>(s==='#nav'?nav:s==='#nav2'?nav2:null)};
  vm.createContext(ctx);
  if(withEngine){vm.runInContext(js,ctx);if(texts)ctx.HubUi.setSettings({});}
  vm.runInContext(`const TABS=[${tabsSource[1]}\n];const MENU=[${menuSource[1]}\n];${menuBlock[1]}\n${hubTabSource[0]}
    this.TABS=TABS;this.MENU=MENU;this.renderNav=renderNav;this.tabLabel=tabLabel;this.visibleTabKeys=visibleTabKeys;this.menuTopRow=menuTopRow;this.menuSubRow=menuSubRow;`,ctx);
  if(texts)vm.runInContext('0',ctx);
  return {ctx,nav,nav2};
}
const labelsOf=html=>[...html.matchAll(/<button class="[^"]*" onclick="go\('[^']+'\)">(.*?)(?:<span class="cnt">|<\/button>)/g)].map(m=>m[1]);

test('기본값만 있을 때 메뉴·탭 이름 줄은 허브 설정 도입 전과 글자 하나도 다르지 않다(원장 줄에는 새 탭만 더해짐)',()=>{
  for(const role of ['staff','manager','chief','owner']){
    const withHub=menuHarness({role}),without=menuHarness({role,withEngine:false});
    withHub.ctx.TAB='home';without.ctx.TAB='home';
    withHub.ctx.renderNav();without.ctx.renderNav();
    assert.equal(withHub.nav.innerHTML,without.nav.innerHTML,role+' 위줄');
    for(const k of ['sched','owner','confid','contract']){
      withHub.ctx.TAB=k;without.ctx.TAB=k;withHub.ctx.renderNav();without.ctx.renderNav();
      assert.equal(withHub.nav.innerHTML,without.nav.innerHTML,role+' 위줄 '+k);
      if(role==='owner'&&k==='owner')continue; // 원장 전용 묶음의 아래줄만 새 탭이 더해짐
      assert.equal(withHub.nav2.innerHTML,without.nav2.innerHTML,role+' 아래줄 '+k);
    }
  }
});

test('원장이 탭·묶음 이름을 고치면 그 이름으로 보이고, 표를 못 읽으면 기본 이름',()=>{
  const h=menuHarness({role:'owner',tab:'owner'});
  h.ctx.HubUi.load({from(){const api={select(){return api;},then(res,rej){return Promise.resolve({data:[{key:'tab.owner',value:'🛡️ 계정·권한(원장)'},{key:'menu.g_owner',value:'🔒 원장방'},{key:'tab.sched',value:'근무표 보기'}],error:null}).then(res,rej);}};return api;}});
  return new Promise(r=>setImmediate(r)).then(()=>{
    h.ctx.renderNav();
    assert.ok(labelsOf(h.nav.innerHTML).includes('🔒 원장방'),'묶음 이름');
    assert.ok(labelsOf(h.nav2.innerHTML).includes('🛡️ 계정·권한(원장)'),'탭 이름(아래줄)');
    assert.equal(h.ctx.tabLabel('sched'),'근무표 보기');
    assert.equal(h.ctx.tabLabel('att'),'출퇴근','안 고친 탭은 그대로');
    assert.equal(h.ctx.MENU.find(e=>e.key==='g-owner').label,'🔒 원장 전용','MENU 코드의 기본 이름은 그대로(보드와 대조하는 정본)');
  });
});

test('⚙️ 허브 설정 탭: 원장 전용 묶음에 계정·권한 다음으로 들어가고, 원장만 보인다(직원에게 강제로 열어 줘도 안 보임)',()=>{
  const o=menuHarness({role:'owner',tab:'owner'});
  assert.deepEqual(clone(o.ctx.MENU.find(e=>e.key==='g-owner').children),['owner','hubset','aicost','pay']);
  const hub=clone(o.ctx.TABS.find(t=>t.key==='hubset'));
  assert.deepEqual(hub,{key:'hubset',label:'⚙️ 허브 설정',roles:['owner']});
  assert.ok(o.ctx.visibleTabKeys().has('hubset'));
  o.ctx.renderNav();
  assert.ok(labelsOf(o.nav2.innerHTML).includes('⚙️ 허브 설정'));
  for(const role of ['staff','manager','chief','deputy']){
    for(const forced of [{},{tabRoles:{hubset:['staff','manager','chief','owner']}},{tabOverrides:{u1:{hubset:true}}},{tabRoles:{hubset:['staff','manager','chief','owner']},tabOverrides:{u1:{hubset:true}}}]){
      const s=menuHarness(Object.assign({role,tab:'home'},forced));
      assert.equal(s.ctx.visibleTabKeys().has('hubset'),false,role+' '+JSON.stringify(forced));
      s.ctx.renderNav();
      assert.doesNotMatch(s.nav.innerHTML+s.nav2.innerHTML,/허브 설정/,role);
    }
  }
  // 원장 보기판처럼 다른 탭 규칙은 그대로
  const st=menuHarness({role:'staff'});
  assert.equal(st.ctx.visibleTabKeys().has('owner'),false);
  assert.match(hr,/else if\(TAB==='hubset'\)\{if\(window\.HubUi\)await window\.HubUi\.renderSettings\(m,\{sb,me:ME\}\)/);
  assert.match(hr,/<script src="hub-texts\.js\?v=\d+"><\/script>\s*<script src="security-pledge\.js\?v=[0-9a-z]+"><\/script>\s*<script>\s*\/\* ═+ 설정 ═+/,'hub-texts.js는 main 스크립트보다 먼저 불러옴');
  assert.match(hr,/<script src="ai-assistants\.js\?v=2026100309"><\/script>/,'AI 도우미 스크립트 번호(10-02 원장요청 5건에서 2026100106 → 2026100221)');
});

test('가입 안내 글: 기본은 지금과 같은 글, 원장이 고치면 그 글(복사되는 글)',()=>{
  const ORIGINAL='아산정플란트치과 직원허브 가입 안내입니다.\n\n1) 아래 링크로 접속해 회원가입 해주세요.\nhttps://jung-plant.com/hr.html\n2) 회원가입 후 원장 승인을 기다려 주세요.\n3) 승인되면 같은 링크에서 로그인하시면 됩니다.';
  const block=hr.match(/\/\* account-filling:test-start \*\/([\s\S]*?)\/\* account-filling:test-end \*\//)[1];
  // 허브 설정 엔진이 없는 실행(옛 시험 환경)
  const bare={};vm.createContext(bare);vm.runInContext(block+';this.f=inviteMessageText;',bare);
  assert.equal(bare.f(),ORIGINAL);
  // 엔진이 있고 덮어쓴 글이 없을 때
  const c={};vm.createContext(c);vm.runInContext(js,c);vm.runInContext(block+';this.f=inviteMessageText;',c);
  assert.equal(c.f(),ORIGINAL);
  assert.equal(helpers().HUB_INVITE_DEFAULT,ORIGINAL,'기본값 목록의 글도 같음');
  // 덮어쓰기
  const o={};vm.createContext(o);vm.runInContext(js,o);vm.runInContext(block+';this.f=inviteMessageText;',o);
  return o.HubUi.load({from(){const api={select(){return api;},then(res,rej){return Promise.resolve({data:[{key:'owner.invite.message',value:'새 직원 안내\n링크: https://jung-plant.com/hr.html'}],error:null}).then(res,rej);}};return api;}}).then(()=>{
    assert.equal(o.f(),'새 직원 안내\n링크: https://jung-plant.com/hr.html');
  });
});

// renderOwner를 가짜 자료로 실제 실행해 기본값 HTML과 덮어쓴 HTML을 본다.
function ownerHarness(texts){
  const src=hr.match(/async function renderOwner\([\s\S]*?\r?\n\}\r?\n(?=async function setRole)/);assert.ok(src);
  const fill=hr.match(/\/\* account-filling:test-start \*\/([\s\S]*?)\/\* account-filling:test-end \*\//)[1];
  const del=hr.match(/\/\* account-delete-ui:test-start \*\/([\s\S]*?)\/\* account-delete-ui:test-end \*\//)[1];
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const TABS=[{key:'att',label:'출퇴근',roles:['staff','owner']},{key:'deposit',label:'입금',roles:['staff','owner']},{key:'sched',label:'근무표',roles:['staff','owner']},{key:'leave',label:'연차',roles:['staff','owner']},{key:'appr',label:'결재함',roles:['staff','owner']},{key:'notice',label:'공지',roles:['staff','owner']},{key:'onbo',label:'내 서류함',roles:['staff','owner']},{key:'ai',label:'🤖 AI 도우미',roles:['staff','owner']}];
  const ctx={ME:{id:'o1',role:'owner'},PROFILES:[{user_id:'o1',name:'원장',role:'owner',approved:true,dept:'진료실'},{user_id:'s1',name:'김직원',role:'staff',approved:true,dept:'데스크'},{user_id:'s2',name:'신입',role:'staff',approved:false,dept:'교육팀',created_at:'2026-09-30T00:00:00Z',account_access_status:'활성'}],
    SCHEDULE_PEOPLE:[{id:'p1',name:'미가입 명부',department:'진료실',active:true}],SCHEDULE_DEPARTMENTS:['Dr.','진료실','데스크','기공실','미지정','상담','행정'],BULK_ROLE_SELECTED:new Set(),BULK_ROLE_ALLOWED_ROLES:['staff','manager','chief','deputy'],
    TABS,TAB_ROLES:{},TAB_OVERRIDES:{},esc,md:s=>s?String(s).slice(5).replace('-','/'):'',today:()=>'2026-10-01',$:()=>null,renderJobGroupAdmin:()=>'',previewEmployeeJobGroup(){},renderOverrideRows(){},
    sb:{rpc:async()=>({data:[],error:null}),from(){const api={select(){return Promise.resolve({data:[]});}};return api;}}};
  vm.createContext(ctx);
  vm.runInContext(js,ctx);
  vm.runInContext(fs.readFileSync('security-pledge.js','utf8'),ctx);
  vm.runInContext(fill+'\n'+del+'\n'+src[0]+'\nfunction tabLabel(k){const t=TABS.find(x=>x.key===k);return t?hubText("tab."+k,t.label):k;}\nthis.renderOwner=renderOwner;',ctx);
  return ctx;
}
async function loadTexts(ctx,rows){await ctx.HubUi.load({from(){const api={select(){return api;},then(res,rej){return Promise.resolve({data:rows,error:null}).then(res,rej);}};return api;}});}
test('계정·권한 화면: 기본값이면 지금 글 그대로, 원장이 고친 글·부서 이름이 있으면 그 글',async()=>{
  const ctx=ownerHarness(),m={innerHTML:''};
  ctx.HubUi.setSettings({});
  await ctx.renderOwner(m);
  const base=m.innerHTML;
  for(const s of ['<h2>🛡️ 계정·권한 관리</h2>','<div class="sub">직원 명부</div>','<h3>🧩 미가입자·승인 대기</h3>','<div class="hint">근무명부에는 있지만 계정이 없는 사람과, 가입 후 원장 승인을 기다리는 사람을 모았습니다.</div>',
    '>가입 안내 문구 복사</button>','<h4>계정 없는 근무명부 (1명)</h4>','<h4>🆕 가입 승인 대기 (1명)</h4>','<h3>직원 권한 관리 <span class="sub">(입퇴사·승진 시 여기서 변경)</span></h3>',
    '<h3>🔒 케이스노트 접근 명단</h3>','<h3>🧭 탭 노출 설정 <span class="sub">(역할별 · 즉시 반영)</span></h3>','<td>출퇴근</td>','<h3>👤 사람별 탭 예외 <span class="sub">(역할 기본을 개인별로 덮어씀 · 즉시 반영)</span></h3>',
    '<h2>다음 설계 예정/혹은 할일 <span class="sub">(설계 완료·구현 예정)</span></h2>','<div class="stub">M2 근무표·계약서 자동생성 · M3 급여 대시보드/명세서 발행·월말 평가·휴일근로 계산기 · M4 채용·입금피드·기공차트 통합<br>— 백엔드(표)는 이미 준비됨. 화면만 순차 추가.</div>',
    '<option value="진료실" selected>진료실</option><option value="데스크" >데스크</option><option value="기공팀" >기공팀</option><option value="기타" >기타</option>','<option value="교육팀" selected>교육팀</option>'])
    assert.ok(base.includes(s),'기본 화면에 이 글이 없음: '+s);
  // 원장이 고친 글
  const c2=ownerHarness();
  await loadTexts(c2,[{key:'owner.title',value:'🛡️ 계정·권한 (원장)'},{key:'owner.pending.title',value:'🧩 가입 대기'},{key:'owner.unlinked.title',value:'계정 없는 분 {n}명'},{key:'owner.next.body',value:'첫 줄\n둘째 <b>줄</b>'},{key:'tab.att',value:'근태'}]);
  c2.HubUi.setSettings({'list.profile_depts':JSON.stringify([{code:'데스크',label:'프런트'},{code:'교육팀',label:'교육팀'}])});
  const m2={innerHTML:''};await c2.renderOwner(m2);
  const h2=m2.innerHTML;
  assert.ok(h2.includes('<h2>🛡️ 계정·권한 (원장)</h2>'));assert.ok(h2.includes('<h3>🧩 가입 대기</h3>'));assert.ok(h2.includes('<h4>계정 없는 분 1명</h4>'));
  assert.ok(h2.includes('<div class="stub">첫 줄<br>둘째 &lt;b&gt;줄&lt;/b&gt;</div>'),'긴 글은 줄바꿈만 <br>, 나머지는 이스케이프');
  assert.ok(h2.includes('<td>근태</td>'),'탭 이름이 탭 노출 설정 표에도 반영');
  assert.ok(h2.includes('<option value="데스크" selected>프런트</option>'),'부서는 보이는 이름만 바뀌고 값은 코드 그대로(선택 유지)');
  assert.ok(h2.includes('<option value="진료실" >진료실</option>')||h2.includes('<option value="진료실" selected>진료실</option>'),'안 고친 기본 부서는 그대로');
  assert.ok(h2.includes('<option value="교육팀" >교육팀</option>')||h2.includes('<option value="교육팀" selected>교육팀</option>'),'원장이 늘린 부서가 선택지에 나옴');
  assert.equal(h2.includes('>데스크</option>'),false,'데스크 코드는 이름이 프런트로만 보임');
  // 표를 못 읽으면 기본 화면과 같음
  const c3=ownerHarness();await c3.HubUi.load({from(){const api={select(){return api;},then(res,rej){return Promise.resolve({data:null,error:{message:'x'}}).then(res,rej);}};return api;}});
  c3.HubUi.setSettings({});
  const m3={innerHTML:''};await c3.renderOwner(m3);
  assert.equal(m3.innerHTML,base);
});

/* ───────────── 5. 「⚙️ 허브 설정」 화면(가짜 DOM) ───────────── */
function ui(opts){
  const handlers={},registry={},{sb,state}=fakeSb(opts);
  function attrs(html,name){const out=[];const re=new RegExp('data-'+name+'(?:="([^"]*)")?','g');let m;while((m=re.exec(html)))out.push(m[1]==null?'':m[1]);return out;}
  function listAll(el,sel){
    const m=sel.match(/^\[data-([\w-]+)\]$/);if(!m)return [];
    return attrs(el.innerHTML,m[1]).map(function(v){return {addEventListener(t,f){handlers['['+m[1]+']='+v+'|'+t]=f;},getAttribute(){return v;}};});
  }
  function makeEl(key){const el={innerHTML:'',value:'',textContent:'',hidden:false,addEventListener(t,f){handlers[key+'|'+t]=f;},querySelector(sel){return getEl(sel);},querySelectorAll(sel){return listAll(el,sel);},getAttribute(){return '';}};return el;}
  function getEl(sel){if(sel[0]==='#'){registry[sel]=registry[sel]||makeEl(sel);return registry[sel];}return {addEventListener(t,f){handlers[sel.replace('[data-','[')+'|'+t]=f;}};}
  const rootEl=makeEl('root');
  const ctx={window:{},document:{head:{appendChild(){}},createElement(){return {};}}};
  vm.createContext(ctx);vm.runInContext(js,ctx);
  const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
  return {ctx,root:rootEl,section:getEl('#hubSection'),el:getEl,sb,state,settle,has(k){return (k+'|click') in handlers;},
    async click(key){const r=handlers[key+'|click']();await settle();return r;},
    async render(me){await ctx.window.HubUi.renderSettings(rootEl,{sb,me});await settle();}};
}

test('화면: 원장이 아니면 아무것도 그리지 않고 표를 부르지도 않는다(직원·매니저·실장·부원장·로그인 정보 없음)',async()=>{
  for(const me of [{id:'u',role:'staff'},{id:'u',role:'manager'},{id:'u',role:'chief'},{id:'u',role:'deputy'},{},null]){
    const t=ui({});
    await t.render(me);
    assert.doesNotMatch(t.root.innerHTML,/글 고치기|숫자·기준|data-hub/,JSON.stringify(me));
    assert.match(t.root.innerHTML,/원장만 볼 수 있는 화면/);
    assert.equal(t.state.calls.length,0,'표 호출 없음');
  }
});

test('화면: 원장에게는 「📝 글 고치기 · 🔢 숫자·기준 · 📋 목록」 세 칸이 있고, 글은 화면별로 접혀 검색칸이 있다',async()=>{
  const t=ui({texts:[{key:'tab.home',value:'시작'}]});
  await t.render({id:'o1',role:'owner'});
  const html=t.root.innerHTML;
  assert.match(html,/<h2>⚙️ 허브 설정<\/h2>/);
  for(const k of ['texts','settings','lists'])assert.match(html,new RegExp('data-hub-subtab="'+k+'"'));
  assert.match(html,/📝 글 고치기/);assert.match(html,/🔢 숫자·기준/);assert.match(html,/📋 목록/);
  const sec=t.section.innerHTML;
  assert.match(sec,/<input id="hubTxtSearch"/);
  assert.equal((sec.match(/<details class="hub-grp" data-hub-group="/g)||[]).length,3+11+17+12+9+5+14+1+3+1+1,'화면별 접기: 탭 이름·메뉴 묶음 이름·계정·권한 + 차례 2(내 서류함 8 · 업무자료 3) + 차례 3(출퇴근 5 · 근무표 2 · 연차 4) + 차례 4(결재함 4 · 공지 3 · 캘린더 3 · 건의함 2) + 차례 5(문의함 6 · 상담일지 3) + 시간 표시 1(⏰ 시간 표시 · 2026-10-02)');
  const n=(sec.match(/data-hub-text-save="\d+"/g)||[]).length;
  assert.equal(n,21+4+19+193+439+147+168+188+329+8+2+5+35+27+12+41,'키마다 저장 단추(P7 이름 보기·계약 직무 별칭·충돌 안내·보안서약 키를 포함함)');
  assert.equal((sec.match(/data-hub-text-reset="\d+"/g)||[]).length,n);
  assert.match(sec,/고친 것 1개/);assert.match(sec,/<span class="b ok">고침<\/span>/);
  assert.match(sec,/이름표: tab\.home/);
  assert.match(sec,/<pre class="hub-def">홈<\/pre>/,'기본 글');
  assert.match(sec,/id="hubTxtIn_0" rows="2">시작<\/textarea>/,'지금 글');
  assert.match(sec,/가입 안내 카톡 글/);
  assert.match(sec,/글 안의 \{n\}은 화면이 채워 넣는 자리/);
  assert.ok(t.state.calls.some(c=>c.table==='hub_ui_texts'&&c.op==='select'));
  assert.match(html,/🤖 AI 도우미 안내 문구는 「🤖 AI 도우미」 탭의 「📝 안내 문구」에서/);
});

test('화면: 글을 고쳐 저장하면 hub_ui_texts에 upsert, 되돌리기를 누르면 행이 지워지고 입력칸이 기본 글로',async()=>{
  const t=ui({});
  await t.render({id:'o1',role:'owner'});
  const i=0; // tab.home
  t.el('#hubTxtIn_'+i).value='시작 화면';
  await t.click('[hub-text-save]='+i);
  const up=t.state.calls.filter(c=>c.op==='upsert');
  assert.equal(up.length,1);assert.deepEqual(clone(up[0].payload),{key:'tab.home',value:'시작 화면'});
  assert.equal(t.el('#hubTxtMsg_'+i).textContent,'저장했어요.');
  assert.match(t.el('#hubTxtBadge_'+i).innerHTML,/고침/);
  assert.equal(t.state.texts[0].value,'시작 화면');
  await t.click('[hub-text-reset]='+i);
  assert.equal(t.state.texts.length,0);
  assert.equal(t.el('#hubTxtMsg_'+i).textContent,'기본 글로 돌렸어요.');
  assert.equal(t.el('#hubTxtIn_'+i).value,'홈');
  assert.equal(t.el('#hubTxtBadge_'+i).innerHTML,'');
  // 기본 글과 같게 적고 저장 → 지워 기본으로
  t.el('#hubTxtIn_'+i).value='홈';
  await t.click('[hub-text-save]='+i);
  assert.match(t.el('#hubTxtMsg_'+i).textContent,/기본 글로 돌렸어요/);
  // 쓰기 실패는 쉬운 말
  const f=ui({failWrite:true});await f.render({id:'o1',role:'owner'});
  f.el('#hubTxtIn_0').value='고친 글';await f.click('[hub-text-save]=0');
  assert.match(f.el('#hubTxtMsg_0').textContent,/저장하지 못했어요 — 원장 계정으로 로그인/);
  // 탭·메뉴 이름을 고치면 위쪽 메뉴를 다시 그린다
  let redrawn=0;t.ctx.window.renderNav=function(){redrawn++;};
  t.el('#hubTxtIn_0').value='시작';await t.click('[hub-text-save]=0');
  assert.equal(redrawn,1);
});

test('화면: 글 표를 못 읽으면 안내만 보이고(깨지지 않음) 다른 칸은 열린다',async()=>{
  const t=ui({failSelect:true});
  await t.render({id:'o1',role:'owner'});
  assert.match(t.section.innerHTML,/불러오지 못했습니다/);
  assert.match(t.section.innerHTML,/hub_ui_texts/);
});

test('화면: 🔢 숫자·기준 — 근태 기준 7개, 잘못된 값은 DB 호출 없이 거절, 저장·되돌리기',async()=>{
  const t=ui({settings:[{key:'late_cut',value:'09:50'}]});
  await t.render({id:'o1',role:'owner'});
  await t.click('[hub-subtab]=settings');
  const sec=t.section.innerHTML;
  assert.equal((sec.match(/data-hub-set-save="\d+"/g)||[]).length,7+5+2+4+1+8+1+1+6+1);
  assert.match(sec,/id="hubSetIn_0" type="time" value="09:50"/,'지금 값(표에서 읽음)');
  assert.match(sec,/처음 값 09:40/);
  assert.match(sec,/<span id="hubSetBadge_0"><span class="b ok">고침<\/span><\/span>/);
  assert.match(sec,/id="hubSetIn_6" type="number"[^>]*min="1" max="60" value="10"/);
  const before=t.state.calls.length;
  t.el('#hubSetIn_0').value='9시';await t.click('[hub-set-save]=0');
  assert.match(t.el('#hubSetMsg_0').textContent,/저장하지 못했어요 — 시각은/);
  t.el('#hubSetIn_6').value='99';await t.click('[hub-set-save]=6');
  assert.match(t.el('#hubSetMsg_6').textContent,/1부터 60까지/);
  assert.equal(t.state.calls.length,before,'검사에 걸리면 DB를 안 부름');
  t.el('#hubSetIn_0').value='09:45';await t.click('[hub-set-save]=0');
  assert.equal(t.el('#hubSetMsg_0').textContent,'저장했어요.');
  assert.equal(t.state.settings.find(x=>x.key==='late_cut').value,'09:45');
  await t.click('[hub-set-reset]=0');
  assert.equal(t.state.settings.find(x=>x.key==='late_cut').value,'09:40');
  assert.equal(t.el('#hubSetMsg_0').textContent,'처음 값으로 돌렸어요.');
  assert.equal(t.el('#hubSetBadge_0').innerHTML,'');
  const f=ui({failWrite:true});await f.render({id:'o1',role:'owner'});await f.click('[hub-subtab]=settings');
  f.el('#hubSetIn_0').value='09:41';await f.click('[hub-set-save]=0');
  assert.match(f.el('#hubSetMsg_0').textContent,/원장 계정으로 로그인/);
});

test('화면: 📋 목록 — 코드는 회색(못 고침), 이름만 고침, 새 부서 추가·빼기·저장·되돌리기',async()=>{
  const t=ui({});
  await t.render({id:'o1',role:'owner'});
  await t.click('[hub-subtab]=lists');
  let sec=t.section.innerHTML;
  assert.match(sec,/직원 부서/);
  assert.equal((sec.match(/<span class="hub-code">/g)||[]).length,4+6+3+4+4+7+6+3+8+7+6+5+32+3,'기본 코드 수(기존 목록 + B2 소명 종류 3)');
  assert.match(sec,/<span class="hub-code">데스크<\/span><input id="hubLstLbl_0_1" type="text" maxlength="20" value="데스크"/);
  assert.equal((sec.match(/data-hub-list-del=/g)||[]).length,0,'기본 항목은 뺄 수 없음');
  assert.match(sec,/data-hub-list-add="0"/);
  // 이름 고치기 + 새 항목(가짜 화면은 입력칸 값을 HTML에서 읽지 않으므로 지금 이름을 칸마다 넣어 준다)
  ['진료실','프런트','기공팀','기타'].forEach((v,i)=>{t.el('#hubLstLbl_0_'+i).value=v;});
  t.el('#hubLstNew_0').value='안내팀';
  await t.click('[hub-list-add]=0');
  sec=t.section.innerHTML;
  assert.match(sec,/<span class="hub-code">안내팀<\/span>/);
  assert.match(sec,/data-hub-list-del="0:4"/,'새 항목만 뺄 수 있음');
  assert.match(sec,/id="hubLstLbl_0_1" type="text" maxlength="20" value="프런트"/,'추가해도 고치던 이름이 안 사라짐');
  assert.equal(t.state.settings.length,0,'저장 전에는 DB 안 건드림');
  // 중복·빈 이름 거절
  t.el('#hubLstLbl_0_4').value='안내팀';
  t.el('#hubLstNew_0').value='기타';await t.click('[hub-list-add]=0');
  assert.match(t.el('#hubLstMsg_0').textContent,/같은 코드|같은 이름/);
  // 저장
  await t.click('[hub-list-save]=0');
  assert.equal(t.el('#hubLstMsg_0').textContent,'저장했어요.');
  const saved=JSON.parse(t.state.settings.find(x=>x.key==='list.profile_depts').value);
  assert.deepEqual(saved,[{code:'진료실',label:'진료실'},{code:'데스크',label:'프런트'},{code:'기공팀',label:'기공팀'},{code:'기타',label:'기타'},{code:'안내팀',label:'안내팀'}]);
  // 새 항목 빼기 → 저장 → 되돌리기
  await t.click('[hub-list-del]=0:4');
  await t.click('[hub-list-save]=0');
  assert.equal(JSON.parse(t.state.settings[0].value).length,4);
  await t.click('[hub-list-reset]=0');
  assert.deepEqual(JSON.parse(t.state.settings[0].value),[{code:'진료실',label:'진료실'},{code:'데스크',label:'데스크'},{code:'기공팀',label:'기공팀'},{code:'기타',label:'기타'}]);
  assert.equal(t.el('#hubLstMsg_0').textContent,'처음 목록으로 돌렸어요.');
  // 쓰기 실패
  const f=ui({failWrite:true});await f.render({id:'o1',role:'owner'});await f.click('[hub-subtab]=lists');
  ['진료실','데스크','기공팀','기타'].forEach((v,i)=>{f.el('#hubLstLbl_0_'+i).value=v;});
  await f.click('[hub-list-save]=0');
  assert.match(f.el('#hubLstMsg_0').textContent,/원장 계정으로 로그인/);
});

test('화면: 검색은 맞는 줄만 보이고 맞는 줄이 없는 묶음은 숨기며 검색어가 있으면 펼친다',()=>{
  const t=ui({});
  // 가짜 묶음 2개: 묶음A(탭 이름 줄 2개), 묶음B(계정·권한 줄 1개)
  const h=t.ctx.window.HubUi;
  const rowsOf=(idx)=>idx.map(i=>({hidden:false,getAttribute(){return String(i);}}));
  const gA={hidden:false,open:false,rows:rowsOf([0,1]),querySelectorAll(){return this.rows;}};
  const inviteAt=helpers().hubTextDefs().findIndex(d=>d.key==='owner.invite.message');
  const gB={hidden:false,open:false,rows:rowsOf([inviteAt]),querySelectorAll(){return this.rows;}};
  const sec={querySelectorAll(sel){return sel==='[data-hub-group]'?[gA,gB]:[];}};
  h.applyTextFilter(sec,'가입 안내');
  assert.equal(gA.hidden,true,'맞는 줄 없는 묶음은 숨김');assert.equal(gB.hidden,false);assert.equal(gB.open,true,'검색어가 있으면 펼침');
  assert.equal(gB.rows[0].hidden,false);
  h.applyTextFilter(sec,'');
  assert.equal(gA.hidden,false);assert.equal(gA.rows.every(r=>r.hidden===false),true,'검색어를 지우면 전부 보임');
});

/* ───────────── 6. SQL·원본 글 검사 ───────────── */
test('SQL: 읽기 허브 직원·쓰기 원장만·anon 권한 없음·트리거가 고친 사람 기록·재실행 안전·롤백 짝',()=>{
  const sql=read('db/hub_ui_texts.sql'),rb=read('db/hub_ui_texts_rollback.sql');
  assert.match(sql,/create table if not exists public\.hub_ui_texts/);
  assert.match(sql,/key text primary key check \(key ~ '\^\[a-z\]\[a-z0-9_\.\]\{1,80\}\$'\)/);
  assert.match(sql,/revoke all on table public\.hub_ui_texts from public, anon, authenticated/);
  assert.match(sql,/grant select, insert, update, delete on table public\.hub_ui_texts to authenticated/);
  assert.doesNotMatch(sql.replace(/--[^\n]*/g,'').replace(/revoke[^;]*;/g,''),/\banon\b/,'anon에게 주는 권한 없음');
  assert.match(sql,/for select to authenticated\s+using \(public\.employee_hub_access_allowed\(\)\)/);
  for(const op of ['insert','update','delete'])assert.match(sql,new RegExp('hub_ui_texts_owner_'+op+' on public\\.hub_ui_texts for '+op));
  assert.equal((sql.match(/my_role\(\)\) = 'owner'/g)||[]).length,4,'쓰기 3종 정책(넣기·고치기 2·지우기)이 원장 확인');
  assert.match(sql,/new\.updated_by := auth\.uid\(\)/);
  assert.match(sql,/drop policy if exists/);assert.match(sql,/create or replace function/);
  assert.match(rb,/drop table if exists public\.hub_ui_texts/);
  assert.match(rb,/drop function if exists public\.set_hub_ui_texts_audit\(\)/);
  assert.doesNotMatch(rb.replace(/--[^\n]*/g,''),/ai_ui_texts|app_settings/);
  assert.ok(!sql.includes('§')&&!js.includes('§'));
});

test('원본 글 검사: 로그인 전 화면 글은 옮기지 않았고, hub-texts.js는 BOM 없음·hr.html은 기존 ai-assistants 번호 그대로',()=>{
  const gate=hr.slice(hr.indexOf('id="gate"'),hr.indexOf('id="app"'));
  assert.doesNotMatch(gate,/hubText/,'로그인·가입·승인 대기 화면은 표를 못 읽으므로 코드 글 그대로');
  for(const fn of ['doLogin','doSignup','sendPasswordReset','showPendingGate'])assert.doesNotMatch(hr.match(new RegExp('(async )?function '+fn+'\\([\\s\\S]*?\\n\\}'))?.[0]||'',/hubText/,fn);
  assert.notEqual(fs.readFileSync(path.join(root,'hub-texts.js'))[0],0xEF);
  assert.match(js,/hub-texts:test-start/);
});

test('원장 월차 방식 선택 화면: 글 설정 반영·저장·기본 자동 복원·잘못된 방식 거절',async()=>{
  const t=ui({texts:[{key:'p7.monthly.mode_label',value:'신입 월차 방식'},{key:'p7.monthly.mode_hint',value:'우리 월차 안내'},{key:'p7.monthly.mode_auto',value:'바로 적립'},{key:'p7.monthly.mode_schedule',value:'근무 확인'}]});
  await t.render({id:'o1',role:'owner'});await t.click('[hub-subtab]=settings');
  assert.match(t.section.innerHTML,/신입 월차 방식/);assert.match(t.section.innerHTML,/우리 월차 안내/);assert.match(t.section.innerHTML,/<option value="auto" selected>바로 적립<\/option>/);assert.match(t.section.innerHTML,/<option value="published_schedule">근무 확인<\/option>/);
  const index=35,before=t.state.calls.length;
  t.el('#hubSetIn_'+index).value='bad';await t.click('[hub-set-save]='+index);assert.equal(t.state.calls.length,before);
  t.el('#hubSetIn_'+index).value='published_schedule';await t.click('[hub-set-save]='+index);assert.equal(t.state.settings.find(r=>r.key==='monthly_leave_attendance_mode').value,'published_schedule');
  await t.click('[hub-set-reset]='+index);assert.equal(t.state.settings.find(r=>r.key==='monthly_leave_attendance_mode').value,'auto');
});
