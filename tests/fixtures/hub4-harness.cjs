// 차례 4(결재함 · 공지 · 캘린더 · 건의함) 화면 시험 도구 — hr.html에서 네 화면의 코드 조각을 떼어 가짜 자료로 실제로 실행하고, 나온 HTML·메시지·알림창 글을 모아 돌려준다.
// 같은 도구를 옛 코드(허브 글 옮기기 전, 커밋 3d4b91e)와 새 코드에 똑같이 돌려 「기본값만 있을 때 글자 하나까지 같음」을 대조한다.
// 옛 코드의 결과는 tests/fixtures/hub4-golden-3d4b91e.json 에 저장돼 있다(만든 법: node tests/manual/make-hub4-golden.cjs <옛 hr.html 경로>).
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const lf=s=>String(s).replace(/\r\n/g,'\n');

function region(html,startMarker,endMarker,includeEnd){
  const a=html.indexOf(startMarker);
  if(a<0)throw new Error('시작 표시를 못 찾음: '+startMarker);
  const b=html.indexOf(endMarker,a);
  if(b<0)throw new Error('끝 표시를 못 찾음: '+endMarker);
  return html.slice(a,b+(includeEnd?endMarker.length:0));
}
// supabase 흉내: 어떤 메서드 사슬이든 받아서 표마다 정해진 결과를 돌려준다. single/maybeSingle로 끝나면 spec.single, 아니면 spec.list.
function chain(spec){
  const s=spec||{};
  let mode='list';
  const p=new Proxy(function(){},{
    get(_,k){
      if(k==='then')return function(res,rej){return Promise.resolve({data:s.error?null:(mode==='single'?(s.single===undefined?null:s.single):(s.list===undefined?[]:s.list)),error:s.error||null}).then(res,rej);};
      return function(){if(k==='single'||k==='maybeSingle')mode='single';return p;};
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
  {user_id:'u1',name:'김직원',role:'staff',active:true,approved:true,hire_date:'2025-03-01',dept:'진료실'},
  {user_id:'u2',name:'이매니저',role:'manager',active:true,approved:true,hire_date:'2026-09-01',dept:'데스크'},
  {user_id:'u3',name:'박<신입>',role:'staff',active:true,approved:true,hire_date:null,dept:'기공팀',employment_status:'재직'}
];
const PEOPLE=[
  {id:'p1',profile_user_id:'u1',name:'김직원',department:'진료실',active:true,included_in_schedule:true},
  {id:'p2',profile_user_id:'u2',name:'이매니저',department:'데스크',active:true,included_in_schedule:true},
  {id:'p3',profile_user_id:null,name:'원장Dr',department:'Dr.',active:true,included_in_schedule:true}
];
const NOTICES=[
  {id:1,title:'<중요> 공지',body:'본문1\n[[notice-image:u1/tmp/a.png]]\n[[notice-image:u1/tmp/none.png]]',pinned:true,created_at:'2026-09-30T02:00:00Z',author:'원장',notion_url:'https://n.so/x?a=1&b=2',attachments:[{path:'u1/tmp/a.png',name:'a.png',type:'image/png'},{path:'u1/tmp/b.pdf',name:'b<1>.pdf',type:'application/pdf'},{path:'u1/tmp/c',type:''}]},
  {id:2,title:'평범한 공지',body:'본문2',pinned:false,created_at:'2026-09-29T02:00:00Z',author:null,notion_url:null,attachments:null}
];
const DOCS=[
  {id:1,kind:'보고',title:'<월간> 보고',body:'내용<1>',status:'진행',created_at:'2026-09-30T02:00:00Z',author:'u1'},
  {id:2,kind:'기타',title:'[재직증명서 발급] 발급 요청',body:'[재직증명서 발급 요청]\n기간',status:'완결',created_at:'2026-09-29T02:00:00Z',author:'u1'},
  {id:3,kind:'사직서',title:'사직서',body:'',status:'반려',created_at:'2026-09-28T02:00:00Z',author:'u3'},
  {id:4,kind:'소명',title:'소명',body:null,status:'취소',created_at:'2026-09-27T02:00:00Z',author:'u2'},
  {id:5,kind:'연차',title:'연차',body:'x',status:'완결',created_at:'2026-09-26T02:00:00Z',author:'u1'},
  {id:6,kind:'기타',title:'기타 문서',body:'x',status:'진행',created_at:'2026-09-25T02:00:00Z',author:'u1'}
];
const CAMPAIGN_ACTIVE={id:1,title:'10월 <건의> 캠페인',starts_at:'2026-09-01',ends_at:'2026-10-31',prize_1:50000,prize_2:30000,prize_3:10000};
const CAMPAIGN_ENDED={id:2,title:'9월 건의 캠페인',starts_at:'2026-09-01',ends_at:'2026-09-30',prize_1:50000,prize_2:30000,prize_3:10000};
const SUGGESTIONS=[
  {id:11,campaign_id:1,user_id:'u1',title:'내 <건의>',body:'내용\n둘째 줄',created_at:'2026-09-20T01:00:00Z',updated_at:null},
  {id:12,campaign_id:1,user_id:'u2',title:'남의 건의',body:'본문',created_at:'2026-09-21T01:00:00Z',updated_at:null},
  {id:13,campaign_id:1,user_id:'u3',title:'세 번째',body:'본문3',created_at:'2026-09-22T01:00:00Z',updated_at:null}
];
const LIKES=[{suggestion_id:12,user_id:'u1'},{suggestion_id:11,user_id:'u2'},{suggestion_id:12,user_id:'u3'}];

function tablesFor(name){
  const T={
    approval_docs:{list:DOCS,single:{id:2,kind:'기타',title:'[재직증명서 발급] 발급 요청',body:'[재직증명서 발급 요청]\n기간',status:'완결'}},
    approval_steps:{list:[{id:1,doc_id:1,seq:1,approver_role:'chief',status:'승인'},{id:2,doc_id:1,seq:2,approver_role:'owner',status:'대기'},{id:3,doc_id:3,seq:3,approver_role:'owner',status:'반려'}]},
    employment_certificates:{list:[{id:5,approval_doc_id:2}],single:{id:5,issued_html:'<p>재직증명서 본문</p>'}},
    notices:{list:NOTICES},
    notice_reads:{list:[]},
    holidays:{list:[{date:'2026-10-03',name:'개천절'},{date:'2026-10-09',name:'한글날'}]},
    calendar_events:{list:[{id:1,date:'2026-10-01',title:'<행사>',kind:'이벤트'},{id:2,date:'2026-10-02',title:'일찍 퇴근',kind:'단축근무'},{id:3,date:'2026-10-05',title:'면접',kind:'면접'}]},
    leave_requests:{list:[
      {id:1,user_id:'u1',type:'연차',type_note:null,date_from:'2026-10-05',date_to:'2026-10-06',days:2,status:'승인',created_at:'2026-09-30T02:00:00Z',chief_at:'2026-10-01T03:00:00Z',owner_at:'2026-10-01T04:00:00Z'},
      {id:2,user_id:'u2',type:'반차',type_note:'09:00~13:00',date_from:'2026-10-05',date_to:'2026-10-05',days:0.5,status:'승인',created_at:'2026-09-29T02:00:00Z',chief_at:'2026-10-01T03:00:00Z',owner_at:null},
      {id:3,user_id:'u3',type:'기타',type_note:'<경조사>',date_from:'2026-10-07',date_to:'2026-10-08',days:2,status:'승인',created_at:null,chief_at:null,owner_at:null}]},
    schedules:{list:[
      {person_id:'p1',user_id:'u1',week_start:'2026-09-28',day:4,shift:'work'},
      {person_id:'p2',user_id:'u2',week_start:'2026-09-28',day:4,shift:'evening'},
      {person_id:'p3',user_id:null,week_start:'2026-09-28',day:4,shift:'work'},
      {person_id:'p1',user_id:'u1',week_start:'2026-09-28',day:5,shift:'off'},
      {person_id:'p2',user_id:'u2',week_start:'2026-09-28',day:5,shift:'etc'}]},
    schedule_weeks:{list:[{week_start:'2026-09-28',status:'공표'},{week_start:'2026-10-05',status:'초안'}]},
    suggestion_campaigns:{single:CAMPAIGN_ACTIVE},
    suggestions:{list:SUGGESTIONS},
    suggestion_likes:{list:LIKES},
    suggestion_reviews:{list:[{suggestion_id:11,originality_score:4,review_note:'<좋음>',award_rank:1}]},
    suggestion_awards_public:{list:[{campaign_id:2,suggestion_id:11,award_rank:1,title:'내 <건의>',user_id:'u1',ends_at:'2026-09-30',prize_amount:50000},{campaign_id:2,suggestion_id:12,award_rank:2,title:'남의 건의',user_id:'u2',ends_at:'2026-09-30',prize_amount:30000}]}
  };
  return T[name];
}
function makeSb(over){
  const o=over||{};
  const rpcCalls=[],ups=[];
  const sb={
    from(t){const spec=Object.prototype.hasOwnProperty.call(o.tables||{},t)?o.tables[t]:tablesFor(t);return chain(spec||{list:[],single:null});},
    rpc(name,args){rpcCalls.push([name,args]);const r=(o.rpc||{})[name];return Promise.resolve(r!==undefined?(typeof r==='function'?r(args):r):{data:[{}],error:null});},
    storage:{from(){return {
      upload:async()=>({error:o.uploadError||null}),
      download:async()=>(o.downloadError?{data:null,error:{message:o.downloadError}}:{data:{type:'image/png'},error:null}),
      createSignedUrl:async()=>({data:null,error:null}),
      remove:async()=>({error:null})};}}
  };
  sb.rpcCalls=rpcCalls;sb.ups=ups;
  return sb;
}

async function renderAll(html,opts){
  const o=opts||{};
  const text=lf(html);
  const timeSrc=(text.match(/\/\* hub-time:test-start \*\/[\s\S]*?\/\* hub-time:test-end \*\//)||[''])[0]; /* 허브 시간 표시 공통 함수(이 작업 이후의 hr.html에만 있음 — 없으면 빈 글) */
  const out={};
  const hubHelpers=text.includes('function hubN(')?region(text,'function hubN(','/* hub-texts.js(원장이 고치는 허브 글·목록)를 못 불러와도',false):'';
  const noticeConsts=region(text,'const NOTICE_ATTACHMENT_ALLOWED_TYPES',"bindNoticePaste($('#ntBody'));",true);
  const helperSrc=hubHelpers+'\n'+noticeConsts+'\n'+region(text,'const nameOf=uid=>','const SHIFTS={work:',false)+text.slice(text.indexOf('const SHIFTS={work:'),text.indexOf('\n',text.indexOf('const SHIFTS={work:'))+1);
  const hubTLine=text.match(/function hubT\(k,d,v\)\{[^\n]*\}/)[0];
  const apprSrc=region(text,'/* ── 결재함 ── */','/* ── 업무자료 ── */',false);
  const calSrc=region(text,'/* ── 캘린더 ── */','/* ── 온보딩 ── */',false);
  const hubJs=o.engine?lf(fs.readFileSync(path.join(__dirname,'..','..','hub-texts.js'),'utf8')):null;
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const md=s=>s?String(s).slice(5).replace('-','/'):'';

  async function makeCtx(extra,sbOver){
    const dom=makeDom(),log=[],statuses=[];
    const ctx={console,esc,md,$:dom.$,Date:FakeDate,Intl,Promise,Math,JSON,Set,Map,Number,String,Array,Object,parseInt,parseFloat,isNaN,Blob,
      PROFILES:PROFILES.map(p=>Object.assign({},p)),SCHEDULE_PEOPLE:PEOPLE.map(p=>Object.assign({},p)),SCHEDULE_PEOPLE_ERROR:'',
      ME:{id:'u1',name:'김직원',role:'staff',department:'진료실'},
      SETTINGS:{late_cut:'09:40',ot_unit_min:'10',siueop:'10:00'},
      SETTINGS_LOAD_OK:true,
      isLead:()=>['chief','owner'].includes(ctx.ME.role),isMgr:()=>['manager','chief','owner'].includes(ctx.ME.role),
      today:()=>'2026-10-01',
      setStatus:s=>statuses.push(s),render:()=>{log.push('render');},refreshBadges:()=>{log.push('badges');},show:id=>log.push('show:'+id),hide:id=>log.push('hide:'+id),openLeave:()=>log.push('openLeave'),
      loadSchedulePeople:async()=>{},loadProfiles:async()=>{},
      alert:m=>log.push('alert:'+m),confirm:m=>{log.push('confirm:'+m);return ctx.__confirm!==false;},prompt:()=>null,
      setTimeout:()=>0,
      URL:{createObjectURL:()=>'blob:fake',revokeObjectURL(){}},crypto:{randomUUID:()=>'uuid'},
      Image:function(){const im={set src(v){this._s=v;Promise.resolve().then(()=>{if(typeof im.onerror==='function')im.onerror(new Error('x'));});},get src(){return this._s;}};return im;},
      FileReader:function(){},XLSX:{},
      sb:makeSb(sbOver)};
    ctx.document=Object.assign({createElement:()=>({click(){},getContext(){return null;}}),querySelector:()=>({textContent:''}),querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){},body:{classList:{add(){},remove(){}}}},(extra&&extra.document)||{});
    ctx.window=ctx;
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
    vm.runInContext(timeSrc+'\n'+helperSrc+'\n'+hubTLine+'\n'+apprSrc+'\n'+calSrc+'\n;this.api={renderAppr,docCard,loadSteps,apprAct,submitApproval,cancelApprovalDoc,openEmploymentCertificate,'
      +'renderNotice,renderNoticeBody,noticeAttachmentLinks,documentPreviewMarkup,previewNoticeAttachment,downloadNoticeAttachment,submitNotice,delNotice,renderNoticePastePreview,'
      +'renderCalendar,renderCalendarDayPanel,renderCalendarDayDetail,renderCalendarWeekTable,saveCalendarPng,addCalendarEvent,deleteCalendarEvent,renderLeaveStatus,'
      +'renderSuggestions,saveSuggestion,deleteSuggestion,toggleSuggestionLikeRemote,saveSuggestionReview,saveSuggestionCampaign,'
      +'setState:(k,v)=>{if(k==="CAL_VIEW")CAL_VIEW=v;if(k==="CAL_PERIOD")CAL_PERIOD=v;if(k==="CAL_MONTH")CAL_MONTH=v;if(k==="CAL_WEEK_START")CAL_WEEK_START=v;if(k==="CAL_SELECTED_DATE")CAL_SELECTED_DATE=v;if(k==="CAL_DETAIL_DATE")CAL_DETAIL_DATE=v;if(k==="LVSTATUS_VIEW")LVSTATUS_VIEW=v;if(k==="LVSTATUS_MONTH")LVSTATUS_MONTH=v;if(k==="SUGGESTION_EDIT_ID")SUGGESTION_EDIT_ID=v;if(k==="NOTICE_PASTED_IMAGES")NOTICE_PASTED_IMAGES=v;}};'
      +'this.api2={hubStaticFill:typeof hubStaticFill==="function"?hubStaticFill:null,hubFillHtml:typeof hubFillHtml==="function"?hubFillHtml:null,hubN:typeof hubN==="function"?hubN:null,'
      +'apprKindSelectFill:typeof apprKindSelectFill==="function"?apprKindSelectFill:null,approvalKindItems:typeof approvalKindItems==="function"?approvalKindItems:null,approvalKindDisplay:typeof approvalKindDisplay==="function"?approvalKindDisplay:null,'
      +'calendarKindItems:typeof calendarKindItems==="function"?calendarKindItems:null,calendarKindLabel:typeof calendarKindLabel==="function"?calendarKindLabel:null};',ctx);
    return {ctx,dom,log,statuses,api:ctx.api,api2:ctx.api2};
  }
  const flush=()=>new Promise(res=>setImmediate(res));
  const asRole=async(role,extra,sbOver)=>{const r=await makeCtx(extra,sbOver);r.ctx.ME={id:'u1',name:'김직원',role,department:'진료실'};return r;};
  const fail=m=>({error:{message:m}});
  if(o.probe)return {makeCtx,asRole,fail,flush,makeDom,chain,makeSb,text};

  /* ───────── 결재함 ───────── */
  for(const role of ['staff','chief','owner']){
    const r=await asRole(role);const m={innerHTML:''};await r.api.renderAppr(m);out['appr.render.'+role]=m.innerHTML;
  }
  {
    const r=await asRole('chief',null,{tables:{approval_docs:{list:[]},employment_certificates:{list:[]},approval_steps:{list:[]}}});const m={innerHTML:''};await r.api.renderAppr(m);out['appr.render.chief_empty']=m.innerHTML;
    const r2=await asRole('staff',null,{tables:{approval_docs:{list:[]},employment_certificates:{list:null}}});const m2={innerHTML:''};await r2.api.renderAppr(m2);out['appr.render.staff_empty']=m2.innerHTML;
    const q=await asRole('owner');
    out['appr.docCard']=JSON.stringify(DOCS.flatMap(d=>[q.api.docCard(d,true,new Map([[2,5]])),q.api.docCard(d,false)]));
  }
  { // 결재선 줄(loadSteps)
    const els=[{id:'steps-1',innerHTML:''},{id:'steps-3',innerHTML:''},{id:'steps-9',innerHTML:''}];
    const r=await asRole('chief',{document:{querySelectorAll:sel=>sel==='[id^="steps-"]'?els:[],getElementById:()=>null}});
    await r.api.loadSteps();await flush();await flush();
    out['appr.steps']=JSON.stringify(els.map(e=>e.innerHTML));
  }
  { // 결재 처리(알림창)
    const runAct=async(name,role,act,sbOver)=>{const r=await asRole(role,null,sbOver);await r.api.apprAct(1,act);out['appr.act.'+name]=JSON.stringify([r.log,r.statuses,r.ctx.sb.rpcCalls]);};
    await runAct('req_err','chief','ok',{tables:{approval_docs:{error:{message:'x'}}}});
    await runAct('req_none','chief','ok',{tables:{approval_docs:{single:null}}});
    await runAct('cert_fail','owner','ok',{tables:{approval_docs:{single:{kind:'기타',title:'[재직증명서 발급] 요청',body:'[재직증명서 발급 요청]\nx'}}},rpc:{issue_employment_certificate:fail('발급<오류>')}});
    await runAct('cert_ok','owner','ok',{tables:{approval_docs:{single:{kind:'기타',title:'[재직증명서 발급] 요청',body:'[재직증명서 발급 요청]\nx'}}},rpc:{issue_employment_certificate:{error:null}}});
    await runAct('no_step','chief','ok',{tables:{approval_docs:{single:{kind:'보고',title:'t',body:'b'}},approval_steps:{list:[{id:9,status:'대기',approver_role:'owner',seq:2}]}}});
    await runAct('ok_chief','chief','ok',{tables:{approval_docs:{single:{kind:'보고',title:'t',body:'b'}},approval_steps:{list:[{id:9,status:'대기',approver_role:'chief',seq:1},{id:10,status:'대기',approver_role:'owner',seq:2}]}}});
    await runAct('rej_chief','chief','rej',{tables:{approval_docs:{single:{kind:'보고',title:'t',body:'b'}},approval_steps:{list:[{id:9,status:'대기',approver_role:'chief',seq:1}]}}});
  }
  { // 올리기·취소·발급본
    const runSub=async(name,vals,sbOver)=>{const d=makeDom();Object.entries(vals).forEach(([k,v])=>{d.$(k).value=v;});const r=await asRole('staff',{$:d.$},sbOver);await r.api.submitApproval();out['appr.submit.'+name]=JSON.stringify([d.$('#apMsg').textContent,r.log,r.statuses,d.$('#apTitle').value]);};
    await runSub('no_title',{'#apKind':'보고','#apTitle':' ','#apBody':''});
    await runSub('leave',{'#apKind':'연차 신청','#apTitle':'휴가','#apBody':''});
    await runSub('insert_fail',{'#apKind':'보고','#apTitle':'제목','#apBody':'내용'},{tables:{approval_docs:{error:{message:'저장<실패>'}}},rpc:{submit_approval_document:{data:null,error:{message:'저장<실패>'}}}});
    await runSub('ok',{'#apKind':'재직증명서 발급','#apTitle':'제목','#apBody':'내용'},{tables:{approval_docs:{single:{id:7}}}});
    const mkCancel=async(name,single,confirmOk)=>{const r=await asRole('chief',{__confirm:confirmOk},{tables:{approval_docs:{single}}});await r.api.cancelApprovalDoc(2);out['appr.cancel.'+name]=JSON.stringify([r.log,r.statuses]);};
    await mkCancel('bad_state',{id:2,kind:'기타',title:'t',status:'진행'},true);
    await mkCancel('none',null,true);
    await mkCancel('declined',{id:2,kind:'보고',title:'t<1>',status:'완결'},false);
    await mkCancel('ok',{id:2,kind:'기타',title:'[재직증명서 발급] 요청',body:'[재직증명서 발급 요청]\nx',status:'완결'},true);
    const mkCert=async(name,sbOver)=>{const d=makeDom();const r=await asRole('staff',{$:d.$},sbOver);await r.api.openEmploymentCertificate(5);out['appr.cert.'+name]=JSON.stringify([r.log,d.$('#certificateBody').innerHTML]);};
    await mkCert('err',{tables:{employment_certificates:{error:{message:'x'}}}});
    await mkCert('nohtml',{tables:{employment_certificates:{single:{id:5,issued_html:''}}}});
    await mkCert('ok',null);
  }
  {
    const modalText=id=>{const a=text.indexOf('<div class="mask" id="'+id+'"');let b;if(id==='certificateMask'){let depth=0;b=-1;for(const m of text.slice(a).matchAll(/<div\b[^>]*>|<\/div>/g)){depth+=m[0][1]==='/'?-1:1;if(depth===0){b=a+m.index+m[0].length;break;}}if(b<0)throw new Error('certificateMask closing boundary missing');}else{const next=text.indexOf('\n\n',a);b=next<0?text.length:next;}const blk=text.slice(a,b);return JSON.stringify({text:blk.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(),placeholders:[...blk.matchAll(/placeholder="([^"]*)"/g)].map(m=>m[1])});};
    for(const id of ['apMask','ntMask','certificateMask'])out['static.modal.'+id]=modalText(id);
  }

  /* ───────── 공지 ───────── */
  for(const role of ['staff','chief']){
    const r=await asRole(role);const m={innerHTML:''};await r.api.renderNotice(m);out['notice.render.'+role]=m.innerHTML;out['notice.render.'+role+'.log']=JSON.stringify(r.log);
  }
  {
    const r=await asRole('staff',null,{tables:{notices:{list:[]}}});const m={innerHTML:''};await r.api.renderNotice(m);out['notice.render.empty']=m.innerHTML;
    const r2=await asRole('staff',null,{downloadError:'x'});out['notice.body.download_err']=await r2.api.renderNoticeBody('앞[[notice-image:u1/tmp/a.png]]뒤',[{path:'u1/tmp/a.png',name:'a.png',type:'image/png'}]);
    out['notice.body.plain']=await r2.api.renderNoticeBody('<b>글</b> [[notice-image:zz]]',[]);
    out['notice.attachLinks']=JSON.stringify([r2.api.noticeAttachmentLinks({}),r2.api.noticeAttachmentLinks({attachments:[]}),r2.api.noticeAttachmentLinks({attachments:[{path:'p/1',name:'<n>.pdf',type:'application/pdf'},{path:'',name:'',type:''}]})]);
    const missingFile=await asRole('staff');await missingFile.api.downloadNoticeAttachment('p/1','n.docx');out['notice.download.no_file']=JSON.stringify(missingFile.log);
    out['notice.preview.markup']=JSON.stringify([r2.api.documentPreviewMarkup('blob:u','그림.png','image/png'),r2.api.documentPreviewMarkup('blob:u','문서.pdf',''),r2.api.documentPreviewMarkup('blob:u','표.xlsx','application/vnd.ms-excel')]);
    out['notice.pastePreview']=await (async()=>{const d=makeDom();const q=await asRole('staff',{$:d.$});q.api.setState('NOTICE_PASTED_IMAGES',[{name:'a.png'},{name:''},{}]);q.api.renderNoticePastePreview();return d.$('#ntPastePreview').innerHTML;})();
    for(const [name,sbOver] of [['err',{downloadError:'열기<오류>'}],['ok',null]]){
      const d=makeDom();const q=await asRole('staff',{$:d.$},sbOver);await q.api.previewNoticeAttachment('p/1','n.png','image/png');await q.api.previewNoticeAttachment('','n','');
      out['notice.previewAttach.'+name]=JSON.stringify([q.log,d.$('#noticePreviewBody').innerHTML]);
    }
    const mkSub=async(name,vals,files,sbOver,pasted)=>{const d=makeDom();Object.entries(vals).forEach(([k,v])=>{d.$(k).value=v;});d.$('#ntFiles').files=files||[];const r=await asRole('chief',{$:d.$},sbOver);if(pasted)r.api.setState('NOTICE_PASTED_IMAGES',pasted);await r.api.submitNotice();out['notice.submit.'+name]=JSON.stringify([d.$('#ntMsg').textContent,r.log,r.statuses,d.$('#ntTitle').value]);};
    await mkSub('no_title',{'#ntTitle':'  '});
    await mkSub('bad_file',{'#ntTitle':'제목'},[{name:'a.zip',type:'application/zip',size:10}]);
    await mkSub('big_file',{'#ntTitle':'제목'},[{name:'a.pdf',type:'application/pdf',size:10*1024*1024+1}]);
    await mkSub('upload_fail',{'#ntTitle':'제목'},[{name:'a.pdf',type:'application/pdf',size:10}],{uploadError:{message:'업로드<실패>'}});
    await mkSub('insert_fail',{'#ntTitle':'제목'},[],{tables:{notices:{error:{message:'저장<실패>'}}}});
    await mkSub('ok',{'#ntTitle':'제목','#ntBody':'본문','#ntUrl':'https://x'},[{name:'a.pdf',type:'application/pdf',size:10}]);
    for(const confirmOk of [false,true]){const r=await asRole('chief',{__confirm:confirmOk});await r.api.delNotice(1);out['notice.del.'+confirmOk]=JSON.stringify([r.log,r.statuses]);}
  }

  /* ───────── 캘린더 ───────── */
  const calCases=[
    ['week.all.staff','week','all','staff',null],['week.all.chief','week','all','chief',null],['week.work.staff','week','work','staff',null],
    ['month.all.staff','month','all','staff',null],['month.all.chief','month','all','chief',null],['month.work.chief','month','work','chief',null],
    ['week.err','week','all','staff',{tables:{holidays:fail('휴일<오류>')}}],['month.empty','month','all','staff',{tables:{holidays:{list:[]},calendar_events:{list:[]},leave_requests:{list:[]},schedules:{list:[]},schedule_weeks:{list:[]}}}],
    ['week.empty','week','all','staff',{tables:{holidays:{list:[]},calendar_events:{list:[]},leave_requests:{list:[]},schedules:{list:[]},schedule_weeks:{list:[]}}}]
  ];
  for(const [name,period,view,role,sbOver] of calCases){
    const r=await asRole(role,null,sbOver);
    r.api.setState('CAL_VIEW',view);r.api.setState('CAL_PERIOD',period);r.api.setState('CAL_MONTH','2026-10');r.api.setState('CAL_WEEK_START','2026-09-28');r.api.setState('CAL_SELECTED_DATE','2026-10-01');r.api.setState('CAL_DETAIL_DATE',null);
    const m={innerHTML:''};await r.api.renderCalendar(m);out['cal.'+name]=m.innerHTML;
  }
  for(const [name,period] of [['week_detail','week'],['month_detail','month']]){
    const r=await asRole('chief');
    r.api.setState('CAL_VIEW','all');r.api.setState('CAL_PERIOD',period);r.api.setState('CAL_MONTH','2026-10');r.api.setState('CAL_WEEK_START','2026-09-28');r.api.setState('CAL_SELECTED_DATE','2026-10-01');r.api.setState('CAL_DETAIL_DATE','2026-10-01');
    const m={innerHTML:''};await r.api.renderCalendar(m);out['cal.'+name]=m.innerHTML;
    r.api.setState('CAL_DETAIL_DATE','2026-10-09');const m2={innerHTML:''};await r.api.renderCalendar(m2);out['cal.'+name+'.empty_day']=m2.innerHTML;
  }
  {
    const r=await asRole('staff');
    out['cal.dayPanel']=JSON.stringify([r.api.renderCalendarDayPanel('2026-10-01',{departments:{'Dr.':['원장'],'진료·상담':[],'소독·행정':[],'기공':[],'데스크':[],'미지정':[]},evening:[],off:[],etc:[]},[]),r.api.renderCalendarDayPanel('',null,[]),r.api.renderCalendarDayPanel('2026-10-01',{departments:{'Dr.':[]},evening:['야'],off:['오'],etc:['기']},[{label:'김',type:'반차',type_note:'9시'}])]);
    out['cal.dayDetail']=JSON.stringify([r.api.renderCalendarDayDetail('2026-10-01',null,[]),r.api.renderCalendarDayDetail('2026-10-01',{departments:{'Dr.':['원장']},evening:['야'],off:['오'],etc:['기']},[{label:'김',type:'연차',type_note:null}])]);
  }
  for(const confirmOk of [false,true]){
    const d=makeDom();d.$('#calDate').value='2026-10-02';d.$('#calTitle').value='새 일정';d.$('#calKind').value='면접';
    const r=await asRole('chief',{$:d.$,__confirm:confirmOk});await r.api.addCalendarEvent();await r.api.deleteCalendarEvent(3);
    out['cal.event.ops.'+confirmOk]=JSON.stringify([r.log,r.statuses]);
  }
  {
    const d0=makeDom();d0.$('#calDate').value='';d0.$('#calTitle').value='x';const r0=await asRole('chief',{$:d0.$});await r0.api.addCalendarEvent();out['cal.event.add_empty']=JSON.stringify([r0.log,r0.statuses]);
    const d1=makeDom();d1.$('#calDate').value='2026-10-02';d1.$('#calTitle').value='x';const r1=await asRole('chief',{$:d1.$},{tables:{calendar_events:{error:{message:'x'}}}});await r1.api.addCalendarEvent();out['cal.event.add_err']=JSON.stringify([r1.log,r1.statuses]);
    const r2=await asRole('chief',{$:makeDom().$},{tables:{calendar_events:{error:{message:'x'}}}});await r2.api.deleteCalendarEvent(1);out['cal.event.del_err']=JSON.stringify([r2.log,r2.statuses]);
  }
  { // PNG 저장(준비 실패 알림)
    const r=await asRole('staff',{URL:{createObjectURL:()=>'blob:x',revokeObjectURL(){}}});await r.api.saveCalendarPng();out['cal.png.fail']=JSON.stringify(r.log);
  }
  // 연차 캘린더(캘린더 안의 연차 보기 + 단독)
  for(const [name,role,view,month,sbOver,embedded] of [
    ['cal.staff','staff','calendar','2026-10',null,false],['cal.owner','owner','calendar','2026-10',null,false],['list.staff','staff','list','2026-10',null,false],['list.owner','owner','list','2026-10',null,false],
    ['empty.cal','staff','calendar','2026-11',{tables:{leave_requests:{list:[]}}},false],['empty.list','owner','list','2026-11',{tables:{leave_requests:{list:[]}}},false],
    ['err','staff','calendar','2026-10',{tables:{leave_requests:fail('연차<오류>')}},false],['err_none','staff','calendar','2026-10',{tables:{leave_requests:{error:{}}}},false],
    ['embedded.owner','owner','list','2026-10',null,true]
  ]){
    const r=await asRole(role,null,sbOver);r.api.setState('LVSTATUS_VIEW',view);r.api.setState('CAL_VIEW','leave');r.api.setState('LVSTATUS_MONTH',month);r.api.setState('CAL_MONTH',month);
    const m={innerHTML:''};await r.api.renderLeaveStatus(m,embedded);out['lvs.'+name]=m.innerHTML;
  }
  { // 캘린더(연차 보기)로 들어가는 길
    const r=await asRole('staff');r.api.setState('CAL_VIEW','leave');r.api.setState('CAL_MONTH','2026-10');r.api.setState('LVSTATUS_VIEW','calendar');const m={innerHTML:''};await r.api.renderCalendar(m);out['cal.leave_view']=m.innerHTML;
  }

  /* ───────── 건의함 ───────── */
  const sugCases=[
    ['active.staff','staff',null],['active.owner','owner',null],['active.manager','manager',null],
    ['ended.staff','staff',{tables:{suggestion_campaigns:{single:CAMPAIGN_ENDED}}}],['ended.owner','owner',{tables:{suggestion_campaigns:{single:CAMPAIGN_ENDED}}}],
    ['ended.no_awards','staff',{tables:{suggestion_campaigns:{single:CAMPAIGN_ENDED},suggestion_awards_public:{list:[]}}}],
    ['no_rows','staff',{tables:{suggestions:{list:[]}}}],['no_campaign','staff',{tables:{suggestion_campaigns:{single:null}}}],
    ['err_campaign','staff',{tables:{suggestion_campaigns:fail('캠페인<오류>')}}],['err_campaign_none','staff',{tables:{suggestion_campaigns:{error:{}}}}],
    ['err_rows','staff',{tables:{suggestions:fail('목록<오류>')}}],['err_likes','staff',{tables:{suggestion_likes:fail('좋아요<오류>')}}],
    ['err_reviews','owner',{tables:{suggestion_reviews:fail('평가<오류>')}}],['err_awards','staff',{tables:{suggestion_campaigns:{single:CAMPAIGN_ENDED},suggestion_awards_public:fail('수상<오류>')}}]
  ];
  for(const [name,role,sbOver] of sugCases){
    const r=await asRole(role,null,sbOver);const m={innerHTML:''};await r.api.renderSuggestions(m);out['sug.render.'+name]=m.innerHTML;
  }
  {
    const r=await asRole('staff');r.api.setState('SUGGESTION_EDIT_ID',11);const m={innerHTML:''};await r.api.renderSuggestions(m);out['sug.render.editing']=m.innerHTML;
    const runSave=async(name,id,vals,sbOver)=>{const d=makeDom();Object.entries(vals).forEach(([k,v])=>{d.$(k).value=v;});const q=await asRole('staff',{$:d.$},sbOver);await q.api.saveSuggestion(id);out['sug.save.'+name]=JSON.stringify([q.log,q.statuses]);};
    await runSave('new_empty',null,{'#suggestionNewTitle':'','#suggestionNewBody':'x'});
    await runSave('new_fail',null,{'#suggestionNewTitle':'제목','#suggestionNewBody':'내용'},{tables:{suggestions:{error:{message:'저장<실패>'}}}});
    await runSave('new_ok',null,{'#suggestionNewTitle':'제목','#suggestionNewBody':'내용'});
    await runSave('edit_ok',11,{'#suggestionEditTitle-11':'제목','#suggestionEditBody-11':'내용'});
    for(const [name,confirmOk,sbOver] of [['declined',false,null],['fail',true,{tables:{suggestions:{error:{message:'삭제<실패>'}}}}],['ok',true,null]]){
      const q=await asRole('staff',{__confirm:confirmOk},sbOver);await q.api.deleteSuggestion(11);out['sug.delete.'+name]=JSON.stringify([q.log,q.statuses]);
    }
    for(const [name,liked,sbOver] of [['fail_insert',false,{tables:{suggestion_likes:{error:{message:'좋아요<실패>'}}}}],['fail_delete',true,{tables:{suggestion_likes:{error:{message:'취소<실패>'}}}}],['ok',false,null]]){
      const q=await asRole('staff',null,sbOver);await q.api.toggleSuggestionLikeRemote(12,liked);out['sug.like.'+name]=JSON.stringify([q.log,q.statuses]);
    }
    for(const [name,sbOver] of [['fail',{tables:{suggestion_reviews:{error:{message:'평가<실패>'}}}}],['ok',null]]){
      const d=makeDom();d.$('#suggestionScore-11').value='4';d.$('#suggestionNote-11').value='메모';d.$('#suggestionRank-11').value='1';
      const q=await asRole('owner',{$:d.$},sbOver);await q.api.saveSuggestionReview(11);out['sug.review.'+name]=JSON.stringify([q.log,q.statuses]);
    }
    for(const [name,vals,sbOver] of [['invalid_title',{'#suggestionCampaignTitle':'','#suggestionStartsAt':'2026-09-01','#suggestionEndsAt':'2026-09-30'}],['invalid_range',{'#suggestionCampaignTitle':'t','#suggestionStartsAt':'2026-10-01','#suggestionEndsAt':'2026-09-30'}],['invalid_prize',{'#suggestionCampaignTitle':'t','#suggestionStartsAt':'2026-09-01','#suggestionEndsAt':'2026-09-30','#suggestionPrize1':'-1'}],
      ['fail',{'#suggestionCampaignTitle':'t','#suggestionStartsAt':'2026-09-01','#suggestionEndsAt':'2026-09-30'},{tables:{suggestion_campaigns:{error:{message:'캠페인<실패>'}}}}],['ok',{'#suggestionCampaignTitle':'t','#suggestionStartsAt':'2026-09-01','#suggestionEndsAt':'2026-09-30'},null]]){
      const d=makeDom();Object.entries(vals).forEach(([k,v])=>{d.$(k).value=v;});
      const q=await asRole('owner',{$:d.$},sbOver);await q.api.saveSuggestionCampaign();out['sug.campaign.'+name]=JSON.stringify([q.log,q.statuses]);
    }
  }
  return out;
}
module.exports={renderAll,region,chain,lf,makeSb,tablesFor,FakeDate,PROFILES,PEOPLE,DOCS,NOTICES};
