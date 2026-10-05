/* 마케팅비·AI비용 공용 기간 분석 화면. 고른 기간은 메모리에만 보관한다. */
(function(root){
  'use strict';
  const TEXTS={title:'📈 기간·주기',period:'조회 기간',days:'최근 일수',from:'시작일',to:'마지막 날',total:'기간 합계',count:'{n}건',day:'하루',week:'주',month:'월',average:'평균',maximum:'최대',interval:'결제 간격',interval_values:'평균 {avg}일 · 최소 {min}일 · 최대 {max}일',last_payment:'마지막 결제 {at}',no_interval:'결제 2건부터 간격을 계산합니다.',comparison:'지난 기간 대비',unavailable:'비교 불가',no_previous:'지난 기간 기록 없음',summary_no_previous:' · 지난 기간 기록 없음',comparison_values:'{amount} ({pct})',previous:'지난 기간 {start} ~ {end} · {amount}',summary:'{start} ~ {end} 동안 {amount}({count}건) · 하루 평균 {avg}',summary_interval:' · 평균 {days}일마다 결제',summary_comparison:' · 지난 기간보다 {pct}',channels:'채널별',merchants:'상호별',platforms:'플랫폼별',models:'모델별',other:'그 외',unknown_merchant:'상호 미확인',empty:'선택 기간에 기록이 없습니다.',manual_hint:'직접 입력 월 합계는 이 분석에 들어가지 않음',foreign_count:'외화 {n}건은 원화 합계·결제 간격에서 제외함',money_title:'자동감지 결제금액',tokens_title:'모델 사용 토큰',tokens_unit:'토큰',tokens_small:'50만 토큰 미만',load_error:'기간 분석 자료를 불러오지 못했습니다.',reorder_up:'위로',reorder_down:'아래로'};
  const PERIODS=[{code:'today',label:'오늘'},{code:'this_week',label:'이번 주'},{code:'this_month',label:'이번 달'},{code:'last_n_days',label:'최근 N일'},{code:'custom',label:'직접 기간'}];
  const state={};
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const t=(key,vars)=>{const value=TEXTS[key]||key;return typeof root.hubT==='function'?root.hubT('spend.'+key,value,vars):value.replace(/\{(\w+)\}/g,(m,k)=>vars&&vars[k]!=null?vars[k]:m);};
  const n=(key,def)=>typeof root.hubN==='function'?root.hubN('spend.'+key,def):def;
  const enabled=scope=>typeof root.hubSettingBoolean==='function'?root.hubSettingBoolean('spend.enabled_'+scope,true):true;
  function periods(){
    const list=typeof root.hubList==='function'?root.hubList('list.spend_periods',PERIODS):PERIODS;
    try{const saved=JSON.parse(root.hubSetting('list.spend_periods','[]'));if(saved.length===PERIODS.length&&new Set(saved.map(x=>x.code)).size===PERIODS.length&&saved.every(x=>PERIODS.some(p=>p.code===x.code))){return saved.map(x=>list.find(p=>p.code===x.code));}}catch{}
    return list;
  }
  function options(scope){
    const current=state[scope]||{},now=typeof root.today==='function'?root.today():root.SpendCycle.date(new Date());
    return {now,preset:current.preset||'last_n_days',days:current.days||n('default_days',30),from:current.from||now.slice(0,7)+'-01',to:current.to||now,weekStart:n('week_start',1)};
  }
  function change(scope,field,value){
    if(!['marketing','ai'].includes(scope)||!['preset','days','from','to'].includes(field))return;
    state[scope]=Object.assign({},state[scope],{[field]:field==='days'?Math.max(1,Math.min(3660,Math.floor(Number(value)||n('default_days',30)))):value});
    if(typeof root.render==='function')root.render();
  }
  function controls(scope){
    const o=options(scope),id='spend-'+scope;
    const field=(name,type,value,label,extra='')=>`<label style="display:flex;flex-direction:column;gap:4px;min-width:0;max-width:100%">${esc(t(label))}<input class="mini" style="min-width:0;width:140px;max-width:100%;box-sizing:border-box" type="${type}" aria-label="${esc(t(label))}" id="${id}-${name}" value="${esc(value)}" ${extra} onchange="SpendUi.change('${scope}','${name}',this.value)"></label>`;
    return `<div class="rowflex" style="flex-wrap:wrap;gap:8px;min-width:0"><label style="display:flex;flex-direction:column;gap:4px;min-width:0">${esc(t('period'))}<select class="mini" style="max-width:100%" id="${id}-preset" aria-label="${esc(t('period'))}" onchange="SpendUi.change('${scope}','preset',this.value)">${periods().map(p=>`<option value="${p.code}" ${p.code===o.preset?'selected':''}>${esc(p.label)}</option>`).join('')}</select></label>${o.preset==='last_n_days'?field('days','number',o.days,'days','min="1" max="3660" step="1"'):''}${o.preset==='custom'?field('from','date',o.from,'from',`max="${esc(o.now)}"`)+field('to','date',o.to,'to',`max="${esc(o.now)}"`):''}</div>`;
  }
  function format(value,token){
    if(token){const rounded=Math.floor(Math.abs(value)/500000+0.5)*50;if(rounded===0)return (value<0?'-':'')+t('tokens_small');if(rounded>=10000)return (value<0?'-':'')+(Math.round(rounded/1000)/10).toLocaleString('ko-KR',{maximumFractionDigits:1})+'억 '+t('tokens_unit');return (value<0?'-':'')+rounded.toLocaleString('ko-KR')+'만 '+t('tokens_unit');}
    return (value<0?'-':'')+'₩'+Math.round(Math.abs(value)).toLocaleString('ko-KR');
  }
  const pct=value=>value==null?t('unavailable'):(value>0?'+':'')+value.toFixed(1)+'%';
  function bars(items,token){
    const max=Math.max(1,...items.map(x=>Math.abs(x.amount)));
    return items.map(x=>`<div style="margin:8px 0;min-width:0"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;overflow-wrap:anywhere"><span>${esc(x.label)} · ${esc(t('count',{n:x.count}))}</span><b>${esc(format(x.amount,token))} · ${esc(x.share.toFixed(1))}%</b></div><div style="height:7px;background:var(--line);border-radius:4px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${Math.min(100,Math.abs(x.amount)/max*100)}%;background:var(--mint)"></div></div></div>`).join('')||`<div class="hint">${esc(t('empty'))}</div>`;
  }
  function summary(summary,token,title,splitTitle,merchants){
    const f=x=>format(x,token),s=summary;let line=t('summary',{start:s.start,end:s.end,amount:f(s.total),count:s.count,avg:f(s.day.avg)});
    if(!token&&s.interval)line+=t('summary_interval',{days:s.interval.avgDays});const noPrev=s.prev.count===0&&s.prev.total===0;line+=noPrev?t('summary_no_previous'):t('summary_comparison',{pct:pct(s.prev.pct)});
    const highlight=s.prev.pct!=null&&Math.abs(s.prev.pct)>=n('change_alert_pct',30);
    const tiles=['day','week','month'].map(key=>`<div style="border:1px solid var(--line);border-radius:8px;padding:10px;min-width:0;overflow-wrap:anywhere"><b>${esc(t(key))}</b><div>${esc(t('average'))} ${esc(f(s[key].avg))}</div><div>${esc(t('maximum'))} ${esc(f(s[key].max))}</div><div class="sub">${esc(s[key].maxDate||s[key].maxStart||s[key].maxMonth)}</div></div>`).join('');
    return `<div data-spend-unit="${token?'tokens':'money'}" style="min-width:0;overflow-wrap:anywhere"><h4>${esc(t(title))}</h4><div class="hint">${esc(line)}</div><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:10px 0"><span>${esc(t('total'))} · ${esc(t('count',{n:s.count}))}</span><b>${esc(f(s.total))}</b></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">${tiles}</div>${token?'':`<div class="hint" style="margin-top:8px"><b>${esc(t('interval'))}</b> · ${esc(s.interval?t('interval_values',{avg:s.interval.avgDays,min:s.interval.minDays,max:s.interval.maxDays}):t('no_interval'))}${s.interval?'<br>'+esc(t('last_payment',{at:root.SpendCycle.date(s.interval.lastAt)})):''}</div>`}<div data-spend-change="${highlight?'highlight':'normal'}" style="margin:10px 0;${highlight?'color:var(--red,#b83f42)':''}"><b>${esc(t('comparison'))} ${esc(noPrev?t('no_previous'):t('comparison_values',{amount:f(s.prev.diff),pct:pct(s.prev.pct)}))}</b><div class="sub">${esc(t('previous',{start:s.prev.start,end:s.prev.end,amount:f(s.prev.total)}))}</div></div><h4>${esc(t(splitTitle))}</h4>${bars(s.byKey,token)}${merchants?'<h4>'+esc(t('merchants'))+'</h4>'+bars(merchants,false):''}</div>`;
  }
  /* 카드 문자는 상호를 잘라 보냄(예: 주식회사카카) — 원장이 정한 가맹점 규칙 이름이 있으면 그 이름으로 보임 */
  function merchantLabel(row,rules){const key=String(row.merchant_key||'');const hit=(rules||[]).filter(r=>r&&r.merchant_key&&r.merchant_label&&(key===r.merchant_key||key.includes(r.merchant_key))).sort((a,b)=>b.merchant_key.length-a.merchant_key.length)[0];return hit?hit.merchant_label:(row.merchant||t('unknown_merchant'));}
  function marketing(events,rules,links){
    if(!enabled('marketing')||!root.SpendCycle)return '';
    const linked=new Set((links||[]).map(x=>x.foreign_event_id)),rows=[];
    for(const row of events||[]){if(row.parse_status!=='recorded'||linked.has(row.id))continue;
      const category=root.marketingEventCategoryFor(row,rules,events,links);if(!root.MARKETING_CHANNELS?.some(x=>x[0]===category)&&!['daangn','kakao','google','naver','meta'].includes(category))continue;
      rows.push({at:row.transaction_at,amount:Number(row.amount_krw||0),key:category,label:root.marketingCategoryItems().find(x=>x[0]===category)?.[1]||category,kind:row.event_kind,merchant:merchantLabel(row,rules),currency:row.currency});
    }
    const o=options('marketing'),krw=rows.filter(x=>x.currency==='KRW'),s=root.SpendCycle.calculate(krw,o),merchantSummary=root.SpendCycle.calculate(krw.map(x=>({...x,key:x.merchant,label:x.merchant})),o);
    const limit=n('top_merchants',5),merchants=merchantSummary.byKey.slice(0,limit),rest=merchantSummary.byKey.slice(limit);
    if(rest.length)merchants.push({key:'other',label:t('other'),amount:rest.reduce((a,x)=>a+x.amount,0),count:rest.reduce((a,x)=>a+x.count,0),share:rest.reduce((a,x)=>a+x.share,0)});
    const foreign=rows.filter(x=>{try{const d=root.SpendCycle.date(x.at);return x.currency!=='KRW'&&d>=s.start&&d<=s.end;}catch{return false;}}).length;
    return `<section data-spend-scope="marketing" style="border-top:1px solid var(--line);margin-top:14px;padding-top:12px;min-width:0"><h3>${esc(t('title'))}</h3>${controls('marketing')}${summary(s,false,'money_title','channels',merchants)}<div class="hint">${esc(t('foreign_count',{n:foreign}))}</div></section>`;
  }
  async function loadAi(sb,fetchAll){
    if(!enabled('ai')||!root.SpendCycle)return null;const o=options('ai'),w=root.SpendCycle.window(o),start=w.prevStart+'T00:00:00+09:00',end=w.end+'T23:59:59.999+09:00';
    const [money,tokens]=await Promise.all([
      fetchAll(()=>sb.from('ai_billing_events').select('id,platform,amount_krw,received_at').gte('received_at',start).lte('received_at',end).or(`and(received_at.gte.${start},received_at.lte.${w.prevEnd}T23:59:59.999+09:00),and(received_at.gte.${w.start}T00:00:00+09:00,received_at.lte.${end})`).order('received_at').order('id')),
      fetchAll(()=>sb.from('ai_model_usage_daily').select('usage_date,model,tokens').gte('usage_date',w.prevStart).lte('usage_date',w.end).or(`and(usage_date.gte.${w.prevStart},usage_date.lte.${w.prevEnd}),and(usage_date.gte.${w.start},usage_date.lte.${w.end})`).order('usage_date').order('model'))
    ]);
    return {money:money.data||[],tokens:tokens.data||[],moneyError:!!money.error,tokensError:!!tokens.error};
  }
  function ai(data){
    if(!enabled('ai')||!root.SpendCycle||!data)return '';const o=options('ai');
    const money=data.money.filter(x=>!root.isNaverAdBillingEvent(x)).map(x=>{const key=root.aicostPlatformKey(x.platform);return {at:x.received_at,amount:x.amount_krw,key,label:typeof root.aicostPlatformLabel==='function'?root.aicostPlatformLabel(key):key,kind:Number(x.amount_krw)<0?'cancellation':'purchase'};});
    const tokens=data.tokens.map(x=>({at:x.usage_date+'T00:00:00+09:00',amount:x.tokens,key:x.model,label:x.model,kind:'usage'}));
    const error=`<div class="hint">${esc(t('load_error'))}</div>`;
    return `<section data-spend-scope="ai" style="border-top:1px solid var(--line);margin:14px 0;padding-top:12px;min-width:0"><h3>${esc(t('title'))}</h3>${controls('ai')}<div class="hint">${esc(t('manual_hint'))}</div>${data.moneyError?error:summary(root.SpendCycle.calculate(money,o),false,'money_title','platforms')}${data.tokensError?error:summary(root.SpendCycle.calculate(tokens,o),true,'tokens_title','models')}</section>`;
  }
  root.SpendUi={TEXTS,PERIODS,options,periods,change,marketing,loadAi,ai,format,merchantLabel};
})(typeof window!=='undefined'?window:globalThis);
