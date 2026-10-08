const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'hr.html'),'utf8');
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function panel({role='owner',listResult={data:[],error:null},oneResult={data:null,error:null}}={}){
  const calls=[],slot={children:[],appendChild(node){this.children.push(node);}},viewer={hidden:true,innerHTML:'',replaceChildren(){this.children=[];this.cleared=true;},querySelector(selector){assert.equal(selector,'.owner-board-frame-slot');return slot;}};
  const document={getElementById(id){assert.equal(id,'ownerBoardViewer');return viewer;},createElement(tag){assert.equal(tag,'iframe');return {attrs:{},style:{},setAttribute(key,value){this.attrs[key]=value;}};}};
  const sb={from(table){calls.push({table});return {select(columns){calls[calls.length-1].select=columns;if(columns==='slug,sha256,synced_at')return Promise.resolve(listResult);return {eq(column,value){calls[calls.length-1].eq=[column,value];return {maybeSingle(){return Promise.resolve(oneResult);}};}};}};}};
  const block=html.match(/\/\* owner-boards:test-start \*\/[\s\S]*?\/\* owner-boards:test-end \*\//)?.[0];assert.ok(block,'원장 보기판 시험 구간이 없습니다.');
  const context={esc,ME:{role},sb,document,TABS:[{key:'aicost',label:'💰 AI비용',roles:['owner']},{key:'owner',label:'원장',roles:['owner']}],MENU:[{kind:'group',key:'g-owner',children:['owner','aicost','pay']}]};const timeBlock=html.match(/\/\* hub-time:test-start \*\/[\s\S]*?\/\* hub-time:test-end \*\//)?.[0];assert.ok(timeBlock,'허브 시간 표시 공통 함수가 없습니다.');vm.createContext(context);vm.runInContext(timeBlock+'\n'+block+';this.api={OWNER_BOARDS,OWNER_BOARD_TAB,installOwnerBoardsTab,ownerBoardSrcdoc,ownerBoardsTimestamp,ownerBoardsMissing,ownerBoardsPanelHtml,renderOwnerBoards,openOwnerBoard,closeOwnerBoard};',context);
  return {api:context.api,calls,viewer,slot,tabs:context.TABS,menu:context.MENU};
}

test('원장 보기판 탭은 원장 역할만 가지며 원장 전용 묶음에서 AI비용 바로 다음이다',()=>{
  const h=panel();
  assert.deepEqual(JSON.parse(JSON.stringify(h.tabs.map(t=>t.key))),['aicost','ownerboards','owner']);
  assert.deepEqual(JSON.parse(JSON.stringify(h.tabs.find(t=>t.key==='ownerboards').roles)),['owner']);
  assert.deepEqual(JSON.parse(JSON.stringify(h.menu[0].children)),['owner','aicost','ownerboards','pay']);
  assert.match(html,/else if\(TAB==='ownerboards'\)await renderOwnerBoards\(m\)/);
});

test('tabVisible은 개인 설정으로 원장 보기판을 켜도 원장 역할만 보이며 다른 탭 설정은 유지한다',()=>{
  const match=html.match(/function tabVisible\(t\)\{[\s\S]*?\nfunction visibleTabKeys/);assert.ok(match,'tabVisible 함수를 찾지 못했습니다.');
  const source=match[0].replace(/\nfunction visibleTabKeys$/,'');
  const TAB_ROLES={ownerboards:['staff','manager','chief'],aicost:['staff'],pay:['staff'],contract:['deputy']};
  for(const role of ['staff','manager','chief']){
    const context={ME:{id:'u1',role},TAB_OVERRIDES:{u1:{ownerboards:true,aicost:true,pay:true}},TAB_ROLES};vm.createContext(context);vm.runInContext(source+';this.check=tabVisible;',context);
    assert.equal(context.check({key:'ownerboards',roles:['owner']}),false,role+'는 원장 보기판을 보면 안 됩니다.');
    if(role==='staff'){assert.equal(context.check({key:'aicost',roles:['owner']}),true);assert.equal(context.check({key:'pay',roles:['owner']}),true);}
  }
  const owner={ME:{id:'u1',role:'owner'},TAB_OVERRIDES:{},TAB_ROLES};vm.createContext(owner);vm.runInContext(source+';this.check=tabVisible;',owner);assert.equal(owner.check({key:'ownerboards',roles:['owner']}),true);
  const deputy={ME:{id:'u1',role:'deputy'},TAB_OVERRIDES:{},TAB_ROLES};vm.createContext(deputy);vm.runInContext(source+';this.check=tabVisible;',deputy);assert.equal(deputy.check({key:'ownerboards',roles:['owner']}),false);
});

test('원장이 아니면 원장 전용 문구만 보이고 표를 조회하지 않는다',async()=>{
  const h=panel({role:'staff'}),m={innerHTML:''};await h.api.renderOwnerBoards(m);
  assert.equal(m.innerHTML,'<div class="card"><div class="empty">원장 전용입니다.</div></div>');assert.equal(h.calls.length,0);
  for(const word of ['rules_map','codex_flow','AI 규칙 관계도','클로드→코덱스 브라우저 흐름'])assert.ok(!m.innerHTML.includes(word),'원장이 아니면 새 판 카드가 없음: '+word);
});

test('목록은 여섯 판과 마지막 올라온 때를 표시하고 HTML 본문은 조회하지 않는다',async()=>{
  const h=panel({listResult:{data:[{slug:'busd_ledger',synced_at:'2026-09-30T01:02:00Z'},{slug:'pin_board',synced_at:null},{slug:'inbox',synced_at:'2026-10-02T12:49:00Z'},{slug:'rules_map',synced_at:'2026-10-08T01:00:00Z'},{slug:'codex_flow',synced_at:null}],error:null}}),m={innerHTML:''};await h.api.renderOwnerBoards(m);
  assert.deepEqual(h.calls,[{table:'owner_boards',select:'slug,sha256,synced_at'}]);
  for(const title of ['📒 뻐스디 장부','📌 명심판','📖 박제 단어장','📥 인박스 경고','🧭 AI 규칙 관계도','🔀 클로드→코덱스 브라우저 흐름'])assert.ok(m.innerHTML.includes(title));
  assert.ok(m.innerHTML.includes('마지막으로 올라온 때 '));assert.ok(m.innerHTML.includes('아직 PC에서 올라오지 않음'));
  assert.match(m.innerHTML,/data-owner-board="busd_ledger"/);assert.match(m.innerHTML,/data-owner-board="pin_board"/);assert.match(m.innerHTML,/data-owner-board="wordbook"/);assert.match(m.innerHTML,/data-owner-board="inbox"/);assert.match(m.innerHTML,/data-owner-board="rules_map"/);assert.match(m.innerHTML,/data-owner-board="codex_flow"/);
  assert.ok(m.innerHTML.includes('AI가 남긴 최근 경고·대기'));assert.ok(m.innerHTML.includes('마지막으로 올라온 때 2026.10.2 오후 9시 49분'),'인박스 판도 허브 시간 꼴');
  assert.deepEqual(JSON.parse(JSON.stringify(h.api.OWNER_BOARDS.map(b=>b.slug))),['busd_ledger','pin_board','wordbook','inbox','rules_map','codex_flow'],'다섯째·여섯째(끝) 자리');
  assert.ok(m.innerHTML.includes('AI 규칙·지침이 어떤 순서로 이기는지'));assert.ok(m.innerHTML.includes('클로드가 코덱스 브라우저에 일을 넘기는 길'));assert.ok(m.innerHTML.includes('마지막으로 올라온 때 2026.10.8 오전 10시'),'규칙 관계도 판도 허브 시간 꼴');
});
test('인박스 경고 판을 열면 같은 격리 iframe으로 보여 주고 제목·창 이름이 인박스 판이다',async()=>{
  const h=panel({oneResult:{data:{html:'<!doctype html><html><body>인박스</body></html>',synced_at:'2026-10-02T12:49:00Z'},error:null}});
  await h.api.openOwnerBoard('inbox');const frame=h.slot.children[0];
  assert.ok(frame);assert.equal(frame.attrs.sandbox,'allow-scripts allow-downloads allow-modals');assert.equal(frame.attrs.title,'📥 인박스 경고 보기');
  assert.deepEqual(h.calls[0].eq,['slug','inbox']);assert.match(h.viewer.innerHTML,/<strong>📥 인박스 경고<\/strong>/);
});

test('AI 규칙 관계도·클로드→코덱스 브라우저 흐름 판을 열면 같은 격리 iframe으로 보여 주고 제목·창 이름이 그 판이다',async()=>{
  for(const [slug,title] of [['rules_map','🧭 AI 규칙 관계도'],['codex_flow','🔀 클로드→코덱스 브라우저 흐름']]){
    const h=panel({oneResult:{data:{html:'<!doctype html><html><body>'+slug+'</body></html>',synced_at:'2026-10-08T01:00:00Z'},error:null}});
    await h.api.openOwnerBoard(slug);const frame=h.slot.children[0];
    assert.ok(frame,slug);assert.equal(frame.attrs.sandbox,'allow-scripts allow-downloads allow-modals');assert.equal(frame.attrs.title,title+' 보기');
    assert.deepEqual(h.calls[0].eq,['slug',slug]);assert.ok(h.viewer.innerHTML.includes('<strong>'+title+'</strong>'),slug);
  }
  const n=panel({role:'staff'});await n.api.openOwnerBoard('rules_map');assert.equal(n.calls.length,0,'원장이 아니면 판 본문을 조회하지 않음');
});

test('owner_boards 표가 없으면 준비 중 안내로 처리한다',()=>{
  const h=panel(),out=h.api.ownerBoardsPanelHtml([],{code:'PGRST205',status:404,message:'missing'});
  assert.match(out,/원장 보기판이 준비 중입니다/);assert.doesNotMatch(out,/오류:|불러오지 못했습니다/);
  assert.equal(h.api.ownerBoardsMissing({code:'42P01'}),true);assert.equal(h.api.ownerBoardsMissing({status:404}),true);
});

test('판 HTML은 정확한 격리 sandbox의 iframe srcdoc 속성으로만 보여 준다',async()=>{
  const htmlValue='<script>parent.secret="x"</script><p>판 본문</p>',h=panel({oneResult:{data:{html:htmlValue,synced_at:'2026-09-30T01:02:00Z'},error:null}});
  await h.api.openOwnerBoard('busd_ledger');const frame=h.slot.children[0];assert.ok(frame);assert.equal(frame.attrs.sandbox,'allow-scripts allow-downloads allow-modals');assert.equal(frame.attrs.referrerpolicy,'no-referrer');assert.equal(frame.attrs.title,'📒 뻐스디 장부 보기');assert.equal(frame.srcdoc,'<style>#btn-png{display:none!important}</style>'+htmlValue);assert.match(h.viewer.innerHTML,/PNG 저장은 PC 판에서만 됨 · 허브에서는 PDF 저장을 쓰세요/);assert.equal(h.calls[0].select,'html,synced_at');assert.deepEqual(h.calls[0].eq,['slug','busd_ledger']);
  assert.doesNotMatch(frame.attrs.sandbox,/allow-same-origin|allow-top-navigation|allow-popups-to-escape-sandbox/);
  assert.doesNotMatch(html.match(/\/\* owner-boards:test-start \*\/[\s\S]*?\/\* owner-boards:test-end \*\//)[0],/localStorage|sessionStorage/);
});

test('PNG 숨김 style은 head·body·doctype 구조를 보존하며 한 번만 끼운다',()=>{
  const {api}=panel(),style='<style>#btn-png{display:none!important}</style>';
  const withHead='<!doctype html><html><head><title>x</title></head><body>내용</body></html>';
  assert.equal(api.ownerBoardSrcdoc(withHead),'<!doctype html><html><head><title>x</title>'+style+'</head><body>내용</body></html>');
  const withBody='<html><body class="x">내용</body></html>';
  assert.equal(api.ownerBoardSrcdoc(withBody),'<html><body class="x">'+style+'내용</body></html>');
  const doctype='<!doctype html><p>내용</p>';
  assert.equal(api.ownerBoardSrcdoc(doctype),'<!doctype html>'+style+'<p>내용</p>');
  const noTags='내용';assert.equal(api.ownerBoardSrcdoc(noTags),style+noTags);
});

test('표가 없거나 판 행이 없으면 조회 실패 없이 준비·미등록 안내를 보인다',async()=>{
  const missing=panel({oneResult:{data:null,error:{code:'42P01',status:404}}});await missing.api.openOwnerBoard('wordbook');assert.match(missing.viewer.innerHTML,/원장 보기판이 준비 중입니다/);
  const absent=panel({oneResult:{data:null,error:null}});await absent.api.openOwnerBoard('pin_board');assert.match(absent.viewer.innerHTML,/아직 PC에서 올라오지 않음/);
});

test('닫기는 보기 영역을 비우고 숨긴다',()=>{const h=panel();h.viewer.hidden=false;h.api.closeOwnerBoard();assert.equal(h.viewer.hidden,true);assert.equal(h.viewer.cleared,true);});
