const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=f=>fs.readFileSync(require('node:path').join(__dirname,'..',f),'utf8');
const hr=read('hr.html');
function helpers(){const c={};vm.createContext(c);vm.runInContext(read('hub-texts.js').match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)[0]+';this.h={HUB_HELP_TABS,hubTextDefs,hubText,hubTextSetOverrides,hubTextsSave,hubTextsReset};',c);return c.h;}
function coverage(html=hr){
 const keys=new Set([...html.matchAll(/\bkey:'([a-z][a-z0-9]*)',\s*label:/g)].map(m=>m[1]));
 // 메뉴의 자식·동적으로 설치하는 탭도 확인합니다.
 const menu=html.match(/const MENU=\[([\s\S]*?)\n\];/)[1];
 for(const a of menu.matchAll(/children:\[([^\]]*)\]/g))for(const m of a[1].matchAll(/'([^']+)'/g))keys.add(m[1]);
 for(const f of ['hr.html','wage-hourly.js','payroll-bonus.js','payroll-reply.js','payroll-compare.js'])
  for(const m of (f==='hr.html'?html:read(f)).matchAll(/setPayView\('([a-z]+)'\)/g))keys.add('pay.'+m[1]);
 for(const m of html.matchAll(/SCHED_VIEW=(?:\\)?'([a-z]+)(?:\\)?'/g))keys.add('sched.'+m[1]);
 for(const m of html.matchAll(/setCalendarView\('([a-z]+)'\)/g))keys.add('calendar.'+m[1]);
 for(const m of html.matchAll(/setCalendarPeriod\('([a-z]+)'\)/g))keys.add('calendar.period.'+m[1]);
 for(const m of html.matchAll(/LVSTATUS_VIEW='([a-z]+)'/g))keys.add('calendar.leave.'+m[1]);
 for(const m of html.matchAll(/inboxSetSubtab\((?:\\)?'([a-z]+)(?:\\)?'\)/g))keys.add('inbox.'+m[1]);
 for(const m of html.matchAll(/setDepRange\('([a-z]+)'\)/g))keys.add('deposit.'+m[1]);
 for(const f of ['ai-assistants.js','hub-texts.js']){
  const s=read(f),a=s.indexOf(f==='hub-texts.js'?'function hubShellHtml()':'function renderShell()'),b=s.indexOf('const nav=',a);
  for(const m of s.slice(a,b).matchAll(/key:'([a-z]+)'/g))keys.add((f==='hub-texts.js'?'hubset.':'ai.')+m[1]);
 }
 return keys;
}
test('메뉴·동적 탭·화면 안 전환의 모든 열쇠에 help 글 정의가 있다',()=>{
 const h=helpers(),defs=new Set(h.hubTextDefs().map(d=>d.key));
 for(const key of coverage())assert.ok(defs.has('help.'+key),'누락된 안내: '+key);
 assert.equal(new Set(h.HUB_HELP_TABS.map(t=>t.key)).size,h.HUB_HELP_TABS.length);
});
test('새 탭을 추가하면 목록 누락을 잡는다',()=>{
 const defs=new Set(helpers().hubTextDefs().map(d=>d.key));
 const changed=hr.replace('const TABS=[',"const TABS=[\n{key:'newtab', label:'새 탭',roles:['owner']},");
 assert.ok([...coverage(changed)].filter(key=>!defs.has('help.'+key)).includes('newtab'));
});
module.exports={helpers,coverage};

function stripScreenComments(source){
 // 문자열의 URL·정규 문자열은 유지하고 코드 주석과 HTML 주석만 제외합니다.
 return source.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|<!--[\s\S]*?-->/g,(match,string)=>string||'').replace(/<!--[\s\S]*?-->/g,'');
}
function decodeScreenLabels(source){return stripScreenComments(source).replace(/\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})/gi,(_,point,unit)=>String.fromCodePoint(parseInt(point||unit,16)));}
function screenLabelCorpus(){
 const path=require('node:path'),root=path.join(__dirname,'..');
 // 도움말 자체는 빼고 화면 코드·hubT 기본값·설정 정의만 대조합니다.
 return fs.readdirSync(root).filter(f=>f==='hr.html'||f.endsWith('.js')).map(f=>{
  const s=read(f);return decodeScreenLabels(f==='hub-texts.js'?s.replace(/const HUB_HELP_TABS=\[[\s\S]*?\n\];/,''):s);
 }).join('\n');
}
function missingQuotedLabels(tabs,corpus=screenLabelCorpus()){
 const errors=[];
 // 예외 목록 없음: 화면 이름·입력칸·검색 글까지 실제 문자열과 대조합니다.
 for(const t of tabs)for(const m of t.def.matchAll(/「([^」]+)」/g)){
  if(!corpus.includes(m[1]))errors.push(t.key+' → 「'+m[1]+'」');
 }
 return [...new Set(errors)];
}
test('모든 help 안내의 인용 이름은 도움말을 제외한 화면 코드와 hubT 기본값에 있다',()=>{
 assert.deepEqual(missingQuotedLabels(helpers().HUB_HELP_TABS),[]);
});
test('AI 대화 안내는 실제 뒤로 가기 버튼인 목록과 새 대화를 설명한다',()=>{
 const text=helpers().HUB_HELP_TABS.find(t=>t.key==='ai.chat').def;
 assert.ok(text.includes('「← 목록」으로 돌아가 다른 도우미를 고르거나, 새 주제는 「새 대화」로 시작합니다.'));
 assert.ok(decodeScreenLabels(read('ai-assistants.js')).includes('>← 목록</button>'));
});
test('이름 검사는 과거 리콜·복원 오기와 임의의 새 오기를 실제로 잡는다',()=>{
 const tabs=helpers().HUB_HELP_TABS.map(t=>({...t}));
 for(const [key,correct,wrong] of [
  ['inbox','📞 리콜 명단','리콜·재진'],['hubset.settings','기본으로 되돌리기','기본값 되돌리기'],
  ['onbo','지문 등록 완료 보고','🖐 지문 등록 완료 보고'],['appr','결재 올리기','화면에 없는 단추 예시']
 ]){
  const t=tabs.find(t=>t.key===key),original=t.def;
  t.def=original.replace('「'+correct+'」','「'+wrong+'」');assert.notEqual(t.def,original,key);
  assert.ok(missingQuotedLabels(tabs).includes(key+' → 「'+wrong+'」'),key);
  t.def=original;
 }
});
test('주석에만 있는 다른 도우미는 실제 버튼 이름으로 인정하지 않는다',()=>{
 assert.deepEqual(missingQuotedLabels([{key:'ai.chat',def:'「다른 도우미」'}]),['ai.chat → 「다른 도우미」']);
});
test('이름 대조는 세 종류 주석을 빼고 문자열의 URL과 유니코드 버튼 이름은 유지한다',()=>{
 const source='/* 주석 단추 */ const a="https://example.invalid/path"; // 주석 단추\nconst b=`실제 // 글 <!-- 주석 단추 -->`; <!-- 주석 단추 --> const c="\\u2190 \\uBAA9\\uB85D";';
 const result=decodeScreenLabels(source);
 assert.ok(!result.includes('주석 단추'));assert.ok(result.includes('https://example.invalid/path'));
 assert.ok(result.includes('실제 // 글'));assert.ok(result.includes('← 목록'));
});

test('AI 상위 안내는 설정의 위치와 도움말에서 화면에 나오지 않음을 알린다',()=>{
 const h=helpers(),definition=h.hubTextDefs().find(d=>d.key==='help.ai');
 assert.ok(definition.where.includes('AI 탭은 자체 사용법을 써서 이 글은 화면에 나오지 않습니다'));
 const s=read('hub-texts.js');
 assert.ok(s.includes("d.key==='help.ai'?'<div class=\"sub\">AI 탭은 자체 사용법을 써서 이 글은 화면에 나오지 않습니다</div>'"));
 assert.equal(h.HUB_HELP_TABS.length,54);
});

test('캘린더 상위 안내는 근무 화면의 주간 월간·상세·이름·내보내기를 구분한다',()=>{
 const text=helpers().HUB_HELP_TABS.find(t=>t.key==='calendar').def;
 assert.ok(text.includes('근무 캘린더에서는 주간·월간'));
 assert.ok(text.includes('근무 캘린더에서는 날짜를 눌러'));
 assert.ok(text.includes('알아둘 점: 근무 캘린더에서는 칸에'));
});

test('리콜·기본 복원·체크리스트 안내는 화면의 정확한 버튼 이름을 쓴다',()=>{
 const defs=new Map(helpers().HUB_HELP_TABS.map(t=>[t.key,t.def]));
 for(const key of ['inbox','inbox.recall']){
  assert.ok(defs.get(key).includes('「📞 리콜 명단」'),key);
  assert.ok(!defs.get(key).includes('「리콜·재진」'),key);
 }
 assert.ok(defs.get('hubset.settings').includes('「기본으로 되돌리기」'));
 assert.ok(defs.get('onbo').includes('「체크리스트 정보 저장」'));
 assert.ok(defs.get('onbo').includes('「지문 등록 완료 보고」'));
});

test('서류함은 업로드한 증빙과 연차 탭에서 생성하는 신청서를 구분한다',()=>{
 const text=helpers().HUB_HELP_TABS.find(t=>t.key==='onbo').def;
 assert.ok(text.includes('업로드한 연차 증빙 파일은 서류함의 「연차증빙」 필터에서 확인합니다.'));
 assert.ok(text.includes('허브에서 신청한 연차의 신청서는 「연차」 탭의 「내 신청 내역」에서 「📄 신청서」를 눌러 확인합니다.'));
 assert.match(hr,/hubT\('leave.my.list_title','내 신청 내역'\)/);
 assert.ok(hr.includes("hubT('leave.btn.form','📄 신청서')"));
});

test('근무표 세 안내는 초안·공표 권한과 즉시 저장·다시 초안을 함께 설명한다',()=>{
 for(const key of ['sched','sched.week','sched.month']){
  const text=helpers().HUB_HELP_TABS.find(t=>t.key===key).def;
  for(const phrase of ['승인된 직원·매니저는 초안인 주만 편집할 수 있습니다.','공표된 주는 실장·원장만 수정할 수 있습니다.','편집 가능한 칸을 체크하면 바로 저장됩니다.','공표된 주를 실장·원장이 고치면 다시 초안'])assert.ok(text.includes(phrase),key+' '+phrase);
 }
});

test('결재 완료 목록 안내는 실장·원장과 직원·매니저의 실제 경로를 구분한다',()=>{
 const text=helpers().HUB_HELP_TABS.find(t=>t.key==='appr').def;
 assert.ok(text.includes('실장·원장은 「완결된 결재 문서」에서 완료 문서를 확인합니다.'));
 assert.ok(text.includes('직원·매니저는 「내가 올린 문서」에서 본인 문서의 완료 상태를 확인합니다.'));
});

test('main 관찰자는 하나이며 여러 내용 변화를 한 프레임에 묶는다',()=>{
 const observers=[],frames=[];let mounts=0;
 const main={},window={MutationObserver:class {
  constructor(fn){this.fn=fn;observers.push(this);}
  observe(target,options){this.target=target;this.options=options;}
 },requestAnimationFrame(fn){frames.push(fn);}};
 vm.runInNewContext(read('hub-help.js'),{window,document:{}});
 assert.equal(typeof window.HubHelp.watch,'function');
 const mount=()=>mounts++;
 window.HubHelp.watch(main,mount);window.HubHelp.watch(main,mount);
 assert.equal(observers.length,1);assert.equal(observers[0].target,main);
 assert.equal(observers[0].options.childList,true);assert.equal(observers[0].options.subtree,true);
 assert.equal(observers[0].options.attributes,undefined);
 observers[0].fn();observers[0].fn();observers[0].fn();assert.equal(frames.length,1);
 frames.shift()();assert.equal(mounts,1);assert.equal(frames.length,0);
 // 실제 화면 함수의 지연·저장 경로는 tab-help-screen-races.test.js에서 재현합니다.
 assert.match(hr,/HubHelp\.watch\(m,\(\)=>mountHubTabHelp\(m\)\)/);
});

test('AI 직원 화면은 기존 사용법 1개, 원장은 기존 1개와 하위 탭 1개만 둔다',()=>{
 const shell=read('ai-assistants.js').match(/function renderShell\(\)\{[\s\S]*?(?=\nfunction renderActiveSection)/)[0];
 for(const role of ['staff','manager','chief','owner']){
  const mounts=[],root={innerHTML:'',querySelector(selector){return selector==='.ai-subnav'?(this.innerHTML.includes('ai-subnav')?{}:null):{addEventListener(){}};},querySelectorAll(){return [];}};
  vm.runInNewContext(shell+';renderShell();',{ME:{role},AI_ROOT:root,AI_SUBTAB:'chat',AI_HELP_OPEN:false,aiHelpHtml(){return '';},bindHelpCopyButtons(){},renderActiveSection(){},window:{HubHelp:{mount(...args){mounts.push(args);}}}});
  assert.equal((root.innerHTML.match(/data-ai-help-toggle/g)||[]).length,1);
  assert.equal(mounts.length,role==='owner'?1:0);
  if(role==='owner')assert.equal(mounts[0][1],'ai.chat');
 }
});
test('연차 달력·목록 사용법은 상위 캘린더 선택과 다른 줄에 붙는다',()=>{
 const screen=hr.match(/async function renderLeaveStatus\(m,embedded\)\{[\s\S]*?\/\* leave-calendar:render-end \*\//)[0];
 assert.match(screen,/render\(\)"><\/label><\/div><div class="rowflex"><button class="mini \$\{LVSTATUS_VIEW/);
});

function cardHelpers(){const c={};vm.createContext(c);vm.runInContext(read('hub-help.js').match(/\/\* hub-help:test-start \*\/[\s\S]*?\/\* hub-help:test-end \*\//)[0]+';this.h={hubHelpParse,hubHelpCardHtml,hubHelpButtonHtml,HUB_HELP_CSS};',c);return c.h;}
function quotedParticleErrors(text){
 const errors=[],pairs={을:['을','를'],를:['을','를'],이:['이','가'],가:['이','가'],은:['은','는'],는:['은','는'],과:['과','와'],와:['과','와'],으로:['으로','로'],로:['으로','로']};
 for(const m of text.matchAll(/「([^」]+)」(으로|을|를|이|가|은|는|과|와|로)/g)){
  const tokens=m[1].match(/[가-힣]|\d+/g);if(!tokens)continue;
  let last=tokens.at(-1);
  if(/^\d+$/.test(last)){
   const digits=['영','일','이','삼','사','오','육','칠','팔','구'];
   if(Number(last)===0)last='영';
   else if(last.endsWith('0')){const zeros=last.match(/0+$/)[0].length;last=({1:'십',2:'백',3:'천',4:'만',8:'억'})[zeros];if(!last)continue;}
   else last=digits[Number(last.at(-1))];
  }
  const coda=(last.charCodeAt(0)-0xac00)%28,has=coda!==0&&(!['으로','로'].includes(m[2])||coda!==8);
  const expected=pairs[m[2]][has?0:1];if(m[2]!==expected)errors.push({quote:m[1],actual:m[2],expected});
 }
 return errors;
}
test('인용한 버튼 뒤 조사 검사는 받침·괄호·이모지·숫자·ㄹ 예외를 잡는다',()=>{
 for(const [good,bad] of [
  ['「오늘」을','「오늘」를'],['「7일」을','「7일」를'],['「이번달」을','「이번달」를'],
  ['「공표(확정)」을','「공표(확정)」를'],['「👤 이름 보기」를','「👤 이름 보기」을'],
  ['「확인」이','「확인」가'],['「보기」가','「보기」이'],['「확인」은','「확인」는'],
  ['「보기」는','「보기」은'],['「확인」과','「확인」와'],['「보기」와','「보기」과'],
  ['「저장」으로','「저장」로'],['「달력」으로','「달력」로'],['「목록」으로','「목록」로'],
  ['「이번달」로','「이번달」으로'],['「보기」로','「보기」으로'],
  ['「1」을','「1」를'],['「7」을','「7」를'],['「8」을','「8」를'],['「3」을','「3」를'],
  ['「10」을','「10」를'],['「2」를','「2」을'],['「저장 ✅」을','「저장 ✅」를']
 ]){assert.deepEqual(quotedParticleErrors(good),[],good);assert.equal(quotedParticleErrors(bad).length,1,bad);}
});
test('모든 help 기본 안내의 인용 뒤 조사가 받침과 맞는다',()=>{
 for(const t of helpers().HUB_HELP_TABS){assert.deepEqual(quotedParticleErrors(t.def),[],t.key);assert.doesNotMatch(t.def,/매니저이/);}
});
test('수정 1차 안내는 실제 버튼·역할·저장 흐름과 집계 기간을 설명한다',()=>{
 const defs=new Map(helpers().HUB_HELP_TABS.map(t=>[t.key,t.def]));
 const expected={att:['수기 입력 제출','승인 대기','월 마감','원장에게는'],aicost:['◀·▶','읽기 전용','예산 저장'],
  notice:['활성 직원 누구나','삭제','실장·원장만','읽음'],inbox:['상태·담당 저장','실제 답변 기록','직원은 조회만'],
  'inbox.inbox':['꺼져 있으면','조회만'],'inbox.recall':['📞 연락함','예정일 바꾸기','확인 창 없이'],
  onbo:['항목 추가','매니저는','연차증빙','매니저 승인'],'ai.usage':['최근 30일','날짜별·도우미별·직원별·모델별','미상 N건','추정치'],
  'ai.chat':['최대 4장','사진을 읽을 수 있을 때만'],'hubset.settings':['즉시 저장','해당 줄'],
  sched:['바로 저장','다시 초안','반차·조퇴'],'sched.week':['바로 저장','재공표'],'sched.month':['월간 편집','월간 직무표','주간 화면에서만'],
  'calendar.leave':['연차 캘린더','대상 월'],'calendar.leave.calendar':['달력 보기'],'calendar.leave.list':['종류·신청·승인 시각은 원장에게만'],
  'calendar.period.week':['직무별 인원 수','PNG로 저장'],'calendar.period.month':['직무별 이름','PDF로 저장'],
  'deposit.week':['7일 전 0시','시각·금액·입금자·계좌','수기 대조용'],suggestions:['건의 등록'],
  'pay.hourly':['접힌 칸','세후 시급','별개'],'pay.bonus':['1초 뒤','미확정','지난달 그대로 가져오기'],
  'pay.reply':['포괄 연장 미입력·상여 미확정'],'ai.manage':['되돌릴 수 없습니다'],leave:['동시 휴가 제한'],appr:['완결된 결재 문서']};
 for(const [key,phrases] of Object.entries(expected))for(const phrase of phrases)assert.ok(defs.get(key).includes(phrase),key+' '+phrase);
 assert.doesNotMatch(defs.get('ai.usage'),/처리 결과|건별 목록/);
 for(const key of ['calendar.leave','calendar.leave.calendar','calendar.leave.list'])assert.doesNotMatch(defs.get(key),/주간|주간·월간/);
});
test('모든 기본 안내에 4칸과 실제 이용 단계 3~6개가 있다',()=>{
 const h=cardHelpers();for(const t of helpers().HUB_HELP_TABS){const f=h.hubHelpParse(t.def);
  assert.ok(f.what.length&&f.who.length,t.key+' 내용');assert.ok(f.steps.length>=3&&f.steps.length<=6,t.key+' 단계');
  for(const head of ['무엇:','누가:','쓰는 법:','알아둘 점:'])assert.ok(t.def.includes(head),t.key+' '+head);
 }
});
test('안내 카드 4칸·번호 단계·빈 값 숨김·HTML 이스케이프',()=>{
 const h=cardHelpers(),text='무엇: <img src=x onerror=alert(1)>\n누가: 직원\n쓰는 법:\n1. 열기\n2. 확인\n3. 저장\n알아둘 점: 자동 저장 아님';
 const html=h.hubHelpCardHtml('home',text,'홈',false);
 assert.equal((html.match(/class="hub-help-field"/g)||[]).length,4);
 assert.match(html,/ hidden/);assert.match(html,/<li>열기<\/li>/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);
 assert.match(h.hubHelpButtonHtml('home',text,false),/aria-expanded="false"/);
 assert.equal(h.hubHelpButtonHtml('home','   ',true),'');
});
test('375px 안내는 한 칸·줄바꿈·최대너비 계약을 지킨다',()=>{
 const css=cardHelpers().HUB_HELP_CSS;
 assert.match(css,/@media\(max-width:640px\)/);assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/max-width:100%/);assert.match(css,/overflow-wrap:anywhere/);assert.match(css,/box-sizing:border-box/);
});
test('빈 안내 칸은 제목과 함께 숨긴다',()=>{
 const html=cardHelpers().hubHelpCardHtml('example','무엇: 안내\n누가: 직원\n쓰는 법:\n1. 보기\n알아둘 점:','예시',true);
 assert.equal((html.match(/class="hub-help-field"/g)||[]).length,3);
 assert.doesNotMatch(html,/<h3>알아둘 점<\/h3>/);
 assert.equal((cardHelpers().hubHelpCardHtml('example','무엇:\n누가:\n쓰는 법:\n알아둘 점:','예시',true).match(/class="hub-help-field"/g)||[]).length,0);
});
test('인쇄와 캘린더 PNG 복제본은 사용법 버튼·카드를 제외한다',()=>{
 assert.match(cardHelpers().HUB_HELP_CSS,/@media print\{\.hub-help-button,\.hub-help-card\{display:none!important\}\}/);
 assert.match(hr,/clone\.querySelectorAll\('\.calendar-actions,\.hub-help-button,\.hub-help-card'\)\.forEach\(node=>node\.remove\(\)\)/);
});
test('빈 사용법은 DB 제약을 지키며 저장·다시 읽기 후에도 숨고 기본 복원은 별도다',async()=>{
 const h=helpers(),calls=[];let saved;
 const sb={from(){return {upsert(row){saved=row;calls.push('upsert');return Promise.resolve({error:null});},delete(){calls.push('delete');return {eq(){return Promise.resolve({error:null});}};}};}};
 assert.equal((await h.hubTextsSave(sb,'help.home','')).ok,true);assert.deepEqual(calls,['upsert']);
 assert.ok(saved.value.trim().length>0);h.hubTextSetOverrides([saved]);assert.equal(h.hubText('help.home','기본 안내'),'');
 await h.hubTextsReset(sb,'help.home');assert.equal(h.hubText('help.home','기본 안내'),'기본 안내');
});
test('저장 실패는 이전 안내를 유지하며 다른 글의 빈 값은 기존대로 기본 복원된다',async()=>{
 const h=helpers();h.hubTextSetOverrides([{key:'help.home',value:'기존 안내'}]);
 const fail={from(){return {upsert(){return Promise.resolve({error:{message:'실패'}});}};}};
 assert.equal((await h.hubTextsSave(fail,'help.home','')).ok,false);assert.equal(h.hubText('help.home','기본'),'기존 안내');
 const calls=[],sb={from(){return {delete(){calls.push('delete');return {eq(){return Promise.resolve({error:null});}};}};}};
 assert.equal((await h.hubTextsSave(sb,'tab.home','')).action,'reset');assert.deepEqual(calls,['delete']);
});
test('실제 클릭 처리로 펼침·접힘을 기억하고 저장소 실패에도 동작한다',()=>{
 for(const denied of [false,true]){
  const saved={},window={HubUi:{helpers:{hubTextDefByKey(){return {def:'무엇: 안내'};}}},hubText(k,d){return d;}};
  window.localStorage={getItem(k){if(denied)throw Error('denied');return saved[k]??null;},setItem(k,v){if(denied)throw Error('denied');saved[k]=v;}};
  const document={getElementById(){return true;}};const c={window,document};vm.runInNewContext(read('hub-help.js'),c);
  function screen(){let added=false;const button={expanded:'false',getAttribute(){return this.expanded;},setAttribute(k,v){this.expanded=v;},addEventListener(k,fn){this.click=fn;}};
   const panel={hidden:true},row={tagName:'DIV',classList:{add(){}},querySelector(){return button;},nextElementSibling:panel,insertAdjacentHTML(where,html){if(where==='beforeend'){added=true;button.expanded=html.includes('aria-expanded="true"')?'true':'false';}else panel.hidden=html.includes(' hidden');}};
   const container={querySelector(){return added?button:null;}};window.HubHelp.mount(container,'home','홈',row);return {button,panel};
  }
  let x=screen();assert.equal(x.panel.hidden,true);x.button.click();assert.equal(x.panel.hidden,false);assert.equal(x.button.expanded,'true');
  x=screen();assert.equal(x.panel.hidden,false,'다시 그린 탭도 펼침 상태');x.button.click();assert.equal(x.panel.hidden,true);
 }
});
