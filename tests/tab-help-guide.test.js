const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=f=>fs.readFileSync(f,'utf8');
function helpers(){const c={};vm.createContext(c);vm.runInContext(read('hub-help.js').match(/\/\* hub-help:test-start \*\/[\s\S]*?\/\* hub-help:test-end \*\//)[0]+';this.h={hubHelpParse,hubHelpCardHtml,hubHelpImagePaths,hubHelpFindTarget,HUB_HELP_TARGETS};',c);return c.h;}
function texts(){const c={};vm.createContext(c);vm.runInContext(read('hub-texts.js').match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)[0]+';this.h={HUB_HELP_TABS,hubTextDefs,hubText,hubTextSetOverrides,hubTextsSave,hubTextsReset};',c);return c.h;}
test('54개 정의와 대상 표가 일치하며 DB에 늘어난 단계는 대상을 추측하지 않는다',()=>{
 const h=helpers(),t=texts();assert.equal(t.HUB_HELP_TABS.length,54);
 assert.deepEqual(Object.keys(h.HUB_HELP_TARGETS).sort(),Array.from(t.HUB_HELP_TABS,t=>t.key).sort());
 for(const tab of t.HUB_HELP_TABS)assert.equal(h.HUB_HELP_TARGETS[tab.key].length,h.hubHelpParse(tab.def).steps.length,tab.key);
 assert.equal(h.hubHelpFindTarget({querySelectorAll(){throw Error('추측 대상 검색 금지');}},'home',15),null);
});
test('현재 카드나 숨겨진 대상 대신 실제 화면에서만 찾고 대상의 클릭은 호출하지 않는다',()=>{
 const h=helpers();let clicks=0;
 const el={textContent:'보기',closest(){return null;},getClientRects(){return [{}];},click(){clicks++;}};
 assert.equal(h.hubHelpFindTarget({querySelectorAll(){return [el];}},'home',2),el);assert.equal(clicks,0);
 el.getClientRects=()=>[];assert.equal(h.hubHelpFindTarget({querySelectorAll(){return [el];}},'home',2),null);
 el.getClientRects=()=>[{}];el.closest=()=>({});assert.equal(h.hubHelpFindTarget({querySelectorAll(){return [el];}},'home',2),null);
});
test('그림 경로는 PC·폰 한 쌍이며 빈 값·외부 URL·HTML은 숨기고 기본은 접혀 있다',()=>{
 const h=helpers(),options={guide:'짚기',imageLabel:'그림',imageAlt:'번호 안내'};
 for(const image of ['', 'https://example.com/pc.png help-img/m.png','help-img/../pc.png help-img/m.png','<img>'])assert.equal(h.hubHelpImagePaths(image).length,0);
 const html=h.hubHelpCardHtml('leave','쓰는 법:\n1. 신청','연차',true,{...options,image:'help-img/leave-pc.png help-img/leave-m.png'});
 assert.match(html,/<source media="\(max-width:640px\)" srcset="help-img\/leave-m.png">/);assert.match(html,/<details class="hub-help-image">/);assert.doesNotMatch(html,/<details[^>]+open/);
 assert.doesNotMatch(h.hubHelpCardHtml('leave','쓰는 법:\n1. 신청','연차',true,{...options,image:''}),/<picture>/);
});
test('그림 키 빈 값 저장은 DB의 빈 글 제약을 지키며 재읽기 뒤 숨고 기본 복원은 별도다',async()=>{
 const h=texts();let saved;const calls=[];
 const sb={from(){return {upsert(r){saved=r;calls.push('upsert');return Promise.resolve({error:null});},delete(){calls.push('delete');return {eq(){return Promise.resolve({error:null});}};}};}};
 assert.equal((await h.hubTextsSave(sb,'help_img.leave','')).ok,true);assert.deepEqual(calls,['upsert']);assert.ok(saved.value.trim());
 h.hubTextSetOverrides([saved]);assert.equal(h.hubText('help_img.leave','default'),'');
 assert.equal((await h.hubTextsReset(sb,'help_img.leave')).ok,true);assert.equal(h.hubText('help_img.leave','default'),'default');
 const fail={from(){return {upsert(){return Promise.resolve({error:{message:'실패'}});}};}};
 h.hubTextSetOverrides([{key:'help_img.leave',value:'help-img/leave-pc.png help-img/leave-m.png'}]);
 assert.equal((await h.hubTextsSave(fail,'help_img.leave','')).ok,false);assert.match(h.hubText('help_img.leave',''),/leave-pc/);
});
test('짚기·이동·닫기·대상 없는 안내·그림 글은 원장이 고치는 글 목록에 있다',()=>{
 const h=texts(),defs=new Map(h.hubTextDefs().map(d=>[d.key,d]));
 for(const key of ['guide','next','close','finish','step','missing','image','image_alt'])assert.ok(defs.has('help_ui.'+key));
 for(const key of ['appr','leave','sched'])assert.ok(defs.has('help_img.'+key));
 h.hubTextSetOverrides([{key:'help_ui.next',value:'계속 보기'}]);assert.equal(h.hubText('help_ui.next','다음'),'계속 보기');
});

function runtime(){
 const listeners={},frames=new Map();let sequence=0,observer;
 class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.events={};this.isConnected=true;this.className='';}
  append(...children){for(const c of children){c.parent=this;this.children.push(c);}}
  remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);}
  setAttribute(k,v){this[k]=v;}
  addEventListener(k,fn){this.events[k]=fn;}
  focus(){this.focused=true;}
  closest(){return null;}
  getClientRects(){return this.visible===false?[]:[{}];}
  getBoundingClientRect(){return {left:30,right:150,top:80,bottom:120,width:120,height:40};}
  scrollIntoView(){this.scrolled=true;}
 }
 const body=new Element('body'),target=new Element('button'),start=new Element('button');let businessClicks=0;
 target.click=()=>businessClicks++;
 const container=new Element('main');container.querySelectorAll=()=>target.visible===false?[]:[target];
 const document={body,documentElement:{clientWidth:375},createElement:t=>new Element(t)};
 const window={innerHeight:900,HUB_HELP_TABS:[{key:'home',label:'홈'}],HubUi:{helpers:{hubTextDefByKey(k){return {def:k==='help.home'?'쓰는 법:\n1. 보기\n2. 확인\n3. 보기\n4. 추가':'설명'};}}},hubText:(k,d)=>d,
  addEventListener(k,fn){listeners[k]=fn;},removeEventListener(k,fn){if(listeners[k]===fn)delete listeners[k];},
  requestAnimationFrame(fn){frames.set(++sequence,fn);return sequence;},cancelAnimationFrame(id){frames.delete(id);},
  MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){this.disconnected=true;}}};
 vm.runInNewContext(read('hub-help.js'),{window,document});
 return {api:window.HubHelp,container,target,start,body,listeners,frames,get clicks(){return businessClicks;},mutate(){observer();}};
}
test('실제 짚기 실행은 업무 버튼을 누르지 않으며 다음·추가 단계·Esc로 정리한다',()=>{
 const r=runtime();r.api.startGuide(r.container,'home',r.start);
 const overlay=r.body.children[0],panel=overlay.children[0],next=panel.children[3].children[0];
 assert.equal(overlay.children.filter(e=>e.className==='hub-help-guide-ring').length,1);assert.equal(r.clicks,0);
 next.events.click();next.events.click();next.events.click();
 assert.equal(overlay.children.filter(e=>e.className==='hub-help-guide-ring').length,0,'새 번호는 글만');
 r.listeners.keydown({key:'Escape',preventDefault(){}});assert.equal(r.body.children.length,0);assert.equal(r.frames.size,0);assert.equal(r.clicks,0);
});
test('탭 render의 unwatch와 같은 화면 재그리기의 관찰 콜백은 테두리를 정리한다',()=>{
 for(const change of ['unwatch','mutation']){
  const r=runtime();r.api.watch(r.container,()=>{});r.api.startGuide(r.container,'home',r.start);
  if(change==='unwatch')r.api.unwatch(r.container);else r.mutate();
  assert.equal(r.body.children.length,0,change);assert.equal(r.listeners.keydown,undefined);assert.equal(r.clicks,0);
 }
});
test('숨겨진 대상은 빨간 빈 테두리가 없고 닫기·마침은 전부 상태를 정리한다',()=>{
 for(const action of ['close','finish']){
  const r=runtime();r.target.visible=false;r.api.startGuide(r.container,'home',r.start);
  const panel=r.body.children[0].children[0],buttons=panel.children[3].children;
  assert.equal(r.body.children[0].children.length,1);assert.equal(panel.children[2].hidden,false);
  if(action==='close')buttons[1].events.click();else for(let i=0;i<4;i++)buttons[0].events.click();
  assert.equal(r.body.children.length,0);assert.equal(r.frames.size,0);assert.equal(r.clicks,0);
 }
});
test('앞선 관찰 프레임이 대기 중이어도 다음 화면 변화는 열린 짚기를 닫는다',()=>{
 const r=runtime();r.api.watch(r.container,()=>{});r.mutate();
 r.api.startGuide(r.container,'home',r.start);assert.equal(r.body.children.length,1);
 r.mutate();assert.equal(r.body.children.length,0);assert.equal(r.listeners.keydown,undefined);
});

test('아래쪽 대상 안내는 위에 붙이고 반대쪽 위치를 풀며 스크롤 뒤 아래 위치로 전환한다',()=>{
 const r=runtime();let top=600;
 r.target.getBoundingClientRect=()=>({left:30,right:150,top,bottom:top+40,width:120,height:40});
 r.api.startGuide(r.container,'home',r.start);
 const panel=r.body.children[0].children[0];
 assert.equal(panel.style.top,'12px');assert.equal(panel.style.bottom,'auto');
 top=80;r.listeners.scroll();
 assert.equal(panel.style.top,'auto');assert.equal(panel.style.bottom,'12px');
 top=600;r.listeners.resize();
 assert.equal(panel.style.top,'12px');assert.equal(panel.style.bottom,'auto');
 assert.match(read('hub-help.js'),/\.hub-help-guide-panel\{[^}]*margin:0 auto;/);
 assert.equal(r.clicks,0);r.api.closeGuide();
});
