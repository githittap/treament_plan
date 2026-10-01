// 차례 2(내 서류함 + 업무자료) 화면 시험 도구 — hr.html에서 두 화면의 코드 조각을 떼어 가짜 자료로 실제로 실행하고, 나온 HTML·메시지를 모아 돌려준다.
// 같은 도구를 옛 코드(허브 글 옮기기 전, 커밋 656ad0d)와 새 코드에 똑같이 돌려 「기본값만 있을 때 글자 하나까지 같음」을 대조한다.
// 옛 코드의 결과는 tests/fixtures/hub2-golden-656ad0d.json 에 저장돼 있다(만든 법: node tests/manual/make-hub2-golden.cjs <옛 hr.html 경로>).
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const lf=s=>String(s).replace(/\r\n/g,'\n');

function region(html,startMarker,endMarker,includeEnd){
  const a=html.indexOf(startMarker);
  if(a<0)throw new Error('시작 표시를 못 찾음: '+startMarker);
  const b=html.indexOf(endMarker,a);
  if(b<0)throw new Error('끝 표시를 못 찾음: '+endMarker);
  return html.slice(a,b+(includeEnd?endMarker.length:0));
}
// supabase 흉내: 어떤 메서드 사슬이든 받아서 표마다 정해진 결과를 돌려준다.
function chain(result){
  const p=new Proxy(function(){},{get(_,k){if(k==='then')return function(res,rej){return Promise.resolve(result).then(res,rej);};return function(){return p;};},apply(){return p;}});
  return p;
}
function makeDom(){
  const reg={};
  function el(sel){
    if(!reg[sel])reg[sel]={value:'',textContent:'',innerHTML:'',checked:false,files:[],style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},querySelectorAll(){return [];}};
    return reg[sel];
  }
  return {reg,$:el};
}

const DOCS=[{id:11,user_id:'u1',document_type:'잠복결핵 검사서',original_name:'결핵.pdf',created_at:'2026-09-01T00:00:00Z',mime_type:'application/pdf'},{id:12,user_id:'u2',document_type:'면허증',original_name:'면허.png',created_at:'2026-09-02T00:00:00Z',mime_type:'image/png'},{id:13,user_id:'u2',document_type:'새종류',original_name:'기타.pdf',created_at:'2026-09-03T00:00:00Z',mime_type:'application/pdf'}];
const CONTRACT_ROWS=[{id:5,user_id:'u1',_kind:'contract',document_type:'근로계약서',original_name:'근로계약서(위생사)',created_at:'2026-09-05T00:00:00Z'}];
const LEAVE_DOCS=[{id:21,user_id:'u1',original_name:'연차신청서.pdf',created_at:'2026-09-10T00:00:00Z',document_type:'연차 신청서'}];
const LEAVE_REQUESTS=[{id:31,date_from:'2026-09-20',date_to:'2026-09-21',type:'연차'},{id:32,date_from:'2026-10-02',date_to:'2026-10-02',type:null}];
const APPROVALS=[{id:41,user_id:'u1',kind:'연차',title:'연차 신청',created_at:'2026-09-11T00:00:00Z',status:'완결'},{id:42,author:'u2',kind:'기타',title:'재직증명서 발급 요청',created_at:'2026-09-12T00:00:00Z',status:'반려'},{id:43,user_id:'u2',kind:'보고',title:'<b>보고</b>',created_at:'2026-09-13T00:00:00Z',status:'대기'}];
const CERTS=[{id:51,approval_doc_id:41}];
const PAYMENTS=[{id:61,payment_item:'소모품 <구매>',amount_krw:123456,deadline_date:'2026-10-05',bank_name:'국민',account_holder:'홍길동',account_number:'123-456',status:'chief_pending'},{id:62,payment_item:'장비',amount_krw:5000,deadline_date:null,bank_name:'신한',account_holder:'김',account_number:'9',status:'owner_pending'},{id:63,payment_item:'교육비',amount_krw:7000,deadline_date:'2026-10-01',bank_name:'농협',account_holder:'이',account_number:'1',status:'approved'},{id:64,payment_item:'기타',amount_krw:1,deadline_date:null,bank_name:'우리',account_holder:'박',account_number:'2',status:'rejected'},{id:65,payment_item:'이상',amount_krw:2,deadline_date:null,bank_name:'우리',account_holder:'박',account_number:'3',status:'weird'}];
const RECEIPTS=[{request_id:61,original_name:'영수증.pdf',storage_path:'u1/61/a.pdf',mime_type:'application/pdf'}];
const FP_ROWS_MINE_NONE=[];
const PROFILES=[{user_id:'u1',name:'김직원',role:'staff',active:true,approved:true},{user_id:'u2',name:'이매니저',role:'manager',active:true,approved:true},{user_id:'u3',name:'박신입',role:'staff',active:true,approved:true}];

function errTexts(){return {documents:'D오류',contracts:'C오류'};}

async function renderAll(html,opts){
  const o=opts||{};
  const text=lf(html);
  const out={};
  const workSrc=region(text,'/* ── 업무자료 ── */','/* work-documents:render-end */',true);
  const onboSrc=region(text,'/* onboarding-guide:test-start */','async function submitOnbo(',false);
  const hubJs=o.engine?lf(fs.readFileSync(path.join(__dirname,'..','..','hub-texts.js'),'utf8')):null;
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const md=s=>s?String(s).slice(5).replace('-','/'):'';

  async function makeCtx(srcs,extra){
    const dom=makeDom(),alerts=[];
    const ctx={console,esc,md,$:dom.$,PROFILES,ME:{id:'u1',name:'김직원',role:'staff',dept:'진료실'},
      isLead:()=>['chief','owner'].includes(ctx.ME.role),isMgr:()=>['manager','chief','owner'].includes(ctx.ME.role),isLeaveDocsLead:()=>['manager','chief','owner'].includes(ctx.ME.role),
      nameOf:uid=>{const p=PROFILES.find(x=>x.user_id===uid);return p?p.name:(uid||'').slice(0,6);},
      contractDate:s=>s?String(s).slice(0,10):'-',contractTitle:r=>r.title||'근로계약서',
      setStatus(){},render(){},refreshBadges(){},show(){},hide(){},alert:m=>alerts.push(String(m)),prompt:()=>'사유입니다',confirm:()=>true,
      documentPreviewMarkup:()=>'',previewStorageAttachmentStub:null,openLeave(){},
      crypto:{randomUUID:()=>'uuid-1'},URL:{createObjectURL:()=> 'blob:x',revokeObjectURL(){}},setTimeout:()=>0,
      document:{createElement:()=>({click(){}}),querySelector:()=>null},
      sb:{from:()=>chain({data:[],error:null})}};
    Object.assign(ctx,extra||{});
    vm.createContext(ctx);
    if(o.shim||hubJs){const prevWin=ctx.window;ctx.window=ctx;if(prevWin&&typeof prevWin==='object')Object.assign(ctx,prevWin);} // 브라우저처럼 window가 전역 자신
    if(o.shim){ // 허브 설정 엔진을 못 불러왔을 때 hr.html 맨 위의 대비책(shim)을 그대로 돌린다
      const m=text.match(/if\(typeof window\.hubText!=='function'\)\{[\s\S]*?\n\}/);
      if(!m)return {ctx,dom,alerts}; // 옛 코드에는 대비책이 없음
      vm.runInContext(m[0],ctx);
    }else if(!hubJs){
      ctx.hubList=(k,d)=>d; // 엔진도 대비책도 없는 가장 빈 환경: 목록만 기본값을 돌려주는 정도
    }
    if(hubJs){
      vm.runInContext(hubJs,ctx);
      ctx.HubUi.setSettings(o.settings||{});
      if(o.textRows||o.loadFail){
        await ctx.HubUi.load({from(){const api={select(){return api;},then(res,rej){return Promise.resolve(o.loadFail?{data:null,error:{message:'x'}}:{data:o.textRows,error:null}).then(res,rej);}};return api;}});
      }
    }
    for(const s of srcs)vm.runInContext(s,ctx);
    return {ctx,dom,alerts};
  }

  /* ───────── 업무자료 ───────── */
  for(const [mode,keySrc] of [['push',workSrc],['nopush',workSrc.replace(/const PUSH_VAPID_PUBLIC_KEY='[^']*';/,"const PUSH_VAPID_PUBLIC_KEY='';")]]){
    const {ctx}=await makeCtx([keySrc+';this.api={renderWorkDocuments,pushNotificationCard,subscribePushNotifications,unsubscribePushNotifications,setQuery:q=>{WORK_DOC_QUERY=q;},setGuide:v=>{WORK_DOC_GUIDE_OPEN=v;},workDocuments};']);
    const api=ctx.api;
    const run=ME=>{ctx.ME=ME;const m={innerHTML:''};api.renderWorkDocuments(m);return m.innerHTML;};
    if(mode==='push'){
      out['work.clinical']=run({id:'u1',dept:'진료실'});
      out['work.consult_group']=run({id:'u1',dept:'기공팀',job_group:'clinical_consult'});
      out['work.other_dept']=run({id:'u2',dept:'기공팀'});
      api.setQuery('없는자료');out['work.empty_search']=run({id:'u1',dept:'진료실'});api.setQuery('');
      api.setGuide(true);out['work.guide']=run({id:'u1',dept:'진료실'});api.setGuide(false);
    }
    out['work.push_card.'+mode]=api.pushNotificationCard();
    if(mode==='nopush'){
      const dom=ctx.$;
      const msgOf=()=>dom('#pushMsg').textContent;
      dom('#pushMsg').textContent='';
      await api.subscribePushNotifications();out['work.sub.not_ready']=msgOf();
    }
  }
  // 등록·해제 메시지 가지가지(키 있음)
  async function pushFlow(name,setup,fn){
    const {ctx}=await makeCtx([workSrc+';this.api={subscribePushNotifications,unsubscribePushNotifications};'],setup(),);
    ctx.$('#pushMsg').textContent='';
    await ctx.api[fn]();
    out['work.'+name]=ctx.$('#pushMsg').textContent;
  }
  const sub={endpoint:'https://x/e',toJSON:()=>({endpoint:'https://x/e'})};
  const reg=(s,sb2)=>({pushManager:{getSubscription:async()=>s,subscribe:async()=>sub}});
  await pushFlow('sub.unsupported',()=>({navigator:{},window:{}}),'subscribePushNotifications');
  await pushFlow('sub.denied',()=>({navigator:{serviceWorker:{ready:Promise.resolve(reg(null))}},window:{PushManager:function(){}},Notification:{requestPermission:async()=>'denied'}}),'subscribePushNotifications');
  await pushFlow('sub.ok',()=>({navigator:{serviceWorker:{ready:Promise.resolve(reg(null))}},window:{PushManager:function(){}},Notification:{requestPermission:async()=>'granted'},atob:s=>Buffer.from(s,'base64').toString('binary'),sb:{from:()=>({upsert:async()=>({error:null})})},ME:{id:'me'}}),'subscribePushNotifications');
  await pushFlow('sub.dberr',()=>({navigator:{serviceWorker:{ready:Promise.resolve(reg(null))}},window:{PushManager:function(){}},Notification:{requestPermission:async()=>'granted'},atob:s=>Buffer.from(s,'base64').toString('binary'),sb:{from:()=>({upsert:async()=>({error:{message:'DB망'}})})},ME:{id:'me'}}),'subscribePushNotifications');
  await pushFlow('sub.throw',()=>({navigator:{serviceWorker:{ready:Promise.reject(new Error('준비실패'))}},window:{PushManager:function(){}},Notification:{requestPermission:async()=>'granted'}}),'subscribePushNotifications');
  await pushFlow('sub.throw_nomsg',()=>({navigator:{serviceWorker:{ready:Promise.reject({})}},window:{PushManager:function(){}},Notification:{requestPermission:async()=>'granted'}}),'subscribePushNotifications');
  await pushFlow('unsub.unsupported',()=>({navigator:{}}),'unsubscribePushNotifications');
  await pushFlow('unsub.none',()=>({navigator:{serviceWorker:{ready:Promise.resolve(reg(null))}}}),'unsubscribePushNotifications');
  const eqChain=err=>({delete:()=>({eq:()=>({eq:async()=>({error:err})})})});
  await pushFlow('unsub.dberr',()=>({navigator:{serviceWorker:{ready:Promise.resolve(reg({endpoint:'e',unsubscribe:async()=>true}))}},ME:{id:'me'},sb:{from:()=>eqChain({message:'삭제불가'})}}),'unsubscribePushNotifications');
  await pushFlow('unsub.browserfail',()=>({navigator:{serviceWorker:{ready:Promise.resolve(reg({endpoint:'e',unsubscribe:async()=>false}))}},ME:{id:'me'},sb:{from:()=>eqChain(null)}}),'unsubscribePushNotifications');
  await pushFlow('unsub.ok',()=>({navigator:{serviceWorker:{ready:Promise.resolve(reg({endpoint:'e',unsubscribe:async()=>true}))}},ME:{id:'me'},sb:{from:()=>eqChain(null)}}),'unsubscribePushNotifications');
  await pushFlow('unsub.throw',()=>({navigator:{serviceWorker:{ready:Promise.reject(new Error('해제실패'))}}}),'unsubscribePushNotifications');

  /* ───────── 내 서류함 ───────── */
  const API='this.api={onboardingGuideItems,onboardingGuideCard,onboardingChecklistRows,onboardingChecklistCard,fingerprintRegistrationCard,fingerprintRequestStatus,employeeSignatureVaultCard,employeeDocumentsCard,paymentRequestCard,paymentRequestStatusLabel,validateGeneralDocument,validateEmployeeDocument,setEmployeeDocumentUploadScope,onboOverview,renderOnbo,submitFingerprintRegistration,saveOnboardingEvidence,uploadEmployeeSignature,uploadEmployeeDocument,uploadLeaveApplicationDocument,submitPaymentRequest,paymentRequestAct,downloadEmployeeDocument,downloadLeaveApplicationDocument,previewStorageAttachment};';
  const {ctx,dom,alerts}=await makeCtx([onboSrc+';'+API],{
    sb:{from:t=>chain(({
      onboarding_items:{data:[{id:1,label:'보안서약 제출',required:true,order_no:1},{id:2,label:'기타 <서류>',required:false,order_no:2},{id:3,label:'면허',required:true,order_no:3}],error:null},
      onboarding_checks:{data:[{user_id:'u1',item_id:1,status:'확인'},{user_id:'u1',item_id:2,status:'제출'},{user_id:'u2',item_id:1,status:'미제출'}],error:null},
      employee_documents:{data:DOCS,error:null},contracts:{data:[],error:null},leave_application_documents:{data:LEAVE_DOCS,error:null},leave_requests:{data:LEAVE_REQUESTS,error:null},
      onboarding_evidence:{data:{bank_name:'국민',account_number:'123',notion_id:'',notion_app_installed:true,notion_workspace_logged_in:false},error:null},
      employee_signature_vault:{data:[{id:1},{id:2}],error:null},approval_docs:{data:APPROVALS,error:null},payment_requests:{data:PAYMENTS,error:null},payment_request_receipts:{data:RECEIPTS,error:null},
      fingerprint_registration_requests:{data:[{user_id:'u1',status:'요청'},{user_id:'u3',status:'요청'}],error:null},employment_certificates:{data:CERTS,error:null},
      onboarding_evidence_completion:{data:[{user_id:'u1',bank_complete:true,notion_complete:false},{user_id:'u2',bank_complete:true,notion_complete:true}],error:null}
    })[t]||{data:[],error:null})}});
  const api=ctx.api;
  const roles=['staff','manager','chief','owner'];
  // 신입 첫날 안내
  out['onbo.guide.items']=JSON.stringify(api.onboardingGuideItems());
  out['onbo.guide.card.collapsed']=api.onboardingGuideCard({collapsed:true});
  out['onbo.guide.card.open']=api.onboardingGuideCard();
  // 체크리스트
  const ev={bank_name:'국민',account_number:'123',notion_id:'n',notion_app_installed:true,notion_workspace_logged_in:true};
  out['onbo.check.rows']=JSON.stringify(api.onboardingChecklistRows(ev,[{document_type:'자격증'}]));
  out['onbo.check.card.partial']=api.onboardingChecklistCard(ev,[{document_type:'자격증'},{document_type:'잠복결핵 검사서',mime_type:'application/pdf'}],[],'u1');
  out['onbo.check.card.empty']=api.onboardingChecklistCard(null,[],[],'u1');
  // 지문 등록
  for(const role of ['staff','manager']){
    ctx.ME={id:'u1',name:'김직원',role};
    for(const [n,rows] of [['none',[]],['pending',[{user_id:'u1',status:'요청'},{user_id:'u3',status:'요청'}]],['done',[{user_id:'u1',status:'완료'}]],['rejected',[{user_id:'u1',status:'반려'}]]])
      out['onbo.fp.'+role+'.'+n]=api.fingerprintRegistrationCard(rows);
  }
  ctx.ME={id:'u1',name:'김직원',role:'staff'};
  out['onbo.fp.status.mapped']=JSON.stringify(['요청','완료','반려',undefined].map(api.fingerprintRequestStatus));
  // 개인서명
  out['onbo.sign.error']=api.employeeSignatureVaultCard([],{message:'x'});
  out['onbo.sign.none']=api.employeeSignatureVaultCard([],null);
  out['onbo.sign.some']=api.employeeSignatureVaultCard([{id:1},{id:2}],null);
  // 서류함
  for(const role of ['staff','manager']){
    ctx.ME={id:'u1',name:'김직원',role};
    out['onbo.docs.'+role+'.full']=api.employeeDocumentsCard(DOCS,null,CONTRACT_ROWS,null,LEAVE_DOCS,null,LEAVE_REQUESTS,APPROVALS,null,[],null,[],null,CERTS);
    out['onbo.docs.'+role+'.errors']=api.employeeDocumentsCard([],{message:'D<오류>'},[],{message:'C오류'},[],{message:'L오류'},[],[],{message:'A오류'},[],null,[],null,[]);
    out['onbo.docs.'+role+'.empty']=api.employeeDocumentsCard([],null,[],null,[],null,[],[],null,[],null,[],null,[]);
  }
  // 결제 요청
  for(const role of ['staff','chief','owner']){
    ctx.ME={id:'u1',name:'김직원',role};
    out['onbo.pay.'+role+'.rows']=api.paymentRequestCard(PAYMENTS,null,RECEIPTS,null);
  }
  ctx.ME={id:'u1',name:'김직원',role:'staff'};
  out['onbo.pay.empty']=api.paymentRequestCard([],null,[],null);
  out['onbo.pay.error']=api.paymentRequestCard([],{message:'표없음'},[],null);
  out['onbo.pay.status']=JSON.stringify(['chief_pending','owner_pending','approved','rejected','x'].map(api.paymentRequestStatusLabel));
  // 서류 검사
  const f=(name,type,size)=>({name,type,size});
  out['onbo.validate']=JSON.stringify([api.validateGeneralDocument(null),api.validateGeneralDocument(f('a.pdf','application/pdf',0)),api.validateGeneralDocument(f('a.pdf','application/pdf',10*1024*1024+1)),api.validateGeneralDocument(f('a.exe','application/pdf',5)),api.validateGeneralDocument(f('a.pdf','application/pdf',5)),
    api.validateEmployeeDocument(f('a.txt','text/plain',5),'잠복결핵 검사서'),api.validateEmployeeDocument(f('a.pdf','application/pdf',5),'잠복결핵 검사서'),api.validateEmployeeDocument(f('a.txt','text/plain',5),'자격증')]);
  // 올릴 종류 바꾸기 단추 글
  dom.$('#edScope').value='연차증빙';api.setEmployeeDocumentUploadScope();out['onbo.scope.leave']=dom.$('#edUploadButton').textContent;
  dom.$('#edScope').value='직원서류';api.setEmployeeDocumentUploadScope();out['onbo.scope.staff']=dom.$('#edUploadButton').textContent;
  // 입사 체크 현황 + 화면 전체
  for(const role of ['staff','manager','owner']){
    ctx.ME={id:'u1',name:'김직원',role};
    out['onbo.overview.'+role]=role==='staff'?'':await api.onboOverview();
    const m={innerHTML:'',querySelectorAll(){return [];}};
    await api.renderOnbo(m);
    out['onbo.render.'+role]=m.innerHTML;
  }
  ctx.sb={from:tb=>chain(tb==='onboarding_evidence_completion'?{data:PROFILES.map(p=>({user_id:p.user_id,bank_complete:true,notion_complete:true})),error:null}:{data:[],error:null})};
  out['onbo.overview.alldone']=await (async()=>{ctx.ME={id:'u1',role:'manager'};return api.onboOverview();})();

  /* 메시지 가지가지 */
  const msgs={};
  async function flow(name,setup,fn){
    const r=await makeCtx([onboSrc+';'+API],setup());
    r.ctx.ME={id:'u1',name:'김직원',role:'manager'};
    r.alerts.length=0;
    await r.ctx.api[fn]();
    msgs[name]={msg:['#fpMsg','#oeMsg','#signatureMsg','#edMsg','#paymentMsg'].map(s=>r.ctx.$(s).textContent).filter(Boolean),alerts:r.alerts.slice()};
    return r;
  }
  const fail=m=>({error:{message:m}});
  await flow('fp.fail',()=>({sb:{from:()=>({upsert:async()=>fail('지문실패')})}}),'submitFingerprintRegistration');
  await flow('fp.ok',()=>({sb:{from:()=>({upsert:async()=>({error:null})})}}),'submitFingerprintRegistration');
  await flow('evidence.fail',()=>({sb:{from:()=>({upsert:async()=>fail('증빙실패')})}}),'saveOnboardingEvidence');
  await flow('sign.badfile',()=>({}),'uploadEmployeeSignature');
  await flow('sign.upfail',()=>({$:(()=>{const d=makeDom();d.$('#signatureFile').files=[{type:'image/png',size:10}];return d.$;})(),sb:{storage:{from:()=>({upload:async()=>fail('서명올리기실패')})}}}),'uploadEmployeeSignature');
  await flow('sign.savefail',()=>({$:(()=>{const d=makeDom();d.$('#signatureFile').files=[{type:'image/png',size:10}];return d.$;})(),sb:{storage:{from:()=>({upload:async()=>({error:null}),remove:async()=>({})})},from:()=>({insert:async()=>fail('서명저장실패')})}}),'uploadEmployeeSignature');
  const docDom=(extra)=>{const d=makeDom();d.$('#edFile').files=[{name:'a.pdf',type:'application/pdf',size:10}];d.$('#edType').value='자격증';d.$('#edLeaveRequest').value='31';Object.assign(d.$('#edUser'),{value:'u1'});if(extra)extra(d);return d.$;};
  await flow('doc.nofile',()=>({$:(()=>{const d=makeDom();return d.$;})()}),'uploadEmployeeDocument');
  await flow('doc.storagefail',()=>({$:docDom(),sb:{storage:{from:()=>({upload:async()=>fail('저장소실패')})}}}),'uploadEmployeeDocument');
  await flow('doc.insertfail',()=>({$:docDom(),sb:{storage:{from:()=>({upload:async()=>({error:null}),remove:async()=>({})})},from:()=>({insert:async()=>fail('목록실패')})}}),'uploadEmployeeDocument');
  await flow('leavedoc.norequest',()=>({$:docDom(d=>{d.$('#edLeaveRequest').value='';})}),'uploadLeaveApplicationDocument');
  await flow('leavedoc.upfail',()=>({$:docDom(),sb:{storage:{from:()=>({upload:async()=>fail('연차올리기실패')})}}}),'uploadLeaveApplicationDocument');
  await flow('leavedoc.savefail',()=>({$:docDom(),sb:{storage:{from:()=>({upload:async()=>({error:null}),remove:async()=>({})})},from:()=>({insert:async()=>fail('연차저장실패')})}}),'uploadLeaveApplicationDocument');
  const payDom=(vals)=>{const d=makeDom();Object.entries(vals).forEach(([k,v])=>{d.$(k).value=v;});d.$('#paymentFiles').files=[];return d.$;};
  await flow('pay.missing',()=>({$:payDom({'#paymentItem':'','#paymentAmount':'0'})}),'submitPaymentRequest');
  await flow('pay.rpcfail',()=>({$:payDom({'#paymentItem':'소모품','#paymentAmount':'1000','#paymentBank':'국민','#paymentHolder':'홍','#paymentAccount':'1'}),sb:{rpc:async()=>fail('요청실패')}}),'submitPaymentRequest');
  const payDomFile=()=>{const d=makeDom();Object.entries({'#paymentItem':'소모품','#paymentAmount':'1000','#paymentBank':'국민','#paymentHolder':'홍','#paymentAccount':'1'}).forEach(([k,v])=>{d.$(k).value=v;});d.$('#paymentFiles').files=[{name:'r.pdf',type:'application/pdf',size:10}];return d.$;};
  await flow('pay.fileupfail',()=>({$:payDomFile(),sb:{rpc:async()=>({data:9,error:null}),storage:{from:()=>({upload:async()=>fail('영수증올리기실패'),remove:async()=>({})})}}}),'submitPaymentRequest');
  await flow('pay.filelinkfail',()=>({$:payDomFile(),sb:{rpc:async(n)=>n==='submit_payment_request'?{data:9,error:null}:fail('연결실패'),storage:{from:()=>({upload:async()=>({error:null}),remove:async()=>({})})}}}),'submitPaymentRequest');
  {
    const r=await makeCtx([onboSrc+';'+API],{sb:{rpc:async()=>fail('결재실패')}});
    r.ctx.ME={id:'u1',role:'owner'};await r.ctx.api.paymentRequestAct(61,'reject');msgs['pay.actfail']={alerts:r.alerts.slice()};
  }
  {
    const r=await makeCtx([onboSrc+';'+API],{sb:{from:()=>chain({data:null,error:null})}});
    await r.ctx.api.downloadEmployeeDocument(1);await r.ctx.api.downloadLeaveApplicationDocument(1);
    msgs['dl.notfound']={alerts:r.alerts.slice()};
    const r2=await makeCtx([onboSrc+';'+API],{sb:{from:()=>chain({data:{storage_path:'p',original_name:'n'},error:null}),storage:{from:()=>({download:async()=>({data:null,error:{message:'내려받기실패'}})})}}});
    await r2.ctx.api.downloadEmployeeDocument(1);await r2.ctx.api.downloadLeaveApplicationDocument(1);await r2.ctx.api.previewStorageAttachment('b','p','n','t');
    msgs['dl.downloadfail']={alerts:r2.alerts.slice()};
    const r3=await makeCtx([onboSrc+';'+API],{sb:{storage:{from:()=>({download:async()=>({data:null,error:null})})}}});
    await r3.ctx.api.previewStorageAttachment('b','p','n','t');
    msgs['dl.nofile']={alerts:r3.alerts.slice()};
  }
  out['onbo.messages']=JSON.stringify(msgs);
  return out;
}
module.exports={renderAll,region,chain,lf};
