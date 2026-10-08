// 직원허브 「🧰 도구」 탭(2026-10-08) 시험 — 첫 화면 도구 카드 10장을 허브 안으로.
// 역할별 보이는 카드 · 설정(tools.who.<코드>)을 바꾸면 보이는 사람이 바뀜 · 글 고치기 값이 화면에 나옴(HTML 이스케이프)
// 권한 없는 카드 열기 막힘 · 카드 0장이면 탭 숨김 · iframe으로 열기 · index.html에는 hr.html 카드만 남음.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const hr=read('hr.html'),js=read('hub-texts.js'),index=read('index.html');
const clone=x=>JSON.parse(JSON.stringify(x));
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const textBlock=js.match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)?.[0];
const toolsBlock=hr.match(/\/\* hub-tools:test-start \*\/([\s\S]*?)\/\* hub-tools:test-end \*\//)?.[1];
const menuBlock=hr.match(/\/\* menu-restructure:test-start \*\/([\s\S]*?)\/\* menu-restructure:test-end \*\//)?.[1];
const tabsSource=hr.match(/const TABS=\[([\s\S]*?)\n\];/)?.[1];
const menuSource=hr.match(/const MENU=\[([\s\S]*?)\n\];/)?.[1];

const ALL_CODES=['treatment_plan','news','ai_metrics','deck_maker','lab_remake_ledger','ortho','prosthesis_protocol','saju','progress_board','employee_pick'];

/* 허브 글·설정 엔진 + 도구 탭 코드 + 메뉴 코드를 한 vm에 올린다. settings = app_settings 값(키:값), texts = hub_ui_texts 행 */
function make({role='staff',settings={},texts=[]}={}){
  assert.ok(textBlock&&toolsBlock&&menuBlock&&tabsSource&&menuSource,'시험 경계가 없습니다.');
  const nav={innerHTML:''},nav2={innerHTML:''};
  const renders=[];
  const ctx={ME:{id:'u1',role,confidAccess:false},TAB_ROLES:{},TAB_OVERRIDES:{},BADGE:{},TAB:'tools',esc,render(){renders.push(ctx.TOOLS_NOW);},
    $:sel=>(sel==='#nav'?nav:sel==='#nav2'?nav2:null)};
  vm.createContext(ctx);
  vm.runInContext(textBlock+';this.hubSettingSetValues=hubSettingSetValues;this.hubTextSetOverrides=hubTextSetOverrides;this.hubTextDefs=hubTextDefs;this.HUB_SETTING_DEFS=HUB_SETTING_DEFS;this.hubSettingValidate=hubSettingValidate;this.hubText=hubText;this.hubSetting=hubSetting;',ctx);
  vm.runInContext('function hubT(k,d,v){return hubText(k,d,v);}',ctx);
  vm.runInContext(`const TABS=[${tabsSource}\n];const MENU=[${menuSource}\n];${menuBlock}${toolsBlock}
    this.TABS=TABS;this.MENU=MENU;this.TOOL_CARDS=TOOL_CARDS;this.toolsVisibleCards=toolsVisibleCards;this.toolsAnyVisible=toolsAnyVisible;this.toolsListHtml=toolsListHtml;
    this.openTool=openTool;this.closeTool=closeTool;this.toolFrameLoaded=toolFrameLoaded;this.toolHomeHref=toolHomeHref;this.renderTools=renderTools;this.visibleTabKeys=visibleTabKeys;this.tabLabel=tabLabel;this.renderNav=renderNav;
    this.getOpen=()=>TOOLS_OPEN;this.setOpen=v=>{TOOLS_OPEN=v;};`,ctx);
  ctx.hubSettingSetValues(settings);
  ctx.hubTextSetOverrides(texts);
  ctx.TOOLS_NOW='';
  return {ctx,nav,nav2,renders};
}
const codes=env=>clone(env.ctx.toolsVisibleCards(env.ctx.ME.role).map(c=>c.code));

test('카드 10장이 index.html과 같은 순서·묶음(정보/진료/재미)으로 코드에 고정돼 있다',()=>{
  const {ctx}=make();
  assert.deepEqual(clone(ctx.TOOL_CARDS.map(c=>c.code)),ALL_CODES);
  assert.deepEqual(clone(ctx.TOOL_CARDS.map(c=>c.file)),['치료계획.html','뉴스.html','AI지표.html','설명덱_제작기.html','기공차트_리메이크장부_서식.html','ortho.html','보철프로토콜_진단기.html','사주.html','진행판.html','직원뽑기.html']);
  assert.deepEqual(clone(ctx.TOOL_CARDS.map(c=>c.group)),['top','info','info','info','clinic','clinic','clinic','fun','fun','fun']);
});

test('역할별 보이는 카드: 직원·매니저·실장은 진행판만 빠진 9장, 원장은 10장',()=>{
  for(const role of ['staff','manager','chief']){
    const env=make({role});
    assert.deepEqual(codes(env),ALL_CODES.filter(c=>c!=='progress_board'),role);
    assert.ok(!env.ctx.toolsListHtml(role).includes('작업 진행판'),role+': 진행판 글이 화면에 없음');
  }
  const owner=make({role:'owner'});
  assert.deepEqual(codes(owner),ALL_CODES);
  assert.ok(owner.ctx.toolsListHtml('owner').includes('작업 진행판'));
  assert.deepEqual(codes(make({role:'deputy'})),[],'부원장(근로계약서만 쓰는 계정)에게는 없음');
});

test('설정(tools.who.<코드>)을 바꾸면 보이는 사람이 바뀐다 — 전 직원/실장·매니저·원장/원장만, 이상한 값은 기본값',()=>{
  const lead={'tools.who.progress_board':'lead'};
  assert.ok(codes(make({role:'manager',settings:lead})).includes('progress_board'));
  assert.ok(codes(make({role:'chief',settings:lead})).includes('progress_board'));
  assert.ok(!codes(make({role:'staff',settings:lead})).includes('progress_board'));
  assert.ok(codes(make({role:'staff',settings:{'tools.who.progress_board':'all'}})).includes('progress_board'));
  const ownerOnly={'tools.who.news':'owner','tools.who.saju':'lead'};
  assert.ok(!codes(make({role:'staff',settings:ownerOnly})).includes('news'));
  assert.ok(!codes(make({role:'manager',settings:ownerOnly})).includes('news'));
  assert.ok(codes(make({role:'owner',settings:ownerOnly})).includes('news'),'원장은 늘 모두 봄(스스로 잠그지 못함)');
  assert.ok(!codes(make({role:'staff',settings:ownerOnly})).includes('saju'));
  assert.ok(codes(make({role:'manager',settings:ownerOnly})).includes('saju'));
  const bad={'tools.who.progress_board':'zzz','tools.who.news':'  ','tools.who.ortho':'ALL'};
  assert.ok(!codes(make({role:'staff',settings:bad})).includes('progress_board'),'이상한 값은 진행판 기본(원장만)');
  assert.ok(codes(make({role:'staff',settings:bad})).includes('news'),'빈 값은 기본(전 직원)');
  assert.ok(codes(make({role:'staff',settings:bad})).includes('ortho'));
});

test('글 고치기 값이 화면에 나오고 HTML은 이스케이프된다 · 안 고친 글은 기본 글',()=>{
  const base=make({role:'owner'}).ctx.toolsListHtml('owner');
  for(const t of ['치과 치료계획 도구','치과 소식','AI 모델 지표','설명덱 만들기','기공차트 · 리메이크 장부','교정 케이스 보드','보철 장착 프로토콜','사주 정밀풀이','작업 진행판','직원 뽑기 · 사다리'])assert.ok(base.includes('<h3>'+t+'</h3>'),t);
  for(const g of ['📚 정보(치과 소식·AI 모델 지표·설명덱)','🦷진료','🎲 재미'])assert.ok(base.includes('<h3 class="tools-head">'+g+'</h3>'),g);
  assert.equal((base.match(/<h3 class="tools-head">/g)||[]).length,3,'치료계획 카드는 소제목 없는 맨 위 묶음');
  assert.ok(base.indexOf('치과 치료계획 도구')<base.indexOf('📚 정보'),'소제목 없는 묶음이 맨 위');
  assert.equal((base.match(/>열기<\/button>/g)||[]).length,10);
  const texts=[{key:'tools.card.news.title',value:'<b>소식</b> & "새"'},{key:'tools.card.news.desc',value:'설명 <i>고침</i>'},{key:'tools.group.info',value:'정보 <묶음>'},{key:'tools.open',value:'들어가기'}];
  const out=make({role:'owner',texts}).ctx.toolsListHtml('owner');
  assert.ok(out.includes('<h3>&lt;b&gt;소식&lt;/b&gt; &amp; &quot;새&quot;</h3>'));
  assert.ok(out.includes('<p>설명 &lt;i&gt;고침&lt;/i&gt;</p>'));
  assert.ok(out.includes('<h3 class="tools-head">정보 &lt;묶음&gt;</h3>'));
  assert.equal((out.match(/>들어가기<\/button>/g)||[]).length,10);
  assert.ok(!out.includes('<b>소식</b>'));
  // 탭 이름·화면 제목·빈 화면 글도 글 고치기 값을 따른다
  const env=make({role:'staff',texts:[{key:'tools.tab',value:'🧰 연장통'},{key:'tools.title',value:'연장통 <제목>'}]});
  assert.equal(env.ctx.tabLabel('tools'),'🧰 연장통');
  const m={innerHTML:''};env.ctx.renderTools(m);
  assert.ok(m.innerHTML.includes('<h2>연장통 &lt;제목&gt;</h2>'));
  assert.equal(make({role:'staff'}).ctx.tabLabel('tools'),'🧰 도구');
});

test('권한 없는 카드는 열기 함수에서도 막힌다 · 보이는 카드는 열린다',()=>{
  const staff=make({role:'staff'});
  assert.equal(staff.ctx.openTool('progress_board'),false);
  assert.equal(staff.ctx.getOpen(),'');assert.equal(staff.renders.length,0,'다시 그리지도 않음');
  assert.equal(staff.ctx.openTool('없는코드'),false);
  assert.equal(staff.ctx.openTool('news'),true);
  assert.equal(staff.ctx.getOpen(),'news');assert.equal(staff.renders.length,1);
  // 열려 있던 카드가 설정 때문에 못 보게 되면(또는 직접 값을 넣어도) 열린 화면 대신 목록
  const direct=make({role:'staff'});
  direct.ctx.setOpen('progress_board');
  const m={innerHTML:''};direct.ctx.renderTools(m);
  assert.equal(direct.ctx.getOpen(),'');
  assert.ok(!m.innerHTML.includes('<iframe'));assert.ok(m.innerHTML.includes('class="workdocs-grid"'));
  // 원장은 진행판도 열 수 있다
  const owner=make({role:'owner'});
  assert.equal(owner.ctx.openTool('progress_board'),true);
  // 설정으로 진행판을 매니저에게 열어 주면 매니저도 열 수 있다
  assert.equal(make({role:'manager',settings:{'tools.who.progress_board':'lead'}}).ctx.openTool('progress_board'),true);
  assert.equal(make({role:'deputy'}).ctx.openTool('news'),false);
});

test('카드를 열면 같은 사이트 상대경로 iframe(한글 파일명은 encodeURI) + 「← 도구 목록」 + 「새 창」(noopener)',()=>{
  const env=make({role:'staff'});
  env.ctx.openTool('lab_remake_ledger');
  const m={innerHTML:''};env.ctx.renderTools(m);
  const url=encodeURI('기공차트_리메이크장부_서식.html');
  assert.ok(url.includes('%'),'한글이 인코딩됨');
  assert.ok(m.innerHTML.includes('<iframe class="tools-frame" src="'+url+'" title="기공차트 · 리메이크 장부" onload="toolFrameLoaded(this)"></iframe>'));
  assert.ok(m.innerHTML.includes('<a class="mini" href="'+url+'" target="_blank" rel="noopener">새 창</a>'));
  assert.ok(m.innerHTML.includes('onclick="closeTool()">← 도구 목록</button>'));
  assert.ok(!/src="\/|src="https?:|href="https?:/.test(m.innerHTML),'같은 사이트 상대경로');
  // 버튼 글도 글 고치기 값
  const env2=make({role:'staff',texts:[{key:'tools.back',value:'<뒤로>'},{key:'tools.newwin',value:'따로 열기'}]});
  env2.ctx.openTool('news');const m2={innerHTML:''};env2.ctx.renderTools(m2);
  assert.ok(m2.innerHTML.includes('>&lt;뒤로&gt;</button>'));assert.ok(m2.innerHTML.includes('>따로 열기</a>'));
  // 닫으면 목록으로
  env2.ctx.closeTool();assert.equal(env2.ctx.getOpen(),'');
  // 영어 파일명도 그대로
  const env3=make({role:'staff'});env3.ctx.openTool('ortho');const m3={innerHTML:''};env3.ctx.renderTools(m3);
  assert.ok(m3.innerHTML.includes('src="ortho.html"'));
  // 폰(375px)에서 가로로 넘치지 않는 틀
  assert.match(hr,/\.tools-frame\{[^}]*width:100%;max-width:100%;[^}]*min-height:520px/);
  assert.match(hr,/\.tools-bar\{[^}]*flex-wrap:wrap/);
});

test('보이는 카드가 0장이면 탭도 숨고, 한 장이라도 있으면 보인다 · 메뉴 위줄에는 단독 탭',()=>{
  const allOwner=Object.fromEntries(ALL_CODES.map(c=>['tools.who.'+c,'owner']));
  const hidden=make({role:'staff',settings:allOwner});
  assert.equal(hidden.ctx.toolsAnyVisible('staff'),false);
  assert.equal(hidden.ctx.visibleTabKeys().has('tools'),false);
  hidden.ctx.renderNav();
  assert.ok(!hidden.nav.innerHTML.includes("go('tools')"),'위줄에 도구 단추가 없음');
  const m={innerHTML:''};hidden.ctx.renderTools(m);
  assert.ok(m.innerHTML.includes('볼 수 있는 도구가 없습니다.'),'주소로 직접 들어와도 빈 화면 글');
  // 원장은 원장만 설정이어도 탭이 보인다
  const owner=make({role:'owner',settings:allOwner});
  assert.equal(owner.ctx.visibleTabKeys().has('tools'),true);
  // 한 장만 열려 있어도 보임
  const one=make({role:'staff',settings:Object.assign({},allOwner,{'tools.who.saju':'all'})});
  assert.equal(one.ctx.visibleTabKeys().has('tools'),true);
  assert.deepEqual(codes(one),['saju']);
  one.ctx.renderNav();
  assert.ok(one.nav.innerHTML.includes("go('tools')")&&one.nav.innerHTML.includes('🧰 도구'));
  // 메뉴: 단독 탭(자식 없음), 업무자료 묶음 다음 자리
  const entry=one.ctx.MENU.find(e=>e.key==='tools');
  assert.deepEqual(clone(entry),{kind:'tab',key:'tools',children:[]});
  assert.equal(one.ctx.MENU.findIndex(e=>e.key==='tools'),one.ctx.MENU.findIndex(e=>e.key==='g-care')+1);
  const tab=clone(one.ctx.TABS.find(t=>t.key==='tools'));
  assert.deepEqual(tab,{key:'tools',label:'🧰 도구',roles:['staff','manager','chief','owner']});
  // 탭 노출 예외(원장이 사람별로 숨김)도 그대로 먹는다
  const ov=make({role:'staff'});ov.ctx.TAB_OVERRIDES.u1={tools:false};
  assert.equal(ov.ctx.visibleTabKeys().has('tools'),false);
});

test('index.html 첫 화면에는 hr.html 카드만 남는다(파일은 그대로, 링크만 빠짐)',()=>{
  const links=[...index.matchAll(/<a class="card" href="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(links,['hr.html']);
  assert.match(index,/도구는 직원 허브 › 🧰 도구에 있습니다\./);
  for(const f of ['치료계획.html','뉴스.html','AI지표.html','설명덱_제작기.html','기공차트_리메이크장부_서식.html','ortho.html','보철프로토콜_진단기.html','사주.html','진행판.html','직원뽑기.html']){
    assert.ok(!index.includes('href="'+f+'"'),f+' 링크가 첫 화면에서 빠짐');
    assert.ok(fs.existsSync(path.join(root,f)),f+' 파일은 지우지 않음');
  }
});

test('글·설정 등록: 새 글 32개와 보는 사람 설정 10개(enum all/lead/owner)가 글 고치기 「🧰 도구」 묶음에 있고, 화면 기본 글과 글자까지 같다',()=>{
  const {ctx}=make();
  const defs=clone(ctx.hubTextDefs()).filter(d=>d.key.startsWith('tools.'));
  assert.equal(defs.length,32);
  assert.ok(defs.every(d=>d.screen==='🧰 도구'));
  assert.equal(new Set(defs.map(d=>d.key)).size,defs.length);
  const byKey=Object.fromEntries(defs.map(d=>[d.key,d.def]));
  // 화면 코드(hr.html)의 카드 기본 글 = 글 고치기 기본 글
  const cards=clone(ctx.TOOL_CARDS);
  for(const c of cards){assert.equal(byKey['tools.card.'+c.code+'.title'],c.title,c.code);assert.equal(byKey['tools.card.'+c.code+'.desc'],c.desc,c.code);}
  const groupsSrc=hr.match(/const TOOL_GROUPS=\[([^\n]*)\];/)[1];
  const groups=vm.runInNewContext('['+groupsSrc+']').filter(g=>g.title);
  for(const g of groups)assert.equal(byKey['tools.group.'+g.key],g.title,g.key);
  // hr.html에 박힌 hubT 기본 글
  const re=/hubT\(\s*'(tools\.[a-z_.]+)'\s*,\s*'((?:[^'\\\n]|\\.)*)'/g;let m,n=0;
  while((m=re.exec(hr))){n++;assert.equal(vm.runInNewContext("'"+m[2]+"'"),byKey[m[1]],m[1]);}
  assert.ok(n>=5,'열기·새 창·← 도구 목록·제목·빈 화면 글이 hr.html에서 쓰임');
  assert.match(hr,/hubText\('tools\.tab','🧰 도구'\)/);assert.equal(byKey['tools.tab'],'🧰 도구');
  // 설정 10개
  const sets=clone(ctx.HUB_SETTING_DEFS).filter(d=>d.key.startsWith('tools.who.'));
  assert.deepEqual(sets.map(d=>d.key),ALL_CODES.map(c=>'tools.who.'+c));
  for(const d of sets){
    assert.equal(d.kind,'enum');assert.equal(d.screen,'🧰 도구');
    assert.deepEqual(d.options.map(o=>o.value),['all','lead','owner']);
    assert.deepEqual(d.options.map(o=>o.label),['전 직원','실장·매니저·원장','원장만']);
    assert.equal(d.def,d.key==='tools.who.progress_board'?'owner':'all',d.key);
    for(const o of d.options)assert.ok(byKey[o.labelKey]===o.label,o.labelKey);
    const dd=ctx.HUB_SETTING_DEFS.find(x=>x.key===d.key);
    assert.equal(ctx.hubSettingValidate(dd,'lead').ok,true);assert.equal(ctx.hubSettingValidate(dd,'zzz').ok,false);
  }
  // 코드 쪽 기본 보는 사람(hr.html)도 같은 값
  for(const c of cards)assert.equal(c.who,sets.find(d=>d.key==='tools.who.'+c.code).def,c.code);
});

test('도구 안 「← 홈」(index.html)은 iframe 안에서 첫 화면 대신 도구 목록으로 돌아간다 — 다른 링크는 그대로',()=>{
  const env=make({role:'staff'});
  assert.match(env.ctx.renderTools.toString(),/onload="toolFrameLoaded\(this\)"/);
  for(const h of ['index.html','./index.html','index.html#x','/','./'])assert.ok(env.ctx.toolHomeHref(h),h);
  for(const h of ['hr.html','https://jung-plant.com/','index.htmlx','#','other/index.html'])assert.ok(!env.ctx.toolHomeHref(h),h);
  const mk=href=>{const a={attrs:{href,target:'_top'},handlers:[],getAttribute(k){return this.attrs[k];},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},addEventListener(t,f){this.handlers.push(f);}};return a;};
  const home=mk('index.html'),other=mk('hr.html');
  const frame={contentDocument:{querySelectorAll:()=>[home,other]}};
  env.ctx.setOpen('news');
  assert.equal(env.ctx.toolFrameLoaded(frame),1);
  assert.equal(home.attrs.href,'#');assert.equal(home.attrs.target,undefined);
  assert.equal(other.attrs.href,'hr.html');assert.equal(other.handlers.length,0);
  let prevented=false;home.handlers[0]({preventDefault(){prevented=true;}});
  assert.ok(prevented);assert.equal(env.ctx.getOpen(),'','목록으로 돌아감');
  assert.equal(env.ctx.toolFrameLoaded({get contentDocument(){throw new Error('cross-origin');}}),0,'다른 주소 도구는 건드리지 않음');
  assert.equal(env.ctx.toolFrameLoaded(null),0);
});
