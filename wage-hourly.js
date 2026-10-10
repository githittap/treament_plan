/* 시급제: 계산의 정본은 DB RPC. 월급제 계산·명세서는 사용하지 않음. */
'use strict';
let WH_MONTH='',WH_DATA=null,WH_CONFIG=null,WH_MESSAGE='',WH_CORR_DATE='',WH_CORR_TARGETS=[];
function wageT(k,d,v){return hubT('wh.'+k,d,v);}
function wageMoney(n){return n==null?wageT('review','확인 필요'):Number(n).toLocaleString('ko-KR');}
function wageHourlyNav(){return `<button class="mini ${PAY_VIEW==='hourly'?'stamp':''}" onclick="setPayView('hourly')">${esc(wageT('nav','시급제 월 지급액'))}</button>`;}
function wageHourlyPanelHtml(data,ownerView){
  const owner=ownerView&&ME.role==='owner';
  const users=(data?.users||[]).filter(u=>owner||u.user_id===ME.id);
  if(!users.length&&!owner)return '';
  const date=WH_MONTH||data?.month||today().slice(0,7);
  const gross=u=>u.insured&&u.gross_estimate!=null?`<div class="hint">${esc(wageT('gross','참고용 세전 추정치'))}: ${wageMoney(u.gross_estimate)} ${esc(wageT('won','원'))} · ${esc(u.income_tax_included?wageT('tax_included','설정된 소득세 반영'):wageT('tax_missing','소득세 미반영'))}</div>`:'';
  const details=u=>`<details ${owner?'':'open'}><summary>${esc(u.name)} · ${wageMoney(u.minutes)} ${esc(wageT('minutes','분'))} · ${wageMoney(u.net)} ${esc(wageT('won','원'))}</summary>${gross(u)}
    <div class="tblwrap wage-hourly-days"><table><thead><tr><th>${esc(wageT('date','날짜'))}</th><th>${esc(wageT('category','구분'))}</th><th>${esc(wageT('time','근무분'))}</th><th>${esc(wageT('rate','세후 시급'))}</th><th>${esc(wageT('net','세후 지급액'))}</th><th>${esc(wageT('basis','기록'))}</th></tr></thead><tbody>
    ${(u.days||[]).map(d=>`<tr><td>${esc(d.date)}</td><td>${esc(d.label||'—')}</td><td>${wageMoney(d.minutes)}</td><td>${wageMoney(d.rate)}</td><td>${wageMoney(d.net)}</td><td>${esc(d.needs_review?wageT('review','확인 필요'):d.corrected?wageT('corrected','정정'):wageT('fingerprint','지문'))}</td></tr>`).join('')}
    </tbody></table></div></details>`;
  return `<div class="card" id="wageHourlyPanel"><h2>${esc(owner?wageT('owner_title','시급제 월 지급액'):wageT('self_title','내 시급제 지급액'))}</h2>
    <div class="rowflex" style="flex-wrap:wrap;gap:8px"><label>${esc(wageT('month','대상 월'))} <input class="mini" type="month" value="${esc(date)}" onchange="WH_MONTH=this.value;render()"></label>
    ${owner?`<button class="mini" onclick="wageHourlyDownload()">${esc(wageT('csv','CSV 내려받기'))}</button>`:''}</div>
    <div class="hint">${esc(wageT('calculation_hint','지문 출퇴근의 분을 그대로 계산합니다. 자정을 넘으면 날짜별 시급을 적용하며, 일별 금액은 원 단위로 반올림합니다.'))}</div>
    ${owner?`<div class="tblwrap wage-hourly-summary"><table><tr><th>${esc(wageT('employee','직원'))}</th><th>${esc(wageT('time','근무분'))}</th><th>${esc(wageT('net','세후 지급액'))}</th><th>${esc(wageT('gross','참고용 세전 추정치'))}</th></tr>
    ${users.map(u=>`<tr><td>${esc(u.name)}</td><td>${wageMoney(u.minutes)}</td><td>${wageMoney(u.net)}</td><td>${u.insured&&u.gross_estimate!=null?wageMoney(u.gross_estimate):'—'}</td></tr>`).join('')}</table></div>`:''}
    ${users.map(details).join('')||`<div class="empty">${esc(wageT('empty','시급제 대상자가 없습니다. 아래 설정에서 추가하세요.'))}</div>`}
    ${users.some(u=>u.needs_review)?`<div class="hint">${esc(wageT('incomplete','출퇴근 누락 또는 시급 미입력이 있어 지급액 확인이 필요합니다.'))}</div>`:''}</div>`;
}
function wageHourlyCsv(data){
  if(ME.role!=='owner')return '';
  const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
  const rows=[[wageT('month','대상 월'),wageT('employee','직원'),wageT('time','근무분'),wageT('net','세후 지급액'),wageT('gross','참고용 세전 추정치'),wageT('tax','소득세')]];
  (data?.users||[]).forEach(u=>rows.push([data.month,u.name,u.minutes,u.net,u.insured?u.gross_estimate:null,u.insured?(u.income_tax_included?wageT('tax_included','설정된 소득세 반영'):wageT('tax_missing','소득세 미반영')):'']));
  return '\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n');
}
function wageHourlyDownload(){
  if(ME.role!=='owner'||!WH_DATA)return;
  const url=URL.createObjectURL(new Blob([wageHourlyCsv(WH_DATA)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
  a.href=url;a.download='hourly-'+WH_DATA.month+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function wageHourlyHome(){
  if(ME.role==='deputy')return '';
  if(!WH_MONTH)WH_MONTH=today().slice(0,7);
  const {data,error}=await sb.rpc('wage_hourly_month',{p_month:WH_MONTH,p_user_id:ME.id});
  if(error){if(error.code==='42883'||/disabled|function.*does not exist|schema cache/i.test(error.message||''))return '';return `<div class="card"><div class="hint">${esc(wageT('load_error','시급제 지급액을 불러오지 못했습니다. 잠시 후 다시 확인하세요.'))}</div></div>`;}
  return wageHourlyPanelHtml(data,false);
}
function wageHourlyConfigHtml(config){
  if(ME.role!=='owner')return '';
  const cats=config.settings.categories,employees=config.employees||[],ded=config.settings.deductions;
  const rates=[['pension',wageT('pension','국민연금')],['health',wageT('health','건강보험')],['ltc_health',wageT('ltc','장기요양 (건강보험료 대비)')],['employment',wageT('employment','고용보험')],['local_income',wageT('local_income','지방소득세 (소득세 대비)')]];
  return `<div class="card" id="wageHourlySettings"><details><summary>${esc(wageT('settings','시급제 대상자·시급·공제율 설정'))}</summary>
    <div class="hint">${esc(wageT('settings_hint','대상자에 체크하고 세후 시급을 입력하세요. 체크를 해제해 제외할 수 있습니다. 적용일을 새 날짜로 저장하면 이전 설정은 보존됩니다.'))}</div>
    <div class="tblwrap"><table><tr><th>${esc(wageT('enabled','대상자'))}</th><th>${esc(wageT('employee','직원'))}</th>${cats.map(c=>`<th>${esc(c.label)} · ${esc(wageT('rate','세후 시급'))}</th>`).join('')}<th>${esc(wageT('insured','4대보험 가입 확인'))}</th><th>${esc(wageT('effective','적용일'))}</th><th></th></tr>
    ${employees.map((e,i)=>`<tr><td><input type="checkbox" aria-label="${esc(wageT('enabled','대상자'))}" id="wh-enabled-${i}" ${e.enabled?'checked':''}></td><td>${esc(e.name)}</td>
    ${cats.map((c,j)=>`<td><input class="mini" style="width:110px" type="number" min="0" step="1" id="wh-rate-${i}-${j}" aria-label="${esc(c.label)}" value="${e.rates?.[c.code]??''}"></td>`).join('')}
    <td><input type="checkbox" id="wh-insured-${i}" aria-label="${esc(wageT('insured','4대보험 가입 확인'))}" ${e.insured?'checked':''}></td><td><input class="mini" type="date" id="wh-effective-${i}" value="${esc(e.effective_from||today())}"></td>
    <td><button class="mini stamp" onclick="wageHourlySaveEmployee(${i})">${esc(wageT('save','저장'))}</button></td></tr>`).join('')}</table></div>
    <h3>${esc(wageT('deductions','근로자 부담 공제율'))}</h3><div class="grid">${rates.map(([k,label])=>`<div class="fld"><label>${esc(label)} (%)</label><input type="number" min="0" max="99.999" step="0.001" id="wh-ded-${k}" value="${Math.round(Number(ded[k])*100000)/1000}"></div>`).join('')}</div>
    <h3>${esc(wageT('tax_table','월 세전 금액별 소득세 구간'))}</h3><div class="hint">${esc(wageT('tax_hint','비워 두면 소득세 미반영으로 표시합니다. 마지막 상한은 비워 두세요.'))}</div>
    <div id="whTaxRows">${wageHourlyTaxRows(config.settings.income_tax)}</div><button class="mini" onclick="wageHourlyAddTax()">${esc(wageT('tax_add','소득세 구간 추가'))}</button>
    <h3>${esc(wageT('categories','시급 구분'))}</h3><div class="hint">${esc(wageT('categories_hint','요일마다 한 구분을 선택합니다. 별도 날짜를 넣으면 그 날짜에는 해당 구분을 먼저 적용합니다.'))}</div>
    <div id="whCategoryRows">${wageHourlyCategoryRows(cats)}</div><button class="mini" onclick="wageHourlyAddCategory()">${esc(wageT('category_add','시급 구분 추가'))}</button>
    <div style="margin-top:12px"><button class="mini stamp" onclick="wageHourlySaveConfig()">${esc(wageT('save_global','공제율·소득세·구분 저장'))}</button></div></details></div>`;
}
function wageHourlyTaxRows(rows){
 return rows.map((r,i)=>`<div class="rowflex wh-tax-row" style="flex-wrap:wrap;gap:8px;margin:8px 0">
 <label>${esc(wageT('tax_min','세전 하한'))} <input class="mini wh-tax-min" type="number" min="0" value="${r.min}" style="width:110px"></label>
 <label>${esc(wageT('tax_max','세전 상한 (미만)'))} <input class="mini wh-tax-max" type="number" min="0" value="${r.max??''}" style="width:110px"></label>
 <label>${esc(wageT('tax_amount','월 소득세'))} <input class="mini wh-tax-amount" type="number" min="0" value="${r.amount}" style="width:110px"></label>
 <button class="mini" onclick="this.parentElement.remove()">${esc(wageT('remove','입력에서 빼기'))}</button></div>`).join('');
}
function wageHourlyCategoryRows(rows){
 const labels=[wageT('sun','일'),wageT('mon','월'),wageT('tue','화'),wageT('wed','수'),wageT('thu','목'),wageT('fri','금'),wageT('sat','토')];
 return rows.map((r,i)=>`<div class="wh-category-row" data-code="${esc(r.code)}" style="border-top:1px solid var(--line);padding:10px 0">
 <label>${esc(wageT('category_name','구분 이름'))} <input class="mini wh-category-label" value="${esc(r.label)}" style="width:140px"></label>
 <label>${esc(wageT('reply_column','회신 시간 칸'))} <select class="mini wh-category-reply">${[['',wageT('reply_auto','기본 규칙')],['weekday',wageT('reply_weekday','평일')],['weekend',wageT('reply_weekend','주말')]].map(([code,label])=>`<option value="${code}" ${(r.reply_column||'')===code?'selected':''}>${esc(label)}</option>`).join('')}</select></label>
 <div class="rowflex" style="flex-wrap:wrap;margin:8px 0">${labels.map((s,d)=>`<label><input type="checkbox" data-day="${d}" ${r.days.includes(d)?'checked':''}> ${esc(s)}</label>`).join('')}</div>
 <label>${esc(wageT('category_dates','별도 날짜 (쉼표로 나눔)'))} <input class="wh-category-dates" value="${esc(r.dates.join(','))}" placeholder="2026-12-25" style="width:100%;box-sizing:border-box"></label></div>`).join('');
}
function wageHourlyReadTax(){return [...document.querySelectorAll('.wh-tax-row')].map(el=>({min:Number(el.querySelector('.wh-tax-min').value),max:el.querySelector('.wh-tax-max').value===''?null:Number(el.querySelector('.wh-tax-max').value),amount:Number(el.querySelector('.wh-tax-amount').value)}));}
function wageHourlyReadCategories(){return [...document.querySelectorAll('.wh-category-row')].map(el=>({code:el.dataset.code,label:el.querySelector('.wh-category-label').value.trim(),...(el.querySelector('.wh-category-reply').value?{reply_column:el.querySelector('.wh-category-reply').value}:{}),days:[...el.querySelectorAll('[data-day]:checked')].map(c=>Number(c.dataset.day)),dates:el.querySelector('.wh-category-dates').value.split(',').map(s=>s.trim()).filter(Boolean)}));}
function wageHourlyAddTax(){const rows=wageHourlyReadTax();rows.push({min:rows.length?(rows.at(-1).max??0):0,max:null,amount:0});document.querySelector('#whTaxRows').innerHTML=wageHourlyTaxRows(rows);}
function wageHourlyAddCategory(){
 const label=prompt(wageT('category_prompt','추가할 시급 구분 이름을 입력하세요. 예: 공휴일'));if(!label?.trim())return;
 const rows=wageHourlyReadCategories();rows.push({code:'extra_'+Date.now(),label:label.trim(),days:[],dates:[]});document.querySelector('#whCategoryRows').innerHTML=wageHourlyCategoryRows(rows);
}
async function wageHourlySaveEmployee(i){
 if(ME.role!=='owner'||!WH_CONFIG?.employees[i])return;
 const e=WH_CONFIG.employees[i],rates={};WH_CONFIG.settings.categories.forEach((c,j)=>{const raw=document.querySelector('#wh-rate-'+i+'-'+j).value;rates[c.code]=raw===''?null:Number(raw);});
 const {error}=await sb.rpc('wage_hourly_save_employee',{p_user_id:e.user_id,p_effective_from:document.querySelector('#wh-effective-'+i).value,
 p_enabled:document.querySelector('#wh-enabled-'+i).checked,p_rates:rates,p_insured:document.querySelector('#wh-insured-'+i).checked});
 WH_MESSAGE=error?wageT('save_error','저장하지 못했습니다: {detail}',{detail:error.message}):wageT('saved','저장했습니다.');setStatus(error?'error':'saved');if(error)alert(WH_MESSAGE);else render();
}
async function wageHourlySaveConfig(){
 if(ME.role!=='owner')return;
 const deductions={};['pension','health','ltc_health','employment','local_income'].forEach(k=>deductions[k]=Number(document.querySelector('#wh-ded-'+k).value)/100);
 const {error}=await sb.rpc('wage_hourly_save_config',{p_settings:{categories:wageHourlyReadCategories(),deductions,income_tax:wageHourlyReadTax()}});
 WH_MESSAGE=error?wageT('save_error','저장하지 못했습니다: {detail}',{detail:error.message}):wageT('saved','저장했습니다.');setStatus(error?'error':'saved');if(error)alert(WH_MESSAGE);else render();
}
async function renderWageHourly(m){
 if(ME.role!=='owner')return;
 if(!WH_MONTH)WH_MONTH=today().slice(0,7);
 const [result,config]=await Promise.all([sb.rpc('wage_hourly_month',{p_month:WH_MONTH,p_user_id:null}),sb.rpc('wage_hourly_config')]);
 if(m.isConnected===false)return;
 if(result.error||config.error){m.innerHTML=payTop()+`<div class="card">${esc(wageT('load_error','시급제 지급액을 불러오지 못했습니다. 잠시 후 다시 확인하세요.'))}</div>`;return;}
 WH_DATA=result.data;WH_CONFIG=config.data;
 m.innerHTML=payTop()+(WH_MESSAGE?`<div class="hint">${esc(WH_MESSAGE)}</div>`:'')+wageHourlyPanelHtml(result.data,true)+wageHourlyConfigHtml(config.data);
}
async function wageHourlyCorrectionPanel(){
 if(!['owner','chief'].includes(ME.role))return '';
 if(!WH_CORR_DATE)WH_CORR_DATE=today();
 const {data,error}=await sb.rpc('wage_hourly_correction_targets',{p_work_date:WH_CORR_DATE});
 if(error)return `<div class="card"><div class="hint">${esc(wageT('correction_load_error','시급제 정정 대상자를 불러오지 못했습니다.'))}</div></div>`;
 WH_CORR_TARGETS=data||[];
 if(!WH_CORR_TARGETS.length)return '';
 const first=WH_CORR_TARGETS[0];
 return `<div class="card" id="wageHourlyCorrection"><h2>${esc(wageT('correction_title','시급제 지문 시간 정정'))}</h2><div class="hint">${esc(wageT('correction_hint','원본 지문은 보존하고 정정 전 시간·사유·정정자를 기록합니다. 저장하면 해당 월 지급액에 바로 반영됩니다.'))}</div>
 <div class="grid"><div class="fld"><label>${esc(wageT('employee','직원'))}</label><select id="wh-correct-user" onchange="wageHourlyPickCorrection()">${WH_CORR_TARGETS.map(e=>`<option value="${esc(e.user_id)}">${esc(e.name)}</option>`).join('')}</select></div>
 <div class="fld"><label>${esc(wageT('date','날짜'))}</label><input id="wh-correct-date" type="date" value="${esc(WH_CORR_DATE)}" onchange="WH_CORR_DATE=this.value;render()"></div>
 <div class="fld"><label>${esc(wageT('clock_in','정정 출근'))}</label><input id="wh-correct-in" type="time" step="60" value="${esc(first.clock_in?.slice(0,5)||'')}"></div>
 <div class="fld"><label>${esc(wageT('clock_out','정정 퇴근'))}</label><input id="wh-correct-out" type="time" step="60" value="${esc(first.clock_out?.slice(0,5)||'')}"></div>
 <div class="fld w4"><label>${esc(wageT('reason','정정 사유 (필수)'))}</label><input id="wh-correct-reason"></div></div>
 <button class="mini stamp" onclick="wageHourlyCorrect()">${esc(wageT('correct_save','시간 정정 저장'))}</button><div class="hint">${esc(WH_MESSAGE)}</div></div>`;
}
function wageHourlyPickCorrection(){const e=WH_CORR_TARGETS.find(e=>e.user_id===document.querySelector('#wh-correct-user').value);document.querySelector('#wh-correct-in').value=e?.clock_in?.slice(0,5)||'';document.querySelector('#wh-correct-out').value=e?.clock_out?.slice(0,5)||'';}
async function wageHourlyCorrect(){
 if(!['owner','chief'].includes(ME.role))return;
 const {error}=await sb.rpc('wage_hourly_correct',{p_user_id:document.querySelector('#wh-correct-user').value,p_work_date:document.querySelector('#wh-correct-date').value,
 p_clock_in:document.querySelector('#wh-correct-in').value||null,p_clock_out:document.querySelector('#wh-correct-out').value||null,p_reason:document.querySelector('#wh-correct-reason').value.trim()});
 WH_MESSAGE=error?wageT('save_error','저장하지 못했습니다: {detail}',{detail:error.message}):wageT('correct_saved','시간을 정정하고 월 지급액을 다시 계산했습니다.');setStatus(error?'error':'saved');if(error)alert(WH_MESSAGE);else render();
}
