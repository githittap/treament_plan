// 차례 7(급여·AI비용·원장 보기판·진료기록·입금·홈 + 계정 위험 확인창·직무 분류 관리·저장 상태 글·결제 금액 단위·상태 이름) 화면 시험 도구.
// hr.html에서 해당 코드 조각을 떼어 가짜 자료로 실제 실행하고, 나온 HTML·메시지·알림창·확인창을 모아 돌려준다.
// 같은 도구를 옛 코드(허브 글 옮기기 전, 커밋 f95b951)와 새 코드에 똑같이 돌려 「기본값만 있을 때 글자 하나까지 같음」을 대조한다.
// 옛 코드의 결과는 tests/fixtures/hub7-golden-f95b951.json 에 저장돼 있다(만든 법: node tests/manual/make-hub7-golden.cjs <옛 hr.html 경로>).
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const lf=s=>String(s).replace(/\r\n/g,'\n');
const REAL_DATE=Date,FIXED=REAL_DATE.UTC(2026,9,1,3,0,0);
class FakeDate extends REAL_DATE{
  constructor(...a){if(a.length===0)super(FIXED);else super(...a);}
  static now(){return FIXED;}
}
function region(html,a,b){
  const i=html.indexOf(a);if(i<0)throw new Error('시작 표시를 못 찾음: '+a);
  const j=html.indexOf(b,i+a.length);if(j<0)throw new Error('끝 표시를 못 찾음: '+b);
  return html.slice(i,j);
}
// 함수 한 개의 원문(한 줄짜리면 그 줄, 아니면 줄 맨 앞 「}」까지)
function fnSrc(text,name){
  const m=new RegExp('(?:async )?function '+name+'\\(').exec(text);
  if(!m)throw new Error('함수를 못 찾음: '+name);
  const ls=text.lastIndexOf('\n',m.index)+1;
  let le=text.indexOf('\n',m.index);if(le<0)le=text.length;
  const first=text.slice(ls,le);
  if(/\}\s*(\/\*.*\*\/)?\s*$/.test(first)&&!/\{\s*$/.test(first))return first;
  const end=text.indexOf('\n}',m.index);
  return text.slice(ls,end+2);
}
function chain(spec,rec,table,limits){
  const s=spec||{};
  let mode='list';
  const p=new Proxy(function(){},{
    get(_,k){
      if(k==='then')return function(res,rej){
        const out={data:s.error?null:(mode==='single'?(s.single===undefined?null:s.single):(s.list===undefined?[]:s.list)),error:s.error||null};
        if(s.count!==undefined)out.count=s.count;
        return Promise.resolve(out).then(res,rej);
      };
      return function(...a){if(limits&&k==='limit')limits.push([table,a[0]]);if(rec&&['insert','update','upsert','delete'].includes(k))rec.push([table,k,JSON.parse(JSON.stringify(a))]);if(k==='single'||k==='maybeSingle')mode='single';return p;};
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
        addEventListener(){},removeAttribute(){},setAttribute(){},focus(){},scrollIntoView(){},querySelector(){return null;},querySelectorAll(){return [];}};
      let t='',h='';
      Object.defineProperty(e,'textContent',{get(){return t;},set(v){t=v;hist.push([sel,'t',String(v)]);},enumerable:true});
      Object.defineProperty(e,'innerHTML',{get(){return h;},set(v){h=v;hist.push([sel,'h',String(v)]);},enumerable:true});
      reg[sel]=e;
    }
    return reg[sel];
  }
  return {reg,$:el,hist};
}
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const PROFILES=[
  {user_id:'u1',name:'김직원',role:'staff',active:true,approved:true,dept:'진료실',job_group:'clinical_consult'},
  {user_id:'u2',name:'이매니저',role:'manager',active:true,approved:true,dept:'상담',job_group:'desk'},
  {user_id:'u3',name:'박실장',role:'chief',active:true,approved:true},
  {user_id:'u4',name:'정원장',role:'owner',active:true,approved:true},
  {user_id:'u5',name:'최<직원>',role:'staff',active:true,approved:true,dept:'리셉션'},
  {user_id:'u6',name:'퇴사직원',role:'staff',active:false,approved:true,account_access_status:'차단'}
];
const PEOPLE=[
  {id:'p1',name:'김직원',profile_user_id:'u1',department:'진료실',active:true},
  {id:'p2',name:'이매니저',profile_user_id:'u2',department:'데스크',active:true},
  {id:'p3',name:'박<실장>',profile_user_id:'u3',department:'기타',active:true},
  {id:'p4',name:'원장님',profile_user_id:null,department:'Dr.',active:true}
];
const ROLE_ME={staff:{id:'u1',name:'김직원',role:'staff'},manager:{id:'u2',name:'이매니저',role:'manager'},chief:{id:'u3',name:'박실장',role:'chief'},owner:{id:'u4',name:'정원장',role:'owner'},desk:{id:'u7',name:'데스크직원',role:'staff',department:'데스크'}};

/* ───────── 가짜 자료 ───────── */
const MKT_EVENTS=[
  {id:'e1',received_at:'2026-10-01T01:00:00Z',transaction_at:'2026-10-01T01:00:00Z',event_kind:'purchase',parse_status:'recorded',failure_code:null,currency:'KRW',amount_native:50000,amount_krw:50000,merchant:'당근마켓 광고',merchant_key:'daangn',category_override:null,reversed_event_id:null},
  {id:'e2',received_at:'2026-10-01T02:00:00Z',transaction_at:'2026-10-01T02:00:00Z',event_kind:'purchase',parse_status:'recorded',failure_code:null,currency:'USD',amount_native:12.3456,amount_krw:null,merchant:'GOOGLE ADS',merchant_key:'google',category_override:null,reversed_event_id:null},
  {id:'e3',received_at:'2026-10-01T03:00:00Z',transaction_at:'2026-10-01T03:00:00Z',event_kind:'purchase',parse_status:'recorded',failure_code:null,currency:'KRW',amount_native:30000,amount_krw:30000,merchant:'기타 상점<x>',merchant_key:'etc',category_override:'not_marketing',reversed_event_id:null},
  {id:'e4',received_at:'2026-10-01T04:00:00Z',transaction_at:'2026-10-01T04:00:00Z',event_kind:'purchase',parse_status:'recorded',failure_code:null,currency:'KRW',amount_native:7000,amount_krw:7000,merchant:'모르는 가맹점',merchant_key:'unknown',category_override:null,reversed_event_id:null},
  {id:'e5',received_at:'2026-10-01T05:00:00Z',transaction_at:'2026-10-01T05:00:00Z',event_kind:'cancellation',parse_status:'recorded',failure_code:null,currency:'KRW',amount_native:50000,amount_krw:-50000,merchant:'당근마켓 광고',merchant_key:'daangn',category_override:null,reversed_event_id:'e1'},
  {id:'f1',received_at:'2026-10-01T06:00:00Z',transaction_at:'2026-10-01T06:00:00Z',event_kind:'cancellation',parse_status:'failed',failure_code:'unmatched_cancellation',currency:'KRW',amount_native:1000,amount_krw:1000,merchant:'취소1',merchant_key:'c1',category_override:null,reversed_event_id:null},
  {id:'f2',received_at:'2026-10-01T06:10:00Z',transaction_at:'2026-10-01T06:10:00Z',event_kind:'cancellation',parse_status:'failed',failure_code:'ambiguous_cancellation',currency:'KRW',amount_native:2000,amount_krw:2000,merchant:'취소2',merchant_key:'c2',category_override:null,reversed_event_id:null},
  {id:'f3',received_at:'2026-10-01T06:20:00Z',transaction_at:'2026-10-01T06:20:00Z',event_kind:'cancellation',parse_status:'failed',failure_code:'duplicate_cancellation',currency:'KRW',amount_native:3000,amount_krw:3000,merchant:'취소3',merchant_key:'c3',category_override:null,reversed_event_id:null},
  {id:'f5',received_at:'2026-10-01T06:30:00Z',transaction_at:null,event_kind:'cancellation',parse_status:'failed',failure_code:'unmatched_cancellation',currency:'KRW',amount_native:4000,amount_krw:4000,merchant:'취소4',merchant_key:'c4',category_override:null,reversed_event_id:null},
  {id:'e6',received_at:'2026-10-01T08:00:00Z',transaction_at:'2026-10-01T08:00:00Z',event_kind:'purchase',parse_status:'recorded',failure_code:null,currency:'KRW',amount_native:900,amount_krw:900,merchant:null,merchant_key:'nomerchant',category_override:null,reversed_event_id:null},
  {id:'f4',received_at:'2026-10-01T07:00:00Z',transaction_at:null,event_kind:'purchase',parse_status:'failed',failure_code:'parse_error',currency:null,amount_native:null,amount_krw:null,merchant:null,merchant_key:null,category_override:null,reversed_event_id:null}
];
const MKT_RULES=[{merchant_key:'daangn',merchant_label:'당근',category:'daangn'},{merchant_key:'google',merchant_label:'구글',category:'google'}];
const MKT_LINKS=[];
const USAGE_ROWS=[
  {usage_date:'2026-09-30',model:'Sol',tokens:123456789,turns:12,synced_at:'2026-10-01T01:00:00Z'},
  {usage_date:'2026-09-29',model:'Astra',tokens:50000,turns:3,synced_at:'2026-10-01T01:00:00Z'},
  {usage_date:'2026-09-28',model:'Luna',tokens:30000,turns:2,synced_at:'2026-10-01T01:00:00Z'}
];
const SNAP_COST={fx:1375.64,fx_src:'환율<원천>',generated:'2026-10-01 10:00',this_month:'2026-10',this_usd:100.5,total_usd:400.25,month_usd:{'2026-08':10,'2026-09':50,'2026-10':100.5,'?':3},agents:{claude:{cumUSD:300,inTok:123456,outTok:45678,months:[{m:'2026-10',usd:80}]},codex:{cumUSD:100.25,inTok:1000,outTok:2000,months:[]},mystery:{cumUSD:1,inTok:1,outTok:1,months:[]}}};
const SNAP_EXT={fx:1500,generated:'2026-10-01 10:00',totals:{deepseek:{calls:10,ok:8,fail:2,costed_calls:10,krw:1234.5},step5:{calls:5,ok:5,fail:0,costed_calls:2,krw:100},luna:{calls:1,ok:1,fail:0,costed_calls:0,krw:0},'?':{calls:2,ok:1,fail:1,costed_calls:0,krw:0},새로운:{calls:1,ok:1,fail:0,costed_calls:1,krw:5}},days:{'2026-10-01':{deepseek:{calls:3,ok:3,fail:0,costed_calls:3,krw:300},step5:{calls:1,ok:1,fail:0,costed_calls:0,krw:0},luna:{calls:2,ok:2,fail:0,costed_calls:1,krw:9}},'2026-09-29':{deepseek:{calls:2,ok:2,fail:0,costed_calls:0,krw:0}},'2026-09-20':{kimi:{calls:1,ok:1,fail:0,costed_calls:1,krw:1}},'2026-09-10':{deepseek:{calls:1,ok:1,fail:0,costed_calls:1,krw:2}}}};
const SNAP_SESS={generated:'2026-10-01 10:00',won_today_total:12345.6,flagged:[{thread:'t1',name:'대화<A>',sev:'red',active:true,won_today:5000,reasons:['이유1','이유2']},{thread:'t2',name:'',sev:'orange',active:false,won_today:300,reasons:[]},{thread:'t3',name:'대화3',sev:'orange',active:true,won_today:200,reasons:['r3']},{thread:'t4',name:'대화4',sev:'orange',active:true,won_today:100,reasons:['r4']},{thread:'t5',name:'대화5',sev:'orange',active:false,won_today:50,reasons:['r5']}]};
const BILLING=[{ym:'2026-10',platform:'Claude',amount_krw:30000,note:'메모<1>'},{ym:'2026-10',platform:'Codex(OpenAI)',amount_krw:0,note:null}];
const BILLING_HIST=[{ym:'2026-10',amount_krw:30000},{ym:'2026-09',amount_krw:55000},{ym:'2026-08',amount_krw:10000}];
const BILLING_EVENTS=[{platform:'Claude',amount_krw:15000,source:'macrodroid',note:'n',raw_text:'결제 문자 원문 "1"',received_at:'2026-10-01T01:00:00Z'},{platform:' codex(openai) ',amount_krw:5000,source:'m',note:'메모만',raw_text:'',received_at:null},{platform:'naver_ads',amount_krw:100000,source:'m',note:'NAVER_AD_LOW_BALANCE',raw_text:'x',received_at:'2026-10-01T01:00:00Z'}];
const OWNER_BOARD_ROWS=[{slug:'busd_ledger',sha256:'a',synced_at:'2026-09-30T01:02:00Z'},{slug:'pin_board',sha256:'b',synced_at:null}];
const PAY_ITEMS={base_pay:3000000,meal_allow:200000,fixed_ot:100000,fixed_annual:50000,extra_ot_pay:30000,gross_total:3380000,income_tax:100000,local_tax:10000,pension:135000,health_ins:100000,ltc_ins:13140,employment_ins:30420,prepaid_deduct:5000,deduct_total:393560,net_pay:2986440,ins_adjust:100};
const PAY_ROW_SAVED={id:1,month:'2026-10',user_id:'u1',items:PAY_ITEMS,net:2986440};
const WAGES=[{user_id:'u1',wage_type:'hourly',base_wage:15000,normal_hours:209,fixed_bonus:0,housing_support:100000,effective_from:'2026-09-01',memo:'메모<w>'}];

function tablesDefault(){
  return {
    consultation_inbox:{list:[{id:1,source:'kakao',received_at:'2026-10-01T01:00:00Z',sender_name:'홍<길동>',message:'문의 내용',status:'new'},{id:2,source:'phone',received_at:null,sender_name:'',message:'',status:'closed'}],count:2},
    v_leave_balance:{single:{balance:7.5}},
    payslips:{list:[{id:1,month:'2026-09',html:'<p>x</p>'},{id:2,month:'2026-08',html:'<p>y</p>'}]},
    onboarding_items:{list:[{id:1,label:'a',active:true},{id:2,label:'b',active:true}]},
    onboarding_checks:{list:[{item_id:1,status:'제출'}]},
    deposits:{list:[{id:2,bank_dt:'2026-10-01T01:00:00Z',amount:50000,payer_raw:'홍길동',is_card:false,account_tail:'1234'},{id:1,bank_dt:'2026-09-30T05:00:00Z',amount:12000,payer_raw:'카드사<x>',is_card:true,account_tail:'5678'}]},
    confidential_records:{list:[{id:1,patient_name:'환자<A>',chart_no:'C-1',body:'내용\n줄',owner_only:true,created_at:'2026-09-30T01:00:00Z',author:'정원장'},{id:2,patient_name:'환자B',chart_no:'',body:'b',owner_only:false,created_at:'2026-09-29T01:00:00Z',author:''}]},
    ai_billing:{list:BILLING},ai_billing_events:{list:BILLING_EVENTS},ai_model_usage_daily:{list:USAGE_ROWS},
    ai_usage_snapshots:{list:[{kind:'platform_cost',payload:SNAP_COST,synced_at:'x'},{kind:'external_ai',payload:SNAP_EXT,synced_at:'x'},{kind:'codex_sessions',payload:SNAP_SESS,synced_at:'x'}]},
    marketing_expense_events:{list:MKT_EVENTS},marketing_month_budgets:{single:{month:'2026-10-01',amount_krw:100000}},marketing_merchant_rules:{list:MKT_RULES},marketing_foreign_charge_links:{list:MKT_LINKS},
    owner_boards:{list:OWNER_BOARD_ROWS,single:{html:'<html><head></head><body>판</body></html>',synced_at:'2026-09-30T01:02:00Z'}},
    wage_info:{list:WAGES},
    payroll_rows:{list:[{id:1,user_id:'u1'}],single:PAY_ROW_SAVED},payroll_row_archive:{list:[{archive_id:1,archived_at:'2026-10-01T00:00:00+00:00'}]},
    payroll_uploads:{list:[{id:'up1',file_name:'급여<대장>.xlsx',size_bytes:10,sha256:'abc',uploaded_at:'2026-10-01T01:00:00Z',storage_path:'a/b.xlsx'}],single:{file_name:'f.xlsx',storage_path:'a/b.xlsx',sha256:'abc'}},
    attendance:{list:[{work_date:'2026-10-01',source:'fp',clock_in:'10:00',clock_out:'19:00',overtime_min:30,evening:false,is_holiday:false}]},
    attendance_manual_entries:{list:[]},attendance_issue_resolutions:{list:[]},
    app_settings:{list:[]}
  };
}
function makeSb(over,rec){
  const o=over||{};
  const rpcCalls=[],stor=[],fn=[],limits=[];
  const tables=Object.assign(tablesDefault(),o.tables||{});
  const sb={
    from(t){return chain(tables[t]||{list:[],single:null},rec,t,limits);},
    rpc(name,args){rpcCalls.push([name,args]);if(name==='payroll_save_month')return Promise.resolve({data:3,error:tables.payroll_rows.error||null});const r=(o.rpc||{})[name];return Promise.resolve(r!==undefined?(typeof r==='function'?r(args):r):{data:3,error:null});},
    storage:{from(b){return {upload(p){stor.push(['upload',b,String(p).replace(/[0-9a-f-]{36}/,'UUID')]);return Promise.resolve({error:(o.storage&&o.storage.upload)||null});},download(p){stor.push(['download',b,p]);return Promise.resolve((o.storage&&o.storage.download)||{data:null,error:{message:'없음<파일>'}});}};}},
    functions:{invoke(name,args){fn.push([name,JSON.parse(JSON.stringify(args))]);return Promise.resolve({data:{ok:true,message:'삭제함'},error:null});}}
  };
  sb.rpcCalls=rpcCalls;sb.stor=stor;sb.fn=fn;sb.limits=limits;
  return sb;
}

async function renderAll(html,opts){
  const o=opts||{};
  const text=lf(html);
  const timeSrc=(text.match(/\/\* hub-time:test-start \*\/[\s\S]*?\/\* hub-time:test-end \*\//)||[''])[0]; /* 허브 시간 표시 공통 함수(이 작업 이후의 hr.html에만 있음 — 없으면 빈 글) */
  const out={};
  const hubTLine=text.match(/function hubT\(k,d,v\)\{[^\n]*\}/)[0];
  const hubNLine=text.match(/function hubN\(k,d\)\{[^\n]*\}/)[0];
  const hubTELine=(text.match(/function hubTE\(k,d,v\)\{[^\n]*\}/)||[''])[0];
  const homeSrc=region(text,'/* ── 홈 ── */','/* ── 출퇴근 ── */');
  const confSrc=region(text,'/* ── 진료기록(구 케이스노트) ── */','/* ── 상담일지: 원본');
  const aiPaySrc=region(text,'/* ── AI 실제 청구액 ── */','/* ── 원장 ── */');
  const ownerSrc=region(text,'/* ── 원장 ── */','/* ── 로그인 ── */');
  const jgSrc=region(text,'const EMPLOYEE_JOB_GROUPS = [','function schedulePersonName');
  const contractStatusSrc=region(text,'function contractIsRejected(row){','\nfunction mergeContractHtml');
  const helperSrc=['stampDate','appStamp','formatLeaveTimestamp','formatLeaveMonth','attendanceMonthBounds'].map(n=>fnSrc(text,n)).join('\n');
  const setStatusSrc=region(text,'function setStatus(k){','function show(id)');
  const payReqSrc=fnSrc(text,'paymentRequestCard');
  const prevEmpSrc=text.includes('function empdocPreviewFill')?fnSrc(text,'empdocPreviewFill')+'\n'+fnSrc(text,'previewEmployeeContract'):fnSrc(text,'previewEmployeeContract');
  const docCardSrc=(text.includes('function approvalStatusLabel')?fnSrc(text,'approvalStatusLabel')+'\n':'')+fnSrc(text,'docCard');
  const hubJs=o.engine?lf(fs.readFileSync(path.join(__dirname,'..','..','hub-texts.js'),'utf8')):null;

  async function makeCtx(extra,sbOver){
    const dom=makeDom(),log=[],statuses=[],rec=[];
    const doc={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){},createElement:()=>({click(){}}),body:{classList:{add(){},remove(){}}}};
    const ctx={console,esc,$:dom.$,Date:FakeDate,Intl,Promise,Math,JSON,Set,Map,Number,String,Array,Object,parseInt,parseFloat,isNaN,RegExp,Blob,URL,FileReader:function(){},XLSX:{},crypto:{randomUUID:()=>'00000000-0000-4000-8000-000000000000'},
      PROFILES:PROFILES.map(p=>Object.assign({},p)),SCHEDULE_PEOPLE:PEOPLE.map(p=>Object.assign({},p)),
      ME:Object.assign({},ROLE_ME.owner),
      today:()=>'2026-10-01',md:s=>s?String(s).slice(5).replace('-','/'):'',
      nameOf:uid=>{const p=PROFILES.find(x=>x.user_id===uid);return p?p.name:(uid||'').slice(0,6);},
      canViewDeposit:me=>me?.role==='owner'||me?.role==='chief'||me?.department==='데스크',
      homeInboxCardEligible:me=>me.role==='owner'||['chief','manager'].includes(me.role)||me.department==='데스크',
      homeInboxRecentRows:rows=>(rows||[]).map(r=>({receivedAt:r.received_at,source:r.source==='kakao'?'카카오':'전화',name:r.sender_name||'이름 없음',message:r.message||'',status:r.status})),
      homeInboxRecentGroups:rows=>(ctx.homeInboxRecentRows(rows)||[]).map(row=>({...row,count:1,items:[]})),
      homeInboxRecentLine:(row,showCount)=>{const status=ctx.inboxStatusInfo(row.status);return `${ctx.esc(ctx.hubFmtWhen(row.receivedAt)||ctx.hubT('home.inbox_unknown','미상'))} · ${ctx.esc(row.source)} · ${ctx.esc(row.name)} · <span class="b ${status.className}">${ctx.esc(status.label)}</span>${row.message?` · ${ctx.esc(row.message)}`:''}${showCount&&row.count>1?` ${ctx.esc(ctx.hubT('inbox.group_count','({n}건)',{n:row.count}))}`:''}`;},
      homeInboxRecentDetailLine:item=>{const status=ctx.inboxStatusInfo(item.status);return `<div class="hint" style="padding:5px 0;border-top:1px dashed var(--line)">${ctx.esc(ctx.hubFmtWhen(item.receivedAt)||ctx.hubT('home.inbox_unknown','미상'))} · <span class="b ${status.className}">${ctx.esc(status.label)}</span>${item.message?` · ${ctx.esc(item.message)}`:''}</div>`;},
      inboxStatusInfo:s=>({className:s==='new'?'wait':'ok',label:s==='new'?'NEW(미처리)':'종결'}),
      canManageConsultation:()=>ctx.ME.role!=='staff',
      onboardingGuideVisibleForRole:r=>['staff','manager','chief','owner'].includes(r),onboardingGuideCard:()=>'<GUIDE/>',
      paymentRequestStatusLabel:s=>s,paymentRequestCanAct:(r,role)=>role==='owner',contractPreviewHtml:r=>String(r&&r.merged_html||''),
      approvalKindDisplay:d=>d.kind,
      setStatus:s=>statuses.push(s),render:()=>{log.push('render');},go:t=>log.push('go:'+t),refreshBadges:async()=>{log.push('badges');},
      show:id=>log.push('show:'+id),hide:id=>log.push('hide:'+id),
      alert:m=>log.push('alert:'+m),confirm:m=>{log.push('confirm:'+m);return ctx.__confirm!==false;},prompt:m=>{log.push('prompt:'+m);return ctx.__prompt===undefined?null:ctx.__prompt;},
      showScheduleRosterError:m=>log.push('rosterErr:'+m),loadProfiles:async()=>{log.push('loadProfiles');},loadSchedulePeople:async()=>{log.push('loadPeople');},
      contractPdfHash:async()=>'abc',openPayslipHtml:()=>{},
      setTimeout:(f)=>{if(typeof f==='function')log.push('timeout');return 0;},clearTimeout:()=>0,
      INBOX_FIRST_EXTRA_IDS:[],
      sb:makeSb(sbOver,rec)};
    ctx.document=Object.assign(doc,(extra&&extra.document)||{});
    ctx.window=Object.assign(ctx,{open:()=>log.push('open')});
    Object.assign(ctx,extra||{});
    if(extra&&extra.document)ctx.document=Object.assign(doc,extra.document);
    vm.createContext(ctx);
    if(o.shim){
      const m=text.match(/if\(typeof window\.hubText!=='function'\)\{[\s\S]*?\n\}/);
      if(m)vm.runInContext(m[0],ctx);
    }
    if(hubJs){
      vm.runInContext(hubJs,ctx);
      ctx.HubUi.setSettings(Object.assign({},o.settings||{}));
      if(o.textRows||o.loadFail){
        await ctx.HubUi.load({from(){const api={select(){return api;},then(res,rej){return Promise.resolve(o.loadFail?{data:null,error:{message:'x'}}:{data:o.textRows,error:null}).then(res,rej);}};return api;}});
      }
    }
    if(text.includes('payrollParseMain(aoa)')){vm.runInContext(fs.readFileSync(path.join(__dirname,'../../payroll-bonus.js'),'utf8').split('function bonusT(')[0].replace("if(typeof globalThis!=='undefined')globalThis.HUB_BONUS_CATALOG=true;",'')+fs.readFileSync(path.join(__dirname,'../../payroll-ledger-extra.js'),'utf8'),ctx);}
    vm.runInContext('let BADGE={notice:2};let MY_PAYSLIPS=[];let DEP_RANGE="month";let PAY_VIEW="ledger",PAY_MONTH="",PAY_ROWS=[],PAY_COLUMNS=[],PAY_MESSAGE="",PAY_WAGE_LATEST={},PAY_SOURCE_FILE=null,PAY_SAVING=false,PAY_BUSY="",PAY_READ_ID=0;let PAY_SLIP_USER="",PAY_SLIP_HTML="";let SETTINGS={};let PAYMENT_RECEIPT_PREVIEWS=[];let EMPLOYEE_CONTRACT_PREVIEWS={};let CONTRACT_SHOW_CANCELLED=false;\n'
      +hubTLine+'\n'+hubNLine+'\n'+hubTELine+'\n'+timeSrc+'\n'+helperSrc+'\n'+setStatusSrc+'\n'
      +homeSrc+'\n'+confSrc+'\n'+aiPaySrc+'\n'+ownerSrc+'\n'+jgSrc+'\n'+contractStatusSrc+'\n'+payReqSrc+'\n'+prevEmpSrc+'\n'+docCardSrc+'\n'
      +';this.api={renderHome,renderDeposit,renderConfid,filterConfid,submitConfidRecord,aiUsagePanelHtml,aiCostSectionHtml,aiExternalSectionHtml,aiSessionSectionHtml,aiUsageSummary,aiUsageWindow,'
      +'ownerBoardsPanelHtml,renderOwnerBoards,openOwnerBoard,renderAicost,saveAicost,saveMarketingBudget,renderMarketingExpensePanel,marketingCategoryOptions,'
      +'payTop,renderPay,renderPayWages,saveWageInfo,setPayMonth,addPayRow,buildPayrollPreview,parsePayrollXls,renderPayLedger,savePayrollRows,uploadPayrollOriginal,downloadPayrollOriginal,movePayrollMonth,archivePayrollMonth,restorePayrollMonth,'
      +'buildPayslipHtml,payslipStatusBadge,payslipCrossCheck,renderPaySlip,issuePayslip,'
      +'disableEmployeeAccountPreserveRecords,hardDeleteAccountPreserveRecords,revokeApproval,'
      +'renderJobGroupAdmin,previewEmployeeJobGroup,saveEmployeeJobGroupPreview,toggleJobGroupPerson,'
      +'contractDisplayStatus,paymentRequestCard,previewEmployeeContract,docCard,setStatus,'
      +'set:(k,v)=>{if(k==="AICOST_MONTH")AICOST_MONTH=v;if(k==="PAY_VIEW")PAY_VIEW=v;if(k==="PAY_MONTH")PAY_MONTH=v;if(k==="PAY_ROWS")PAY_ROWS=v;if(k==="PAY_COLUMNS")PAY_COLUMNS=v;if(k==="PAY_MESSAGE")PAY_MESSAGE=v;if(k==="PAY_SOURCE_FILE")PAY_SOURCE_FILE=v;if(k==="PAY_SLIP_USER")PAY_SLIP_USER=v;if(k==="PAY_SLIP_HTML")PAY_SLIP_HTML=v;if(k==="DEP_RANGE")DEP_RANGE=v;if(k==="MY_PAYSLIPS")MY_PAYSLIPS=v;if(k==="PAYMENT_RECEIPT_PREVIEWS")PAYMENT_RECEIPT_PREVIEWS=v;if(k==="EMPLOYEE_CONTRACT_PREVIEWS")EMPLOYEE_CONTRACT_PREVIEWS=v;if(k==="BADGE")BADGE=v;},'
      +'get:k=>({PAY_MESSAGE:PAY_MESSAGE,PAY_SLIP_HTML:PAY_SLIP_HTML,PAY_ROWS:PAY_ROWS,PAY_COLUMNS:PAY_COLUMNS,PAY_MONTH:PAY_MONTH,PAY_VIEW:PAY_VIEW,SETTINGS:SETTINGS,AICOST_MONTH:AICOST_MONTH,PAY_WAGE_LATEST:PAY_WAGE_LATEST})[k]};',ctx);
    return {ctx,dom,log,statuses,rec,api:ctx.api};
  }
  const flush=()=>new Promise(res=>setImmediate(res));
  const asRole=async(role,extra,sbOver)=>{const r=await makeCtx(extra,sbOver);r.ctx.ME=Object.assign({},ROLE_ME[role]);return r;};
  const err=m=>({error:{message:m}});
  const jj=x=>JSON.stringify(x);
  if(o.probe)return {makeCtx,asRole,flush,makeDom,chain,makeSb,text,err,jj};
  const snap=(r,m)=>jj([m?m.innerHTML:null,r.dom.hist.filter(h=>h[0]!=='#main').map(h=>h.join('|')),r.log,r.statuses,r.rec]);

  /* ───────── 홈 ───────── */
  const homeCases=[
    ['staff','staff',null,null],['staff_nopay','staff',{MY_PAYSLIPS:[]},{tables:{payslips:{list:[]},onboarding_checks:{list:[{item_id:1,status:'제출'},{item_id:2,status:'확인'}]}}}],
    ['manager','manager',null,null],['owner','owner',null,null],['desk','desk',null,null],
    ['inbox_error','manager',null,{tables:{consultation_inbox:{error:{message:'x'}}}}],
    ['inbox_empty','manager',null,{tables:{consultation_inbox:{list:[],count:0}}}],
    ['no_balance','manager',null,{tables:{v_leave_balance:{single:null}}}]
  ];
  for(const [name,role,state,sbOver] of homeCases){
    const r=await asRole(role,null,sbOver);
    const m={innerHTML:''};await r.api.renderHome(m);await flush();
    out['home.'+name]=snap(r,m);
  }
  /* ───────── 입금 ───────── */
  for(const [name,role,range,sbOver] of [['no_access','staff','month',null],['owner_month','owner','month',null],['owner_today','owner','today',null],['chief_week','chief','week',null],['desk','desk','month',null],['empty','owner','month',{tables:{deposits:{list:[]}}}]]){
    const r=await asRole(role,null,sbOver);
    r.api.set('DEP_RANGE',range);r.ctx.TAB='deposit';
    const m={innerHTML:''};await r.api.renderDeposit(m);await flush();
    out['dep.'+name]=snap(r,m);
  }
  /* ───────── 진료기록 ───────── */
  for(const [name,role,sbOver,q] of [['owner','owner',null,''],['staff','staff',null,''],['search','owner',null,'환자<a'],['search_none','owner',null,'zzz'],['empty','owner',{tables:{confidential_records:{list:[]}}},''],['error','owner',{tables:{confidential_records:{error:{message:'x'}}}},'']]){
    const d=makeDom();
    const r=await asRole(role,{$:d.$},sbOver);
    const m={innerHTML:''};d.$('#main').innerHTML='';
    await r.api.renderConfid(m);await flush();
    if(q){d.$('#cfQ').value=q;r.api.filterConfid();}
    out['conf.'+name]=jj([m.innerHTML,d.hist.map(h=>h.join('|')),r.log]);
  }
  for(const [name,vals,sbOver] of [['missing',{n:'',b:''},null],['fail',{n:'환자',b:'내용'},{tables:{confidential_records:{error:{message:'권한<없음>'}}}}],['ok',{n:'환자',b:'내용',c:'C1'},null]]){
    const d=makeDom();
    const r=await asRole('owner',{$:d.$},sbOver);
    d.$('#cfName').value=vals.n;d.$('#cfBody').value=vals.b;d.$('#cfChart').value=vals.c||'';
    await r.api.submitConfidRecord();await flush();
    out['conf.submit_'+name]=jj([d.hist.map(h=>h.join('|')),r.log,r.statuses,r.rec]);
  }
  /* ───────── 상태 글 ───────── */
  {
    const d=makeDom();const r=await asRole('owner',{$:d.$});
    const el=d.$('#saveTag');
    const seen=[];
    for(const k of ['saving','saved','error','idle','']){r.api.setStatus(k);seen.push(el.textContent);}
    out['status.tag']=jj(seen);
  }
  /* ───────── AI비용 · 마케팅비 · 사용량 ───────── */
  const aicostCases=[
    ['full','owner',null,null],['nonowner','staff',null,null],
    ['err_billing','owner',null,{tables:{ai_billing:{error:{message:'청구<오류>'}}}}],
    ['err_history','owner',null,{tables:{ai_billing_events:{error:{message:'이벤트오류'}}}}],
    ['usage_err_snap_err','owner',null,{tables:{ai_model_usage_daily:{error:{message:'사용량오류'}},ai_usage_snapshots:{error:{message:'스냅샷<오류>'}}}}],
    ['nosnap_empty','owner',null,{tables:{ai_billing:{list:[]},ai_billing_events:{list:[]},ai_model_usage_daily:{list:[]},ai_usage_snapshots:{list:[]},marketing_expense_events:{list:[]},marketing_month_budgets:{single:null},marketing_merchant_rules:{list:[]}}}],
    ['mkt_err','owner',null,{tables:{marketing_expense_events:{error:{message:'x'}}}}],
    ['mkt_zero_budget','owner',null,{tables:{marketing_month_budgets:{single:{month:'2026-10-01',amount_krw:0}}}}],
    ['mkt_nobudget','owner',null,{tables:{marketing_month_budgets:{single:null}}}],
    ['snap_odd','owner',null,{tables:{ai_usage_snapshots:{list:[{kind:'platform_cost',payload:{agents:null},synced_at:'x'},{kind:'external_ai',payload:{days:{}},synced_at:'x'},{kind:'codex_sessions',payload:{generated:'g',flagged:[]},synced_at:'x'}]}}}]
  ];
  for(const [name,role,state,sbOver] of aicostCases){
    const r=await asRole(role,null,sbOver);
    const m={innerHTML:''};await r.api.renderAicost(m);await flush();
    out['aicost.'+name]=snap(r,m);
  }
  {
    const r=await asRole('owner');
    // 순수 구역들
    const win=r.api.aiUsageWindow('2026-10-01',7);
    const sum=r.api.aiUsageSummary(USAGE_ROWS,win.start,win.end);
    const empty=r.api.aiUsageSummary([],win.start,win.end);
    const noAstra=r.api.aiUsageSummary([USAGE_ROWS[0]],win.start,win.end);
    const P=(a)=>r.api.aiUsagePanelHtml(Object.assign({start:win.start,end:win.end,error:''},a));
    out['aiu.panels']=jj([
      P({summary:sum,cost:SNAP_COST,external:SNAP_EXT,sessions:SNAP_SESS}),P({summary:empty}),P({summary:noAstra,cost:null,external:null,sessions:null}),
      P({summary:null,error:'사용량<e>',costError:'비용e',externalError:'외부e',sessionsError:'점검e'}),
      P({summary:sum,cost:{agents:null},external:{totals:{},days:{}},sessions:{generated:'g',flagged:[]}}),
      P({summary:sum,cost:SNAP_COST,external:{generated:'g',fx:1500,totals:{deepseek:{calls:1,ok:1,fail:0,costed_calls:1,krw:5}},days:{'2026-10-01':{deepseek:{calls:1,ok:1,fail:0,costed_calls:1,krw:5}}}},sessions:null})
    ]);
    out['aiu.sections']=jj([r.api.aiCostSectionHtml({cost:null,error:'e'}),r.api.aiExternalSectionHtml({external:null,error:''}),r.api.aiSessionSectionHtml({sessions:null,error:''}),r.api.aiSessionSectionHtml({sessions:SNAP_SESS,error:''})]);
    out['mkt.options']=jj([r.api.marketingCategoryOptions('google'),r.api.marketingCategoryOptions('',true),r.api.marketingCategoryOptions(null)]);
    // 원장 보기판
    out['ob.panel']=jj([r.api.ownerBoardsPanelHtml(OWNER_BOARD_ROWS,null),r.api.ownerBoardsPanelHtml([],null),r.api.ownerBoardsPanelHtml([],{code:'42P01'}),r.api.ownerBoardsPanelHtml([],{message:'오류<x>'}),r.api.ownerBoardsPanelHtml([],{}),r.api.ownerBoardsPanelHtml(null,{status:404})]);
  }
  for(const [name,role,sbOver] of [['nonowner','staff',null],['owner','owner',null],['owner_missing','owner',{tables:{owner_boards:{error:{code:'42P01'},list:[]}}}],['owner_err','owner',{tables:{owner_boards:{error:{message:'목록<오류>'}}}}]]){
    const r=await asRole(role,null,sbOver);
    const m={innerHTML:''};await r.api.renderOwnerBoards(m);await flush();
    out['ob.render.'+name]=snap(r,m);
  }
  for(const [name,role,slug,sbOver] of [['nonowner','staff','busd_ledger',null],['unknown_slug','owner','nope',null],['ok_busd','owner','busd_ledger',null],['ok_pin_nosynced','owner','pin_board',{tables:{owner_boards:{single:{html:'<p>x</p>',synced_at:null}}}}],['ok_word','owner','wordbook',null],['missing','owner','wordbook',{tables:{owner_boards:{error:{code:'42P01',status:404},single:null}}}],['absent','owner','pin_board',{tables:{owner_boards:{single:null}}}],['err','owner','busd_ledger',{tables:{owner_boards:{error:{message:'판<오류>'},single:null}}}],['err_nomsg','owner','busd_ledger',{tables:{owner_boards:{error:{},single:null}}}]]){
    const viewer={innerHTML:'',hidden:true,hist:[],replaceChildren(){},querySelector(){return {appendChild(f){viewer.frame=f;}};}};
    const attrs={};
    const documentX={getElementById:id=>id==='ownerBoardViewer'?viewer:null,createElement:()=>({setAttribute(k,v){attrs[k]=v;},style:{}})};
    const r=await asRole(role,{document:documentX},sbOver);
    const hist=[];
    Object.defineProperty(viewer,'innerHTML',{get(){return this._h||'';},set(v){this._h=v;hist.push(v);}});
    await r.api.openOwnerBoard(slug);await flush();
    out['ob.open.'+name]=jj([hist,attrs,viewer.hidden,r.log]);
  }
  {
    const r=await asRole('staff');out['mkt.panel_staff']=await r.api.renderMarketingExpensePanel();
    const r2=await asRole('owner');r2.api.set('AICOST_MONTH','2026-10');const f0=r2.ctx.sb.from;r2.ctx.sb.from=function(t){if(t==='marketing_expense_events')throw new Error('연결<오류>');return f0(t);};out['mkt.panel_throw']=await r2.api.renderMarketingExpensePanel();
    const r3=await asRole('owner');r3.api.set('AICOST_MONTH','2026-10');out['mkt.panel_ok']=await r3.api.renderMarketingExpensePanel();
  }
  for(const [name,fnName,args,role,sbOver,state] of [
    ['budget_bad','saveMarketingBudget',[],'owner',null,{budget:'-5'}],['budget_ok','saveMarketingBudget',[],'owner',null,{budget:'1000'}],['budget_dberr','saveMarketingBudget',[],'owner',{tables:{marketing_month_budgets:{error:{message:'x'}}}},{budget:'1000'}],
    ['aicost_fail','saveAicost',[0],'owner',{tables:{ai_billing:{error:{message:'저장<오류>'}}}},null],['aicost_ok','saveAicost',[1],'owner',null,null]
  ]){
    const d=makeDom();
    const r=await asRole(role,{$:d.$},sbOver);
    r.api.set('AICOST_MONTH','2026-10');
    if(state&&state.budget!==undefined)d.$('#marketingBudget').value=state.budget;
    d.$('#aiAmount-0').value='5000';d.$('#aiNote-0').value='';d.$('#aiAmount-1').value='7';d.$('#aiNote-1').value='n';
    await r.api[fnName](...args);await flush();
    out['aicost.act.'+name]=jj([r.log,r.statuses,r.rec]);
  }
  /* ───────── 급여 ───────── */
  {
    const r=await asRole('owner');
    r.ctx.FileReader=function(){this.readAsArrayBuffer=function(){this.onload({target:{result:new ArrayBuffer(1)}});};};
    r.ctx.XLSX={read(){throw new Error('엑셀<오류>');}};
    r.api.parsePayrollXls({target:{files:[{name:'a.xlsx'}]}});await flush();
    out['pay.parse_fail']=jj([r.api.get('PAY_MESSAGE'),r.log]);
  }
  for(const [name,view] of [['ledger','ledger'],['wage','wage'],['payslip','payslip']]){
    const r=await asRole('owner');r.api.set('PAY_VIEW',view);
    out['pay.top.'+name]=r.api.payTop();
  }
  {
    const r=await asRole('staff');const m={innerHTML:''};await r.api.renderPay(m);out['pay.nonowner']=m.innerHTML;
  }
  for(const [name,sbOver,msg] of [['wage_ok',null,''],['wage_msg',null,'안내<글>'],['wage_err',{tables:{wage_info:{error:{message:'시급<오류>'}}}},''],['wage_empty',{tables:{wage_info:{list:[]}}},'']]){
    const r=await asRole('owner',null,sbOver);r.api.set('PAY_VIEW','wage');r.api.set('PAY_MESSAGE',msg);
    const m={innerHTML:''};await r.api.renderPay(m);await flush();
    out['pay.'+name]=snap(r,m);
  }
  for(const [name,sbOver,vals] of [['nodate',null,''],['dberr',{tables:{wage_info:{error:{message:'저장<오류>'}}}},'2026-10-01'],['ok',null,'2026-10-01']]){
    const d=makeDom();const r=await asRole('owner',{$:d.$},sbOver);
    r.api.set('PAY_WAGE_LATEST',{});
    d.$('#pw-from-u1').value=vals;d.$('#pw-type-u1').value='monthly';d.$('#pw-base-u1').value='2000000';d.$('#pw-hours-u1').value='209';d.$('#pw-bonus-u1').value='0';d.$('#pw-housing-u1').value='0';d.$('#pw-memo-u1').value='';
    await r.api.saveWageInfo('u1');await flush();
    out['pay.savewage.'+name]=jj([r.api.get('PAY_MESSAGE'),r.log,r.statuses,r.rec]);
  }
  {
    const r=await asRole('owner');r.api.set('PAY_MONTH','2026-09');r.api.setPayMonth('2026-10');out['pay.setmonth']=jj([r.api.get('PAY_MESSAGE'),r.log]);
    const r2=await asRole('owner');r2.api.addPayRow();out['pay.addrow']=jj([r2.api.get('PAY_MESSAGE'),r2.api.get('PAY_COLUMNS')]);
  }
  for(const [name,aoa,sbOver] of [['no_base',[['a','b']],null],['no_name',[['기본급','식대']],null],
      ['ok',[['성명','기본급','식대','지급액계','공제액계','차인지급액'],['김직원',3000000,200000,3200000,100000,3100000],['없는사람',1,2,3,4,5]],null],
      ['mapfail',[['성명','기본급','차인지급액'],['김직원',1,2]],{tables:{app_settings:{error:{message:'매핑<오류>'}}}}]]){
    const r=await asRole('owner',null,sbOver);
    const res=await r.api.buildPayrollPreview(aoa,{month:r.api.get('PAY_MONTH'),id:0});await flush();
    out['pay.preview.'+name]=jj([res,r.api.get('PAY_MESSAGE'),r.statuses,r.log]);
  }
  for(const [name,state,sbOver] of [['empty',{},null],['rows',{rows:true,file:true,msg:'메시지<m>'},null],['upload_err',{rows:true},{tables:{payroll_uploads:{error:{message:'목록<오류>'},list:[]}}}],['no_saved',{},{tables:{payroll_rows:{list:[]},payroll_row_archive:{list:[]},payroll_uploads:{list:[]}}}]]){
    const r=await asRole('owner',null,sbOver);
    r.api.set('PAY_MONTH','2026-10');
    if(state.rows){r.api.set('PAY_COLUMNS',[{key:'base_pay',label:'기본급'},{key:'net_pay',label:'차인지급액'}]);r.api.set('PAY_ROWS',[{user_id:'u1',name:'김직원',items:{base_pay:1,net_pay:2},manual:false},{user_id:'',name:'',items:{},manual:true}]);}
    if(state.file)r.api.set('PAY_SOURCE_FILE',{name:'원본<f>.xlsx'});
    if(state.msg)r.api.set('PAY_MESSAGE',state.msg);
    const m={innerHTML:''};await r.api.renderPayLedger(m);await flush();
    out['pay.ledger.'+name]=snap(r,m);
  }
  for(const [name,state,sbOver] of [['nomonth',{month:''},null],['norows',{rows:[]},null],['dberr',{rows:[{user_id:'u1',items:{net_pay:1}},{user_id:'u1',items:{}}]},{tables:{payroll_rows:{error:{message:'저장<오류>'}}}}],
      ['ok',{rows:[{user_id:'u1',items:{net_pay:1}},{user_id:'',items:{}}]},null],
      ['ok_src',{rows:[{user_id:'u1',items:{net_pay:1}}],file:{name:'a.xlsx',size:100,type:'x',arrayBuffer:async()=>new ArrayBuffer(4)}},null],
      ['src_fail',{rows:[{user_id:'u1',items:{net_pay:1}}],file:{name:'a.txt',size:100,type:'x',arrayBuffer:async()=>new ArrayBuffer(4)}},null]]){
    const r=await asRole('owner',null,sbOver);
    r.api.set('PAY_MONTH',state.month===undefined?'2026-10':state.month);
    if(state.rows)r.api.set('PAY_ROWS',state.rows);
    if(state.file)r.api.set('PAY_SOURCE_FILE',state.file);
    await r.api.savePayrollRows();await flush();
    out['pay.saverows.'+name]=jj([r.api.get('PAY_MESSAGE'),r.log,r.statuses,r.rec,r.ctx.sb.stor,r.ctx.sb.rpcCalls]);
  }
  for(const [name,file,sbOver] of [['bad_ext',{name:'a.txt',size:5,type:'t',arrayBuffer:async()=>new ArrayBuffer(1)},null],['too_big',{name:'a.xlsx',size:20971521,type:'t',arrayBuffer:async()=>new ArrayBuffer(1)},null],['record_fail',{name:'a.xlsx',size:5,type:'t',arrayBuffer:async()=>new ArrayBuffer(1)},{tables:{payroll_uploads:{error:{message:'등록<오류>'}}}}]]){
    const r=await asRole('owner',null,sbOver);
    let msg='ok';try{await r.api.uploadPayrollOriginal(file,'2026-10');}catch(e){msg=e.message;}
    out['pay.upload.'+name]=jj([msg,r.rec]);
  }
  for(const [name,sbOver,dl] of [['norecord',{tables:{payroll_uploads:{single:null}}},null],['dlfail',null,{data:null,error:{message:'받기<오류>'}}],['hashmismatch',null,{data:{arrayBuffer:async()=>new ArrayBuffer(1)},error:null}]]){
    const r=await asRole('owner',null,Object.assign({},sbOver||{},dl?{storage:{download:dl}}:{}));
    r.ctx.contractPdfHash=async()=>'zzz';
    await r.api.downloadPayrollOriginal('up1');await flush();
    out['pay.download.'+name]=jj([r.log,r.ctx.sb.stor]);
  }
  for(const [name,fnName,confirmAns,rpc,month,target] of [
    ['move_nopick','movePayrollMonth',true,null,'2026-10',''],['move_cancel','movePayrollMonth',false,null,'2026-10','2026-11'],['move_fail','movePayrollMonth',true,{payroll_move_month:{data:null,error:{message:'옮김<오류>'}}},'2026-10','2026-11'],['move_ok','movePayrollMonth',true,null,'2026-10','2026-11'],
    ['archive_cancel','archivePayrollMonth',false,null,'2026-10',''],['archive_fail','archivePayrollMonth',true,{payroll_archive_month:{data:null,error:{message:'삭제<오류>'}}},'2026-10',''],['archive_ok','archivePayrollMonth',true,null,'2026-10',''],
    ['restore_fail','restorePayrollMonth',true,{payroll_restore_month:{data:null,error:{message:'복구<오류>'}}},'2026-10',''],['restore_ok','restorePayrollMonth',true,null,'2026-10','']
  ]){
    const d=makeDom();const r=await asRole('owner',{$:d.$},rpc?{rpc}:null);
    r.ctx.__confirm=confirmAns;r.api.set('PAY_MONTH',month);d.$('#payMoveMonth').value=target;
    await r.api[fnName]();await flush();
    out['pay.month.'+name]=jj([r.api.get('PAY_MESSAGE'),r.log,r.statuses,r.ctx.sb.rpcCalls]);
  }
  {
    const r=await asRole('owner');
    const base={employee:{name:'김<직원>',dept:'진료실'},month:'2026-10',items:PAY_ITEMS,net:2986440,crossCheck:r.api.payslipCrossCheck(PAY_ITEMS),workSummary:{workedDays:3,totalWorkMinutes:1500,overtimeMinutes:90,nightMinutes:30,holidayMinutes:60}};
    out['slip.html']=jj([r.api.buildPayslipHtml(base),r.api.buildPayslipHtml(Object.assign({},base,{issued:true,issuedBy:'정원장',issuedAt:'2026-10-01T01:00:00Z'})),r.api.buildPayslipHtml({employee:{name:'x'},month:'m',items:{},net:5})]);
    const chk=r.api.payslipCrossCheck({gross_total:3380000,meal_allow:200000,income_tax:100000,health_ins:1,ltc_ins:null,employment_ins:30420,local_tax:10000,pension:5});
    out['slip.badges']=jj(chk.map(row=>r.api.payslipStatusBadge(row)).concat([r.api.payslipStatusBadge(null)]));
  }
  for(const [name,sbOver,state] of [['ok',null,{}],['nostaff',null,{noStaff:true}],['norow',{tables:{payroll_rows:{single:null}}},{}],['atterr',{tables:{attendance:{error:{message:'근태<오류>'}}}},{}],['issued',{tables:{payslips:{single:{issued:true,issued_by:'정원장',issued_at:'2026-10-01T01:00:00Z'}}}},{}],['msg',null,{msg:'안내<m>'}]]){
    const r=await asRole('owner',null,sbOver);
    if(state.noStaff)r.ctx.PROFILES.forEach(p=>{p.active=false;});
    r.api.set('PAY_MONTH','2026-10');r.api.set('PAY_SLIP_USER',state.noStaff?'':'u1');
    if(state.msg)r.api.set('PAY_MESSAGE',state.msg);
    const m={innerHTML:''};await r.api.renderPaySlip(m);await flush();
    out['pay.slip.'+name]=snap(r,m);
  }
  for(const [name,html,sbOver] of [['nohtml','',null],['dberr','<p>x</p>',{tables:{payslips:{error:{message:'발행<오류>'}}}}],['ok','<p>x</p>',null]]){
    const r=await asRole('owner',null,sbOver);
    r.api.set('PAY_SLIP_HTML',html);r.api.set('PAY_MONTH','2026-10');r.api.set('PAY_SLIP_USER','u1');
    await r.api.issuePayslip();await flush();
    out['pay.issue.'+name]=jj([r.api.get('PAY_MESSAGE'),r.log,r.statuses,r.rec]);
  }
  /* ───────── 계정·권한 위험 작업 확인창 ───────── */
  for(const [name,fnName,ans,pr,prof] of [
    ['block_cancel','disableEmployeeAccountPreserveRecords',false,null,null],['block_ok','disableEmployeeAccountPreserveRecords',true,null,null],
    ['delete_cancel','hardDeleteAccountPreserveRecords',false,null,null],['delete_noprompt','hardDeleteAccountPreserveRecords',true,null,null],['delete_wrong','hardDeleteAccountPreserveRecords',true,'다른이름',null],['delete_ok','hardDeleteAccountPreserveRecords',true,'퇴사직원',null],
    ['revoke_cancel','revokeApproval',false,null,null],['revoke_ok','revokeApproval',true,null,null],['revoke_unknown','revokeApproval',true,null,'u99']
  ]){
    const d=makeDom();const r=await asRole('owner',{$:d.$});
    r.ctx.__confirm=ans;r.ctx.__prompt=pr;
    d.$('#employment-u6-status').value='자진퇴사';d.$('#employment-u6-effective').value='2026-10-01';d.$('#employment-u6-reason').value='';
    r.ctx.PROFILES.find(p=>p.user_id==='u6').account_access_status='차단';
    await r.api[fnName](prof||'u6');await flush();
    out['acct.'+name]=jj([r.log,r.statuses,r.ctx.sb.rpcCalls,r.ctx.sb.fn]);
  }
  /* ───────── 직무 분류 관리 ───────── */
  for(const [name,mut] of [['normal',null],['no_doctor',p=>{p.SCHEDULE_PEOPLE=p.SCHEDULE_PEOPLE.filter(x=>x.department!=='Dr.');}],['unassigned',p=>{p.PROFILES.forEach(x=>{x.job_group=null;});}],['nobody',p=>{p.SCHEDULE_PEOPLE=[];}]]){
    const r=await asRole('owner');
    if(mut)mut(r.ctx);
    out['jg.render.'+name]=r.api.renderJobGroupAdmin();
  }
  for(const [name,sel,target] of [['none',[],''],['pick',[['p1','clinical_consult']],'desk'],['stale',[['p1','desk']],'lab'],['same',[['p1','clinical_consult']],'clinical_consult'],['multi',[['p1','clinical_consult'],['p3','']],'lab']]){
    const d=makeDom();const r=await asRole('owner',{$:d.$});
    sel.forEach(([id,old])=>r.api.toggleJobGroupPerson(id,true,old));
    d.$('#jobGroupTarget').value=target;
    r.api.previewEmployeeJobGroup();
    out['jg.preview.'+name]=jj([d.hist.map(h=>h.join('|')),r.ctx.JOB_GROUP_PREVIEW&&r.ctx.window.JOB_GROUP_PREVIEW?{canSave:r.ctx.window.JOB_GROUP_PREVIEW.canSave}:null]);
  }
  for(const [name,sel,target,first,refetch] of [['nopreview',[],'',null,false],['ok',[['p1','clinical_consult']],'desk',null,false],['err_perm',[['p1','clinical_consult']],'desk',{code:'42501',message:'권한<x>'},false],['err_session',[['p1','clinical_consult']],'desk',{code:'401',message:'jwt expired'},false],['err_server',[['p1','clinical_consult']],'desk',{code:'500',message:'서버<x>'},false],['err_conflict',[['p1','clinical_consult']],'desk','conflict',false],['err_some',[['p1','clinical_consult']],'desk',{code:'X1',message:'기타'},false],['refetch_fail',[['p1','clinical_consult']],'desk',null,true]]){
    const d=makeDom();
    const r=await asRole('owner',{$:d.$});
    sel.forEach(([id,old])=>r.api.toggleJobGroupPerson(id,true,old));
    d.$('#jobGroupTarget').value=target;
    r.api.previewEmployeeJobGroup();
    const okProfiles=PROFILES.map(p=>Object.assign({},p,p.user_id==='u1'&&!first?{job_group:'desk'}:{}));
    let n=0;
    r.ctx.sb.from=function(t){n++;
      if(n<=1)return chain(first==='conflict'?{list:[]}:(first&&first.code?{error:first}:{list:[{k:1}]}),r.rec,t);
      if(refetch&&t==='profiles')return chain({error:{message:'재조회<오류>'}},r.rec,t);
      if(t==='profiles')return chain({list:okProfiles},r.rec,t);
      return chain({list:PEOPLE},r.rec,t);};
    await r.api.saveEmployeeJobGroupPreview();await flush();
    out['jg.save.'+name]=jj([d.hist.map(h=>h.join('|')),r.log,r.statuses]);
  }
  {
    const d=makeDom();const r=await asRole('owner',{$:d.$});
    r.api.toggleJobGroupPerson('p1',true,'clinical_consult');d.$('#jobGroupTarget').value='desk';r.api.previewEmployeeJobGroup();
    r.ctx.ME={role:'owner'};
    await r.api.saveEmployeeJobGroupPreview();await flush();
    out['jg.save.nosession']=jj([d.hist.map(h=>h.join('|')).slice(-2),r.log]);
  }
  /* ───────── 앞 차례에서 미룬 것 ───────── */
  {
    const r=await asRole('owner');
    const rows=[{id:1,payment_item:'결제<건>',amount_krw:1234567,deadline_date:'2026-10-05',bank_name:'은행',account_holder:'예금주',account_number:'123',status:'owner_pending'},{id:2,payment_item:'취소건',amount_krw:0,deadline_date:null,status:'approved'}];
    out['payreq.card']=jj([r.api.paymentRequestCard(rows,null,[],null),r.api.paymentRequestCard([],null,[],null),r.api.paymentRequestCard([],{message:'연결<오류>'},[],null)]);
    const d=makeDom();const box=d.$('#employeeContractPreview');
    const r2=await asRole('owner',{$:d.$});r2.api.set('EMPLOYEE_CONTRACT_PREVIEWS',{a:{original_name:'계약서<1>.pdf',merged_html:'<p>본문</p>'},b:{original_name:'',merged_html:''}});
    r2.api.previewEmployeeContract('a');const h1=box.innerHTML;r2.api.previewEmployeeContract('b');const h2=box.innerHTML;r2.api.previewEmployeeContract('zz');
    out['empdoc.preview']=jj([h1,h2]);
    const docs=[{id:1,kind:'연차',title:'제목<1>',status:'진행',author:'u1',created_at:'2026-10-01T01:00:00Z',body:'본문'},{id:2,kind:'기타',title:'완결문서',status:'완결',author:'u1',created_at:'2026-10-01T01:00:00Z'},{id:3,kind:'기타',title:'반려문서',status:'반려',author:'u1',created_at:'2026-10-01T01:00:00Z'},{id:4,kind:'기타',title:'취소문서',status:'취소',author:'u1',created_at:'2026-10-01T01:00:00Z'},{id:5,kind:'기타',title:'새상태',status:'보류',author:'u1',created_at:'2026-10-01T01:00:00Z'}];
    out['appr.doccard']=jj(docs.map(x=>r.api.docCard(x,x.id===1,new Map([[2,9]]))));
    out['contract.status']=jj([{status:'발송요청'},{status:'대기'},{status:'서명완료'},{status:'취소',reviewed_at:'x',sent_at:null},{status:'취소',reviewed_at:'x',sent_at:'y'},{status:'기타값'},{status:''},null].map(x=>r.api.contractDisplayStatus(x)));
  }
  return out;
}
module.exports={renderAll,PROFILES,fnSrc,region,lf};
