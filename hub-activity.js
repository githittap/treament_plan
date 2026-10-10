/* 직원허브 사용 기록: 화면 동작을 막지 않는 수집 + 원장 전용 조회. */
(function(root){
'use strict';
const KINDS=['enter','leave','tab','click','write','view','download'];
const TEXTS={title:'👁 사용 기록',today:'오늘',week:'7일',month:'30일',custom:'직접',all_staff:'모든 직원',all_kind:'모든 종류',from:'시작일',to:'마지막 날',staff:'직원',kind:'종류',time:'날짜 시각',target:'대상',device:'기기',load:'조회',more:'200줄 더 보기',csv:'CSV 내려받기',summary:'직원별 요약',first:'오늘 들어온 시각',last:'마지막 활동',days:'이번 달 접속 일수',empty:'기록 없음',error:'기록을 불러오지 못했음',loading:'불러오는 중…',csv_error:'CSV를 만들지 못했음',enter:'접속',leave:'나감',tab:'탭 열람',click:'클릭',write:'작성·수정·삭제',view:'열람',download:'내려받기·인쇄',csv_name:'허브_사용기록',count:'{n}건 표시 중임',owner_only:'원장만 볼 수 있음',t_notice:'공지',t_consultation_inbox:'상담 문의',t_consultation_inbox_reply:'상담 문의 답변',t_consultation_inbox_handled:'상담 문의 처리',t_suggestions:'건의',t_suggestion_comments:'건의 댓글',t_approval_docs:'결재',t_employee_documents:'직원 서류',t_leave_requests:'연차 신청',t_leave_application_documents:'연차신청서',t_employment_certificates:'재직증명서',t_contracts:'근로계약서',t_consultation_journals:'상담일지',t_hub:'허브'};
function targetLabel(t){const k='t_'+t;return TEXTS[k]?T(k):t;}
function T(key,vars){const def=TEXTS[key]||key;return typeof root.hubText==='function'?root.hubText('actlog.'+key,def,vars):String(def).replace(/\{(\w+)\}/g,(m,k)=>vars&&k in vars?vars[k]:m);}
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function label(el){
 if(!el||/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)||el.isContentEditable)return '';
 const named=el.getAttribute&&el.getAttribute('data-log');if(named)return String(named).slice(0,40);
 if(el.querySelector&&el.querySelector('input,textarea,select,[contenteditable]'))return String(el.tagName||'button').toLowerCase();
 return String(el.textContent||el.getAttribute&&el.getAttribute('aria-label')||el.tagName||'button').trim().replace(/\s+/g,' ').slice(0,40);
}
function safeId(value){return /^(?:[0-9]+|[0-9a-f]{8}-[0-9a-f-]{27,36})$/i.test(String(value||''))?String(value).slice(0,100):null;}
function event(kind,target,id,meta){
 const clean={};if(meta&&Number.isFinite(meta.duration_seconds))clean.duration_seconds=Math.min(86400,Math.max(0,Math.floor(meta.duration_seconds)));
 if(meta&&['insert','update','delete','upsert','rpc'].includes(meta.action))clean.action=meta.action;
 return {kind,target:String(target||'hub').slice(0,200),target_id:safeId(id),meta:clean};
}
function device(ua){const mobile=/Android|iPhone|iPad|Mobile/i.test(ua||''),browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Browser';return (mobile?'폰':'PC')+' · '+browser;}
let state=null,queue=[],interval=null,installed=false,session='',entered=0,lastTab='';
function enabled(){return !!(state&&state.me&&state.me.id);}
function record(kind,target,id,meta){try{if(enabled()&&KINDS.includes(kind))queue.push({...event(kind,target,id,meta),session_id:session,user_agent_short:device(root.navigator&&root.navigator.userAgent)});}catch(_){} }
async function flush(unloading){
 if(!enabled())return;
 const pending=queue.splice(0);if(!pending.length)return;
 try{
  const token=state.token&&state.token();
  for(let i=0;i<pending.length;i+=50){const events=pending.slice(i,i+50);
   if(unloading&&token&&state.url&&state.key&&typeof root.fetch==='function'){
    // token은 메모리의 현재 로그인 세션에서만 읽고 기록·디스크에 남기지 않음.
    const body=JSON.stringify({p_events:events});
    if(new TextEncoder().encode(body).length<60000)root.fetch(state.url+'/rest/v1/rpc/log_hub_activity',{method:'POST',headers:{'Content-Type':'application/json',apikey:state.key,Authorization:'Bearer '+token},body,keepalive:true}).catch(()=>{});
   }else await state.sb.rpc('log_hub_activity',{p_events:events});
  }
 }catch(_){} // 수집 실패는 재시도 없이 버리고 화면에 전파하지 않음.
}
function leave(){if(!entered)return;record('leave','hub',null,{duration_seconds:(Date.now()-entered)/1000});entered=0;flush(true);}
function resume(){if(!enabled()||entered)return;entered=Date.now();record('enter','hub');}
function tab(key){if(key&&key!==lastTab){lastTab=key;record('tab',key);}}
const MUTATIONS=new Set(['insert','update','delete','upsert']);
const VIEWS=new Set(['suggestions','suggestion_comments','approval_docs','employee_documents','leave_requests','leave_application_documents','employment_certificates','contracts','consultation_journals']);
const SKIP=new Set(['hub_activity_log','notice_reads','consultation_inbox_views']);
function succeeded(result){return !!result&&!result.error&&!(result.data&&result.data.ok===false);}
function observeBuilder(builder,target,info){
 return new Proxy(builder,{get(obj,key){
  if(key==='then')return (ok,bad)=>Promise.resolve(obj).then(result=>{
   try{if(!info.done&&succeeded(result)){
    info.done=true;const rows=Array.isArray(result.data)?result.data:[result.data],ids=rows.filter(Boolean).map(r=>safeId(r.id||r.user_id)).filter(Boolean);
    const chosen=ids.length?ids:info.ids.length?info.ids:[null];
    if(info.action&&!SKIP.has(target)&&!(Array.isArray(result.data)&&result.data.length===0))chosen.forEach(id=>record('write',target,id,{action:info.action}));
    else if(!info.action&&VIEWS.has(target)&&info.ids.length&&result.data)info.ids.forEach(id=>record('view',target,id));
   }}catch(_){}return result;
  }).then(ok,bad);
  const method=Reflect.get(obj,key,obj);if(typeof method!=='function')return method;
  return (...args)=>{if(MUTATIONS.has(key))info.action=key;if(['eq','in'].includes(key)&&['id','item_id','notice_id'].includes(args[0]))info.ids=(Array.isArray(args[1])?args[1]:[args[1]]).map(safeId).filter(Boolean);const next=method.apply(obj,args);return next&&typeof next.then==='function'?observeBuilder(next,target,info):next;};
 }});
}
function instrument(sb){
 if(!sb||typeof sb.from!=='function'||typeof sb.rpc!=='function'||sb.__hubActivityObserved)return;
 const from=sb.from.bind(sb),rpc=sb.rpc.bind(sb);
 sb.from=function(target){return observeBuilder(from(target),target,{ids:[],action:null,done:false});};
 sb.rpc=function(name,args,options){
  const request=rpc(name,args,options);
  // 읽기 RPC·로그 수집은 제외. 저장 RPC는 서버 성공 뒤에만 이름·ID를 남김.
  if(name==='log_hub_activity'||name==='consultation_inbox_record_view'||!/^(save_|submit_|create_|update_|delete_|remove_|cancel_|approve_|reject_|confirm_|record_|mark_|set_|sign_|grant_|revoke_|apply_|review_|issue_|process_|request_|replace_|respond_|register_|prepare_|copy_|disable_|attendance_issue_add_|payment_request_(act|add)|payroll_(move|archive|restore)|consultation_inbox_(convert|record|reply|set)|fortune_(draw|mark|save))/.test(name))return request;
  return Promise.resolve(request).then(result=>{if(succeeded(result)){const data=Array.isArray(result.data)?result.data[0]:result.data,id=safeId(data&&typeof data==='object'?data.id||data.doc_id||data.request_id:data)||safeId(args&&Object.entries(args).find(([k])=>/^p_(id|.*_id)$/.test(k))?.[1]);record('write',name,id,{action:'rpc'});}return result;});
 };
 if(sb.storage&&sb.storage.from){const storageFrom=sb.storage.from.bind(sb.storage);sb.storage.from=function(bucket){const storage=storageFrom(bucket);return new Proxy(storage,{get(obj,key){const fn=Reflect.get(obj,key,obj);if(typeof fn!=='function')return fn;if(key!=='download'&&key!=='createSignedUrl')return fn.bind(obj);return (...args)=>Promise.resolve(fn.apply(obj,args)).then(result=>{if(succeeded(result))record(key==='download'||args[2]?.download?'download':'view','storage:'+bucket);return result;});}});};}
 sb.__hubActivityObserved=true;
}
function start(options){
 if(state&&state.me.id===options.me.id){state={...state,...options,me:{...options.me}};return;}
 if(state){leave();queue=[];}
 state={...options,me:{...options.me}};session=root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);lastTab='';entered=Date.now();
 try{instrument(state.sb);}catch(_){}record('enter','hub');
 if(interval)clearInterval(interval);interval=setInterval(()=>flush(false),5000);
 const doc=options.document===null?null:root.document;if(installed||!doc)return;installed=true;
 doc.addEventListener('click',e=>{try{
  const el=e.target&&e.target.closest&&e.target.closest('button,a,[role="button"],input[type="button"],input[type="submit"]');if(!el||el.closest('[contenteditable]'))return;
  const name=label(el)||el.tagName==='INPUT'&&'button';if(!name)return;
  const call=el.getAttribute('onclick')||'',download=el.hasAttribute('download')||/^\s*(?:print|download|save\w*Pdf)/i.test(call);record(download?'download':'click',name,el.getAttribute('data-log-id'));
  if(/(?:View|Range|SubTab|Panel)\(/.test(call)){const fn=call.match(/^\s*(\w+)/);if(fn)record('tab','subtab:'+fn[1]);}
  const inline=call.match(/\b([A-Z_]*(?:VIEW|TAB|PANEL))\s*=\s*['"]([a-z0-9_-]+)['"]/i);if(inline)record('tab',inline[1]+':'+inline[2]);
 }catch(_){}},true);
 doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='hidden')leave();else resume();});
 root.addEventListener('pagehide',leave);root.addEventListener('pageshow',resume);root.addEventListener('beforeprint',()=>record('download','print'));
}
function stop(){leave();state=null;queue=[];if(interval)clearInterval(interval);interval=null;}
function csvCell(value){let s=String(value==null?'':value);if(/^[\s\u0000-\u001f]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function kstDate(date){return new Date(date.getTime()+9*3600000).toISOString().slice(0,10);}
function dates(range,now=new Date()){const to=kstDate(now),d=new Date(to+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(range==='week'?6:range==='month'?29:0));return {from:d.toISOString().slice(0,10),to};}
function bounds(from,to){if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)throw new Error('invalid_filter');const end=new Date(to+'T00:00:00+09:00');end.setUTCDate(end.getUTCDate()+1);return {p_from:new Date(from+'T00:00:00+09:00').toISOString(),p_to:end.toISOString()};}
function time(value){if(!value)return '—';return new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});}
function nameOf(id,profiles){return (profiles||[]).find(p=>p.user_id===id)?.name||id;}
let ui=null,uiGeneration=0;
function filteredArgs(model){return {...bounds(model.from,model.to),p_user:model.user||null,p_kind:model.kind||null};}
function rowsHtml(rows,profiles){return rows.map(r=>'<tr><td>'+esc(time(r.occurred_at))+'</td><td>'+esc(nameOf(r.user_id,profiles))+'</td><td>'+esc(T(r.kind))+'</td><td>'+esc(targetLabel(r.target))+(r.target_id?' <small>#'+esc(r.target_id)+'</small>':'')+'</td><td>'+esc(r.user_agent_short||'—')+'</td></tr>').join('');}
function summaryHtml(rows,profiles){return '<div class="tblwrap"><table><thead><tr>'+['staff','first','last','days'].map(k=>'<th>'+esc(T(k))+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(nameOf(r.user_id,profiles))+'</td><td>'+esc(time(r.first_enter))+'</td><td>'+esc(time(r.last_activity))+'</td><td>'+Number(r.month_days||0)+'</td></tr>').join('')+'</tbody></table></div>';}
async function render(container,options){
 if(!options.me||options.me.role!=='owner'){container.innerHTML='<div class="empty">'+esc(T('owner_only'))+'</div>';return;}
 const range=dates('today');ui={...options,container,...range,rows:[],summary:[],user:'',kind:'',more:false,offset:0};
 container.innerHTML='<section class="card actlog"><h2>'+esc(T('title'))+'</h2><div class="rowflex actlog-filters">'+
 '<select id="actlog-range" aria-label="'+esc(T('kind'))+'">'+['today','week','month','custom'].map(k=>'<option value="'+k+'">'+esc(T(k))+'</option>').join('')+'</select>'+
 '<label>'+esc(T('from'))+' <input id="actlog-from" type="date" value="'+range.from+'"></label><label>'+esc(T('to'))+' <input id="actlog-to" type="date" value="'+range.to+'"></label>'+
 '<select id="actlog-user" aria-label="'+esc(T('staff'))+'"><option value="">'+esc(T('all_staff'))+'</option>'+(options.profiles||[]).map(p=>'<option value="'+esc(p.user_id)+'">'+esc(p.name)+'</option>').join('')+'</select>'+
 '<select id="actlog-kind" aria-label="'+esc(T('kind'))+'"><option value="">'+esc(T('all_kind'))+'</option>'+KINDS.map(k=>'<option value="'+k+'">'+esc(T(k))+'</option>').join('')+'</select>'+
 '<button class="mini" id="actlog-load">'+esc(T('load'))+'</button><button class="mini" id="actlog-csv">'+esc(T('csv'))+'</button></div><div id="actlog-error" class="msg"></div><h3>'+esc(T('summary'))+'</h3><div id="actlog-summary"></div><div class="tblwrap"><table><thead><tr>'+['time','staff','kind','target','device'].map(k=>'<th>'+esc(T(k))+'</th>').join('')+'</tr></thead><tbody id="actlog-rows"></tbody></table></div><div id="actlog-count" class="hint"></div><button class="mini" id="actlog-more" hidden>'+esc(T('more'))+'</button></section>';
 if(!root.document.getElementById('actlog-style')){const style=root.document.createElement('style');style.id='actlog-style';style.textContent='.actlog{min-width:0;max-width:100%}.actlog-filters{flex-wrap:wrap;gap:8px}.actlog-filters>*{max-width:100%;min-width:0}.actlog .tblwrap{max-width:100%;overflow-x:auto}.actlog td{max-width:260px;overflow-wrap:anywhere}.actlog .tblwrap table{min-width:650px}';root.document.head.appendChild(style);}
 const get=id=>container.querySelector('#actlog-'+id);
 get('range').onchange=()=>{if(get('range').value==='custom')return;const d=dates(get('range').value);get('from').value=d.from;get('to').value=d.to;loadPage(false);};
 ['user','kind'].forEach(k=>get(k).onchange=()=>loadPage(false));['from','to'].forEach(k=>get(k).onchange=()=>{get('range').value='custom';});
 get('load').onclick=()=>loadPage(false);get('more').onclick=()=>loadPage(true);get('csv').onclick=exportCsv;
 await loadPage(false);
}
async function loadPage(more){
 if(!ui||ui.container.isConnected===false)return;const model=ui,container=model.container,get=id=>container.querySelector('#actlog-'+id),generation=++uiGeneration;
 get('error').textContent=T('loading');get('more').disabled=true;
 try{
  if(!more){model.from=get('from').value;model.to=get('to').value;model.user=get('user').value;model.kind=get('kind').value;model.rows=[];model.offset=0;}
  const args={...filteredArgs(model),p_offset:model.offset},result=await model.sb.rpc('hub_activity_page',args);
  if(result.error)throw result.error;if(container.isConnected===false||generation!==uiGeneration||model!==ui)return;
  model.rows.push(...result.data||[]);model.offset+=(result.data||[]).length;model.more=(result.data||[]).length===200;
  get('rows').innerHTML=rowsHtml(model.rows,model.profiles);get('count').textContent=model.rows.length?T('count',{n:model.rows.length}):T('empty');get('more').hidden=!model.more;
  if(!more){const summary=await model.sb.rpc('hub_activity_summary');if(summary.error)throw summary.error;if(container.isConnected===false||generation!==uiGeneration||model!==ui)return;model.summary=summary.data||[];get('summary').innerHTML=summaryHtml(model.summary.filter(r=>!model.user||r.user_id===model.user),model.profiles);}
  get('error').textContent='';
 }catch(_){if(container.isConnected!==false&&generation===uiGeneration)get('error').textContent=T('error');}
 finally{if(container.isConnected===false||generation===uiGeneration)get('more').disabled=false;}
}
function csv(rows,profiles){return '\ufeff'+[['time','staff','kind','target','device'].map(k=>T(k)),...rows.map(r=>[time(r.occurred_at),nameOf(r.user_id,profiles),T(r.kind),targetLabel(r.target)+(r.target_id?' #'+r.target_id:''),r.user_agent_short||''])].map(row=>row.map(csvCell).join(',')).join('\r\n');}
async function exportCsv(){
 if(!ui)return;const model=ui,button=model.container.querySelector('#actlog-csv');button.disabled=true;
 try{const args=filteredArgs(model),rows=[];for(let offset=0;;offset+=200){const result=await model.sb.rpc('hub_activity_page',{...args,p_offset:offset});if(result.error)throw result.error;rows.push(...result.data||[]);if((result.data||[]).length<200)break;}
  const url=root.URL.createObjectURL(new Blob([csv(rows,model.profiles)],{type:'text/csv;charset=utf-8'})),a=root.document.createElement('a');a.href=url;a.download=T('csv_name')+'_'+model.from+'_'+model.to+'.csv';a.click();setTimeout(()=>root.URL.revokeObjectURL(url),1000);
 }catch(_){model.container.querySelector('#actlog-error').textContent=T('csv_error');}finally{button.disabled=false;}
}
root.HubActivity={start,stop,record,flush,tab,render,_t:{label,event,csvCell,csv,dates,bounds,rowsHtml,summaryHtml,instrument,device,pending:()=>queue.length}};
})(typeof window!=='undefined'?window:globalThis);
