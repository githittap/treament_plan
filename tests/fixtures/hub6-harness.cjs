// 차례 6(근로계약서) 화면 시험 도구 — hr.html에서 근로계약서 코드 조각(「/* ── 근로계약서 ── */」부터 「/* ── AI 실제 청구액 ── */」 앞까지)을 떼어
// 가짜 자료로 실제로 실행하고, 나온 HTML·메시지·알림창·확인창·저장 요청 글을 모아 돌려준다.
// 같은 도구를 옛 코드(허브 글 옮기기 전, 커밋 699df1c)와 새 코드에 똑같이 돌려 「기본값만 있을 때 글자 하나까지 같음」을 대조한다.
// 옛 코드의 결과는 tests/fixtures/hub6-golden-699df1c.json 에 저장돼 있다(만든 법: node tests/manual/make-hub6-golden.cjs <옛 hr.html 경로>).
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),nodeCrypto=require('node:crypto');
const lf=s=>String(s).replace(/\r\n/g,'\n');

function region(html,startMarker,endMarker){
  const a=html.indexOf(startMarker);
  if(a<0)throw new Error('시작 표시를 못 찾음: '+startMarker);
  const b=html.indexOf(endMarker,a);
  if(b<0)throw new Error('끝 표시를 못 찾음: '+endMarker);
  return html.slice(a,b);
}
// supabase 흉내: 어떤 메서드 사슬이든 받아서 표마다 정해진 결과를 돌려준다.
function chain(spec,rec,table){
  const s=spec||{};
  let mode='list';
  const p=new Proxy(function(){},{
    get(_,k){
      if(k==='then')return function(res,rej){
        const out={data:s.error?null:(mode==='single'?(s.single===undefined?null:s.single):(s.list===undefined?[]:s.list)),error:s.error||null};
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
const REAL_DATE=Date,FIXED=REAL_DATE.UTC(2026,9,1,3,0,0);
class FakeDate extends REAL_DATE{
  constructor(...a){if(a.length===0)super(FIXED);else super(...a);}
  static now(){return FIXED;}
}
const PROFILES=[
  {user_id:'u1',name:'김직원',role:'staff',active:true,approved:true,dept:'진료실'},
  {user_id:'u2',name:'이매니저',role:'manager',active:true,approved:true,dept:'상담'},
  {user_id:'u3',name:'박실장',role:'chief',active:true,approved:true},
  {user_id:'u4',name:'정원장',role:'owner',active:true,approved:true},
  {user_id:'u5',name:'최<직원>',role:'staff',active:true,approved:true,dept:'리셉션'},
  {user_id:'u6',name:'퇴사직원',role:'staff',active:false,approved:true}
];
const TEMPLATE={id:1,name:'표준 근로계약서',title:'근로계약서',active:true,
  body_html:'<h1>근 로 계 약 서</h1><p>{{성명}} 님과 계약합니다.</p><p>기간 {{계약시작}} ~ {{계약종료}}</p>{{기간계약종료문구}}<p>연봉 {{연봉세전}} · 시급 {{통상시급}} · 이메일 {{직원이메일}}</p>{{근무시간표}}{{임금구성표}}{{공휴일근무문구}}<p>{{계약일자}} {{도장_원장}} {{모르는칸}}</p><span data-sign-slot="employee"></span>',
  fields:[{key:'성명',label:'성명'},{key:'계약시작',label:'계약 시작일',type:'date'},{key:'계약종료',label:'계약 종료일',type:'date'},{key:'직종',label:'직종',type:'select',options:['위생사','코디'],required:true},{key:'공휴일근무',label:'공휴일 근무',type:'select',options:['포함','제외']},{key:'근무시간표',label:'근무시간표',type:'work_schedule'},{key:'근무장소',label:'근무장소',type:'text',default:'본원'},{key:'연봉세전',label:'연봉',type:'text'}],
  presets:{'리셉션':{직종:'코디'},'진료실':{직종:'위생사'}},sign_slots:[{who:'employee'}]};
const TEMPLATE2={id:2,name:'단시간 근로계약서',title:'단시간 근로계약서',active:true,body_html:'<p>단시간 {{성명}}</p>',fields:[],presets:{},sign_slots:[]};
const SCHED_ROWS=[
  {days:['월','화','수','목','금'],kind:'주간',start:'10:00',end:'19:00',break_time:'13:00 ~ 14:00',note:''},
  {days:['월','화','수','목','금','토','일'],day_mode:'rotating_5',kind:'주간',start:'09:00',end:'18:00',break_time:'',note:'교대<표시>'},
  {days:['월','화','수','목','금'],day_mode:'weekday_twice',kind:'야간',start:'10:00',end:'20:00',break_time:'18:00 ~ 18:30',note:''},
  {days:['월','화','수','목','금'],day_mode:'rotating_5',kind:'별도',start:'10:00',end:'19:00',break_time:'',note:''}
];
const WAGE={기본급:'2,000,000',기본급산정시간:'209','식대(비과세)':'',식대:'200,000',포괄연차수당:'80,000',포괄연차시간:'8',기타수당:'10,000'};
const MERGE_CASES={
  fixed:{성명:'홍길동',계약시작:'2026-10-01',계약종료:'2027-09-30',연봉세전:'30,000,000',통상시급:'',직원이메일:'a@b.c',근무시간표:SCHED_ROWS,...WAGE,공휴일근무:'포함'},
  open:{성명:'김<이름>',계약시작:'2026-10-01',계약종료:'기간의 정함 없음',근무시간표:SCHED_ROWS.slice(0,1),공휴일근무:'제외'},
  empty_wage:{성명:'빈임금',계약종료:'2026-12-31',근무시간표:'[object Object]'},
  no_schedule:{성명:'시간표없음',계약종료:'2026-12-31'}
};
const CONTRACT_ROWS=[
  {id:11,user_id:'u1',template_id:1,status:'발송요청',created_by:'이매니저',due_at:'2026-10-08T14:59:59Z',sent_at:null,signed_at:null,created_at:'2026-09-29T01:00:00Z',merged_html:'<p>요청본</p>',fields:{계약종료:'2027-09-30',근무시간표:SCHED_ROWS.slice(0,1)},request_fields:{계약종료:'2027-09-30',근무시간표:SCHED_ROWS.slice(0,1)},reviewed_at:null},
  {id:12,user_id:'u5',template_id:1,status:'발송요청',created_by:'박실장',due_at:'2026-10-09T14:59:59Z',sent_at:null,signed_at:null,created_at:'2026-09-30T01:00:00Z',merged_html:'깨진 [object Object] 시간표',fields:{계약종료:'2026-10-10',근무시간표:'[object Object]'},request_fields:{계약종료:'2026-10-10',근무시간표:'[object Object]'},reviewed_at:null},
  {id:13,user_id:'u1',template_id:1,status:'대기',due_at:'2026-10-20T14:59:59Z',sent_at:'2026-09-28T01:00:00Z',signed_at:null,created_at:'2026-09-28T01:00:00Z',merged_html:'<p>대기본</p><span data-sign-slot="employee"></span>',fields:{계약종료:'2026-10-20'},source_pdf_path:null},
  {id:14,user_id:'u1',template_id:1,status:'서명완료',due_at:'2026-09-20T14:59:59Z',sent_at:'2026-09-10T01:00:00Z',signed_at:'2026-09-12T01:00:00Z',created_at:'2026-09-10T01:00:00Z',merged_html:'<p>서명완료본</p>',fields:{계약종료:'2026-11-20'},signed_pdf_path:'u1/signed.pdf',source_pdf_path:'u1/src.pdf'},
  {id:15,user_id:'u5',template_id:1,status:'취소',due_at:'2026-09-20T14:59:59Z',sent_at:'2026-09-10T01:00:00Z',created_at:'2026-09-10T01:00:00Z',merged_html:'<p>취소본</p>',fields:{계약종료:'2026-11-20'},reviewed_at:'2026-09-11T01:00:00Z'},
  {id:16,user_id:'u5',template_id:9,status:'대기',due_at:'2026-09-01T14:59:59Z',sent_at:'2026-08-28T01:00:00Z',created_at:'2026-08-28T01:00:00Z',merged_html:'<p>기한지남</p>',fields:{계약종료:''}},
  {id:17,user_id:'u1',template_id:1,status:'대기',due_at:'2026-10-25T14:59:59Z',sent_at:'2026-09-28T01:00:00Z',created_at:'2026-09-28T02:00:00Z',integrated_signature_required:true,source_pdf_path:'u1/src2.pdf',merged_html:'<section class="contract-part" data-contract-part="employment"><span data-sign-slot="employment"></span></section><section class="contract-part" data-contract-part="medical"><span data-sign-slot="medical"></span></section><section class="contract-part" data-contract-part="privacy"><span data-sign-slot="privacy"></span></section>',fields:{계약종료:'기간의 정함 없음'}},
  {id:18,user_id:'u1',template_id:1,status:'대기',due_at:'2026-10-26T14:59:59Z',sent_at:'2026-09-28T01:00:00Z',created_at:'2026-09-28T03:00:00Z',source_pdf_path:'u1/src3.pdf',merged_html:'<p>PDF기준</p><span data-sign-slot="employee"></span>',fields:{계약종료:'2026-12-01'}},
  {id:19,user_id:'u1',template_id:1,status:'대기',due_at:'2026-10-26T14:59:59Z',sent_at:'2026-09-28T01:00:00Z',created_at:'2026-09-28T04:00:00Z',integrated_signature_required:true,merged_html:'<p>구성 안 맞음</p>',fields:{}}
];
const TERMS=[{user_id:'u1',start_date:'2026-01-01',end_date:'2026-10-10',is_indefinite:false,updated_at:'2026-09-01T00:00:00Z'},{user_id:'u2',start_date:'2025-01-01',end_date:null,is_indefinite:true,updated_at:'2026-09-01T00:00:00Z'},{user_id:'u5',start_date:null,end_date:'2026-12-31',is_indefinite:false,updated_at:'2026-09-02T00:00:00Z'}];

function tablesFor(name){
  const T={
    doc_templates:{list:[TEMPLATE,TEMPLATE2]},
    contracts:{list:CONTRACT_ROWS},
    employee_contract_terms:{list:TERMS}
  };
  return T[name];
}
function makeSb(over){
  const o=over||{};
  const rpcCalls=[],writes=[],stor=[],fn=[];
  const sb={
    from(t){const spec=Object.prototype.hasOwnProperty.call(o.tables||{},t)?o.tables[t]:tablesFor(t);return chain(spec||{list:[],single:null},writes,t);},
    rpc(name,args){rpcCalls.push([name,args&&args.p_merged_html?Object.assign({},args,{p_merged_html:String(args.p_merged_html).slice(0,60)}):args]);const r=(o.rpc||{})[name];return Promise.resolve(r!==undefined?(typeof r==='function'?r(args):r):{data:[{}],error:null});},
    storage:{from(b){return {upload(p){stor.push(['upload',b,p]);return Promise.resolve({error:(o.storage&&o.storage.upload)||null});},download(p){stor.push(['download',b,p]);return Promise.resolve((o.storage&&o.storage.download)||{data:null,error:{message:'없음<파일>'}});}};}},
    functions:{invoke(name,args){fn.push([name,JSON.parse(JSON.stringify(args))]);const r=(o.fn||{})[name];return Promise.resolve(r!==undefined?r:{data:{ok:true},error:null});}}
  };
  sb.rpcCalls=rpcCalls;sb.writes=writes;sb.stor=stor;sb.fn=fn;
  return sb;
}

async function renderAll(html,opts){
  const o=opts||{};
  const text=lf(html);
  const out={};
  const hubTLine=text.match(/function hubT\(k,d,v\)\{[^\n]*\}/)[0];
  const stampSrc=text.match(/function stampDate\(s\)\{[\s\S]*?\n\}/)[0];
  const termAlertSrc=text.match(/function employmentTermAlertRows\(terms,contracts\)\{[\s\S]*?\n\}/)[0];
  const contractSrc=region(text,'/* ── 근로계약서 ── */','/* ── AI 실제 청구액 ── */');
  const hubJs=o.engine?lf(fs.readFileSync(path.join(__dirname,'..','..','hub-texts.js'),'utf8')):null;
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  async function makeCtx(extra,sbOver){
    const dom=makeDom(),log=[],statuses=[];
    const doc={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){},createElement:()=>({click(){}}),body:{classList:{add(){},remove(){}}}};
    const ctx={P9_PLEDGES:new Map(),loadContractPledges:async()=>{},initPledgeCanvas(){},renderSecurityPledgeDocuments:async()=>{},console,esc,$:dom.$,Date:FakeDate,Intl,Promise,Math,JSON,Set,Map,Number,String,Array,Object,parseInt,parseFloat,isNaN,RegExp,Blob,URL,Image:function(){},CSS:{escape:s=>s},crypto:nodeCrypto.webcrypto,
      PROFILES:PROFILES.map(p=>Object.assign({},p)),SCHEDULE_PEOPLE:[{profile_user_id:'u1'}],
      employeeJobGroupModel:()=>({kind:'staff',label:'진료·상담'}),
      CLINIC_SEAL:'data:image/png;base64,SEAL',
      ME:{id:'u4',name:'정원장',role:'owner'},
      today:()=>'2026-10-01',addDays:(ds,n)=>{const d=new REAL_DATE(ds+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);},
      nameOf:uid=>{const p=PROFILES.find(x=>x.user_id===uid);return p?p.name:(uid||'').slice(0,6);},
      setStatus:s=>statuses.push(s),render:()=>{log.push('render');},go:t=>log.push('go:'+t),renderNav:()=>log.push('nav'),
      refreshBadges:async()=>{log.push('badges');},show:id=>log.push('show:'+id),hide:id=>log.push('hide:'+id),
      alert:m=>log.push('alert:'+m),confirm:m=>{log.push('confirm:'+m);return ctx.__confirm!==false;},prompt:()=>null,
      setTimeout:()=>0,clearTimeout:()=>0,
      sb:makeSb(sbOver)};
    ctx.document=Object.assign(doc,(extra&&extra.document)||{});
    ctx.window=Object.assign(ctx,{open:()=>log.push('open')});
    Object.assign(ctx,extra||{});
    if(extra&&extra.document)ctx.document=Object.assign(doc,extra.document);
    vm.createContext(ctx);
    if(o.shim){ // 엔진(hub-texts.js)을 못 불러왔을 때 hr.html이 깔아 두는 대비책(shim)만 있는 상태
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
    vm.runInContext('let BADGE={};let CONTRACT_ALERTS=[];let EMPLOYMENT_TERMS=[];\n'+hubTLine+'\n'+stampSrc+'\n'+termAlertSrc+'\n'+contractSrc+'\n;this.api={'
      +'contractExpiryInfo,contractExpiryRows,contractAlertText,contractAlertsCard,contractScheduleRowEditor,contractScheduleInputs,contractScheduleHtml,mergeContractHtml,contractWageHtml,fixedTermClause,contractFieldInputs,contractTitle,'
      +'integratedSignatureCard,integratedContractPage,employmentTermsCard,viewContract,previewContract,renderContractOwner,renderContractEmployee,renderContract,'
      +'sendContract,approveContractSend,rejectContractSend,cancelContract,uploadContractPdfSource,openContractEnd,saveContractEnd,saveEmploymentTerm,openContractPdfSource,downloadContractPdf,'
      +'saveContractSignature,signContractPdf,completeIntegratedContract,syncContractScheduleDayMode,'
      +'set:(k,v)=>{if(k==="CONTRACT_TEMPLATES")CONTRACT_TEMPLATES=v;if(k==="CONTRACT_ROWS")CONTRACT_ROWS=v;if(k==="CONTRACT_TEMPLATE_ID")CONTRACT_TEMPLATE_ID=v;if(k==="CONTRACT_EMPLOYEE_ID")CONTRACT_EMPLOYEE_ID=v;if(k==="CONTRACT_EDIT_ID")CONTRACT_EDIT_ID=v;if(k==="CONTRACT_EDIT_FIELDS")CONTRACT_EDIT_FIELDS=v;if(k==="CONTRACT_FLASH")CONTRACT_FLASH=v;if(k==="CONTRACT_SHOW_CANCELLED")CONTRACT_SHOW_CANCELLED=v;if(k==="CONTRACT_END_ID")CONTRACT_END_ID=v;if(k==="CONTRACT_DRAFT_FIELDS")CONTRACT_DRAFT_FIELDS=v;if(k==="EMPLOYMENT_TERMS")EMPLOYMENT_TERMS=v;},'
      +'get:k=>({CONTRACT_FLASH:CONTRACT_FLASH,CONTRACT_EDIT_ID:CONTRACT_EDIT_ID,CONTRACT_ALERTS:CONTRACT_ALERTS,BADGE:BADGE})[k]};',ctx);
    return {ctx,dom,log,statuses,api:ctx.api};
  }
  const flush=()=>new Promise(res=>setImmediate(res));
  const asRole=async(role,extra,sbOver)=>{const r=await makeCtx(extra,sbOver);r.ctx.ME={id:role==='staff'?'u1':role==='manager'?'u2':role==='chief'?'u3':'u4',name:role==='staff'?'김직원':role==='manager'?'이매니저':role==='chief'?'박실장':'정원장',role};return r;};
  const fail=m=>({error:{message:m}});
  const jj=x=>JSON.stringify(x);
  if(o.probe)return {makeCtx,asRole,fail,flush,makeDom,chain,makeSb,text};

  /* ───────── 순수 함수 ───────── */
  {
    const r=await asRole('owner');
    const A=r.api;
    const info=(end,status,base)=>A.contractExpiryInfo({fields:{계약종료:end},status:status||'서명완료'},base||'2026-10-01');
    const ends=['2026-09-25','2026-10-01','2026-10-15','2026-10-16','2026-10-31','2026-11-01','2026-11-30','2026-12-01','2027-03-01','','날짜 미정','2026-02-30','기간의 정함 없음'];
    out['pure.expiry']=jj(ends.map(e=>info(e)));
    out['pure.expiry_cancelled']=jj([info('2026-10-05','취소')]);
    out['pure.expiry_json_fields']=jj([A.contractExpiryInfo({fields:'{"계약종료":"2026-10-20"}',status:'서명완료'},'2026-10-01'),A.contractExpiryInfo({fields:'깨짐',status:'서명완료'},'2026-10-01')]);
    out['pure.alert_text']=jj([{kind:'review',days:null},{kind:'expired',days:-3},{kind:'urgent',days:0},{kind:'urgent',days:7},{kind:'warning',days:20},{kind:'upcoming',days:45}].map(a=>A.contractAlertText(a)));
    const rows=[
      {id:1,user_id:'u1',created_at:'2026-01-01',status:'서명완료',fields:{계약종료:'2026-09-28'}},
      {id:2,user_id:'u2',created_at:'2026-01-01',status:'서명완료',fields:{계약종료:'2026-10-10'}},
      {id:3,user_id:'u3',created_at:'2026-01-01',status:'서명완료',fields:{계약종료:'2026-10-25'}},
      {id:4,user_id:'u5',created_at:'2026-01-01',status:'서명완료',fields:{계약종료:'2026-11-20'}},
      {id:5,user_id:'u4',created_at:'2026-01-01',status:'서명완료',fields:{계약종료:''}},
      {id:6,user_id:'u6',created_at:'2026-01-01',status:'서명완료',fields:{계약종료:'2028-01-01'}}
    ];
    const alerts=A.contractExpiryRows(rows,'2026-10-01');
    out['pure.alerts_card']=jj([A.contractAlertsCard(alerts),A.contractAlertsCard([]),A.contractAlertsCard(alerts.slice(0,1))]);
    out['pure.alerts_kinds']=jj(alerts.map(a=>[a.row.id,a.kind,a.days]));
    out['pure.schedule_editor']=jj(SCHED_ROWS.map(x=>A.contractScheduleRowEditor(x)));
    out['pure.schedule_inputs']=A.contractScheduleInputs('근무시간표',SCHED_ROWS.slice(0,2));
    out['pure.schedule_html']=jj([A.contractScheduleHtml(SCHED_ROWS),A.contractScheduleHtml('[object Object]'),A.contractScheduleHtml(undefined)]);
    for(const [name,f] of Object.entries(MERGE_CASES))out['pure.merge.'+name]=A.mergeContractHtml(TEMPLATE,f);
    out['pure.merge.no_template']=A.mergeContractHtml(null,{성명:'x'});
    out['pure.wage']=jj([A.contractWageHtml({}),A.contractWageHtml(WAGE),A.contractWageHtml({기본급:'1',포괄시간외근로수당:'2',포괄시간외시간:'10',육아수당:'3',직책수당:'4',포괄휴일수당:'5',포괄휴일시간:'6',포괄휴일연장수당:'7',포괄휴일연장시간:'8'})]);
    out['pure.fixed_term']=jj([A.fixedTermClause({계약종료:'기간의 정함 없음'}),A.fixedTermClause({계약종료:'2026-12-31'}),A.fixedTermClause({})]);
    A.set('CONTRACT_EDIT_ID',null);A.set('CONTRACT_DRAFT_FIELDS',null);A.set('CONTRACT_TEMPLATE_ID',1);
    out['pure.field_inputs']=jj([A.contractFieldInputs(TEMPLATE,{name:'홍길동'},false),A.contractFieldInputs(TEMPLATE,{name:'홍길동'},true),A.contractFieldInputs(null,null,false)]);
    A.set('CONTRACT_TEMPLATES',[TEMPLATE,TEMPLATE2]);
    out['pure.title']=jj([A.contractTitle({template_id:1}),A.contractTitle({template_id:2}),A.contractTitle({template_id:99})]);
    A.set('CONTRACT_TEMPLATES',[]);
    out['pure.title_no_templates']=jj([A.contractTitle({template_id:1})]);
    out['pure.int_sig_card']=jj([A.integratedSignatureCard({id:17,source_pdf_path:'x.pdf'},'employment'),A.integratedSignatureCard({id:17},'medical'),A.integratedSignatureCard({id:17,source_pdf_path:'x.pdf'},'privacy'),A.integratedSignatureCard({id:17},'other')]);
    out['pure.int_page']=jj([A.integratedContractPage(CONTRACT_ROWS[6]),A.integratedContractPage({id:17,merged_html:CONTRACT_ROWS[6].merged_html}),A.integratedContractPage(CONTRACT_ROWS[8])]);
    A.set('EMPLOYMENT_TERMS',TERMS);
    out['pure.terms_card']=A.employmentTermsCard();
  }
  /* ───────── 화면: 원장·실장·매니저 / 직원 ───────── */
  const ownerCases=[
    ['owner','owner',null,null],['chief','chief',null,null],['manager','manager',null,null],
    ['cancelled_shown','owner',{CONTRACT_SHOW_CANCELLED:true},null],
    ['edit_mode','owner',{CONTRACT_EDIT_ID:11,CONTRACT_EDIT_FIELDS:{계약종료:'2027-09-30',직종:'코디',근무시간표:SCHED_ROWS.slice(0,1)},CONTRACT_EMPLOYEE_ID:'u1'},null],
    ['template2','owner',{CONTRACT_TEMPLATE_ID:2},null],
    ['flash_sent','owner',{CONTRACT_FLASH:'발송했습니다.'},null],['flash_req','manager',{CONTRACT_FLASH:'원장에게 최종 발송을 요청했습니다.'},null],
    ['flash_edit','owner',{CONTRACT_FLASH:'수정 후 발송했습니다.'},null],['flash_approved','owner',{CONTRACT_FLASH:'최종 발송을 완료했습니다.'},null],['flash_rejected','owner',{CONTRACT_FLASH:'발송 요청을 반려했습니다.'},null],['flash_other','owner',{CONTRACT_FLASH:'다른 <글>'},null],
    ['no_templates','owner',null,{tables:{doc_templates:{list:[]}}}],
    ['no_contracts','owner',null,{tables:{contracts:{list:[]},employee_contract_terms:{list:[]}}}],
    ['only_cancelled','owner',null,{tables:{contracts:{list:[CONTRACT_ROWS[4]]}}}],
    ['error_templates','owner',null,{tables:{doc_templates:{error:{message:'서식<오류>'}}}}],
    ['error_contracts','owner',null,{tables:{contracts:{error:{message:'계약<오류>'}}}}],
    ['error_terms','owner',null,{tables:{employee_contract_terms:{error:{message:'기간<오류>'}}}}]
  ];
  for(const [name,role,state,sbOver] of ownerCases){
    const d=makeDom();
    const r=await asRole(role,{$:d.$},sbOver);
    r.api.set('CONTRACT_DRAFT_FIELDS',null);
    for(const [k,v] of Object.entries(state||{}))r.api.set(k,v);
    const m={innerHTML:''};await r.api.renderContractOwner(m);await flush();
    out['owner.render.'+name]=jj([m.innerHTML,d.hist.filter(h=>h[0]!=='#main').map(h=>h.join('|')),r.log,r.statuses,r.api.get('BADGE')]);
  }
  const empCases=[
    ['staff','staff',null,null],['cancelled_shown','staff',{CONTRACT_SHOW_CANCELLED:true},null],
    ['empty','staff',null,{tables:{contracts:{list:[]}}}],['only_cancelled','staff',null,{tables:{contracts:{list:[CONTRACT_ROWS[4]]}}}],
    ['error','staff',null,{tables:{contracts:{error:{message:'내계약<오류>'}}}}]
  ];
  for(const [name,role,state,sbOver] of empCases){
    const r=await asRole(role,null,sbOver);
    r.api.set('CONTRACT_TEMPLATES',[]);
    for(const [k,v] of Object.entries(state||{}))r.api.set(k,v);
    const m={innerHTML:'',insertAdjacentHTML(p,h){m.innerHTML+='<<'+p+'>>'+h;}};await r.api.renderContractEmployee(m);await flush();
    out['emp.render.'+name]=jj([m.innerHTML,r.log,r.statuses]);
  }
  { // 실장·매니저 화면 아래에 내 계약서가 덧붙는 경우 · 덧붙일 것이 없는 경우
    const r=await asRole('manager',null,{tables:{contracts:{list:[CONTRACT_ROWS[0]]}}});
    const m={innerHTML:'',insertAdjacentHTML(p,h){m.innerHTML+='<<'+p+'>>'+h;}};await r.api.renderContract(m);await flush();
    out['emp.render.lead_append']=jj([m.innerHTML.length>0,r.log,r.statuses]);
    const r2=await asRole('staff',null,{tables:{contracts:{list:[]}}});
    const m2={innerHTML:''};await r2.api.renderContract(m2);out['emp.render.staff_via_renderContract']=m2.innerHTML;
  }
  /* ───────── 보기·미리보기 ───────── */
  {
    for(const [name,id,role] of [['plain',11,'owner'],['broken_owner',12,'owner'],['broken_manager',12,'manager'],['signed',14,'owner'],['missing',99,'owner']]){
      const d=makeDom();const r=await asRole(role,{$:d.$});
      r.api.set('CONTRACT_ROWS',CONTRACT_ROWS);r.api.set('CONTRACT_TEMPLATES',[TEMPLATE]);
      r.api.viewContract(id);
      out['view.'+name]=jj([d.$('#contractPreview').innerHTML,d.hist.map(h=>h.join('|'))]);
    }
    const d2=makeDom();const r2=await asRole('owner',{$:d2.$,document:{querySelectorAll:sel=>sel==='[data-contract-key]'?[{dataset:{contractKey:'계약종료'},value:'2027-09-30'},{dataset:{contractKey:'직종'},value:'위생사'}]:[]}});
    r2.api.set('CONTRACT_TEMPLATES',[TEMPLATE]);r2.api.set('CONTRACT_TEMPLATE_ID',1);d2.$('#contractEmployee').value='u1';d2.$('#contractDue').value='2026-10-08';
    r2.api.previewContract();out['view.preview']=jj([d2.$('#contractPreview').innerHTML]);
  }
  /* ───────── 발송 · 승인 · 반려 · 취소 ───────── */
  {
    const send=async(name,opt)=>{
      const o2=opt||{};const d=makeDom();
      const els=(o2.keys||{계약종료:'2027-09-30',직종:'위생사',계약시작:'2026-10-01'});
      const document={querySelectorAll:sel=>sel==='[data-contract-key]'?Object.entries(els).map(([k,v])=>({dataset:{contractKey:k},value:v})):sel==='[data-work-schedule-key]'?(o2.sched?[{dataset:{workScheduleKey:'근무시간표'},querySelectorAll:()=>[]}]:[]):[]};
      const r=await asRole(o2.role||'owner',{$:d.$,document},o2.sb);
      r.api.set('CONTRACT_TEMPLATES',o2.noTemplate?[]:[TEMPLATE]);r.api.set('CONTRACT_TEMPLATE_ID',1);r.api.set('CONTRACT_DRAFT_FIELDS',null);
      if(o2.edit)r.api.set('CONTRACT_EDIT_ID',o2.edit);
      d.$('#contractEmployee').value=o2.noEmployee?'':'u1';d.$('#contractDue').value=o2.due===undefined?'2026-10-08':o2.due;
      if(o2.noEnd)d.$('#contractNoEnd').checked=true;
      await r.api.sendContract();await flush();
      out['send.'+name]=jj([d.hist.filter(h=>h[0]==='#contractMsg').map(h=>h.join('|')),r.ctx.sb.writes.map(w=>[w[0],w[1],Object.keys(w[2][0]||{}).sort(),(w[2][0]||{}).status,(w[2][0]||{}).due_at]),r.log,r.statuses,r.api.get('CONTRACT_FLASH')]);
    };
    await send('no_template',{noTemplate:true});
    await send('no_employee',{noEmployee:true});
    await send('no_due',{due:''});
    await send('missing_required',{keys:{계약종료:'2027-09-30',직종:''}});
    await send('no_end',{keys:{계약종료:'',직종:'위생사'}});
    await send('schedule_invalid',{sched:true});
    await send('bad_due',{due:'bad'});
    await send('owner_ok',{});
    await send('owner_ok_noend',{keys:{계약종료:'',직종:'위생사'},noEnd:true});
    await send('manager_request',{role:'manager'});
    await send('insert_fail',{sb:{tables:{contracts:{error:{message:'넣기<실패>'}}}}});
    await send('edit_ok',{edit:11});
    await send('edit_fail',{edit:11,sb:{tables:{contracts:{error:{message:'고치기<실패>'}}}}});
    const act=async(name,fnName,arg,role,sbOver,state,extra)=>{
      const r=await asRole(role||'owner',extra,sbOver);
      r.api.set('CONTRACT_ROWS',CONTRACT_ROWS.map(x=>Object.assign({},x)));
      for(const [k,v] of Object.entries(state||{}))r.api.set(k,v);
      if(extra&&extra.__confirm===false)r.ctx.__confirm=false;
      await r.api[fnName](arg);await flush();
      out[name]=jj([r.log,r.statuses,r.ctx.sb.writes.map(w=>[w[0],w[1],w[2]]),r.ctx.sb.rpcCalls,r.ctx.sb.stor,r.api.get('CONTRACT_FLASH')]);
    };
    await act('approve.ok','approveContractSend',11);
    await act('approve.upload_fail','approveContractSend',11,'owner',{storage:{upload:{message:'보관<실패>'}}});
    await act('approve.update_fail','approveContractSend',11,'owner',{tables:{contracts:{error:{message:'발송<실패>'}}}});
    await act('approve.not_owner','approveContractSend',11,'manager');
    await act('reject.ok','rejectContractSend',11);
    await act('reject.declined','rejectContractSend',11,'owner',null,null,{__confirm:false});
    await act('reject.fail','rejectContractSend',11,'owner',{tables:{contracts:{error:{message:'반려<실패>'}}}});
    await act('reject.already','rejectContractSend',11,'owner',{tables:{contracts:{list:[]}}});
    await act('reject.not_owner','rejectContractSend',11,'manager');
    await act('cancel.ok','cancelContract',13);
    await act('cancel.declined','cancelContract',13,'owner',null,null,{__confirm:false});
    await act('cancel.fail','cancelContract',13,'owner',{tables:{contracts:{error:{message:'취소<실패>'}}}});
    await act('cancel.already','cancelContract',13,'owner',{tables:{contracts:{list:[]}}});
    await act('cancel.not_waiting','cancelContract',14);
  }
  /* ───────── 원본 PDF 등록 · 열기 ───────── */
  {
    const reg=async(name,vals,sbOver)=>{
      const d=makeDom();
      d.$('#contractPdfSourceId').value=vals.id===undefined?'11':vals.id;d.$('#contractPdfSourceVersion').value=vals.version===undefined?'2026-10-01 검토본':vals.version;
      d.$('#contractPdfSourceFile').files=vals.noFile?[]:[{type:vals.type||'application/pdf',size:vals.size||1000,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer}];
      const r=await asRole('owner',{$:d.$},sbOver);r.api.set('CONTRACT_ROWS',CONTRACT_ROWS.map(x=>Object.assign({},x)));
      await r.api.uploadContractPdfSource();await flush();
      out['pdfreg.'+name]=jj([d.hist.filter(h=>h[0]==='#contractPdfSourceMsg').map(h=>h.join('|')),r.log,r.statuses,r.ctx.sb.rpcCalls.map(c=>[c[0],c[1]&&c[1].p_source_path,c[1]&&c[1].p_source_version]),r.ctx.sb.stor]);
    };
    await reg('no_file',{noFile:true});
    await reg('not_pdf',{type:'text/plain'});
    await reg('too_big',{size:30*1024*1024});
    await reg('no_id',{id:''});
    await reg('no_version',{version:''});
    await reg('wrong_state',{id:'14'});
    await reg('upload_fail',{},{storage:{upload:{message:'올리기<실패>'}}});
    await reg('rpc_fail',{},{rpc:{register_contract_pdf_source:{error:{message:'등록<실패>'}}}});
    await reg('ok',{});
    const open=async(name,fnName,id,sbOver)=>{const r=await asRole('owner',null,sbOver);r.api.set('CONTRACT_ROWS',CONTRACT_ROWS.map(x=>Object.assign({},x)));await r.api[fnName](id);out['pdfopen.'+name]=jj([r.log,r.ctx.sb.stor]);};
    await open('src_fail','openContractPdfSource',14);
    await open('src_nofile','openContractPdfSource',14,{storage:{download:{data:null,error:null}}});
    await open('src_none','openContractPdfSource',11);
    await open('signed_fail','downloadContractPdf',14);
    await open('signed_nofile','downloadContractPdf',14,{storage:{download:{data:null,error:null}}});
    await open('signed_none','downloadContractPdf',11);
  }
  /* ───────── 종료일 설정 · 계약기간 저장 ───────── */
  {
    const endCase=async(name,vals,sbOver,endId)=>{
      const d=makeDom();d.$('#contractEndNoEnd').checked=!!vals.noEnd;d.$('#contractEndDate').value=vals.date||'';
      const r=await asRole('owner',{$:d.$},sbOver);r.api.set('CONTRACT_ROWS',CONTRACT_ROWS.map(x=>Object.assign({},x)));r.api.set('CONTRACT_END_ID',endId===undefined?13:endId);
      await r.api.saveContractEnd();await flush();
      out['end.'+name]=jj([d.hist.filter(h=>h[0]==='#contractEndMsg').map(h=>h.join('|')),r.log,r.statuses,r.ctx.sb.writes.map(w=>[w[0],w[1],w[2]])]);
    };
    await endCase('bad_date',{date:''});
    await endCase('ok_date',{date:'2027-01-31'},{tables:{contracts:{list:[{id:13,fields:{계약종료:'2027-01-31'}}]}}});
    await endCase('ok_noend',{noEnd:true},{tables:{contracts:{list:[{id:13,fields:{계약종료:'기간의 정함 없음'}}]}}});
    await endCase('fail',{date:'2027-01-31'},{tables:{contracts:{error:{message:'저장<실패>'}}}});
    await endCase('not_found',{date:'2027-01-31'},{tables:{contracts:{list:[]}}});
    await endCase('no_row',{date:'2027-01-31'},null,999);
    { const d=makeDom();const r=await asRole('owner',{$:d.$});r.api.set('CONTRACT_ROWS',CONTRACT_ROWS.map(x=>Object.assign({},x)));r.api.openContractEnd(13);out['end.open']=jj([d.hist.map(h=>h.join('|')),r.log]);}
    const termCase=async(name,vals,sbOver)=>{
      const d=makeDom();d.$('#termNoEnd-u1').checked=!!vals.noEnd;d.$('#termStart-u1').value=vals.start||'';d.$('#termDate-u1').value=vals.end||'';
      const r=await asRole('owner',{$:d.$},sbOver);
      await r.api.saveEmploymentTerm('u1');await flush();
      out['term.'+name]=jj([r.log,r.statuses,r.ctx.sb.writes.map(w=>[w[0],w[1],(w[2][0]||{}).start_date,(w[2][0]||{}).end_date,(w[2][0]||{}).is_indefinite])]);
    };
    await termCase('bad_start',{start:'2026-13',end:'2026-12-31'});
    await termCase('no_end',{start:'2026-01-01',end:''});
    await termCase('order',{start:'2026-12-31',end:'2026-01-01'});
    await termCase('ok',{start:'2026-01-01',end:'2026-12-31'});
    await termCase('ok_noend',{start:'2026-01-01',noEnd:true});
    await termCase('fail',{start:'2026-01-01',end:'2026-12-31'},{tables:{employee_contract_terms:{error:{message:'기간<실패>'}}}});
  }
  /* ───────── 직원 서명 ───────── */
  {
    const canvasOf=(dirty,sigId)=>({dataset:{dirty:dirty?'true':'false',confirmed:dirty?'true':'false',signatureId:sigId||'',contractId:'13',part:'employment'},toDataURL:()=> 'data:image/png;base64,SIG',getContext:()=>({clearRect(){}}),width:720,height:180});
    const sign=async(name,fnName,id,o2)=>{
      const q=o2||{};const d=makeDom();
      const canv=q.canvas===null?null:canvasOf(q.dirty!==false,q.sigId);
      const doc={querySelector:sel=>{if(/^canvas\[data-contract-signature/.test(sel))return canv;const m=sel.match(/^\[data-pdf-([a-z]+)="/);if(m&&q.pdfVals!==undefined)return q.pdfVals===null?null:{value:q.pdfVals[m[1]]};return null;},querySelectorAll:()=>[]};
      const r=await asRole('staff',{$:d.$,document:doc},q.sb);
      r.api.set('CONTRACT_ROWS',(q.rows||CONTRACT_ROWS).map(x=>Object.assign({},x)));
      if(q.declined)r.ctx.__confirm=false;
      await r.api[fnName](id);await flush();
      out['sign.'+name]=jj([d.hist.filter(h=>h[0].startsWith('#contractSignMsg')).map(h=>h.join('|')),r.log,r.statuses,r.ctx.sb.rpcCalls,r.ctx.sb.fn.map(f=>[f[0],Object.keys(f[1]).sort()])]);
    };
    await sign('save.no_row','saveContractSignature',99);
    await sign('save.not_waiting','saveContractSignature',14);
    await sign('save.expired','saveContractSignature',16);
    await sign('save.not_dirty','saveContractSignature',13,{dirty:false});
    await sign('save.no_canvas','saveContractSignature',13,{canvas:null});
    await sign('save.no_slot','saveContractSignature',18,{rows:[Object.assign({},CONTRACT_ROWS[7],{merged_html:'<p>자리 없음</p>'})]});
    await sign('save.rpc_fail','saveContractSignature',13,{sb:{rpc:{apply_employee_contract_signature:{data:null,error:{message:'서명<실패>'}}}}});
    await sign('save.rpc_null','saveContractSignature',13,{sb:{rpc:{apply_employee_contract_signature:{data:null,error:null}}}});
    await sign('save.ok','saveContractSignature',13,{sigId:'7',sb:{rpc:{apply_employee_contract_signature:{data:{id:13},error:null}}}});
    const pdfOk={page:'1',x:'72',y:'72',width:'150',height:'50'};
    await sign('pdf.not_pdf','signContractPdf',13);
    await sign('pdf.expired','signContractPdf',16,{rows:[Object.assign({},CONTRACT_ROWS[5],{source_pdf_path:'a.pdf'})]});
    await sign('pdf.not_dirty','signContractPdf',18,{dirty:false});
    await sign('pdf.declined','signContractPdf',18,{declined:true,pdfVals:pdfOk});
    await sign('pdf.confirm_fail','signContractPdf',18,{pdfVals:pdfOk,sb:{rpc:{confirm_contract_pdf_source:{error:{message:'확인<실패>'}}}}});
    await sign('pdf.bad_pos','signContractPdf',18,{pdfVals:{page:'1',x:'abc',y:'72',width:'150',height:'50'}});
    await sign('pdf.invoke_fail','signContractPdf',18,{pdfVals:pdfOk,sb:{fn:{'contract-pdf-sign':{data:{error:'서명<함수실패>'},error:null}}}});
    await sign('pdf.invoke_missing','signContractPdf',18,{pdfVals:pdfOk,sb:{fn:{'contract-pdf-sign':{data:null,error:{}}}}});
    await sign('pdf.ok','signContractPdf',18,{pdfVals:pdfOk});
    // 세 구역 통합 서명
    const intCanvas=ready=>({dataset:{dirty:ready?'true':'false',confirmed:ready?'true':'false',signatureId:''},toDataURL:()=> 'data:image/png;base64,SIG'});
    const intSign=async(name,id,q)=>{
      const o2=q||{};const d=makeDom();
      const doc={querySelector:sel=>{if(/^canvas\[data-contract-signature/.test(sel))return intCanvas(o2.ready!==false);const m=sel.match(/^\[data-pdf-([a-z]+)="/);if(m)return {value:(o2.pdfVals||{page:'1',x:'10',y:'10',width:'100',height:'40'})[m[1]]};return null;},querySelectorAll:()=>[]};
      const r=await asRole('staff',{$:d.$,document:doc},o2.sb);
      r.api.set('CONTRACT_ROWS',CONTRACT_ROWS.map(x=>Object.assign({},x)));
      if(o2.declined)r.ctx.__confirm=false;
      await r.api.completeIntegratedContract(id);await flush();
      out['sign.int.'+name]=jj([d.hist.filter(h=>h[0].startsWith('#contractSignMsg')).map(h=>h.join('|')),r.log,r.statuses,r.ctx.sb.rpcCalls.map(c=>[c[0],c[1]&&c[1].p_contract_id]),r.ctx.sb.fn.map(f=>[f[0],Object.keys(f[1]).sort()])]);
    };
    await intSign('not_ready',17,{ready:false});
    await intSign('not_integrated',13);
    await intSign('declined',17,{declined:true});
    await intSign('bad_pos',17,{pdfVals:{page:'0',x:'10',y:'10',width:'100',height:'40'}});
    await intSign('confirm_fail',17,{sb:{rpc:{confirm_contract_pdf_source:{error:{message:'확인<실패>'}}}}});
    await intSign('invoke_fail',17,{sb:{fn:{'contract-pdf-sign':{data:null,error:{message:'함수<실패>'}}}}});
    await intSign('pdf_ok',17);
    const rowNoPdf=Object.assign({},CONTRACT_ROWS[6],{source_pdf_path:null});
    { const d=makeDom();const doc={querySelector:sel=>/^canvas/.test(sel)?intCanvas(true):null,querySelectorAll:()=>[]};
      const r=await asRole('staff',{$:d.$,document:doc},{rpc:{apply_integrated_contract_signatures:{error:{message:'세서명<실패>'}}}});
      r.api.set('CONTRACT_ROWS',[rowNoPdf]);await r.api.completeIntegratedContract(17);await flush();
      out['sign.int.rpc_fail']=jj([d.hist.filter(h=>h[0].startsWith('#contractSignMsg')).map(h=>h.join('|')),r.log,r.statuses]);
      const r2=await asRole('staff',{$:d.$,document:doc});r2.api.set('CONTRACT_ROWS',[rowNoPdf]);await r2.api.completeIntegratedContract(17);await flush();
      out['sign.int.rpc_ok']=jj([r2.log,r2.statuses,r2.ctx.sb.rpcCalls.map(c=>c[0])]); }
  }
  // P7: 실제 직원·관리자 렌더 경로로 계약/직원 직무 충돌 안내를 확인함.
  if(text.includes('function contractJobGroupWarning(')){
    const profile=Object.assign({},PROFILES[0],{job_group:'desk'});
    const rows=[Object.assign({},CONTRACT_ROWS[2],{fields:{직종:'위생사',계약종료:'2026-10-20'}})];
    for(const role of ['staff','owner']){
      const r=await makeCtx({PROFILES:[profile],ME:{id:profile.user_id,name:profile.name,role}},{tables:{contracts:{list:rows}}});
      const m={innerHTML:''};
      if(role==='staff')await r.api.renderContractEmployee(m);else await r.api.renderContractOwner(m);
      out['p7.job_conflict.'+role]=m.innerHTML;
    }
  }
  return out;
}
module.exports={renderAll,region,chain,lf,makeSb,FakeDate,PROFILES,TEMPLATE,CONTRACT_ROWS,TERMS,SCHED_ROWS};
