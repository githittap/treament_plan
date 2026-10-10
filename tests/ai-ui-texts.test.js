// 직원허브 「AI 도우미」 안내 문구를 원장이 화면에서 고치는 기능 시험.
// 덮어쓰기 적용 · 읽기 실패 시 기본값 · 원장 탭은 원장만 · 오류 kind 매핑 · 저장/되돌리기.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('ai-assistants.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function helpers(){
  const block=js.match(/\/\* ai-assistants:test-start \*\/[\s\S]*?\/\* ai-assistants:test-end \*\//)?.[0];
  assert.ok(block,'ai-assistants.js에 순수 helper 블록이 없습니다.');
  const c={};
  vm.createContext(c);
  vm.runInContext(block+';this.h={aiText,aiTextLines,aiTextSetOverrides,aiTextDefs,aiTextDefByKey,aiTextsFetch,aiTextsLoadInto,aiTextsSave,aiTextsReset,aiErrorMessage,aiHelpSectionsFor,aiHelpErrorRows,aiHelpFieldRows,aiHelpExamples,aiPhotoNotice,aiUiText,aiUnwrapInvoke,AI_ERROR_MESSAGES,AI_HELP_SECTIONS,AI_HELP_EXAMPLES,AI_UI_TEXT_DEFAULTS};',c);
  return c.h;
}
// 표(ai_ui_texts)를 흉내 내는 가짜 supabase. opts.rows=현재 행 · opts.failSelect/failWrite=오류 · opts.noFrom=from 없음.
function fakeSb(opts){
  const o=opts||{},state={rows:(o.rows||[]).map(r=>Object.assign({},r)),calls:[]};
  function from(table){
    const q={table,op:null,payload:null,opts:null,filters:{}};
    const api={
      select(c){q.op='select';q.cols=c;return api;},
      upsert(row,op){q.op='upsert';q.payload=row;q.opts=op;return api;},
      delete(){q.op='delete';return api;},
      eq(k,v){q.filters[k]=v;return api;},
      then(res,rej){
        state.calls.push(q);
        let out;
        if(table!=='ai_ui_texts')out={data:[],error:null};
        else if(q.op==='select')out=o.failSelect?{data:null,error:{message:'boom'}}:{data:state.rows.map(r=>Object.assign({},r)),error:null};
        else if(o.failWrite)out={data:null,error:{code:'42501',message:'new row violates row-level security policy'}};
        else if(q.op==='upsert'){const i=state.rows.findIndex(r=>r.key===q.payload.key);if(i>=0)state.rows[i]=Object.assign({},q.payload);else state.rows.push(Object.assign({},q.payload));out={data:null,error:null};}
        else if(q.op==='delete'){state.rows=state.rows.filter(r=>r.key!==q.filters.key);out={data:null,error:null};}
        return Promise.resolve(out).then(res,rej);
      }};
    return api;
  }
  const sb={rpc:async()=>({data:o.assistants||[{id:'A',name:'도우미A',icon:'A',description:'',ready:true,sort_order:1}],error:null}),functions:{invoke:()=>new Promise(()=>{})}};
  if(!o.noFrom)sb.from=from;
  return {sb,state};
}

test('덮어쓴 문구가 없으면 화면 글은 코드의 기본 문구 그대로다',()=>{
  const h=helpers();
  Object.keys(h.AI_ERROR_MESSAGES).forEach(k=>assert.equal(h.aiErrorMessage(k),h.AI_ERROR_MESSAGES[k],k));
  assert.equal(h.aiErrorMessage('never_seen'),'오류가 있었어요. 잠시 후 다시 시도해 주세요.');
  const staff=clone(h.aiHelpSectionsFor('staff'));
  assert.deepEqual(staff[0].steps.map(s=>s.title),clone(h.AI_HELP_SECTIONS[0].steps).map(s=>s.title));
  assert.deepEqual(staff[0].steps[7].list,clone(h.AI_HELP_SECTIONS[0].steps[7].list));
  assert.equal(h.aiHelpExamples().length,3);
  assert.equal(h.aiHelpExamples()[0].instructions,h.AI_HELP_EXAMPLES[0].instructions);
  assert.match(h.aiPhotoNotice({images_ok:false,fallback_images_ok:null}),/글로 적어 주세요/);
});

test('덮어쓰기 적용: 오류 문장·사용법 글·목록·안내 뜻·예시·화면 글이 고친 값으로 바뀐다',()=>{
  const h=helpers();
  h.aiTextSetOverrides([
    {key:'err.usage_unavailable',value:'원장이 고친 사용량 안내'},
    {key:'err.default',value:'원장이 고친 그 밖의 오류'},
    {key:'help.staff.title',value:'직원용 새 제목'},
    {key:'help.staff.pick.title',value:'카드 고르기'},
    {key:'help.staff.pick',value:'카드 설명을 고쳤어요.'},
    {key:'help.staff.notes',value:'첫째 줄\n\n  둘째 줄  \r\n셋째 줄'},
    {key:'help.error.timeout',value:'시간이 오래 걸렸다는 뜻(고침)'},
    {key:'help.field.name',value:'이름 칸 설명(고침)'},
    {key:'help.example.2.instructions',value:'두 번째 예시 지침서(고침)'},
    {key:'ui.photo_none',value:'사진은 글로 적어 주세요(고침)'},
    {key:'ui.chat_empty',value:'대화를 시작해 보세요(고침)'},
  ]);
  assert.equal(h.aiErrorMessage('usage_unavailable'),'원장이 고친 사용량 안내');
  assert.equal(h.aiErrorMessage('rate_limited'),h.AI_ERROR_MESSAGES.rate_limited,'안 고친 것은 기본값');
  assert.equal(h.aiErrorMessage('never_seen'),'원장이 고친 그 밖의 오류');
  const sec=clone(h.aiHelpSectionsFor('staff'))[0];
  assert.equal(sec.title,'직원용 새 제목');
  assert.equal(sec.steps[0].title,'카드 고르기');
  assert.equal(sec.steps[0].text,'카드 설명을 고쳤어요.');
  assert.deepEqual(sec.steps[7].list,['첫째 줄','둘째 줄','셋째 줄'],'목록은 줄바꿈으로 나뉘고 빈 줄·앞뒤 공백은 버림');
  assert.equal(sec.steps[1].text,clone(h.AI_HELP_SECTIONS[0].steps[1]).text,'안 고친 단계는 기본 글');
  const rows=clone(h.aiHelpErrorRows());
  assert.equal(rows.find(r=>r.kind==='timeout').means,'시간이 오래 걸렸다는 뜻(고침)');
  assert.equal(rows.find(r=>r.kind==='usage_unavailable').message,'원장이 고친 사용량 안내','안내 문장 표도 고친 오류 문장을 가져옴');
  assert.equal(h.aiHelpFieldRows()[0][1],'이름 칸 설명(고침)');
  assert.equal(h.aiHelpExamples()[1].instructions,'두 번째 예시 지침서(고침)');
  assert.equal(h.aiHelpExamples()[0].instructions,h.AI_HELP_EXAMPLES[0].instructions);
  assert.equal(h.aiPhotoNotice({images_ok:false,fallback_images_ok:false}),'사진은 글로 적어 주세요(고침)');
  assert.equal(h.aiUiText('chat_empty'),'대화를 시작해 보세요(고침)');
  // 원장용 섹션은 원장에게만(고친 문구가 있어도 같은 규칙)
  assert.deepEqual(clone(h.aiHelpSectionsFor('staff')).map(s=>s.id),['staff']);
  assert.deepEqual(clone(h.aiHelpSectionsFor('owner')).map(s=>s.id),['staff','owner']);
});

test('덮어쓰기 값이 비었거나 모르는 키·엉뚱한 형식이면 무시하고 기본값을 쓴다',()=>{
  const h=helpers();
  h.aiTextSetOverrides([{key:'err.timeout',value:'   '},{key:'err.upstream_error',value:null},{key:'err.unknown_x',value:'없는 키'},{value:'키 없음'},null,{key:'constructor',value:'x'}]);
  assert.equal(h.aiErrorMessage('timeout'),h.AI_ERROR_MESSAGES.timeout);
  assert.equal(h.aiErrorMessage('upstream_error'),h.AI_ERROR_MESSAGES.upstream_error);
  assert.equal(h.aiErrorMessage('unknown_x'),'오류가 있었어요. 잠시 후 다시 시도해 주세요.','모르는 kind는 err.default(없으면 기본)');
  h.aiTextSetOverrides(null);
  assert.equal(h.aiText('help.staff.pick','기본'),'기본');
  h.aiTextSetOverrides([{key:'help.staff.notes',value:' \n \n'}]);
  assert.deepEqual(clone(h.aiHelpSectionsFor('staff'))[0].steps[7].list,clone(h.AI_HELP_SECTIONS[0].steps[7].list),'줄이 하나도 없는 목록은 기본 목록');
});

test('오류 종류(kind)로 화면 문장을 고른다: Edge가 보낸 한국어 message는 쓰지 않고, 덮어쓴 값이 이긴다',async()=>{
  const h=helpers();
  const httpErr=(status,body)=>({name:'FunctionsHttpError',context:{status,json:async()=>body}});
  const edgeMsg='Edge가 직접 보낸 문장입니다';
  const a=await h.aiUnwrapInvoke({data:null,error:httpErr(400,{ok:false,error_kind:'image_not_supported',message:edgeMsg})});
  assert.equal(a.error_kind,'image_not_supported');
  assert.equal(h.aiErrorMessage(a.error_kind),h.AI_ERROR_MESSAGES.image_not_supported,'화면 표의 문장');
  assert.notEqual(h.aiErrorMessage(a.error_kind),edgeMsg);
  h.aiTextSetOverrides([{key:'err.image_not_supported',value:'원장이 고친 사진 안내'}]);
  assert.equal(h.aiErrorMessage(a.error_kind),'원장이 고친 사진 안내','Edge 문장이 있어도 화면 값(덮어쓴 것)이 이김');
  const b=await h.aiUnwrapInvoke({data:{ok:false,error_kind:'usage_unavailable',message:edgeMsg},error:null});
  assert.equal(b.error_kind,'usage_unavailable');
  assert.ok(!h.aiErrorMessage(b.error_kind).includes(edgeMsg));
  // 화면 코드는 Edge의 message를 글로 쓰지 않는다
  assert.doesNotMatch(js,/data\.message|data&&data\.message|\.message\)\s*\|\|\s*data/);
  assert.ok((js.match(/aiErrorMessage\(/g)||[]).length>=6);
});

test('문구 읽기: 있는 키는 덮어쓰고, 읽기에 실패하면 조용히 기본값을 쓴다',async()=>{
  const h=helpers();
  const ok=fakeSb({rows:[{key:'err.timeout',value:'고친 시간초과'}]});
  assert.equal(await h.aiTextsLoadInto(ok.sb),true);
  assert.equal(h.aiErrorMessage('timeout'),'고친 시간초과');
  assert.deepEqual(clone(ok.state.calls.map(c=>[c.table,c.op,c.cols])),[['ai_ui_texts','select','key,value']],'표는 한 번 읽음');
  // 읽기 오류 → 기본값(이전에 읽은 값도 남기지 않음)
  const bad=fakeSb({failSelect:true});
  assert.equal(await h.aiTextsLoadInto(bad.sb),false);
  assert.equal(h.aiErrorMessage('timeout'),h.AI_ERROR_MESSAGES.timeout);
  // from 자체가 없는 연결·null 연결·던지는 연결도 조용히 기본값
  h.aiTextSetOverrides([{key:'err.timeout',value:'x'}]);
  assert.equal(await h.aiTextsLoadInto(fakeSb({noFrom:true}).sb),false);
  assert.equal(h.aiErrorMessage('timeout'),h.AI_ERROR_MESSAGES.timeout);
  assert.equal(await h.aiTextsLoadInto(null),false);
  assert.equal(await h.aiTextsLoadInto({from(){throw new Error('network');}}),false);
  await assert.rejects(h.aiTextsFetch(bad.sb),e=>e.message==='boom');
});

test('문구 목록: 키는 겹치지 않고 DB 키 규칙에 맞으며, 모든 오류 종류·사용법 단계가 들어 있다',()=>{
  const h=helpers();
  const defs=clone(h.aiTextDefs());
  const keys=defs.map(d=>d.key);
  assert.equal(new Set(keys).size,keys.length,'키 중복 없음');
  keys.forEach(k=>assert.match(k,/^[a-z][a-z0-9_.]{1,80}$/,k));
  defs.forEach(d=>{assert.ok(d.where&&d.group&&d.def.trim(),d.key);assert.ok(d.def.length<=20000,d.key);});
  Object.keys(h.AI_ERROR_MESSAGES).forEach(k=>assert.ok(keys.includes('err.'+k),'err.'+k));
  assert.ok(keys.includes('err.default'));
  clone(h.AI_HELP_SECTIONS).forEach(sec=>{assert.ok(keys.includes('help.'+sec.id+'.title'));sec.steps.forEach(st=>{assert.ok(st.id,'단계 id 필요: '+st.title);assert.ok(keys.includes('help.'+sec.id+'.'+st.id),st.id);assert.ok(keys.includes('help.'+sec.id+'.'+st.id+'.title'));});});
  assert.ok(keys.includes('help.staff.notes'),'예시로 든 키 help.staff.notes');
  assert.ok(keys.includes('err.usage_unavailable'));
  assert.equal(defs.find(d=>d.key==='help.staff.notes').multi,true,'목록형은 multi');
  assert.match(defs.find(d=>d.key==='help.staff.notes').def,/\n/,'목록형 기본값은 줄바꿈으로 이어 붙임');
  assert.equal(defs.find(d=>d.key==='err.timeout').multi,false);
  assert.equal(keys.length,88,'키 개수: 오류 18 + 화면 글 7 + 사용법 제목 2 + 단계 15×2 + 안내 뜻 8 + 칸 11 + 예시 12');
  // 「어디에 보이는지」 설명에 직원 화면 금지 문구가 새로 들어가지 않는다(원장 결정)
  assert.doesNotMatch(JSON.stringify(defs.map(d=>d.where)),/사용 기록으로 남고|원장이 볼 수 있어요|대화 기록|열람/);
  assert.ok(!js.includes('§'));
});

test('저장: 기본과 다르면 upsert, 비었거나 기본과 같으면 행 삭제(기본으로 되돌림), 너무 길면 안 보냄',async()=>{
  const h=helpers();
  const t=fakeSb();
  let r=await h.aiTextsSave(t.sb,'err.timeout','고친 글');
  assert.deepEqual(clone(r),{ok:true,action:'saved'});
  const up=t.state.calls[0];
  assert.equal(up.table,'ai_ui_texts');assert.equal(up.op,'upsert');
  assert.deepEqual(clone(up.payload),{key:'err.timeout',value:'고친 글'},'고친 사람·시각은 화면이 안 보냄(DB가 채움)');
  assert.equal(up.opts.onConflict,'key');
  assert.equal(h.aiErrorMessage('timeout'),'고친 글','저장하면 바로 화면 글에 반영');
  // 기본과 같게 저장 → 삭제
  r=await h.aiTextsSave(t.sb,'err.timeout',h.AI_ERROR_MESSAGES.timeout+'  ');
  assert.deepEqual(clone(r),{ok:true,action:'reset'});
  assert.equal(t.state.calls[1].op,'delete');assert.equal(t.state.calls[1].filters.key,'err.timeout');
  assert.equal(h.aiErrorMessage('timeout'),h.AI_ERROR_MESSAGES.timeout);
  assert.equal(t.state.rows.length,0);
  // 빈 글 → 삭제
  await h.aiTextsSave(t.sb,'err.timeout','k');
  r=await h.aiTextsSave(t.sb,'err.timeout','   ');
  assert.equal(r.action,'reset');assert.equal(t.state.rows.length,0);
  // 목록형: 줄바꿈·공백만 다른 기본값은 기본과 같음 / 줄을 바꾸면 저장
  const def=h.aiTextDefByKey('help.staff.notes').def;
  assert.equal((await h.aiTextsSave(t.sb,'help.staff.notes','\n'+def.split('\n').map(x=>'  '+x+'  ').join('\n\n')+'\n')).action,'reset');
  assert.equal((await h.aiTextsSave(t.sb,'help.staff.notes',def+'\n새 줄')).action,'saved');
  assert.deepEqual(clone(h.aiHelpSectionsFor('staff'))[0].steps[7].list.slice(-1),['새 줄']);
  // 여러 줄 글에서 문단 사이 빈 줄만 바꾼 것은 「고친 것」으로 저장
  const ex=h.aiTextDefByKey('help.example.1.instructions').def;
  assert.equal((await h.aiTextsSave(t.sb,'help.example.1.instructions',ex.replace('\n\n','\n'))).action,'saved');
  // 길이·모르는 키·CRLF
  const n=t.state.calls.length;
  assert.deepEqual(clone(await h.aiTextsSave(t.sb,'err.timeout','가'.repeat(20001))),{ok:false,reason:'too_long',error:null});
  assert.equal((await h.aiTextsSave(t.sb,'no.such.key','x')).reason,'unknown_key');
  assert.equal(t.state.calls.length,n,'막힌 저장은 DB를 부르지 않음');
  await h.aiTextsSave(t.sb,'err.timeout','줄1\r\n줄2');
  assert.equal(t.state.rows.find(x=>x.key==='err.timeout').value,'줄1\n줄2');
  // 되돌리기
  r=await h.aiTextsReset(t.sb,'err.timeout');
  assert.deepEqual(clone(r),{ok:true,action:'reset'});
  assert.equal(t.state.rows.find(x=>x.key==='err.timeout'),undefined);
  assert.equal(h.aiErrorMessage('timeout'),h.AI_ERROR_MESSAGES.timeout);
  assert.equal((await h.aiTextsReset(t.sb,'no.such.key')).reason,'unknown_key');
});

test('저장 실패(권한 없음 등)는 ok:false로 돌려주고 화면 글은 바뀌지 않는다',async()=>{
  const h=helpers();
  const t=fakeSb({failWrite:true});
  const r=await h.aiTextsSave(t.sb,'err.timeout','고친 글');
  assert.equal(r.ok,false);assert.equal(r.reason,'write_failed');assert.equal(r.error.code,'42501');
  assert.equal(h.aiErrorMessage('timeout'),h.AI_ERROR_MESSAGES.timeout);
  const r2=await h.aiTextsReset(t.sb,'err.timeout');
  assert.equal(r2.ok,false);
});

// ── 화면 전체(가짜 DOM) ──
function harness(opts){
  const handlers={},registry={};
  const {sb,state}=fakeSb(opts);
  function attrs(html,name){const out=[];const re=new RegExp('data-'+name+'(?:="([^"]*)")?','g');let m;while((m=re.exec(html)))out.push(m[1]==null?'':m[1]);return out;}
  function listAll(el,sel){
    const m=sel.match(/^\[data-([\w-]+)\]$/);if(!m)return [];
    return attrs(el.innerHTML,m[1]).map(function(v){return {addEventListener(t,f){handlers['['+m[1]+']='+v+'|'+t]=f;},getAttribute(){return v;}};});
  }
  function makeEl(key){
    const el={innerHTML:'',value:'',textContent:'',scrollTop:0,scrollHeight:0,focus(){},hidden:false,
      addEventListener(t,f){handlers[key+'|'+t]=f;},
      querySelector(sel){return getEl(sel);},
      querySelectorAll(sel){return listAll(el,sel);},
      getAttribute(){return '';}};
    return el;
  }
  function getEl(sel){
    if(sel[0]==='#'){registry[sel]=registry[sel]||makeEl(sel);return registry[sel];}
    const k=sel.replace('[data-','[');return {addEventListener(t,f){handlers[k+'|'+t]=f;}};
  }
  const rootEl=makeEl('root');
  const ctx={window:{},document:{head:{appendChild(){}},createElement(){return {};}},confirm(){return true;},navigator:{},console};
  vm.createContext(ctx);
  vm.runInContext(js,ctx);
  const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
  return {ctx,root:rootEl,section:getEl('#aiSection'),el:getEl,sb,state,settle,
    has(k){return (k+'|click') in handlers;},
    async click(key){const r=handlers[key+'|click']();await settle();return r;},
    async render(me){await ctx.window.AIAssistants.render(rootEl,{sb:sb,me:me});await settle();}};
}

test('화면: 원장에게만 「📝 안내 문구」 탭이 보이고, 직원·매니저·실장에게는 안 보인다',async()=>{
  for(const role of ['staff','manager','chief']){
    const t=harness({});
    await t.render({id:'u1',role});
    assert.doesNotMatch(t.root.innerHTML,/안내 문구/,role+'에게 탭이 보이면 안 됨');
    assert.doesNotMatch(t.root.innerHTML,/data-ai-subtab="texts"/);
    assert.equal(t.has('[ai-subtab]=texts'),false);
    assert.ok(t.state.calls.every(c=>c.op==='select'),role+': 쓰기 호출 없음');
  }
  const o=harness({});
  await o.render({id:'o1',role:'owner'});
  assert.match(o.root.innerHTML,/data-ai-subtab="texts">📝 안내 문구</);
});

test('화면: 원장이 탭을 열면 키마다 어디에 보이는지·기본 문구·지금 문구·저장·되돌리기가 나온다',async()=>{
  const o=harness({rows:[{key:'err.timeout',value:'고친 시간초과 글'}]});
  await o.render({id:'o1',role:'owner'});
  await o.click('[ai-subtab]=texts');
  const html=o.section.innerHTML;
  assert.match(html,/📝 안내 문구/);
  assert.match(html,/채팅 창 오류 문장 — 답이 너무 오래 걸렸을 때/,'어디에 보이는지');
  assert.match(html,/이름표: err\.timeout/);
  assert.match(html,/<pre class="ai-txt-def">응답이 너무 오래 걸려요\. 다시 시도해 주세요\.<\/pre>/,'기본 문구');
  assert.match(html,/기본으로 되돌리기/);
  assert.equal((html.match(/data-ai-text-save="\d+"/g)||[]).length,88,'키마다 저장 단추');
  assert.equal((html.match(/data-ai-text-reset="\d+"/g)||[]).length,88);
  assert.match(html,/고친 것 1개/,'고친 문구 수 표시');
  assert.match(html,/<span class="b ok">고침<\/span>/);
  assert.ok(o.state.calls.some(c=>c.table==='ai_ui_texts'&&c.op==='select'));
});

test('화면: 원장이 고쳐 저장하면 표에 upsert되고, 되돌리기를 누르면 행이 지워진다',async()=>{
  const o=harness({});
  await o.render({id:'o1',role:'owner'});
  await o.click('[ai-subtab]=texts');
  const key='err.timeout';
  const i=helpers().aiTextDefs().findIndex(d=>d.key===key); // 화면의 줄 번호 = 문구 목록 순서
  assert.ok(i>=0);
  assert.match(o.section.innerHTML,new RegExp('data-ai-text-row="'+i+'"'));
  o.el('#aiTxtIn_'+i).value='원장이 화면에서 고친 글';
  await o.click('[ai-text-save]='+i);
  const up=o.state.calls.filter(c=>c.op==='upsert');
  assert.equal(up.length,1);
  assert.deepEqual(clone(up[0].payload),{key,value:'원장이 화면에서 고친 글'});
  assert.equal(o.el('#aiTxtMsg_'+i).textContent,'저장했어요.');
  assert.match(o.el('#aiTxtBadge_'+i).innerHTML,/고침/);
  assert.equal(o.state.rows[0].value,'원장이 화면에서 고친 글');
  // 되돌리기
  await o.click('[ai-text-reset]='+i);
  assert.equal(o.state.rows.length,0);
  assert.equal(o.el('#aiTxtMsg_'+i).textContent,'기본 문구로 돌렸어요.');
  assert.equal(o.el('#aiTxtIn_'+i).value,'응답이 너무 오래 걸려요. 다시 시도해 주세요.','되돌리면 입력칸도 화면의 기본 문구');
  assert.equal(o.el('#aiTxtBadge_'+i).innerHTML,'');
  // 저장 실패는 쉬운 말로 알림
  const f=harness({failWrite:true});
  await f.render({id:'o1',role:'owner'});
  await f.click('[ai-subtab]=texts');
  f.el('#aiTxtIn_'+i).value='고침';
  await f.click('[ai-text-save]='+i);
  assert.match(f.el('#aiTxtMsg_'+i).textContent,/저장하지 못했어요 — 권한이 없어요/);
});

test('화면: 저장한 문구가 「❓ 사용법」 패널과 다음에 여는 직원 화면에 반영되고, 읽기 실패면 기본 문구가 보인다',async()=>{
  // 직원 화면: 표에 있는 문구가 사용법 패널에 들어간다
  const s=harness({rows:[{key:'help.staff.pick',value:'원장이 고친 도우미 고르기 설명'},{key:'help.staff.notes',value:'고친 알아 둘 것 하나\n고친 알아 둘 것 둘'},{key:'ui.empty_cards',value:'고친 빈 화면 글'}],assistants:[]});
  await s.render({id:'u1',role:'staff'});
  assert.match(s.root.innerHTML,/원장이 고친 도우미 고르기 설명/);
  assert.match(s.root.innerHTML,/<li>고친 알아 둘 것 하나<\/li><li>고친 알아 둘 것 둘<\/li>/);
  assert.match(s.section.innerHTML,/고친 빈 화면 글/);
  assert.ok(s.state.calls.every(c=>c.op==='select'&&c.table==='ai_ui_texts'),'직원은 읽기만');
  // 읽기 실패 → 기본 문구(화면은 멀쩡히 뜸)
  const f=harness({failSelect:true,assistants:[]});
  await f.render({id:'u1',role:'staff'});
  assert.doesNotMatch(f.root.innerHTML,/원장이 고친/);
  assert.match(f.root.innerHTML,/「🤖 AI 도우미」 화면에 도우미 카드가 나옵니다/);
  assert.match(f.section.innerHTML,/아직 쓸 수 있는 도우미가 없습니다\. 원장에게 문의하세요\./);
  // 표를 못 쓰는 옛 연결(from 없음)도 기본 문구
  const n=harness({noFrom:true,assistants:[]});
  await n.render({id:'u1',role:'staff'});
  assert.match(n.section.innerHTML,/아직 쓸 수 있는 도우미가 없습니다/);
  // 원장이 저장하면 위쪽 사용법 패널도 바로 바뀐다
  const o=harness({});
  await o.render({id:'o1',role:'owner'});
  await o.click('[ai-subtab]=texts');
  const i=helpers().aiTextDefs().findIndex(d=>d.key==='help.staff.pick');
  assert.ok(i>=0);
  o.el('#aiTxtIn_'+i).value='저장 직후 패널에 보일 글';
  await o.click('[ai-text-save]='+i);
  assert.match(o.el('#aiHelpPanel').innerHTML,/저장 직후 패널에 보일 글/);
});

test('화면: 사용자가 바뀌면 이전 사람이 읽은 덮어쓰기 문구를 비운다',async()=>{
  const t=harness({rows:[{key:'ui.empty_cards',value:'고친 빈 화면 글'}],assistants:[]});
  await t.render({id:'u1',role:'staff'});
  assert.match(t.section.innerHTML,/고친 빈 화면 글/);
  t.state.rows=[];
  await t.render({id:'u2',role:'staff'});
  assert.doesNotMatch(t.section.innerHTML,/고친 빈 화면 글/);
  assert.match(t.section.innerHTML,/아직 쓸 수 있는 도우미가 없습니다/);
});

test('원본 글 검사: 직원 화면에 대화 기록·원장 열람 안내를 새로 넣지 않았고 hr.html 주소 번호가 올라갔다',()=>{
  assert.doesNotMatch(js,/대화는 저장되지 않아요|업무 확인을 위해 저장되며 원장만 볼 수 있어요|사용 기록으로 남고|원장이 볼 수 있어요/);
  assert.match(read('hr.html'),/<script src="ai-assistants\.js\?v=2026101110"><\/script>/);
  assert.ok(!js.includes('§'));
});
