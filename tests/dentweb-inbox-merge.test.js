const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const privateOperationsPath=path.join(__dirname,'..','server-merge-staging/web-merge/operations.js');
const operations=fs.existsSync(privateOperationsPath)?fs.readFileSync(privateOperationsPath,'utf8'):null;
const html=read('hr.html');

const region=html.slice(html.indexOf('/* ── 상담일지:'),html.indexOf('/* ── 근로계약서 ── */'));
const times=html.match(/\/\* hub-time:test-start \*\/[\s\S]*?\/\* hub-time:test-end \*\//)[0];
const timestamp=html.match(/function formatLeaveTimestamp\(value\)\{[\s\S]*?\n\}/)[0];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const book=(id='booking',extra={})=>({
  id,source:'kakao',external_event_id:'kbook-'+id,status:'closed',received_at:'2026-11-03T05:00:00Z',
  kakao_booking_number:'123456789',kakao_booking_version:1,
  dentweb_entered_at:'2026-11-03T06:00:00Z',message:'예약 알림\n상품명: 원문 상품\n일정: 11/03 14:00\n예약자명: 원문 예약\n예약자 연락처: 010-0000-1234',...extra
});
const booked=(id,extra={})=>({inbox_id:id,booking_version:1,appointment_found:true,visited:true,match_basis:'phone8_date',...extra});
const ambiguous=id=>booked(id,{appointment_found:false,visited:false,match_basis:'ambiguous'});
const ok=data=>({data,error:null});

function boot(answer,texts={},role='staff'){
  const dom=new Map(),queries=[],views=[];
  const $=selector=>{
    if(!dom.has(selector))dom.set(selector,{innerHTML:'',querySelectorAll:()=>[],isConnected:true});
    return dom.get(selector);
  };
  const ctx={$,esc,ME:{role},PROFILES:[],hubFmtWhen:()=>'',nameOf:()=>'',setStatus(){},confirm:()=>true,
    hubT:(key,fallback,values={})=>String(texts[key]??fallback).replace(/\{([a-z_]+)\}/g,(match,name)=>values[name]??match),
    sb:{
      from(table){
        const q={table,cols:'',filters:[]};
        const api=new Proxy({}, {get(_,name){
          if(name==='then')return (resolve,reject)=>Promise.resolve().then(()=>{queries.push(q);return answer(q);}).then(resolve,reject);
          return (...args)=>{if(name==='select')q.cols=args[0];else q.filters.push([name,...args]);return api;};
        }});
        return api;
      },
      rpc(name,args){views.push({name,args});return Promise.resolve(ok(null));}
    }
  };
  vm.createContext(ctx);
  vm.runInContext(times+'\n'+timestamp+'\n'+region+';0',ctx);
  return {ctx,queries,views,$};
}
const matchQueries=h=>h.queries.filter(q=>q.table==='dentweb_inbox_matches');
const ids=q=>(q.filters.find(([key])=>key==='in')||[])[2];

test('normalized booking values win and older rows retain the original parser',()=>{
  const {ctx}=boot(()=>ok([]));
  const normalized=ctx.inboxKakaoBookingDetails(book('booking',{
    kakao_booking_name:'정규 예약',kakao_booking_contact_digits:'01000000003',
    kakao_booking_schedule:'2026.11.25(수) 15:20',kakao_booking_product:'정규 상품'
  }));
  assert.equal(normalized.name,'정규 예약');
  assert.equal(normalized.contact,'01000000003');
  assert.equal(normalized.schedule,'11/25(수) 15:20');
  assert.equal(normalized.product,'정규 상품');
  const legacy=ctx.inboxKakaoBookingDetails(book());
  assert.equal(legacy.name,'원문 예약');
  assert.equal(legacy.contact,'010-0000-1234');
  assert.equal(legacy.schedule,'11/03 14:00');
  assert.equal(ctx.inboxKakaoBookingDetails(book('booking',{kakao_booking_contact_digits:null})).contact,'');
});

test('normalized null stays unknown in the list and in the details with a separate received time',()=>{
  const {ctx}=boot(()=>ok([]));
  const row=book('booking',{
    message:'알림 발송 시각: 2026.11.03 09:00',
    kakao_booking_schedule:null,kakao_booking_name:'정규 예약'
  });
  assert.equal(ctx.inboxKakaoBookingListLines(row).top,'확인 필요');
  const detail=ctx.inboxKakaoBookingDetailHtml(row).match(/<dl[^>]*>[\s\S]*?<\/dl>/)[0];
  assert.match(detail,/<dt>일정<\/dt><dd>확인 필요<\/dd>/);
  assert.match(detail,/<dt>받은 시각<\/dt><dd>2026\.11\.3 오후 2시/);
  assert.doesNotMatch(detail,/09:00/);
  delete row.kakao_booking_schedule;
  assert.equal(ctx.inboxKakaoBookingListLines(row).top,'11/03 09:00');
});

test('list badges use only visible Kakao booking ids and retain the existing entry stamp',async()=>{
  const kakao=book(),chat=book('chat',{external_event_id:'kakao-message'});
  const h=boot(q=>q.table==='consultation_inbox'?(q.cols==='id'?{count:0}:ok([kakao,chat])):ok([booked(kakao.id),booked('never-visible')]));
  await h.ctx.inboxLoad();
  assert.deepEqual(Array.from(ids(matchQueries(h)[0])),[kakao.id]);
  assert.match(matchQueries(h)[0].cols,/^inbox_id,appointment_found,visited,match_basis,checked_at,booking_version$/);
  const markup=h.$('#inboxList').innerHTML;
  assert.equal((markup.match(/덴트웹 예약 있음/g)||[]).length,2);
  assert.equal((markup.match(/내원함/g)||[]).length,2);
  assert.match(markup,/덴트웹 입력함/);
  assert.doesNotMatch(markup,/never-visible/);
});

test('detail shows confirmation, escapes editable badge labels and retains the original status',async()=>{
  const row=book();
  const h=boot(q=>q.table==='consultation_inbox'?ok([row]):ok([ambiguous(row.id)]),{'inbox.kb_match_review':'검토 <b>필요</b>'});
  await h.ctx.inboxSelect([row.id]);
  const markup=h.$('#inboxDetail').innerHTML;
  assert.match(markup,/검토 &lt;b&gt;필요&lt;\/b&gt;/);
  assert.doesNotMatch(markup,/<b>필요<\/b>|덴트웹 예약 있음|내원함/);
  assert.match(markup,/처리됨|완료/);
  assert.match(markup,/덴트웹 입력함/);
  assert.equal(h.views[0].name,'consultation_inbox_record_view');
  assert.equal(h.ctx.inboxDentwebMatchBadges(book()),'');
  assert.equal(h.ctx.inboxDentwebMatchBadges(book('none',{dentweb_match:booked('none',{appointment_found:false,visited:false,match_basis:'no_match'})})),'');
});

test('booking detail shows when positive or insufficient evidence was checked',async()=>{
  const row=book();
  const checked_at='2026-11-21T05:30:00Z';
  let fact=booked(row.id,{checked_at});
  const h=boot(q=>q.table==='consultation_inbox'?ok([row]):ok([fact]));
  await h.ctx.inboxSelect([row.id]);
  const detail=h.$('#inboxDetail');
  assert.match(detail.innerHTML,/최근 대조 시각/);
  assert.match(detail.innerHTML,/2026\.11\.21 오후 2시 30분/);
  assert.match(detail.innerHTML,/덴트웹 예약 있음|내원함/);
  fact={...ambiguous(row.id),match_basis:'insufficient',checked_at};
  await h.ctx.inboxSelect([row.id]);
  assert.match(detail.innerHTML,/최근 대조 시각/);
  assert.match(detail.innerHTML,/확인 필요/);
  assert.doesNotMatch(detail.innerHTML,/덴트웹 예약 있음|내원함|일치 후보 없음/);
});

test('changed booking or unnumbered legacy row does not use a stale match',async()=>{
  for(const row of [book('changed',{kakao_booking_version:2}),book('legacy',{kakao_booking_number:null})]){
    const h=boot(q=>q.table==='consultation_inbox'?ok([row]):ok([booked(row.id)]));
    await h.ctx.inboxSelect([row.id]);
    assert.doesNotMatch(h.$('#inboxDetail').innerHTML,/덴트웹 예약 있음|내원함/);
  }
});

test('unavailable normalization columns and matches leave the original list and detail usable',async()=>{
  const legacy=book();
  const h=boot(q=>{
    if(q.table==='dentweb_inbox_matches')throw new Error('missing table');
    if(q.cols.includes('kakao_booking_name'))return {error:{code:'42703',message:'column consultation_inbox.kakao_booking_name does not exist'}};
    if(q.cols==='id')return {count:0};
    return ok([legacy]);
  });
  await h.ctx.inboxLoad();
  await h.ctx.inboxSelect([legacy.id]);
  assert.ok(h.queries.some(q=>q.cols.includes('kakao_booking_name')));
  assert.ok(matchQueries(h).length>=2);
  for(const content of [h.$('#inboxList').innerHTML,h.$('#inboxDetail').innerHTML]){
    assert.match(content,/원문 상품/);
    assert.match(content,/덴트웹 입력함/);
    assert.doesNotMatch(content,/cal-error|덴트웹 예약 있음|내원함/);
  }
});

test('undo uses the observed timestamp and actor, then reloads the newest row and keeps the failure notice',async()=>{
  const row=book('cas',{dentweb_entered_at:'2026-11-03T15:00:00.123456+09:00',dentweb_entered_by:'u2'});
  const latest=book('cas',{dentweb_entered_at:'2026-11-03T16:30:00.654321+09:00',dentweb_entered_by:'u3'});
  let rowReads=0;
  const h=boot(q=>{
    if(q.filters.some(([name])=>name==='update'))return {data:null,error:null};
    if(q.table==='consultation_inbox'){
      if(q.cols==='id')return {count:0};
      rowReads++;
      return ok([rowReads>=2?latest:row]);
    }
    return ok([]);
  },{},'manager');
  h.ctx.fixture=row;
  h.ctx.hubFmtDateTime=value=>String(value);
  vm.runInContext('INBOX_SELECTED=fixture;INBOX_DENTWEB_FIELDS_AVAILABLE=true',h.ctx);
  await h.ctx.inboxSetDentwebEntered();
  const undo=h.queries.find(q=>q.table==='consultation_inbox'&&q.filters.some(([name])=>name==='update'));
  assert.ok(undo,'undo issues a direct UPDATE');
  assert.equal(undo.cols,'id');
  assert.deepEqual(undo.filters.filter(([method])=>['eq','like','is'].includes(method)),[
    ['eq','id',row.id],['eq','source','kakao'],['like','external_event_id','kbook-%'],['is','journal_id',null],
    ['eq','dentweb_entered_at',row.dentweb_entered_at],['eq','dentweb_entered_by','u2']
  ]);
  assert.ok(rowReads>=2,'stale failure rereads the list and detail');
  assert.equal(vm.runInContext('INBOX_SELECTED.dentweb_entered_at',h.ctx),latest.dentweb_entered_at);
  assert.equal(vm.runInContext('INBOX_SELECTED.dentweb_entered_by',h.ctx),'u3');
  assert.match(String(h.$('#inboxDentwebMsg').textContent),/권한|바뀌었/);
  assert.match(h.$('#inboxDetail').innerHTML,/2026-11-03T16:30:00\.654321\+09:00/);
  assert.doesNotMatch(h.$('#inboxDetail').innerHTML,/2026-11-03T15:00:00\.123456\+09:00/);
});

test('operations stale undo rereads the latest row and renders its notice in the refreshed DOM',{skip:operations===null?'private operations.js absent from public checkout':false},async()=>{
  const stale=book('ops-cas',{dentweb_entered_at:'2026-11-03T15:00:00Z',dentweb_entered_by:'u2'});
  const latest=book('ops-cas',{dentweb_entered_at:'2026-11-03T16:30:00Z',dentweb_entered_by:'u3'});
  const buttons=new Map(),refreshButton={disabled:false};
  const makeElement=tag=>({tag,children:[],attributes:{},listeners:{},append(...items){this.children.push(...items);},setAttribute(key,value){this.attributes[key]=value;},addEventListener(name,fn){this.listeners[name]=fn;},replaceChildren(...items){this.children=items;}});
  const context={
    document:{createElement:makeElement},
    inboxStatuses:{new:'미처리',in_progress:'진행중',recall_1:'리콜 1차',recall_2:'리콜 2차',recall_3:'리콜 3차',closed:'처리됨',converted:'상담일지 전환'},
    kakaoPeople:[],kakaoWriting:false,accessToken:'synthetic-token',
    canWriteKakao:()=>true,byId:()=>refreshButton,
    addKakaoButton(parent,label,action){const button=makeElement('button');button.label=label;button.listeners.click=action;buttons.set(label,button);parent.append(button);return button;},
    addSelectOption(select,value,label){select.append({value,label});},
    client:{from(){const chain=new Proxy({}, {get(_target,name){if(name==='maybeSingle')return async()=>({data:null,error:null});return()=>chain;}});return chain;}},
    loadKakaoBookings:async()=>{}
  };
  vm.createContext(context);
  const notice=operations.slice(operations.indexOf('function kakaoNoticeFor('),operations.indexOf('function kakaoBookingDetails('));
  const save=operations.slice(operations.indexOf('async function saveKakao('),operations.indexOf('function renderKakaoActions('));
  const render=operations.slice(operations.indexOf('function renderKakaoActions('),operations.indexOf('async function loadKakaoBookings('));
  vm.runInContext(`const kakaoNotices=new Map();let kakaoWriting=false;let kakaoPeople=[];let currentUserId='u1';const inboxStatuses=${JSON.stringify({new:'미처리',in_progress:'진행중',recall_1:'리콜 1차',recall_2:'리콜 2차',recall_3:'리콜 3차',closed:'처리됨',converted:'상담일지 전환'})};let accessToken='synthetic-token';function canWriteKakao(){return true;}${notice}${save}${render}`,context);
  let latestCell=null,refreshes=0;
  context.loadKakaoBookings=async()=>{
    refreshes++;
    buttons.clear();
    latestCell=makeElement('td');
    context.renderKakaoActions(latestCell,latest);
  };
  const initial=makeElement('td');
  context.renderKakaoActions(initial,stale);
  const undo=buttons.get('입력 표시 되돌리기');
  assert.ok(undo,'stale row initially exposes undo');
  await undo.listeners.click();
  assert.equal(refreshes,1,'failed conditional update reloads bookings');
  assert.ok(latestCell,'latest row rendered after reload');
  assert.equal(buttons.has('입력 표시 되돌리기'),true,'refreshed row still shows its newer stamp');
  const status=latestCell.children[0].children[1].children.find(child=>child.attributes.role==='status');
  assert.match(status.textContent,/이미 바뀌었거나 권한이 없어/,'failure notice remains in the refreshed status element');
  assert.equal(latest.dentweb_entered_by,'u3','refresh did not replace the latest recorded actor');
});

for(const view of ['list','detail'])test('a slow match response cannot overwrite a newer inbox '+view,async()=>{
  const old=book('old',{kakao_booking_product:'이전 예약'}),current=book('current',{kakao_booking_product:'현재 예약'});
  let hitOld,releaseOld,fetch=0;
  const started=new Promise(resolve=>{hitOld=resolve;});
  const held=new Promise(resolve=>{releaseOld=resolve;});
  const h=boot(q=>{
    if(q.table==='dentweb_inbox_matches'){
      if(ids(q)[0]===old.id){hitOld();return held;}
      return ok([ambiguous(current.id)]);
    }
    if(q.cols==='id')return {count:0};
    return ok([(view==='detail'?ids(q)[0]===old.id:fetch++===0)?old:current]);
  });
  const load=row=>view==='list'?h.ctx.inboxLoad():h.ctx.inboxSelect([row.id]);
  const oldLoad=load(old);
  await Promise.race([started,oldLoad]);
  await load(current);
  releaseOld(ok([booked(old.id)]));
  await oldLoad;
  const content=h.$(view==='list'?'#inboxList':'#inboxDetail').innerHTML;
  assert.match(content,/현재 예약/);
  assert.match(content,/확인 필요/);
  assert.doesNotMatch(content,/이전 예약|덴트웹 예약 있음|내원함/);
});
