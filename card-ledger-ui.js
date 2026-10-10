/* 카드 통합 원장의 원장 전용 화면. DB 쓰기는 원장이 화면에서 저장할 때만 실행됨. */
(function(root){
'use strict';
const TEXTS={
  title:'지출 점검',owner_only:'원장만 사용할 수 있습니다.',loading:'지출 내역을 불러오는 중입니다.',
  load_error:'지출 내역을 불러오지 못했습니다. 잠시 후 다시 조회해 주세요.',settings_error:'설정을 읽지 못해 정기결제 편집을 사용할 수 없습니다.',
  from:'시작일',to:'종료일',card:'카드',category:'용도',all:'전체',apply:'조회',empty:'해당 내역이 없습니다.',
  ledger:'통합 원장',monthly:'월별 합계',by_card:'카드별 합계',by_merchant:'가맹점별 합계',
  date:'결제 시각',merchant:'가맹점',amount:'원화 금액',native:'원래 금액',purchase:'승인',cancellation:'취소',
  event:'구분',count:'{n}건',count_label:'건수',unconverted:'원화 환산 전',estimated:'추정',total:'합계',
  new_merchants:'처음 보는 가맹점',new_hint:'아직 용도를 정하지 않은 가맹점입니다. 저장하면 사전에 반영됩니다.',
  dictionary:'가맹점 사전',display_name:'표시 이름',ai_platform:'AI 이름',memo:'메모',save:'저장',saved:'저장했습니다.',
  save_error:'저장하지 못했습니다. 입력 내용은 남겨 두었습니다.',invalid:'입력 내용을 확인해 주세요.',
  recurring:'정기결제 점검',recurring_hint:'검토표와 원장 확인 기록을 옮긴 목록입니다. 저장한 내용이 다음 조회부터 반영됩니다.',
  edit:'고칠 항목',add:'새 항목',service:'서비스',type:'종류',cycle:'주기',quoted_amount:'기록된 금액',krw_amount:'원화 참고액',
  last_paid:'최근 결제',next_renewal:'다음 갱신',evidence:'근거',checked_at:'확인 시각',status:'상태',flags:'표시',note:'설명',
  failed:'읽기 실패 건',failed_hint:'만료 전 실패 건만 표시합니다.',reason:'실패 이유',expires:'만료 시각',body:'문자 내용',
  reconciliation:'월 대조',reconcile_hint:'매월 카드 명세서와 이 원장을 대조할 자리입니다. 명세서 업로드·대조는 다음 단계에서 연결됩니다.',
  more:'앞에서 {n}건을 보여 주고 있습니다. 기간을 좁혀 나머지 내역을 확인해 주세요.',
  range_invalid:'시작일과 종료일을 확인해 주세요.',review_unmatched:'취소 승인 대조 필요',review_ambiguous:'취소 승인 후보 여러 건',review_duplicate:'이미 취소된 승인 확인',
  missing_last4:'끝자리 없음',abroad_filter:'해외 여부',abroad_section:'해외 거래',abroad:'해외',overseas:'해외',domestic:'국내',no_body:'본문 없음',settings:'문구·목록·숫자 기준은 허브 설정에서 고칠 수 있습니다.'
};
const CATEGORIES=[{code:'병원',label:'병원'},{code:'개인',label:'개인'},{code:'AI',label:'AI'},{code:'광고',label:'광고'},{code:'기타',label:'미분류'}];
const CARDS=[{code:'samsung:4430',label:'삼성 4430'},{code:'kb:0051',label:'국민 0051'},{code:'hana:4801',label:'하나 4801'}];
const ISSUERS=[{code:'samsung',label:'삼성'},{code:'kb',label:'국민'},{code:'hana',label:'하나'}];
const FIELDS=['service','type','cycle','quoted_amount','krw_amount','card','last_paid','next_renewal','evidence','checked_at','status','flags','note'];
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const t=(key,vars)=>typeof root.hubText==='function'?root.hubText('ledger.'+key,TEXTS[key],vars):String(TEXTS[key]||key).replace(/\{(\w+)\}/g,(m,k)=>vars&&Object.hasOwn(vars,k)?String(vars[k]):m);
const list=(key,def)=>typeof root.hubList==='function'?root.hubList(key,def):def;
const num=(key,def,min,max)=>{const n=typeof root.hubSettingChecked==='function'?root.hubSettingChecked('ledger.'+key,def):def;return Number.isInteger(n)&&n>=min&&n<=max?n:def;};
const categoryItems=()=>list('list.ledger_categories',CATEGORIES).filter(x=>CATEGORIES.some(d=>d.code===x.code));
const label=(code,items)=>items.find(x=>x.code===code)?.label||code;
const date=at=>{const d=new Date(at);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(d):'';};
const stamp=at=>{const d=new Date(at);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(d):String(at||'');};
const won=value=>'₩'+Number(value).toLocaleString('ko-KR');
const amount=row=>row.amount_krw==null?t('unconverted'):won(row.amount_krw)+(row.fx_source==='fixed_estimate'?' · '+t('estimated'):'');
function cardName(row){const code=row.card_issuer+':'+(row.card_last4||''),cards=list('list.ledger_cards',CARDS),match=cards.find(x=>x.code===code);return match?match.label:label(row.card_issuer,list('list.ledger_issuers',ISSUERS))+' '+(row.card_last4||t('missing_last4'));}
function enrich(rows,merchants){const map=new Map(merchants.map(m=>[String(m.id),m]));return rows.map(r=>{const m=map.get(String(r.merchant_id));return {...r,category:m?.category||'기타',display_name:m?.display_name||r.merchant};});}
function filter(rows,f){return rows.filter(r=>{const d=date(r.transaction_at);return d&&(!f.from||d>=f.from)&&(!f.to||d<=f.to)&&(!f.card||r.card_issuer+':'+(r.card_last4||'')===f.card)&&(!f.category||r.category===f.category)&&(!f.abroad||r.abroad===f.abroad);});}
function aggregate(rows,key){const map=new Map();for(const r of rows){const k=key(r);if(!map.has(k))map.set(k,{key:k,count:0,amount:0,unconverted:0});const a=map.get(k);a.count++;if(r.amount_krw==null)a.unconverted++;else a.amount+=Number(r.amount_krw);}return [...map.values()].sort((a,b)=>b.amount-a.amount||a.key.localeCompare(b.key));}
function validateMerchant(value){return value&&typeof value.display_name==='string'&&value.display_name.trim().length>=1&&value.display_name.trim().length<=120&&CATEGORIES.some(c=>c.code===value.category)&&String(value.ai_platform||'').length<=120&&String(value.memo||'').length<=num('memo_max',1000,1,20000);}
function subscriptions(raw){try{const rows=typeof raw==='string'?JSON.parse(raw):raw;return Array.isArray(rows)&&rows.every(r=>r&&typeof r.service==='string'&&FIELDS.every(k=>r[k]==null||typeof r[k]==='string'))?rows:null;}catch{return null;}}
let state=null,host=null,mount=null,context=null,version=0;
function allowed(ctx){return ctx?.me?.role==='owner';}
async function fetchAll(makeQuery){let rows=[];const size=500;for(let offset=0;;offset+=size){const r=await makeQuery().range(offset,offset+size-1);if(r.error)return {data:null,error:r.error};const data=r.data||[];rows.push(...data);if(data.length<size)return {data:rows,error:null};}}
async function load(ctx,f){
  if(!allowed(ctx))return null;
  const run=ctx.fetchAll||fetchAll;
  const makeTransactions=()=>{let q=ctx.sb.from('card_transactions').select('id,card_issuer,card_last4,event_kind,transaction_at,currency,amount_native,amount_krw,fx_source,merchant,merchant_id,abroad,cancellation_review').order('transaction_at',{ascending:false}).order('id',{ascending:false});if(f.from)q=q.gte('transaction_at',f.from+'T00:00:00+09:00');if(f.to)q=q.lte('transaction_at',f.to+'T23:59:59.999+09:00');return q;};
  const result=await Promise.all([
    run(makeTransactions),
    run(()=>ctx.sb.from('card_merchants').select('id,merchant_key,display_name,category,ai_platform,memo').order('id')),
    run(()=>ctx.sb.from('card_sms_failed_raw').select('id,received_at,fail_reason,expires_at,body').gt('expires_at',new Date().toISOString()).order('received_at',{ascending:false}).order('id',{ascending:false})),
    ctx.sb.from('app_settings').select('key,value').eq('key','ledger.subscriptions')
  ]);
  return {filters:{...f},rows:result[0].data||[],merchants:result[1].data||[],failed:result[2].data||[],subscriptions:subscriptions(result[3].data?.[0]?.value),subscriptionRaw:result[3].data?.[0]?.value,errors:result.map(r=>r.error||null)};
}
const options=(items,value,all)=> (all?'<option value="">'+esc(t('all'))+'</option>':'')+items.map(x=>'<option value="'+esc(x.code)+'"'+(x.code===value?' selected':'')+'>'+esc(x.label)+'</option>').join('');
function table(headers,rows){return '<div class="tblwrap ledger-table"><table><thead><tr>'+headers.map(h=>'<th>'+esc(t(h))+'</th>').join('')+'</tr></thead><tbody>'+rows.map(c=>'<tr>'+c.map((v,i)=>'<td data-label="'+esc(t(headers[i]))+'">'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
function summary(rows,title,key){const a=aggregate(rows,key);return '<section class="card"><h3>'+esc(t(title))+'</h3>'+table([title,'count_label','amount'],a.map(r=>[esc(r.key),esc(t('count',{n:r.count})),esc(won(r.amount))+(r.unconverted?' · '+esc(t('unconverted'))+' '+esc(t('count',{n:r.unconverted})): '')]))+'</section>';}
function merchantForm(m){return '<form data-ledger-merchant="'+esc(m.id)+'" class="ledger-edit"><label>'+esc(t('display_name'))+'<input name="display_name" value="'+esc(m.display_name)+'" maxlength="120" required></label><label>'+esc(t('category'))+'<select name="category">'+options(categoryItems(),m.category,false)+'</select></label><label>'+esc(t('ai_platform'))+'<input name="ai_platform" value="'+esc(m.ai_platform||'')+'" maxlength="120"></label><label>'+esc(t('memo'))+'<input name="memo" value="'+esc(m.memo||'')+'" maxlength="'+num('memo_max',1000,1,20000)+'"></label><button class="mini stamp" type="submit">'+esc(t('save'))+'</button><span data-ledger-message role="status"></span></form>';}
function subscriptionEditor(rows,index){const r=rows[index]||{};return '<form data-ledger-subscription="'+index+'" class="ledger-edit">'+FIELDS.map(k=>'<label>'+esc(t(k))+'<textarea name="'+k+'" rows="'+(k==='note'?3:1)+'"'+(k==='service'?' required':'')+' maxlength="'+num('subscription_field_max',4000,1,20000)+'">'+esc(r[k]||'')+'</textarea></label>').join('')+'<button class="mini stamp" type="submit">'+esc(t('save'))+'</button><span data-ledger-message role="status"></span></form>';}
function html(s){
  const f=s.filters,rows=filter(enrich(s.rows,s.merchants),f),limit=num('row_limit',100,5,1000),merchantLimit=num('merchant_limit',50,5,500),failedLimit=num('failed_limit',30,5,1000);
  const cards=list('list.ledger_cards',CARDS).slice();for(const r of s.rows){const code=r.card_issuer+':'+(r.card_last4||'');if(!cards.some(c=>c.code===code))cards.push({code,label:cardName(r)});}
  let out='<div data-ledger-panel><div class="card"><h2>'+esc(t('title'))+'</h2><p class="hint">'+esc(t('settings'))+'</p><form data-ledger-filters class="ledger-edit"><label>'+esc(t('from'))+'<input name="from" type="date" value="'+esc(f.from)+'"></label><label>'+esc(t('to'))+'<input name="to" type="date" value="'+esc(f.to)+'"></label><label>'+esc(t('card'))+'<select name="card">'+options(cards,f.card,true)+'</select></label><label>'+esc(t('category'))+'<select name="category">'+options(categoryItems(),f.category,true)+'</select></label><label>'+esc(t('abroad_filter'))+'<select name="abroad">'+options([{code:'overseas',label:t('overseas')},{code:'domestic',label:t('domestic')}],f.abroad,true)+'</select></label><button class="mini stamp" type="submit">'+esc(t('apply'))+'</button><span data-ledger-message role="status"></span></form></div>';
  if(s.errors[0]||s.errors[1])out+='<div class="card" role="alert">'+esc(t('load_error'))+'</div>';
  else{
    out+='<div class="ledger-summaries">'+summary(rows,'monthly',r=>date(r.transaction_at).slice(0,7))+summary(rows,'by_card',cardName)+summary(rows,'by_merchant',r=>r.display_name)+summary(rows.filter(r=>r.abroad==='overseas'),'abroad_section',r=>r.display_name+' ('+r.currency+')')+'</div>';
    // SpendUi와 같은 계산 부품으로 기간 합계를 구함. 이상 알림은 별도 단계임.
    if(root.SpendCycle&&f.from&&f.to){const a=root.SpendCycle.calculate(rows.map(r=>({at:r.transaction_at,amount:Number(r.amount_krw||0),key:r.category,label:label(r.category,categoryItems()),kind:r.event_kind})),{preset:'custom',from:f.from,to:f.to,now:f.to});out+='<div class="card"><b>'+esc(t('total'))+' '+esc(won(a.total))+'</b></div>';}
    out+='<div class="card"><h3>'+esc(t('ledger'))+'</h3>'+(rows.length?table(['date','card','merchant','category','abroad','event','amount','native'],rows.slice(0,limit).map(r=>[esc(stamp(r.transaction_at)),esc(cardName(r)),esc(r.display_name),esc(label(r.category,categoryItems())),esc(r.abroad==='overseas'?t('overseas'):''),esc(t(r.event_kind))+(r.cancellation_review?'<div class="hint">'+esc(t('review_'+r.cancellation_review))+'</div>':''),esc(amount(r)),esc(r.currency+' '+Number(r.amount_native).toLocaleString('ko-KR'))])):'<div class="empty">'+esc(t('empty'))+'</div>')+(rows.length>limit?'<div class="hint">'+esc(t('more',{n:limit}))+'</div>':'')+'</div>';
  }
  if(!s.errors[1]){const fresh=s.merchants.filter(m=>m.category==='기타');out+='<div class="card"><h3>'+esc(t('new_merchants'))+'</h3><p class="hint">'+esc(t('new_hint'))+'</p>'+(fresh.length?fresh.slice(0,merchantLimit).map(merchantForm).join(''):'<div class="empty">'+esc(t('empty'))+'</div>')+(fresh.length>merchantLimit?'<p>'+esc(t('more',{n:merchantLimit}))+'</p>':'')+'</div><div class="card"><h3>'+esc(t('dictionary'))+'</h3><input data-ledger-merchant-search aria-label="'+esc(t('merchant'))+'" type="search"><div data-ledger-dictionary>'+s.merchants.slice(0,merchantLimit).map(merchantForm).join('')+'</div></div>';}
  const subs=s.subscriptions;
  out+='<div class="card"><h3>'+esc(t('recurring'))+'</h3><p class="hint">'+esc(t('recurring_hint'))+'</p>';
  if(s.errors[3]||!subs)out+='<div role="alert">'+esc(t('settings_error'))+'</div>';
  else out+=(subs.length?table(['service','cycle','krw_amount','card','last_paid','next_renewal','status'],subs.map(r=>['<details><summary>'+esc(r.service)+'</summary>'+FIELDS.filter(k=>!['service','cycle','krw_amount','card','last_paid','next_renewal','status'].includes(k)).map(k=>'<p>'+esc(t(k))+': '+esc(r[k]||'')+'</p>').join('')+'</details>',esc(r.cycle),esc(r.krw_amount),esc(r.card),esc(r.last_paid),esc(r.next_renewal),esc(r.status)])):'<div class="empty">'+esc(t('empty'))+'</div>')+'<label>'+esc(t('edit'))+'<select data-ledger-sub-select>'+subs.map((r,i)=>'<option value="'+i+'">'+esc(r.service)+'</option>').join('')+'</select></label><button data-ledger-sub-add class="mini">'+esc(t('add'))+'</button><div data-ledger-sub-editor>'+subscriptionEditor(subs,subs.length?0:-1)+'</div>';
  out+='</div><div class="card"><h3>'+esc(t('failed'))+'</h3><p class="hint">'+esc(t('failed_hint'))+'</p>';
  out+=s.errors[2]?'<div role="alert">'+esc(t('load_error'))+'</div>':s.failed.length?table(['date','reason','expires','body'],s.failed.slice(0,failedLimit).map(r=>[esc(stamp(r.received_at)),esc(r.fail_reason),esc(stamp(r.expires_at)),'<details><summary>'+esc(t('body'))+'</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(r.body||t('no_body'))+'</pre></details>'])):'<div class="empty">'+esc(t('empty'))+'</div>';
  if(s.failed.length>failedLimit)out+='<div class="hint">'+esc(t('more',{n:failedLimit}))+'</div>';
  return out+'</div><div class="card"><h3>'+esc(t('reconciliation'))+'</h3><p>'+esc(t('reconcile_hint'))+'</p></div></div>';
}
async function saveMerchant(ctx,id,value){if(!allowed(ctx)||!validateMerchant(value))return {ok:false,invalid:true};try{const r=await ctx.sb.from('card_merchants').update({...value,display_name:value.display_name.trim(),updated_at:new Date().toISOString()}).eq('id',id).select('id');return {ok:!r.error&&r.data?.length===1,error:r.error};}catch(error){return {ok:false,error};}}
async function saveSubscription(ctx,rows,index,value){
  if(!allowed(ctx)||!subscriptions(rows)||!FIELDS.every(k=>typeof value[k]==='string'&&value[k].length<=num('subscription_field_max',4000,1,20000))||!value.service.trim()||index< -1||index>=rows.length)return {ok:false,invalid:true};
  // 다른 화면의 편집을 덮어쓰지 않도록 조회한 설정값과 같을 때만 갱신함.
  const next=rows.map(r=>({...r}));if(index===-1)next.push(value);else next[index]=value;
  try{const r=await ctx.sb.from('app_settings').update({value:JSON.stringify(next)}).eq('key','ledger.subscriptions').eq('value',ctx.subscriptionRaw).select('key');return {ok:!r.error&&r.data?.length===1,error:r.error,rows:next,raw:JSON.stringify(next)};}catch(error){return {ok:false,error};}
}
function values(form,keys){return Object.fromEntries(keys.map(k=>[k,String(form.elements.namedItem(k)?.value||'')]));}
function bind(){
  host.addEventListener('submit',async event=>{
    const form=event.target;if(mount.isConnected===false)return;if(!form.matches('[data-ledger-filters],[data-ledger-merchant],[data-ledger-subscription]'))return;event.preventDefault();if(!allowed(context))return;
    const msg=form.querySelector('[data-ledger-message]');
    if(form.hasAttribute('data-ledger-filters')){const f=values(form,['from','to','card','category','abroad']);if(!/^\d{4}-\d{2}-\d{2}$/.test(f.from)||!/^\d{4}-\d{2}-\d{2}$/.test(f.to)||f.from>f.to){msg.textContent=t('range_invalid');return;}await render(mount,context,f);return;}
    const button=form.querySelector('button[type="submit"]');if(button.disabled)return;button.disabled=true;
    const ctx=context,currentHost=host,revision=version;
    let r;
    if(form.hasAttribute('data-ledger-merchant')){const id=form.getAttribute('data-ledger-merchant');r=await saveMerchant(ctx,id,values(form,['display_name','category','ai_platform','memo']));}
    else{r=await saveSubscription(ctx,state.subscriptions,Number(form.getAttribute('data-ledger-subscription')),values(form,FIELDS));if(r.ok&&revision===version){ctx.subscriptionRaw=r.raw;state.subscriptions=r.rows;}}
    button.disabled=false;msg.textContent=t(r.ok?'saved':r.invalid?'invalid':'save_error');
    if(r.ok&&form.hasAttribute('data-ledger-merchant')&&revision===version&&currentHost===host&&mount.isConnected!==false)await render(mount,ctx,state.filters);
  });
  host.addEventListener('change',event=>{if(event.target.matches('[data-ledger-sub-select]'))host.querySelector('[data-ledger-sub-editor]').innerHTML=subscriptionEditor(state.subscriptions,Number(event.target.value));});
  host.addEventListener('click',event=>{if(event.target.closest('[data-ledger-sub-add]'))host.querySelector('[data-ledger-sub-editor]').innerHTML=subscriptionEditor(state.subscriptions,-1);});
  host.addEventListener('input',event=>{if(!event.target.matches('[data-ledger-merchant-search]'))return;const q=event.target.value.trim().toLowerCase();host.querySelector('[data-ledger-dictionary]').innerHTML=state.merchants.filter(m=>(m.display_name+' '+m.merchant_key).toLowerCase().includes(q)).slice(0,num('merchant_limit',50,5,500)).map(merchantForm).join('');});
}
async function render(target,ctx,filters){
  if(target.isConnected===false)return;
  const revision=++version;
  if(!allowed(ctx)){target.innerHTML='<div class="card">'+esc(t('owner_only'))+'</div>';return;}
  const f=filters||{from:date(new Date(new Date().getTime()-(num('default_days',30,1,3660)-1)*86400000)),to:date(new Date()),card:'',category:'',abroad:''};
  target.innerHTML='<div class="card">'+esc(t('loading'))+'</div>';
  let s;try{s=await load(ctx,f);}catch{if(revision===version&&target.isConnected!==false)target.innerHTML='<div class="card" role="alert">'+esc(t('load_error'))+'</div>';return;}
  if(target.isConnected===false||revision!==version||!allowed(ctx)||ctx.isActive&& !ctx.isActive())return;
  state=s;context={...ctx,subscriptionRaw:s.subscriptionRaw};
  target.innerHTML=html(s);mount=target;host=target.querySelector('[data-ledger-panel]');bind();
}
root.HUB_CARD_LEDGER_SETTING_DEFS=[{"key":"ledger.default_days","screen":"지출 점검","label":"기본 조회 일수","where":"지출 점검 화면","def":"30","kind":"int","min":1,"max":3660,"unit":"일"},{"key":"ledger.row_limit","screen":"지출 점검","label":"원장 표시 건수","where":"지출 점검 화면","def":"100","kind":"int","min":5,"max":1000,"unit":"건"},{"key":"ledger.merchant_limit","screen":"지출 점검","label":"가맹점 표시 건수","where":"지출 점검 화면","def":"50","kind":"int","min":5,"max":500,"unit":"건"},{"key":"ledger.failed_limit","screen":"지출 점검","label":"읽기 실패 표시 건수","where":"지출 점검 화면","def":"30","kind":"int","min":5,"max":1000,"unit":"건"},{"key":"ledger.memo_max","screen":"지출 점검","label":"가맹점 메모 최대 길이","where":"지출 점검 화면","def":"1000","kind":"int","min":1,"max":9999,"unit":"자"},{"key":"ledger.subscription_field_max","screen":"지출 점검","label":"정기결제 항목 최대 길이","where":"지출 점검 화면","def":"4000","kind":"int","min":1,"max":9999,"unit":"자"}];
root.HUB_CARD_LEDGER_LIST_DEFS=[{"key":"list.ledger_categories","screen":"지출 점검","label":"용도 이름","addable":false,"where":"지출 점검 화면","note":"표시 이름을 고칠 수 있습니다.","def":[{"code":"병원","label":"병원"},{"code":"개인","label":"개인"},{"code":"AI","label":"AI"},{"code":"광고","label":"광고"},{"code":"기타","label":"미분류"}]},{"key":"list.ledger_cards","screen":"지출 점검","label":"카드 이름","addable":true,"where":"지출 점검 화면","note":"표시 이름을 고칠 수 있습니다.","def":[{"code":"samsung:4430","label":"삼성 4430"},{"code":"kb:0051","label":"국민 0051"},{"code":"hana:4801","label":"하나 4801"}]},{"key":"list.ledger_issuers","screen":"지출 점검","label":"카드사 이름","addable":false,"where":"지출 점검 화면","note":"표시 이름을 고칠 수 있습니다.","def":[{"code":"samsung","label":"삼성"},{"code":"kb","label":"국민"},{"code":"hana","label":"하나"}]}];
root.HUB_CARD_LEDGER_TEXT_DEFS=Object.entries(TEXTS).map(([k,v])=>['ledger.'+k,v]).concat([['tab.ledger',TEXTS.title]]);
root.CardLedgerUi={TEXTS,CATEGORIES,CARDS,ISSUERS,FIELDS,esc,date,enrich,filter,aggregate,validateMerchant,subscriptions,allowed,load,html,saveMerchant,saveSubscription,render};
})(typeof window!=='undefined'?window:globalThis);
