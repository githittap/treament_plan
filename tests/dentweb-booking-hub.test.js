const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('hr.html');
const region=html.slice(html.indexOf('/* ── 상담일지:'),html.indexOf('/* ── 근로계약서 ── */'));
const times=html.match(/\/\* hub-time:test-start \*\/[\s\S]*?\/\* hub-time:test-end \*\//)[0];
const timestamp=html.match(/function formatLeaveTimestamp\(value\)\{[\s\S]*?\n\}/)[0];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const book=(id='booking',extra={})=>({
  id,source:'kakao',external_event_id:'kbook-'+id,status:'closed',received_at:'2026-11-03T05:00:00Z',
  dentweb_entered_at:'2026-11-03T06:00:00Z',message:'예약 알림\n상품명: 원문 상품\n일정: 11/03 14:00\n예약자명: 원문 예약\n예약자 연락처: 010-0000-1234',...extra
});
const booked=(id,extra={})=>({inbox_id:id,appointment_found:true,visited:true,match_basis:'phone8_date',...extra});
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

test('numbered booking detail shows state and lets only writers claim using the row id',async()=>{
  const writer=boot(()=>ok([]),{},'manager'); writer.ctx.ME.id='manager-id';
  const row=book('fresh',{dentweb_entered_at:null,kakao_booking_number:'123456789',kakao_booking_state:'confirmed',dentweb_claimed_by:null});
  const view=writer.ctx.inboxKakaoBookingDetailHtml(row); assert.match(view,/확정/); assert.match(view,/덴트웹 등록 맡기/); assert.doesNotMatch(view,/✅ 덴트웹에 입력함/);
  vm.runInContext('INBOX_SELECTED='+JSON.stringify(row)+'; inboxSelect=async()=>{}; inboxLoad=async()=>{}; sb.rpc=async(name,args)=>{ globalThis.claimResult={name,args}; return {data:true,error:null}; };',writer.ctx);
  await writer.ctx.inboxClaimBooking(true); assert.equal(writer.ctx.claimResult.name,'consultation_inbox_claim_kakao_booking');assert.equal(writer.ctx.claimResult.args.p_inbox_id,row.id);
  const staff=boot(()=>ok([]),{},'staff');const staffView=staff.ctx.inboxKakaoBookingDetailHtml(row);assert.match(staffView,/확정/);assert.doesNotMatch(staffView,/덴트웹 등록 맡기/);
});

test('zoned appointment renders Korea time including midnight boundary',()=>{
  const h=boot(()=>ok([]));
  assert.match(h.ctx.inboxKakaoBookingDetails(book('a',{kakao_booking_schedule:'2026-11-25T05:00:00Z'})).schedule,/2026\.11\.25 오후 2시/);
  assert.match(h.ctx.inboxKakaoBookingDetails(book('b',{kakao_booking_schedule:'2026-11-25T15:30:00Z'})).schedule,/2026\.11\.26 오전 12시 30분/);
});

test('reservation state appears in both desktop and mobile list without changing legacy',()=>{
  const h=boot(()=>ok([]),{},'staff');
  const numbered=book('fresh',{kakao_booking_number:'1234567890123456',kakao_booking_state:'cancelled'});
  h.ctx.inboxRenderList([numbered]);const content=h.$('#inboxList').innerHTML;
  assert.equal((content.match(/취소/g)||[]).length,2);
  h.ctx.inboxRenderList([book('legacy')]);assert.doesNotMatch(h.$('#inboxList').innerHTML,/상태 미확인/);
});

test('staff finds one old booking by exact number beyond list limit without broad query',async()=>{
  const old=book('old-outside-150',{kakao_booking_number:'1234567890123456',external_event_id:'kbook-r-1234567890123456'});const all=Array.from({length:151},(_,i)=>book('recent-'+i)).concat(old);
  const h=boot(q=>{const equal=q.filters.filter(x=>x[0]==='eq');assert.deepEqual(equal.map(x=>x[1]),['source','external_event_id']);return ok(all.find(x=>x.external_event_id===equal[1][2])||null);},{},'staff');
  vm.runInContext('inboxSelect=async(id)=>{globalThis.selected=id}',h.ctx);
  await h.ctx.inboxFindBookingByNumber('1234567890123456');assert.equal(h.ctx.selected,old.id);assert.equal(h.queries.length,1);
  assert.equal(h.queries[0].filters.find(x=>x[1]==='external_event_id')[2],'kbook-r-1234567890123456');
  h.$('#inboxDetail').innerHTML='stale';await h.ctx.inboxFindBookingByNumber('12x');assert.equal(h.queries.length,1);assert.equal(h.$('#inboxDetail').innerHTML,'');
});


test('owner-set booking search and state wording are used',()=>{
  const h=boot(()=>ok([]),{'inbox.booking_find':'고유번호 조회','inbox.booking_confirmed':'확정됨 설정'},'staff');
  assert.match(h.ctx.inboxCardHtml(),/고유번호 조회/);
  h.ctx.inboxRenderList([book('x',{kakao_booking_number:'1234567890123456',kakao_booking_state:'confirmed'})]);
  assert.match(h.$('#inboxList').innerHTML,/확정됨 설정/);
});

test('ambiguous booking shows review and prevents a new stamp even for claimant',()=>{
  const h=boot(()=>ok([]),{},'manager');h.ctx.ME.id='manager-id';
  const row=book('ambiguous',{kakao_booking_number:'1234567890123456',kakao_booking_state:'review_required',dentweb_entered_at:null,dentweb_claimed_by:'manager-id'});
  const html=h.ctx.inboxKakaoBookingDetailHtml(row);assert.match(html,/확인 필요/);assert.doesNotMatch(html,/✅ 덴트웹에 입력함/);assert.doesNotMatch(html,/덴트웹 등록 맡기/);
});

test('reservation list uses event time and stable id for ordering without changing original time',()=>{
  const h=boot(()=>ok([]),{},'staff');
  const older=book('aaa',{received_at:'2026-11-01T00:00:00Z',kakao_list_at:'2026-11-05T00:00:00Z',kakao_booking_number:'111111'});
  const newer=book('bbb',{received_at:'2026-11-02T00:00:00Z',kakao_list_at:'2026-11-06T00:00:00Z',kakao_booking_number:'222222'});
  h.ctx.inboxRenderList([older,newer]);const html=h.$('#inboxList').innerHTML;assert.ok(html.indexOf('data-inbox-ids="bbb"')<html.indexOf('data-inbox-ids="aaa"'));assert.equal(older.received_at,'2026-11-01T00:00:00Z');
});

test('hub booking query orders by event-derived key and id while retaining 150 limit',async()=>{
  const h=boot(q=>q.table==='consultation_inbox'?(q.cols==='id'?{count:0}:ok([book()])):ok([]));await h.ctx.inboxLoad();
  const q=h.queries.find(x=>x.table==='consultation_inbox'&&x.cols!=='id');assert.ok(q.cols.includes('kakao_list_at'));
  assert.deepEqual(q.filters.filter(x=>x[0]==='order').map(x=>x[1]),['kakao_list_at','id']);assert.equal(q.filters.find(x=>x[0]==='limit')[1],150);
});

test('hub stale first-entry request sends observed version and reloads on mismatch',async()=>{
  const h=boot(()=>ok([]),{},'manager');h.ctx.ME.id='manager-id';
  const row=book('stale',{kakao_booking_number:'1234567890123456',kakao_booking_state:'confirmed',kakao_booking_version:7,dentweb_claimed_by:'manager-id',dentweb_entered_at:null});
  vm.runInContext('INBOX_SELECTED='+JSON.stringify(row)+'; INBOX_DENTWEB_FIELDS_AVAILABLE=true; inboxSelect=async(id)=>{globalThis.reloaded=id}; inboxLoad=async()=>{}; sb.rpc=async(name,args)=>{globalThis.entryCall={name,args};return {data:false,error:null}};',h.ctx);
  await h.ctx.inboxSetDentwebEntered();assert.equal(h.ctx.entryCall.name,'consultation_inbox_enter_kakao_booking');assert.equal(h.ctx.entryCall.args.p_version,7);assert.equal(h.ctx.entryCall.args.p_state,'confirmed');assert.equal(h.ctx.reloaded,row.id);assert.match(h.$('#inboxDentwebMsg').textContent,/예약이 바뀌었거나/);
});

test('hub cancelled entry asks before sending confirmation',async()=>{
  const h=boot(()=>ok([]),{},'manager');h.ctx.ME.id='manager-id';h.ctx.confirm=()=>false;
  const row=book('cancelled',{kakao_booking_number:'1234567890123456',kakao_booking_state:'cancelled',kakao_booking_version:8,dentweb_claimed_by:'manager-id',dentweb_entered_at:null});
  vm.runInContext('INBOX_SELECTED='+JSON.stringify(row)+'; INBOX_DENTWEB_FIELDS_AVAILABLE=true;',h.ctx);await h.ctx.inboxSetDentwebEntered();assert.equal(h.views.length,0);
});
