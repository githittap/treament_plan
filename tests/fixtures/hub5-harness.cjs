// 차례 5(📥 문의함 · 🗂 상담일지) 화면 시험 도구 — hr.html에서 두 화면의 코드 조각을 떼어 가짜 자료로 실제로 실행하고, 나온 HTML·메시지·알림창·확인창 글을 모아 돌려준다.
// 같은 도구를 옛 코드(허브 글 옮기기 전, 커밋 8829a7a)와 새 코드에 똑같이 돌려 「기본값만 있을 때 글자 하나까지 같음」을 대조한다.
// 옛 코드의 결과는 tests/fixtures/hub5-golden-8829a7a.json 에 저장돼 있다(만든 법: node tests/manual/make-hub5-golden.cjs <옛 hr.html 경로>).
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const lf=s=>String(s).replace(/\r\n/g,'\n');

function region(html,startMarker,endMarker,includeEnd){
  const a=html.indexOf(startMarker);
  if(a<0)throw new Error('시작 표시를 못 찾음: '+startMarker);
  const b=html.indexOf(endMarker,a);
  if(b<0)throw new Error('끝 표시를 못 찾음: '+endMarker);
  return html.slice(a,b+(includeEnd?endMarker.length:0));
}
// supabase 흉내: 어떤 메서드 사슬이든 받아서 표마다 정해진 결과를 돌려준다. single/maybeSingle로 끝나면 spec.single, 아니면 spec.list. spec.count가 있으면 count도 같이.
function chain(spec,rec,table){
  const s=spec||{};
  let mode='list';
  const p=new Proxy(function(){},{
    get(_,k){
      if(k==='then')return function(res,rej){
        const out={data:s.error?null:(mode==='single'?(s.single===undefined?null:s.single):(s.list===undefined?[]:s.list)),error:s.error||null};
        if(s.count!==undefined)out.count=s.count;
        return Promise.resolve(out).then(res,rej);
      };
      return function(...a){if(rec&&['insert','update','upsert','delete'].includes(k))rec.push([table,k,JSON.parse(JSON.stringify(a))]);if(k==='single'||k==='maybeSingle')mode='single';return p;};
    },
    apply(){return p;}
  });
  return p;
}
function makeDom(){
  const reg={},hist=[];
  function el(sel){
    if(!reg[sel]){
      const e={value:'',checked:false,files:[],disabled:false,hidden:false,style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},
        addEventListener(){},removeAttribute(){},setAttribute(){},toggleAttribute(){},focus(){},scrollIntoView(){},querySelector(){return null;},querySelectorAll(){return [];},
        parentElement:{insertAdjacentHTML(pos,h){hist.push([sel+'.parent','adj:'+pos,String(h)]);}},
        cloneNode(){return {querySelectorAll(){return [];},outerHTML:'<div></div>'};},scrollWidth:900,scrollHeight:600};
      let t='',h='';
      Object.defineProperty(e,'textContent',{get(){return t;},set(v){t=v;hist.push([sel,'t',String(v)]);},enumerable:true});
      Object.defineProperty(e,'innerHTML',{get(){return h;},set(v){h=v;hist.push([sel,'h',String(v)]);},enumerable:true});
      reg[sel]=e;
    }
    return reg[sel];
  }
  return {reg,$:el,hist};
}
const REAL_DATE=Date,FIXED=REAL_DATE.UTC(2026,9,1,3,0,0);
class FakeDate extends REAL_DATE{
  constructor(...a){if(a.length===0)super(FIXED);else super(...a);}
  static now(){return FIXED;}
  toLocaleDateString(){return this.toISOString().slice(0,10);}
}

const PROFILES=[
  {user_id:'u1',name:'김직원',role:'staff',active:true,approved:true},
  {user_id:'u2',name:'이매니저',role:'manager',active:true,approved:true},
  {user_id:'u3',name:'박실장',role:'chief',active:true,approved:true},
  {user_id:'u4',name:'정원장',role:'owner',active:true,approved:true},
  {user_id:'u5',name:'최<매니저>',role:'manager',active:true,approved:true},
  {user_id:'u6',name:'쉬는매니저',role:'manager',active:false,approved:true},
  {user_id:'u7',name:'차단실장',role:'chief',active:true,approved:true,account_access_status:'차단'}
];
const kb=(n,msg,entered)=>({id:'kb'+n,source:'kakao',external_event_id:'kbook-'+n,received_at:'2026-09-30T0'+n+':00:00Z',sender_name:null,contact:null,subject:null,message:msg,status:'new',assigned_to:null,journal_id:null,dentweb_entered_at:entered||null,dentweb_entered_by:entered?'u2':null});
const INBOX_ROWS=[
  {id:'a1',source:'daangn',external_event_id:null,received_at:'2026-09-30T05:00:00Z',sender_name:'지민',contact:'01012345678',subject:'임플란트 문의',message:'가격이 궁금해요',status:'new',assigned_to:null,journal_id:null},
  {id:'a2',source:'kakao',external_event_id:'e2',received_at:'2026-09-30T04:00:00Z',sender_name:'민지',contact:'',subject:'교정',message:'교정 상담',status:'in_progress',assigned_to:'u2',journal_id:null},
  {id:'a3',source:'kakao',external_event_id:'e3',received_at:'2026-09-30T04:10:00Z',sender_name:'민지',contact:'',subject:'교정',message:'한 번 더 문의',status:'closed',assigned_to:'u2',journal_id:null},
  {id:'a4',source:'naver_talktalk',external_event_id:null,received_at:'2026-09-30T03:00:00Z',sender_name:'톡톡<님>',contact:'010-9999-8888',subject:'<환불> 문의',message:'환불 가능한가요',status:'recall_1',assigned_to:'u5',journal_id:null},
  {id:'a5',source:'homepage',external_event_id:'12',received_at:'2026-09-29T05:00:00Z',sender_name:'홈페이지님',contact:'01055556666',subject:null,message:'홈페이지 문의',status:'recall_2',assigned_to:null,journal_id:null},
  {id:'a6',source:'phone',external_event_id:null,received_at:'2026-09-29T04:00:00Z',sender_name:'전화님',contact:'0412345678',subject:'전화',message:'전화 문의',status:'converted',assigned_to:'u3',journal_id:'j1'},
  {id:'a7',source:'naver_email',external_event_id:null,received_at:'2026-09-28T04:00:00Z',sender_name:'메일님',contact:null,subject:'메일',message:'메일 문의',status:'recall_3',assigned_to:null,journal_id:null},
  {id:'a8',source:'other',external_event_id:null,received_at:'2026-09-27T04:00:00Z',sender_name:'기타님',contact:null,subject:'기타',message:'기타 문의',status:'closed',assigned_to:null,journal_id:null},
  {id:'a9',source:'manual',external_event_id:null,received_at:'2026-09-26T04:00:00Z',sender_name:'수기님',contact:null,subject:'수기',message:'수기 문의',status:'weird',assigned_to:null,journal_id:null},
  kb(1,'예약 알림\n일정: 10/05 14:00\n상품명: 임플란트 상담\n옵션명: 초진\n예약자명: 홍길동\n예약자 연락처: 010-1111-2222','2026-09-30T03:30:00Z'),
  kb(2,'알림이 왔습니다 (형식 모름)')
];
const BILLING_ROWS=[
  {id:11,note:'NAVER_AD_LOW_BALANCE',raw_text:'잔액 부족 <원문>',received_at:'2026-09-30T02:00:00Z',charged_at:null,account_id:'acc1',account_name:'정플란트',amount_krw:90000,threshold_krw:100000},
  {id:12,note:'NAVER_AD_STOP',raw_text:'노출 중단',received_at:'2026-09-29T02:00:00Z',charged_at:null,account_id:null,account_name:null,amount_krw:0,threshold_krw:null},
  {id:13,note:'NAVER_AD_LOW_BALANCE',raw_text:'x',received_at:'2026-09-28T02:00:00Z',charged_at:null,account_id:'acc2',account_name:'둘째',amount_krw:1,threshold_krw:50000}
];
const JOURNALS=[
  {id:'11111111-1111-4111-8111-111111111111',patient_name:'홍<길동>',source_sheet:'교정',consulted_on:'2026-09-30',status:'대기',next_action:'전화하기',action_due_on:'2026-09-30',action_done:false,quoted_amount:1500000,action_assignee_id:'u2'},
  {id:'22222222-2222-4222-8222-222222222222',patient_name:'김철수',source_sheet:'홈페이지',consulted_on:'2026-09-29',status:'확정',next_action:null,action_due_on:'2026-10-01',action_done:false,quoted_amount:null,action_assignee_id:null},
  {id:'33333333-3333-4333-8333-333333333333',patient_name:'이영희',source_sheet:'카카오,네이버예약,당근',consulted_on:'2026-09-28',status:'종결',next_action:'문자',action_due_on:'2026-10-02',action_done:false,quoted_amount:0,action_assignee_id:'u9'},
  {id:'44444444-4444-4444-8444-444444444444',patient_name:'박민수',source_sheet:'미확정 및 부분확정',consulted_on:'2026-09-27',status:'부분확정',next_action:'방문',action_due_on:'2026-09-25',action_done:false,quoted_amount:320000.5,action_assignee_id:null},
  {id:'55555555-5555-4555-8555-555555555555',patient_name:'최낙',source_sheet:'원본',consulted_on:'2026-09-26',status:'미확정',next_action:'-',action_due_on:'2026-10-01',action_done:true,quoted_amount:null,action_assignee_id:null},
  {id:'77777777-7777-4777-8777-777777777777',patient_name:'오늘할일',source_sheet:'확정',consulted_on:'2026-09-24',status:'확정',next_action:'오늘 연락',action_due_on:'2026-10-01',action_done:false,quoted_amount:100,action_assignee_id:'u3'},
  {id:'66666666-6666-4666-8666-666666666666',patient_name:'낯선구분',source_sheet:'옛구분',consulted_on:'2026-09-25',status:'옛상태',next_action:null,action_due_on:null,action_done:false,quoted_amount:null,action_assignee_id:null}
];
const JOURNAL_ONE={id:'11111111-1111-4111-8111-111111111111',patient_name:'홍길동',contact_phone:'010-1234-5678',source_sheet:'확정',consulted_on:'2026-09-30',status:'확정',consultation_note:'메모',next_action:'전화',action_assignee_id:'u2',action_due_on:'2026-10-02',action_done:false,quoted_amount:500,instruction_note:'지시',special_note:'특이',source_fields:{recall_1:'일차',old:'보존'}};
function hundred(){const out=[];for(let i=0;i<100;i++)out.push({id:'00000000-0000-4000-8000-0000000000'+String(i).padStart(2,'0'),patient_name:'환자'+i,source_sheet:'교정',consulted_on:'2026-09-30',status:'대기',next_action:'조치'+i,action_due_on:'2026-09-30',action_done:false,quoted_amount:i,action_assignee_id:null});return out;}

function tablesFor(name){
  const T={
    consultation_inbox:{list:INBOX_ROWS,count:2},
    consultation_inbox_replies:{list:[{inbox_id:'a2',reply:'답변<1>',created_at:'2026-09-30T05:00:00Z',author_id:'u2'}]},
    consultation_inbox_views:{list:[{inbox_id:'a2',viewer_id:'u3',viewed_at:'2026-09-30T05:30:00Z'}]},
    ai_billing_events:{list:BILLING_ROWS,count:3},
    ai_billing_alert_recipients:{list:[{user_id:'u2',enabled:false}]},
    consultation_journals:{list:JOURNALS,single:JOURNAL_ONE,count:45}
  };
  return T[name];
}
function makeSb(over){
  const o=over||{};
  const rpcCalls=[],writes=[];
  const sb={
    from(t){const spec=Object.prototype.hasOwnProperty.call(o.tables||{},t)?o.tables[t]:tablesFor(t);return chain(spec||{list:[],single:null},writes,t);},
    rpc(name,args){rpcCalls.push([name,args]);const r=(o.rpc||{})[name];return Promise.resolve(r!==undefined?(typeof r==='function'?r(args):r):{data:[{}],error:null});}
  };
  sb.rpcCalls=rpcCalls;sb.writes=writes;
  return sb;
}

async function renderAll(html,opts){
  const o=opts||{};
  const text=lf(html);
  const timeSrc=(text.match(/\/\* hub-time:test-start \*\/[\s\S]*?\/\* hub-time:test-end \*\//)||[''])[0]; /* 허브 시간 표시 공통 함수(이 작업 이후의 hr.html에만 있음 — 없으면 빈 글) */
  const out={};
  const hubHelpers=text.includes('function hubN(')?region(text,'function hubN(','/* hub-texts.js(원장이 고치는 허브 글·목록)를 못 불러와도',false):'';
  const hubTLine=text.match(/function hubT\(k,d,v\)\{[^\n]*\}/)[0];
  const fmtSrc=text.match(/function formatLeaveTimestamp\(value\)\{[\s\S]*?\n\}/)[0];
  const consultSrc=region(text,'/* ── 상담일지:','/* ── 근로계약서 ── */',false);
  const hubJs=o.engine?lf(fs.readFileSync(path.join(__dirname,'..','..','hub-texts.js'),'utf8')):null;
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const md=s=>s?String(s).slice(5).replace('-','/'):'';

  async function makeCtx(extra,sbOver){
    const dom=makeDom(),log=[],statuses=[];
    const ctx={console,esc,md,$:dom.$,Date:FakeDate,Intl,Promise,Math,JSON,Set,Map,Number,String,Array,Object,parseInt,parseFloat,isNaN,RegExp,
      PROFILES:PROFILES.map(p=>Object.assign({},p)),
      ME:{id:'u1',name:'김직원',role:'staff',department:'진료실'},
      SETTINGS:{late_cut:'09:40',ot_unit_min:'10',siueop:'10:00'},
      SETTINGS_LOAD_OK:true,
      today:()=>'2026-10-01',nameOf:uid=>{const p=PROFILES.find(x=>x.user_id===uid);return p?p.name:(uid||'').slice(0,6);},
      setStatus:s=>statuses.push(s),render:()=>{log.push('render');},go:t=>log.push('go:'+t),
      alert:m=>log.push('alert:'+m),confirm:m=>{log.push('confirm:'+m);return ctx.__confirm!==false;},prompt:()=>null,
      setTimeout:()=>0,
      sb:makeSb(sbOver)};
    ctx.document=Object.assign({querySelector:()=>({textContent:''}),querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){},body:{scrollHeight:100,classList:{add(){},remove(){}}}},(extra&&extra.document)||{});
    ctx.window=ctx;ctx.scrollTo=()=>{};
    Object.assign(ctx,extra||{});
    if(extra&&extra.document)ctx.document=Object.assign(ctx.document,extra.document);
    vm.createContext(ctx);
    if(o.shim){
      const m=text.match(/if\(typeof window\.hubText!=='function'\)\{[\s\S]*?\n\}/);
      if(m)vm.runInContext(m[0],ctx);
    }
    if(hubJs){
      vm.runInContext(hubJs,ctx);
      ctx.HubUi.setSettings(Object.assign(ctx.SETTINGS,o.settings||{}));
      if(o.textRows||o.loadFail){
        await ctx.HubUi.load({from(){const api={select(){return api;},then(res,rej){return Promise.resolve(o.loadFail?{data:null,error:{message:'x'}}:{data:o.textRows,error:null}).then(res,rej);}};return api;}});
      }
    }else if(o.settings)Object.assign(ctx.SETTINGS,o.settings);
    vm.runInContext(timeSrc+'\n'+fmtSrc+'\n'+hubHelpers+'\n'+hubTLine+'\n'+consultSrc+'\n;this.api={renderInbox,inboxCardHtml,inboxLoad,inboxRenderList,inboxSelect,inboxSetDentwebEntered,inboxRecordReply,inboxSave,inboxConvert,inboxManualCreate,'
      +'saveAiBillingRecipients,markAiBillingCharged,showAiBillingRaw,aiBillingAlertCard,aiBillingRecipientPanel,'
      +'renderConsultationJournal,consultationRenderList,consultationRenderActionQueue,consultationEdit,consultationResetForm,saveConsultationJournal,consultationRenderSourceFields,consultationOptions,consultationActionAssigneeOptions,consultationRequestError,'
      +'inboxStatusInfo,inboxStatusSummary,inboxGroupCounts,inboxSourceLabel,inboxGroupRows,inboxGroupSummary,inboxReplyLink,inboxKakaoBookingListLines,inboxKakaoBookingDetailHtml,inboxAssigneeOptions,'
      +'setState:(k,v)=>{if(k==="INBOX_FILTER")INBOX_FILTER=v;if(k==="INBOX_ONLY_RESERVATIONS")INBOX_ONLY_RESERVATIONS=v;if(k==="INBOX_SELECTED")INBOX_SELECTED=v;if(k==="CONSULTATION_FILTERS")CONSULTATION_FILTERS=v;if(k==="CONSULTATION_PAGE")CONSULTATION_PAGE=v;if(k==="CONSULTATION_EDIT_ID")CONSULTATION_EDIT_ID=v;if(k==="CONSULTATION_SOURCE_SAVED_FIELDS")CONSULTATION_SOURCE_SAVED_FIELDS=v;if(k==="INBOX_DENTWEB_FIELDS_AVAILABLE")INBOX_DENTWEB_FIELDS_AVAILABLE=v;if(k==="AI_BILLING_RECIPIENT_ERROR")AI_BILLING_RECIPIENT_ERROR=v;if(k==="AI_BILLING_ALERT_ROWS")AI_BILLING_ALERT_ROWS=v;if(k==="AI_BILLING_RECIPIENT_SETTINGS")AI_BILLING_RECIPIENT_SETTINGS=v;},'
      +'getState:k=>({INBOX_SELECTED:typeof INBOX_SELECTED!=="undefined"?INBOX_SELECTED:null,CONSULTATION_EDIT_ID:CONSULTATION_EDIT_ID,CONSULTATION_PAGE_SIZE:CONSULTATION_PAGE_SIZE})[k]};'
      +'this.api2={hubFillHtml:typeof hubFillHtml==="function"?hubFillHtml:null,hubN:typeof hubN==="function"?hubN:null,'
      +'inboxSourceItems:typeof inboxSourceItems==="function"?inboxSourceItems:null,inboxStatusItems:typeof inboxStatusItems==="function"?inboxStatusItems:null,inboxStatusName:typeof inboxStatusName==="function"?inboxStatusName:null,'
      +'consultationKindItems:typeof consultationKindItems==="function"?consultationKindItems:null,consultationStatusItems:typeof consultationStatusItems==="function"?consultationStatusItems:null,'
      +'consultationKindLabel:typeof consultationKindLabel==="function"?consultationKindLabel:null,consultationStatusLabel:typeof consultationStatusLabel==="function"?consultationStatusLabel:null};',ctx);
    return {ctx,dom,log,statuses,api:ctx.api,api2:ctx.api2};
  }
  const flush=()=>new Promise(res=>setImmediate(res));
  const asRole=async(role,extra,sbOver)=>{const r=await makeCtx(extra,sbOver);r.ctx.ME={id:'u1',name:'김직원',role,department:'진료실'};return r;};
  const fail=m=>({error:{message:m}});
  if(o.probe)return {makeCtx,asRole,fail,flush,makeDom,chain,makeSb,text};

  /* ───────── 순수 함수(상태 배지·요약·출처 이름) ───────── */
  {
    const r=await asRole('staff');
    out['pure.status_info']=JSON.stringify(['new','in_progress','recall_1','recall_2','recall_3','closed','converted','weird',undefined,null,''].map(s=>r.api.inboxStatusInfo(s)));
    out['pure.source_label']=JSON.stringify(['daangn','kakao','naver_email','naver_talktalk','homepage','phone','manual','other','기타','zzz',undefined].map(s=>r.api.inboxSourceLabel(s)));
    out['pure.summary']=JSON.stringify([r.api.inboxStatusSummary({new:0,in_progress:0,recall:0,closed:0,converted:0}),r.api.inboxStatusSummary({new:2,in_progress:1,recall:3,closed:4,converted:5})]);
    out['pure.group_summary']=JSON.stringify(r.api.inboxGroupRows(INBOX_ROWS.filter(x=>!x.id.startsWith('kb'))).map(g=>r.api.inboxGroupSummary(g)));
    out['pure.group_counts']=JSON.stringify(r.api.inboxGroupCounts(r.api.inboxGroupRows(INBOX_ROWS.filter(x=>!x.id.startsWith('kb')))));
    out['pure.group_rows']=JSON.stringify(r.api.inboxGroupRows(INBOX_ROWS.filter(x=>!x.id.startsWith('kb'))).map(g=>[g.ids,g.status,g.groupCount]));
    out['pure.reply_link']=JSON.stringify(INBOX_ROWS.map(x=>r.api.inboxReplyLink(x)));
    out['pure.booking_lines']=JSON.stringify(INBOX_ROWS.filter(x=>x.id.startsWith('kb')).concat([{message:'',received_at:null}]).map(x=>r.api.inboxKakaoBookingListLines(x)));
    out['pure.request_error']=JSON.stringify([r.api.consultationRequestError('create',{message:'a'}),r.api.consultationRequestError('update',{message:'b'}),r.api.consultationRequestError('list',{message:'c'}),r.api.consultationRequestError('list',null),r.api.consultationRequestError('list',{})]);
    for(const role of ['manager','staff']){
      const b=await asRole(role);
      out['pure.booking_detail.'+role]=JSON.stringify([
        {message:'일정: 10/06 10:00',received_at:'2026-09-30T05:00:00Z',status:'closed'},
        {message:'상품명: 교정 상담\n옵션명: 교정',received_at:null,status:'new',dentweb_entered_at:'2026-09-30T03:30:00Z'},
        {message:'',received_at:null,status:'weird'},
        {message:'아무 말',received_at:'2026-09-30T05:00:00Z',status:'in_progress',dentweb_entered_by:'u2',dentweb_entered_at:'2026-09-30T03:30:00Z'}
      ].map(x=>b.api.inboxKakaoBookingDetailHtml(x)));
    }
    out['pure.assignee_options']=JSON.stringify([r.api.inboxAssigneeOptions(null),r.api.inboxAssigneeOptions('u2')]);
    out['pure.cj_assignee_options']=JSON.stringify([r.api.consultationActionAssigneeOptions(null),r.api.consultationActionAssigneeOptions('u2'),r.api.consultationActionAssigneeOptions('zz')]);
    out['pure.cj_options']=JSON.stringify([r.api.consultationOptions(['교정','확정','원본'],'확정'),r.api.consultationOptions(['대기','미확정','부분확정','확정','종결'],'')]);
    for(const sheet of ['교정','확정','미확정 및 부분확정','홈페이지','카카오,네이버예약,당근','원본','없는시트']){const d=makeDom();d.$('#cjSheet').value=sheet;const q=await asRole('manager',{$:d.$});q.api.consultationRenderSourceFields({recall_1:'<표시>'});out['pure.source_fields.'+sheet]=d.$('#cjSourceFields').innerHTML;}
  }

  /* ───────── 문의함 화면 ───────── */
  const inboxCases=[
    ['staff','staff',null,null],['manager','manager',null,null],['owner','owner',null,null],['chief','chief',null,null],['noperm','deputy',null,null],
    ['filter_kakao_recall','manager',{INBOX_FILTER:{source:'kakao',status:'recall_2'}},null],
    ['filter_homepage_converted','manager',{INBOX_FILTER:{source:'homepage',status:'converted'}},null],
    ['only_reservations','manager',{INBOX_ONLY_RESERVATIONS:true},null],
    ['empty','owner',null,{tables:{consultation_inbox:{list:[],count:0},ai_billing_events:{list:[],count:0}}}],
    ['load_error','manager',null,{tables:{consultation_inbox:{error:{message:'문의<오류>'}}}}],
    ['old_db_no_dentweb','manager',null,{tables:{consultation_inbox:{error:{code:'42703',message:'column dentweb_entered_at does not exist'}}}}],
    ['recipients_error','owner',null,{tables:{ai_billing_alert_recipients:{error:{message:'받는사람<오류>'}}}}],
    ['alerts_many','manager',null,{tables:{ai_billing_events:{list:BILLING_ROWS.slice(0,2),count:5}}}]
  ];
  for(const [name,role,state,sbOver] of inboxCases){
    const r=await asRole(role,null,sbOver);
    r.api.setState('INBOX_FILTER',{source:'',status:''});r.api.setState('INBOX_ONLY_RESERVATIONS',false);
    for(const [k,v] of Object.entries(state||{}))r.api.setState(k,v);
    const m={innerHTML:''};await r.api.renderInbox(m);await flush();
    out['inbox.render.'+name]=m.innerHTML+'\n---LIST---\n'+r.dom.$('#inboxList').innerHTML+'\n---FILTER---\n'+r.dom.$('#inboxReservationFilter').textContent;
  }
  { // 카드 HTML만(필터 상태·권한별)
    for(const role of ['staff','manager','owner']){const r=await asRole(role);r.api.setState('INBOX_FILTER',{source:'phone',status:'closed'});out['inbox.card.'+role]=r.api.inboxCardHtml();}
  }
  { // 상세 화면(묶음·예약·읽기만)
    const sel=async(name,role,ids,sbOver,state)=>{
      const rows=INBOX_ROWS.filter(x=>ids.includes(x.id));
      const so=sbOver||{};const q=await asRole(role,null,Object.assign({},so,{tables:Object.assign({consultation_inbox:{list:rows}},so.tables||{})}));
      for(const [k,v] of Object.entries(state||{}))q.api.setState(k,v);
      await q.api.inboxSelect(ids);await flush();
      out['inbox.select.'+name]=q.dom.$('#inboxDetail').innerHTML+'\n---REPLIES---\n'+q.dom.$('#inboxReplies').innerHTML+'\n---VIEWS---\n'+q.dom.$('#inboxViews').innerHTML+'\n---LOG---\n'+JSON.stringify([q.log,q.statuses,q.ctx.sb.rpcCalls]);
    };
    await sel('group.manager','manager',['a2','a3']);
    await sel('group.owner','owner',['a2','a3']);
    await sel('single.staff','staff',['a1']);
    await sel('single.owner_recall','owner',['a4']);
    await sel('converted.manager','manager',['a6']);
    await sel('weird.manager','manager',['a9']);
    await sel('booking.manager','manager',['kb1']);
    await sel('booking.staff','staff',['kb1']);
    await sel('booking_unrecognized.manager','manager',['kb2']);
    await sel('empty_result','manager',['zz'],{tables:{consultation_inbox:{list:[]}}});
    await sel('rpc_fail','manager',['a1'],{rpc:{consultation_inbox_record_view:fail('x')}});
    await sel('replies_error','owner',['a2'],{tables:{consultation_inbox_replies:{error:{message:'답변<오류>'}},consultation_inbox_views:{error:{message:'열람<오류>'}}}});
    await sel('replies_empty','manager',['a1'],{tables:{consultation_inbox_replies:{list:[]}}});
  }
  { // 덴트웹 입력 표시
    const run=async(name,sel,opts)=>{
      const o2=opts||{};const q=await asRole(o2.role||'manager',{__confirm:o2.confirm},o2.sb);
      q.api.setState('INBOX_SELECTED',sel);q.api.setState('INBOX_DENTWEB_FIELDS_AVAILABLE',o2.available!==false);
      await q.api.inboxSetDentwebEntered();await flush();
      out['inbox.dentweb.'+name]=JSON.stringify([q.log,q.statuses,q.ctx.sb.rpcCalls,q.dom.$('#inboxDentwebMsg').textContent]);
    };
    await run('unavailable',{id:'kb2',dentweb_entered_at:null},{available:false});
    await run('set_ok',{id:'kb2',dentweb_entered_at:null});
    await run('set_fail',{id:'kb2',dentweb_entered_at:null},{sb:{rpc:{consultation_inbox_set_dentweb_entered:fail('덴트웹<실패>')}}});
    await run('undo_declined',{id:'kb1',dentweb_entered_at:'2026-09-30T03:30:00Z'},{confirm:false});
    await run('undo_ok',{id:'kb1',dentweb_entered_at:'2026-09-30T03:30:00Z'},{confirm:true});
    await run('no_selected',null);
    await run('staff',{id:'kb2',dentweb_entered_at:null},{role:'staff'});
  }
  { // 답변 기록·상태 저장·전환·수기 접수
    const runReply=async(name,sel,reply,sbOver)=>{const d=makeDom();d.$('#inboxReply').value=reply;const q=await asRole('manager',{$:d.$},sbOver);q.api.setState('INBOX_SELECTED',sel);await q.api.inboxRecordReply();await flush();out['inbox.reply.'+name]=JSON.stringify([d.$('#inboxReplyMsg').textContent,d.$('#inboxReply').value,q.ctx.sb.rpcCalls]);};
    await runReply('empty',{id:'a1',ids:['a1']},'  ');
    await runReply('fail',{id:'a1',ids:['a1']},'답변',{rpc:{consultation_inbox_record_reply:fail('기록<실패>')}});
    await runReply('ok',{id:'a1',ids:['a1']},'답변 내용');
    await runReply('no_selected',null,'답변');
    const runSave=async(name,sel,vals,sbOver)=>{const d=makeDom();Object.entries(vals).forEach(([k,v])=>{d.$(k).value=v;});const q=await asRole('manager',{$:d.$},sbOver);q.api.setState('INBOX_SELECTED',sel);await q.api.inboxSave();await flush();out['inbox.save.'+name]=JSON.stringify([q.log,q.statuses,q.ctx.sb.writes]);};
    await runSave('ok',{ids:['a1','a2']},{'#inboxAssigned':'u2','#inboxStatus':'recall_2'});
    await runSave('unassigned',{ids:['a1']},{'#inboxAssigned':'','#inboxStatus':'closed'});
    await runSave('fail',{ids:['a1']},{'#inboxAssigned':'u2','#inboxStatus':'in_progress'},{tables:{consultation_inbox:{error:{message:'x'}}}});
    await runSave('no_ids',{ids:[]},{});
    const runConv=async(name,sel,sbOver)=>{const q=await asRole('manager',null,sbOver);q.api.setState('INBOX_SELECTED',sel);await q.api.inboxConvert();await flush();out['inbox.convert.'+name]=JSON.stringify([q.log,q.statuses,q.ctx.sb.rpcCalls,q.ctx.sb.writes,q.dom.$('#inboxDetail').innerHTML]);};
    const two=INBOX_ROWS.filter(x=>['a2','a3'].includes(x.id)).map(x=>Object.assign({},x,{status:'new'}));
    await runConv('ok_two',{ids:['a2','a3'],messages:two});
    await runConv('ok_one',{ids:['a1'],messages:[INBOX_ROWS[0]]});
    await runConv('rpc_fail',{ids:['a1'],messages:[INBOX_ROWS[0]]},{rpc:{consultation_inbox_convert_to_journal:fail('전환<실패>')}});
    await runConv('close_fail',{ids:['a2','a3'],messages:two},{tables:{consultation_inbox:{error:{message:'종결<실패>'}}}});
    await runConv('none',{ids:['a6'],messages:[INBOX_ROWS[5]]});
    const runManual=async(name,vals,sbOver)=>{const d=makeDom();Object.entries(vals).forEach(([k,v])=>{d.$(k).value=v;});const q=await asRole('manager',{$:d.$},sbOver);await q.api.inboxManualCreate();await flush();out['inbox.manual.'+name]=JSON.stringify([d.$('#inboxMsg').textContent,q.log,q.statuses,q.ctx.sb.writes]);};
    await runManual('empty',{'#inboxSource':'phone','#inboxName':' ','#inboxMessage':'내용'});
    await runManual('no_message',{'#inboxSource':'phone','#inboxName':'홍','#inboxMessage':''});
    await runManual('fail',{'#inboxSource':'other','#inboxName':'홍','#inboxContact':'010-1','#inboxSubject':'제목','#inboxMessage':'내용'},{tables:{consultation_inbox:{error:{message:'접수<실패>'}}}});
    await runManual('ok',{'#inboxSource':'manual','#inboxName':'홍','#inboxContact':'010-1234-5678','#inboxSubject':'제목','#inboxMessage':'내용'});
  }
  { // 광고 알림
    const q=await asRole('owner');
    out['billing.card']=JSON.stringify([q.api.aiBillingAlertCard(BILLING_ROWS,3),q.api.aiBillingAlertCard(BILLING_ROWS.slice(0,1),1),q.api.aiBillingAlertCard(BILLING_ROWS,0),q.api.aiBillingAlertCard(BILLING_ROWS.slice(0,2),9)]);
    out['billing.recipients']=JSON.stringify([q.api.aiBillingRecipientPanel([{user_id:'u2',enabled:false}]),q.api.aiBillingRecipientPanel([])]);
    const q2=await asRole('owner');q2.api.setState('AI_BILLING_RECIPIENT_ERROR','연결<실패>');out['billing.recipients_error']=q2.api.aiBillingRecipientPanel([]);
    const q2b=await asRole('owner');q2b.ctx.PROFILES=q2b.ctx.PROFILES.filter(p=>p.role!=='manager');out['billing.recipients_none']=q2b.api.aiBillingRecipientPanel([]);
    const q3=await asRole('manager',null,{rpc:{mark_ai_billing_event_charged:fail('충전<실패>')}});await q3.api.markAiBillingCharged(11);out['billing.charged_fail']=JSON.stringify(q3.log);
    const q4=await asRole('manager');await q4.api.markAiBillingCharged(11);out['billing.charged_ok']=JSON.stringify(q4.log);
    const q5=await asRole('manager');q5.api.setState('AI_BILLING_ALERT_ROWS',BILLING_ROWS);q5.api.showAiBillingRaw(11);out['billing.raw']=JSON.stringify(q5.log);
    const doc={querySelectorAll:()=>[{getAttribute:()=>'u2',checked:true},{getAttribute:()=>'u5',checked:false}]};
    const q6=await asRole('owner',{document:doc},{tables:{ai_billing_alert_recipients:{error:{message:'받는<실패>'}}}});q6.api.setState('AI_BILLING_RECIPIENT_SETTINGS',[{user_id:'u2',enabled:false}]);await q6.api.saveAiBillingRecipients();out['billing.save_fail']=JSON.stringify([q6.log,q6.statuses]);
  }

  /* ───────── 상담일지 화면 ───────── */
  const cjCases=[
    ['manager','manager',null,null],['owner','owner',null,null],['chief','chief',null,null],['staff_noperm','staff',null,null],
    ['page2','manager',{CONSULTATION_PAGE:1},null],
    ['filtered','manager',{CONSULTATION_FILTERS:{query:'홍',sheet:'홈페이지',status:'확정',page:0},CONSULTATION_PAGE:0},null],
    ['empty','manager',null,{tables:{consultation_journals:{list:[],count:0}}}],
    ['error','manager',null,{tables:{consultation_journals:{error:{message:'상담<오류>'}}}}],
    ['queue_100','owner',null,{tables:{consultation_journals:{list:hundred(),count:100}}}],
    ['last_page','manager',{CONSULTATION_PAGE:2},{tables:{consultation_journals:{list:JOURNALS.slice(0,2),count:42}}}]
  ];
  for(const [name,role,state,sbOver] of cjCases){
    const d=makeDom();
    const r=await asRole(role,{$:d.$},sbOver);
    r.api.setState('CONSULTATION_FILTERS',{query:'',sheet:'',status:'',page:0});r.api.setState('CONSULTATION_PAGE',0);
    for(const [k,v] of Object.entries(state||{}))r.api.setState(k,v);
    const m=d.$('#main');await r.api.renderConsultationJournal(m);await flush();
    out['cj.render.'+name]=JSON.stringify([m.innerHTML,d.hist.filter(h=>h[0]!=='#main').map(h=>h.join('|')),r.log,r.statuses]);
  }
  { // 목록·다음 조치 표(직접)
    const d=makeDom();const r=await asRole('manager',{$:d.$});r.api.consultationRenderList(JOURNALS);out['cj.list.rows']=d.$('#cjList').innerHTML;
    const d2=makeDom();const r2=await asRole('manager',{$:d2.$});r2.api.consultationRenderList([]);out['cj.list.empty']=d2.$('#cjList').innerHTML;
    const d3=makeDom();const r3=await asRole('manager',{$:d3.$});await r3.api.consultationRenderActionQueue();out['cj.queue.rows']=d3.$('#cjActionQueue').innerHTML;
    const d4=makeDom();const r4=await asRole('manager',{$:d4.$},{tables:{consultation_journals:{list:[]}}});await r4.api.consultationRenderActionQueue();out['cj.queue.empty']=d4.$('#cjActionQueue').innerHTML;
    const d5=makeDom();const r5=await asRole('manager',{$:d5.$},{tables:{consultation_journals:{error:{message:'큐<오류>'}}}});await r5.api.consultationRenderActionQueue();out['cj.queue.error']=JSON.stringify([d5.$('#cjActionQueue').innerHTML,r5.statuses]);
  }
  { // 수정 불러오기·새로 입력
    const grab=(d)=>JSON.stringify(Object.keys(d.reg).sort().map(k=>[k,d.reg[k].value,d.reg[k].checked,d.reg[k].textContent,d.reg[k].innerHTML]));
    const d=makeDom();const r=await asRole('manager',{$:d.$});await r.api.consultationEdit('11111111-1111-4111-8111-111111111111');out['cj.edit.ok']=JSON.stringify([grab(d),r.statuses,r.api.getState('CONSULTATION_EDIT_ID')]);
    const d2=makeDom();const r2=await asRole('manager',{$:d2.$},{tables:{consultation_journals:{error:{message:'불러오<실패>'}}}});await r2.api.consultationEdit('11111111-1111-4111-8111-111111111111');out['cj.edit.error']=JSON.stringify([d2.$('#cjMsg').textContent,r2.statuses]);
    const d3=makeDom();const r3=await asRole('manager',{$:d3.$});await r3.api.consultationEdit('not-a-uuid');out['cj.edit.bad_id']=JSON.stringify([grab(d3),r3.statuses]);
    const d4=makeDom();const r4=await asRole('manager',{$:d4.$});r4.api.consultationResetForm();out['cj.reset']=grab(d4);
  }
  { // 저장 검사
    const base={'#cjName':'홍길동','#cjPhone':'010','#cjSheet':'확정','#cjDate':'2026-10-01','#cjStatus':'대기','#cjNote':'상담','#cjNext':'','#cjAmount':'','#cjInstruction':'','#cjSpecial':'','#cjActionAssignee':'','#cjActionDue':''};
    const run=async(name,over,sbOver,editId,checked)=>{
      const d=makeDom();Object.entries(Object.assign({},base,over)).forEach(([k,v])=>{d.$(k).value=v;});d.$('#cjActionDone').checked=!!checked;
      const r=await asRole('manager',{$:d.$},sbOver);if(editId)r.api.setState('CONSULTATION_EDIT_ID',editId);
      await r.api.saveConsultationJournal();await flush();
      out['cj.save.'+name]=JSON.stringify([d.$('#cjMsg').textContent,r.statuses,r.ctx.sb.writes,r.log,d.hist.filter(h=>h[0]==='#cjMsg').map(h=>h[2])]);
    };
    await run('no_name',{'#cjName':' '});
    await run('no_date',{'#cjDate':''});
    await run('no_note',{'#cjNote':''});
    await run('bad_amount',{'#cjAmount':'-5'});
    await run('bad_amount_text',{'#cjAmount':'abc'});
    await run('bad_sheet',{'#cjSheet':'옛구분'});
    await run('bad_status',{'#cjStatus':'옛상태'});
    await run('action_without_next',{'#cjActionDue':'2026-10-05'});
    await run('action_done_without_next',{},null,null,true);
    await run('create_ok',{'#cjAmount':'1500000','#cjNext':'전화','#cjActionAssignee':'u2','#cjActionDue':'2026-10-05','#cjStatus':'미확정','#cjSheet':'교정'});
    await run('create_fail',{},{tables:{consultation_journals:{error:{message:'저장<실패>'}}}});
    await run('update_ok',{'#cjStatus':'종결'},null,'11111111-1111-4111-8111-111111111111');
    await run('update_fail',{},{tables:{consultation_journals:{error:{message:'수정<실패>'}}}},'11111111-1111-4111-8111-111111111111');
  }
  return out;
}
module.exports={renderAll,region,chain,lf,makeSb,tablesFor,FakeDate,PROFILES,INBOX_ROWS,JOURNALS,BILLING_ROWS};
