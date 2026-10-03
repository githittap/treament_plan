/* Separate security pledge, frozen server document, and owner notification aggregates. */
let P9_PLEDGES=new Map();
function p9T(key,values){return hubText(key,typeof HubUi!=='undefined'?HubUi.helpers.hubTextDefByKey(key)?.def||key:key,values);}
function pledgeCanSubmit(signed,read,rules){return signed===true&&read===true&&rules===true;}
function pledgeProgress(row){
  const pledge=P9_PLEDGES.get(Number(row.id));
  return p9T('pledge.progress',{n:pledge?.contract_signatures?.length||(row.integrated_signature_required?3:1),contract:pledge?.staged_at||row.status==='서명완료'?'✓':p9T('pledge.pending'),pledge:pledge?.signed_at?'✓':p9T('pledge.pending')});
}
function pledgeDocumentHtml(pledge){
  const d=pledge.document||{};
  return `<section class="contract-doc pledge-document"><h2>${esc(d['pledge.body.title'])}</h2><ol>${Array.from({length:14},(_,i)=>`<li style="margin:12px 0;white-space:pre-wrap">${esc(d['pledge.body.clause.'+(i+1)])}</li>`).join('')}</ol><p>${esc(d['pledge.body.rules'])}</p>${pledge.signed_at?`<img src="${esc(pledge.signature_png)}" alt="${esc(p9T('pledge.signature'))}" style="max-width:100%;height:60px"><p>${esc(p9T('pledge.signed_meta',{date:pledge.signed_at,version:pledge.version}))}</p>`:''}</section>`;
}
async function loadContractPledges(){
  const {data,error}=await sb.from('contract_security_pledges').select('*');
  if(error)throw error;
  P9_PLEDGES=new Map((data||[]).map(r=>[Number(r.contract_id),r]));
}
async function stageContractPledge(row,signatures){
  const coordinates=row.source_pdf_path?signatures.map(({part})=>{const suffix=integratedContract(row)?`${row.id}-${part}`:String(row.id),n=k=>Number(document.querySelector(`[data-pdf-${k}="${suffix}"]`)?.value);return {part,page_no:n('page'),x:n('x'),y:n('y'),width:n('width'),height:n('height')};}):null;
  if(coordinates?.some(c=>!Number.isInteger(c.page_no)||c.page_no<1||![c.x,c.y,c.width,c.height].every(Number.isFinite)||c.x<0||c.y<0||c.width<=0||c.height<=0))throw Error(p9T('pledge.coordinates'));
  const {data,error}=await sb.rpc('stage_contract_pledge_signatures',{p_contract_id:row.id,p_signatures:signatures,p_coordinates:coordinates});
  if(error)throw error;
  P9_PLEDGES.set(Number(row.id),Array.isArray(data)?data[0]:data);
  await render();
  document.querySelector(`#pledge-${row.id}`)?.scrollIntoView({block:'start'});
}
async function openSecurityPledge(id){
  const {data,error}=await sb.rpc('prepare_contract_security_pledge',{p_contract_id:id});
  if(error){alert(error.message);return;}
  const pledge=Array.isArray(data)?data[0]:data;
  P9_PLEDGES.set(Number(id),pledge);
  const target=document.querySelector(`#pledge-${id}`);
  if(target){target.innerHTML=securityPledgeCard(pledge);initPledgeCanvas();target.scrollIntoView({block:'start'});}
}
function securityPledgeCard(pledge){
  const id=Number(pledge.contract_id);
  const coordinates=pledgePdfCoordinatesHtml(pledge);
  if(pledge.signed_at)return `${pledgeDocumentHtml(pledge)}<button class="mini" onclick="printPledgeDocument(${id})">${esc(p9T('pledge.print'))}</button>${CONTRACT_ROWS.some(r=>Number(r.id)===id&&r.status==='대기'&&r.source_pdf_path)?`${coordinates}<button class="hbtn pri" onclick="retryPledgePdf(${id})">${esc(p9T('pledge.finish_pdf'))}</button><div class="msg" id="pledgeMsg-${id}" role="status"></div>`:''}`;
  return `${pledgeDocumentHtml(pledge)}${coordinates}<label style="display:block;margin:12px 0"><input type="checkbox" id="pledgeRead-${id}" onchange="updatePledgeButton(${id})"> ${esc(p9T('pledge.read'))}</label><label style="display:block;margin:12px 0"><input type="checkbox" id="pledgeRules-${id}" onchange="updatePledgeButton(${id})"> ${esc(pledge.document['pledge.body.rules'])}</label><h3>${esc(p9T('pledge.signature'))}</h3><canvas class="contract-signature" width="720" height="180" data-pledge-signature="${id}" data-dirty="false"></canvas><button class="mini" onclick="clearPledgeCanvas(${id})">${esc(p9T('pledge.clear'))}</button> <button class="hbtn pri" id="pledgeSubmit-${id}" disabled onclick="submitSecurityPledge(${id})">${esc(p9T('pledge.submit'))}</button><div class="msg" id="pledgeMsg-${id}" role="status"></div>`;
}
function pledgePdfCoordinatesHtml(pledge){
  const row=CONTRACT_ROWS.find(r=>Number(r.id)===Number(pledge.contract_id));
  if(!row?.source_pdf_path||row.status!=='대기')return '';
  return `<div class="hint">${esc(p9T('pledge.coordinates'))}</div>`+(pledge.pdf_coordinates||[]).map(c=>`<div class="rowflex" style="margin:8px 0">${['page','x','y','width','height'].map(k=>`<label class="mini">${esc(k==='page'?ctT('contract.f_page','페이지'):k==='width'?ctT('contract.f_w','가로'):k==='height'?ctT('contract.f_h','세로'):k.toUpperCase())} <input class="mini" type="number" min="${k==='x'||k==='y'?0:1}" value="${Number(c[k==='page'?'page_no':k])}" data-pdf-${k}="${row.id}-${c.part}" style="width:70px"></label>`).join('')}</div>`).join('');
}
async function validatePledgePdf(id,signaturePng){
  const pledge=P9_PLEDGES.get(Number(id));
  const coordinates=pledge.contract_signatures.map(({part})=>{const n=k=>Number(document.querySelector(`[data-pdf-${k}="${id}-${part}"]`)?.value);return {part,page_no:n('page'),x:n('x'),y:n('y'),width:n('width'),height:n('height')};});
  const {error:confirmError}=await sb.rpc('confirm_contract_pdf_source',{p_contract_id:id});if(confirmError)throw confirmError;
  const {data,error}=await sb.functions.invoke('contract-pdf-sign',{body:{action:'validate_pledge',contract_id:id,signatures:pledge.contract_signatures,coordinates,pledge_signature_png:signaturePng}});
  if(error||data?.error||data?.validated!==true)throw Error(data?.error||error?.message||p9T('pledge.coordinates'));
  pledge.pdf_coordinates=coordinates;
}
function updatePledgeButton(id){
  const c=document.querySelector(`[data-pledge-signature="${id}"]`),b=document.querySelector(`#pledgeSubmit-${id}`);
  if(b)b.disabled=!pledgeCanSubmit(c?.dataset.dirty==='true',document.querySelector(`#pledgeRead-${id}`)?.checked,document.querySelector(`#pledgeRules-${id}`)?.checked);
}
function clearPledgeCanvas(id){const c=document.querySelector(`[data-pledge-signature="${id}"]`);c.getContext('2d').clearRect(0,0,c.width,c.height);c.dataset.dirty='false';updatePledgeButton(id);}
function initPledgeCanvas(){
  document.querySelectorAll('canvas[data-pledge-signature]').forEach(c=>{
    if(c.dataset.bound)return;c.dataset.bound='true';const ctx=c.getContext('2d');ctx.lineWidth=2.4;ctx.lineCap='round';ctx.strokeStyle='#111';let drawing=false;
    const point=e=>{const r=c.getBoundingClientRect();return [(e.clientX-r.left)*c.width/r.width,(e.clientY-r.top)*c.height/r.height];};
    c.addEventListener('pointerdown',e=>{e.preventDefault();drawing=true;c.setPointerCapture(e.pointerId);ctx.beginPath();ctx.moveTo(...point(e));});
    c.addEventListener('pointermove',e=>{if(!drawing)return;e.preventDefault();ctx.lineTo(...point(e));ctx.stroke();c.dataset.dirty='true';updatePledgeButton(c.dataset.pledgeSignature);});
    c.addEventListener('pointerup',()=>drawing=false);c.addEventListener('pointercancel',()=>drawing=false);
  });
}
async function submitSecurityPledge(id){
  const canvas=document.querySelector(`[data-pledge-signature="${id}"]`),read=document.querySelector(`#pledgeRead-${id}`)?.checked,rules=document.querySelector(`#pledgeRules-${id}`)?.checked,msg=document.querySelector(`#pledgeMsg-${id}`);
  if(!pledgeCanSubmit(canvas?.dataset.dirty==='true',read,rules))return;
  const button=document.querySelector(`#pledgeSubmit-${id}`);button.disabled=true;setStatus('saving');
  try{
    const row=CONTRACT_ROWS.find(r=>Number(r.id)===Number(id)),signaturePng=canvas.toDataURL('image/png');
    if(row?.source_pdf_path&&row.status==='대기')await validatePledgePdf(id,signaturePng);
    const {data,error}=await sb.rpc('submit_contract_security_pledge',{p_contract_id:id,p_signature_png:signaturePng,p_read_confirmed:read,p_rules_confirmed:rules,p_version:P9_PLEDGES.get(Number(id)).version});
    if(error)throw error;
    P9_PLEDGES.set(Number(id),Array.isArray(data)?data[0]:data);
    if(row?.source_pdf_path&&row.status==='대기')await finishPledgePdf(id,false);
    setStatus('saved');await render();
  }catch(e){if(P9_PLEDGES.get(Number(id))?.signed_at)await render();const target=document.querySelector(`#pledgeMsg-${id}`)||msg;if(target)target.textContent=p9T('pledge.failed',{msg:e.message});setStatus('error');button.disabled=false;}
}
async function finishPledgePdf(id,rerender=true){
  const pledge=P9_PLEDGES.get(Number(id));if(!pledge?.signed_at)return;
  const {error:confirmError}=await sb.rpc('confirm_contract_pdf_source',{p_contract_id:id});if(confirmError)throw confirmError;
  const {data,error}=await sb.functions.invoke('contract-pdf-sign',{body:{contract_id:id,signatures:pledge.contract_signatures,coordinates:pledge.pdf_coordinates}});
  if(error||data?.error)throw Error(data?.error||error.message);
  if(rerender)await render();
}
async function retryPledgePdf(id){
  setStatus('saving');try{await validatePledgePdf(id,P9_PLEDGES.get(Number(id)).signature_png);await finishPledgePdf(id);setStatus('saved');}
  catch(e){const msg=document.querySelector(`#pledgeMsg-${id}`);if(msg)msg.textContent=p9T('pledge.failed',{msg:e.message});setStatus('error');}
}
function printPledgeDocument(id){
  const pledge=P9_PLEDGES.get(Number(id));if(!pledge?.signed_at)return;
  const target=document.querySelector(`#pledge-${id}`);if(!target)return;
  target.classList.add('contract-print-target');document.body.classList.add('contract-printing');
  const done=()=>{target.classList.remove('contract-print-target');document.body.classList.remove('contract-printing');window.removeEventListener('afterprint',done);};window.addEventListener('afterprint',done);window.print();
}
async function renderSecurityPledgeDocuments(m){
  const {data:cards,error}=await sb.rpc('get_my_contract_security_pledges');
  if(error)return;
  await loadContractPledges();
  const own=(cards||[]).map(c=>({id:c.contract_id}));
  const ownCards=own.map(c=>{const pledge=P9_PLEDGES.get(Number(c.id));return `<div class="card" id="pledge-${Number(c.id)}"><h2>${esc(p9T('pledge.card_title'))}</h2>${pledge?.signed_at?securityPledgeCard({...pledge,contract_signatures:null}):`<button class="hbtn pri" onclick="openSecurityPledge(${Number(c.id)})">${esc(p9T('pledge.open'))}</button>`}</div>`;}).join('');
  const {data:contracts}=ME.role==='owner'?await sb.from('contracts').select('id,user_id,status,integrated_signature_required').eq('status','서명완료'):{data:[]};
  const overview=ME.role==='owner'?`<div class="card"><h2>${esc(p9T('pledge.overview'))}</h2>${(contracts||[]).map(c=>`<p>${esc(nameOf(c.user_id))} · ${esc(pledgeProgress(c))}</p>`).join('')}</div>`:'';
  m.insertAdjacentHTML('afterbegin',ownCards+overview);initPledgeCanvas();
}
function phoneNotificationCell(row,error){
  if(error||!row)return `<span class="b wait">${esc(p9T('phone.unknown'))}</span>`;
  return Number(row.device_count)>0?`<span class="b ok">${esc(p9T('phone.on',{n:row.device_count,date:contractDate(row.last_enabled_at)}))}</span>`:`<span class="b no">${esc(p9T('phone.off'))}</span><div class="sub" style="min-width:180px;white-space:normal">${esc(p9T('phone.guide'))}</div>`;
}
