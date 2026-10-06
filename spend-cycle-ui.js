/* 마케팅비·AI비용 공용 기간 분석 화면. 고른 기간은 메모리에만 보관한다. */
(function(root){
  'use strict';
  const TEXTS={title:'📈 기간·주기',period:'조회 기간',days:'최근 일수',from:'시작일',to:'마지막 날',total:'기간 합계',count:'{n}건',day:'하루',week:'주',month:'월',average:'평균',maximum:'최대',interval:'결제 간격',interval_values:'평균 {avg}일 · 최소 {min}일 · 최대 {max}일',last_payment:'마지막 결제 {at}',no_interval:'결제 2건부터 간격을 계산합니다.',comparison:'지난 기간 대비',unavailable:'비교 불가',no_previous:'지난 기간 기록 없음',summary_no_previous:' · 지난 기간 기록 없음',comparison_values:'{amount} ({pct})',previous:'지난 기간 {start} ~ {end} · {amount}',summary:'{start} ~ {end} 동안 {amount}({count}건) · 하루 평균 {avg}',summary_interval:' · 평균 {days}일마다 결제',summary_comparison:' · 지난 기간보다 {pct}',channels:'채널별',merchants:'상호별',platforms:'플랫폼별',models:'모델별',other:'그 외',unknown_merchant:'상호 미확인',empty:'선택 기간에 기록이 없습니다.',manual_hint:'직접 입력 월 합계는 이 분석에 들어가지 않음',foreign_count:'외화 {n}건은 원화 합계·결제 간격에서 제외함',money_title:'자동감지 결제금액',tokens_title:'모델 사용 토큰',tokens_unit:'토큰',tokens_small:'50만 토큰 미만',load_error:'기간 분석 자료를 불러오지 못했습니다.',reorder_up:'위로',reorder_down:'아래로'};
  Object.assign(TEXTS,{"anomaly_excess":"🔴 최근 7일 {amount} — 평소 7일 평균 {average}보다 {pct}(평소 범위 밖)","anomaly_interval":"🔴 결제 간격이 평소 {baseline}일 → 최근 {recent}일로 짧아짐","anomaly_normal":"🟢 평소 범위 안","anomaly_insufficient":"⚪ 아직 비교할 평소 자료가 부족함({n}건)","chart_daily":"날짜별 지출","chart_tokens":"날짜별 토큰","chart_weekly":"주별 합계","chart_range":"평소 범위","chart_mean":"평소 평균","chart_spike":"튀는 날","chart_interval":"결제 간격 흐름","chart_interval_mean":"평소 평균 {days}일","chart_gap":"{date} · {days}일","chart_value":"{date} · {amount}","chart_period":"{start} ~ {end}"});
  Object.assign(TEXTS,{"amount_man": "만원 단위 (버림)", "amount_won": "원 단위", "chart_interval_help": "점 하나 = 결제 1건 · 높이 = 바로 앞 결제와 며칠 떨어졌나 · 점이 아래로 몰리면 결제가 잦아진 것(0 = 같은 날 또 결제)", "chart_detail": "{date} · {amount} · 결제 {count}건", "chart_gap_detail": "{date} 결제 {amount} · 앞 결제({previous})와 {days}일 차이", "chart_days": "{days}일", "chart_interval_mean": "평소 {days}일", "chart_interval_summary": "{start}~{end} 동안 {count}건 · 평균 {avg}일마다 1번 결제 · 가장 길게 쉰 간격 {max}일", "chart_date": "{date} ({weekday})", "chart_weekdays": "일,월,화,수,목,금,토"});
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
    return {now,preset:current.preset||'last_n_days',days:current.days||n('default_days',30),from:current.from||now.slice(0,7)+'-01',to:current.to||now,weekStart:n('week_start',1),baseline_weeks:n('baseline_weeks',8),z_threshold:n('z_threshold',2),excess_pct:n('excess_pct',50),shrink_pct:n('shrink_pct',40),recent_payments:n('recent_payments',5),min_baseline_events:n('min_baseline_events',5)};
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
    return root.SpendCycle.spendMan(value,typeof root.hubSetting==='function'?root.hubSetting('spend.amount_unit','man'):'man');
  }
  const pct=value=>value==null?t('unavailable'):(value>0?'+':'')+value.toFixed(1)+'%';
  function bars(items,token){
    const max=Math.max(1,...items.map(x=>Math.abs(x.amount)));
    return items.map(x=>`<div style="margin:8px 0;min-width:0"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;overflow-wrap:anywhere"><span>${esc(x.label)} · ${esc(t('count',{n:x.count}))}</span><b>${esc(format(x.amount,token))} · ${esc(x.share.toFixed(1))}%</b></div><div style="height:7px;background:var(--line);border-radius:4px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${Math.min(100,Math.abs(x.amount)/max*100)}%;background:var(--mint)"></div></div></div>`).join('')||`<div class="hint">${esc(t('empty'))}</div>`;
  }

  const roundedDays=value=>Math.round(value*10)/10;
  function warnings(a,token){
    const card=(status,text)=>'<div class="hint" data-spend-anomaly="'+status+'" style="margin:8px 0;overflow-wrap:anywhere">'+esc(text)+'</div>';
    if(a.insufficient)return card('insufficient',t('anomaly_insufficient',{n:a.baseline.events}));
    let out='';if(a.excess.flag)out+=card('excess',t('anomaly_excess',{amount:format(a.excess.recent7,token),average:format(a.baseline.weekAvg,token),pct:pct(a.excess.pct)}));
    if(!token&&a.interval.flag)out+=card('interval',t('anomaly_interval',{baseline:roundedDays(a.interval.baselineAvg),recent:roundedDays(a.interval.recentAvg)}));
    return out||card('normal',t('anomaly_normal'));
  }
  const exact=value=>(value<0?'−':'')+'₩'+Math.round(Math.abs(value)).toLocaleString('ko-KR');
  function closeDetails(){
    if(!root.document)return;
    root.document.querySelectorAll('[data-spend-chart-wrap]').forEach(w=>{
      const box=w.querySelector('[data-spend-detail]');box.hidden=true;box.textContent='';
      w.querySelectorAll('[data-spend-selected]').forEach(el=>{el.removeAttribute('data-spend-selected');el.setAttribute('aria-pressed','false');el.style.stroke='';el.style.strokeWidth='';});
    });
  }
  function detail(el,event){
    if(event){if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;event.preventDefault();event.stopPropagation();}
    const selected=el.hasAttribute('data-spend-selected');closeDetails();if(selected)return;
    const box=el.closest('[data-spend-chart-wrap]').querySelector('[data-spend-detail]');box.textContent=el.getAttribute('data-spend-detail-text');box.hidden=false;
    el.setAttribute('data-spend-selected','true');el.setAttribute('aria-pressed','true');el.style.stroke='var(--ink,#263b42)';el.style.strokeWidth='2';
  }
  if(root.document)root.document.addEventListener('click',closeDetails);
  function charts(a,token,events){
    if(typeof root.hubSettingBoolean==='function'&&!root.hubSettingBoolean('spend.chart_enabled',true))return '';
    const selected=(events||[]).filter(e=>{try{const d=root.SpendCycle.date(e.at);return Number.isFinite(Number(e.amount))&&d>=a.days[0].date&&d<=a.days.at(-1).date;}catch{return false;}});
    const payments=selected.filter(e=>e.kind==='purchase'&&e.amount>=0).sort((a,b)=>new Date(a.at)-new Date(b.at));
    const weekly=a.days.length>60,spikeDates=new Set(a.spikes.map(x=>x.date)),buckets=[];
    for(let i=0;i<a.days.length;i+=weekly?7:1){const part=a.days.slice(i,i+(weekly?7:1)),from=part[0].date,to=part.at(-1).date;buckets.push({date:from,end:to,amount:part.reduce((sum,x)=>sum+x.amount,0),count:part.length,payments:payments.filter(e=>{const d=root.SpendCycle.date(e.at);return d>=from&&d<=to;}).length,spike:part.some(x=>spikeDates.has(x.date))});}
    const W=640,H=235,L=130,R=14,T=18,B=40,PW=W-L-R,PH=H-T-B;
    const band=buckets.map(x=>({avg:a.baseline.dayAvg*x.count,sd:a.baseline.daySd*x.count}));
    const values=buckets.map(x=>x.amount);if(!a.insufficient)band.forEach(x=>values.push(Math.max(0,x.avg-x.sd),x.avg+x.sd));
    const low=Math.min(0,...values),high=Math.max(1,...values),y=value=>T+(high-value)/(high-low)*PH,x=i=>L+i/buckets.length*PW,step=PW/buckets.length;
    const shell=(type,label,content,extra='')=>'<svg data-spend-chart="'+type+'" '+extra+' role="img" aria-label="'+esc(label)+'" viewBox="0 0 '+W+' '+H+'" style="display:block;width:100%;max-width:640px;height:auto;max-height:240px;overflow:hidden;font-size:20px;fill:var(--ink,#263b42)"><title>'+esc(label)+'</title>'+content+'</svg>';
    const box='<div data-spend-detail hidden role="status" aria-live="polite" style="box-sizing:border-box;max-width:100%;overflow-wrap:anywhere;border:1px solid var(--line,#d9e3e7);border-radius:8px;padding:8px;margin:6px 0;background:var(--bg,#fff)"></div>';
    const action=text=>token?'':' role="button" tabindex="0" aria-pressed="false" aria-label="'+esc(text)+'" data-spend-detail-text="'+esc(text)+'" onclick="SpendUi.detail(this,event)" onkeydown="SpendUi.detail(this,event)" style="cursor:pointer"';
    let plot='';
    if(!a.insufficient){
      plot+=band.map((b,i)=>'<rect class="spend-baseline-band" x="'+x(i)+'" y="'+y(b.avg+b.sd)+'" width="'+step+'" height="'+Math.max(1,y(Math.max(0,b.avg-b.sd))-y(b.avg+b.sd))+'" fill="var(--mint,#39a894)" opacity="0.15"/>').join('');
      plot+='<path class="spend-baseline-mean" d="'+band.map((b,i)=>(i?'L':'M')+x(i)+','+y(b.avg)+' L'+x(i+1)+','+y(b.avg)).join(' ')+'" fill="none" stroke="var(--mint,#39a894)" stroke-dasharray="5 4"/>';
    }
    plot+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(0)+'" y2="'+y(0)+'" stroke="var(--line,#d9e3e7)"/>';
    plot+=buckets.map((b,i)=>{
      const date=weekly?t('chart_period',{start:b.date.slice(5),end:b.end.slice(5)}):t('chart_date',{date:b.date,weekday:t('chart_weekdays').split(',')[new Date(b.date+'T00:00:00Z').getUTCDay()]}),text=t('chart_detail',{date,amount:exact(b.amount),count:b.payments});
      return '<rect class="spend-bar'+(b.spike?' spend-spike':'')+'"'+action(text)+' x="'+(x(i)+step*0.12)+'" y="'+Math.min(y(0),y(b.amount))+'" width="'+step*0.76+'" height="'+Math.max(1,Math.abs(y(0)-y(b.amount)))+'" fill="'+(b.spike?'var(--red,#b83f42)':'var(--mint,#39a894)')+'"><title>'+esc(t('chart_value',{date:weekly?t('chart_period',{start:b.date,end:b.end}):b.date,amount:token?format(b.amount,true):exact(b.amount)}))+'</title></rect>';
    }).join('');
    const ticks=[...new Set([0,Math.floor((buckets.length-1)/2),buckets.length-1])];
    plot+=ticks.map(i=>'<text x="'+(x(i)+step/2)+'" y="'+(H-16)+'" text-anchor="'+(i===0?'start':i===buckets.length-1?'end':'middle')+'">'+esc(buckets[i].date.slice(5))+'</text>').join('');
    plot+=[high,(low+high)/2,low].map(value=>'<text x="'+(L-8)+'" y="'+(y(value)+4)+'" text-anchor="end">'+esc(token&&value===0?'0':format(value,token))+'</text>').join('');
    const label=t(weekly?'chart_weekly':token?'chart_tokens':'chart_daily');
    let out='<div data-spend-chart-wrap style="margin:12px 0;min-width:0"><b>'+esc(label)+'</b>'+box+shell('daily',label,plot,'data-spend-bucket="'+(weekly?'week':'day')+'"')+(a.insufficient?'':'<div class="sub">'+esc(t('chart_range'))+' · '+esc(t('chart_mean'))+' · <span style="color:var(--red,#b83f42)">'+esc(t('chart_spike'))+'</span></div>')+'</div>';
    if(token||!a.points.length)return out;
    const max=Math.max(1,...a.points.map(p=>p.days),a.insufficient?0:a.interval.baselineAvg||0),gy=v=>T+(1-v/max)*PH,gx=i=>L+(i+0.5)/a.points.length*PW;
    let gapsPlot='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+(H-B)+'" y2="'+(H-B)+'" stroke="var(--line,#d9e3e7)"/>';
    if(!a.insufficient&&a.interval.baselineAvg!=null){
      gapsPlot+='<line class="spend-interval-mean" x1="'+L+'" x2="'+(W-R)+'" y1="'+gy(a.interval.baselineAvg)+'" y2="'+gy(a.interval.baselineAvg)+'" stroke="var(--mint,#39a894)" stroke-dasharray="5 4"/>';
      gapsPlot+='<text x="'+(W-R)+'" y="'+Math.max(T+16,gy(a.interval.baselineAvg)-8)+'" text-anchor="end">'+esc(t('chart_interval_mean',{days:roundedDays(a.interval.baselineAvg)}))+'</text>';
    }
    gapsPlot+=a.points.map((p,i)=>{
      const text=t('chart_gap_detail',{date:p.date.slice(5),amount:exact(payments[i+1].amount),previous:root.SpendCycle.date(payments[i].at).slice(5),days:roundedDays(p.days)});
      return '<g'+action(text)+'><circle cx="'+gx(i)+'" cy="'+gy(p.days)+'" r="14" fill="transparent"/><circle class="spend-gap'+(a.interval.flag&&p.recent?' spend-short':'')+'" cx="'+gx(i)+'" cy="'+gy(p.days)+'" r="4" fill="'+(a.interval.flag&&p.recent?'var(--red,#b83f42)':'var(--mint,#39a894)')+'"><title>'+esc(t('chart_gap',{date:p.date,days:roundedDays(p.days)}))+'</title></circle></g>';
    }).join('');
    gapsPlot+=[...new Set([0,Math.floor((a.points.length-1)/2),a.points.length-1])].map(i=>'<text x="'+gx(i)+'" y="'+(H-16)+'" text-anchor="'+(i===0?'start':i===a.points.length-1?'end':'middle')+'">'+esc(a.points[i].date.slice(5))+'</text>').join('');
    gapsPlot+=[max,max/2,0].map(value=>'<text x="'+(L-8)+'" y="'+(gy(value)+4)+'" text-anchor="end">'+esc(t('chart_days',{days:roundedDays(value)}))+'</text>').join('');
    const avg=a.points.reduce((sum,p)=>sum+p.days,0)/a.points.length;
    out+='<div data-spend-chart-wrap style="margin:12px 0;min-width:0"><b>'+esc(t('chart_interval'))+'</b><div class="sub" style="overflow-wrap:anywhere">'+esc(t('chart_interval_help'))+'</div>'+box+shell('interval',t('chart_interval'),gapsPlot)+'<div class="sub">'+esc(t('chart_interval_summary',{start:a.days[0].date.slice(5),end:a.days.at(-1).date.slice(5),count:payments.length,avg:roundedDays(avg),max:roundedDays(Math.max(...a.points.map(p=>p.days)))}))+'</div></div>';
    return out;
  }
  function summary(summary,token,title,splitTitle,merchants,anomaly,events){
    const f=x=>format(x,token),s=summary;let line=t('summary',{start:s.start,end:s.end,amount:f(s.total),count:s.count,avg:f(s.day.avg)});
    if(!token&&s.interval)line+=t('summary_interval',{days:s.interval.avgDays});const noPrev=s.prev.count===0&&s.prev.total===0;line+=noPrev?t('summary_no_previous'):t('summary_comparison',{pct:pct(s.prev.pct)});
    const highlight=s.prev.pct!=null&&Math.abs(s.prev.pct)>=n('change_alert_pct',30);
    const tiles=['day','week','month'].map(key=>`<div style="border:1px solid var(--line);border-radius:8px;padding:10px;min-width:0;overflow-wrap:anywhere"><b>${esc(t(key))}</b><div>${esc(t('average'))} ${esc(f(s[key].avg))}</div><div>${esc(t('maximum'))} ${esc(f(s[key].max))}</div><div class="sub">${esc(s[key].maxDate||s[key].maxStart||s[key].maxMonth)}</div></div>`).join('');
    return `<div data-spend-unit="${token?'tokens':'money'}" style="min-width:0;overflow-wrap:anywhere"><h4>${esc(t(title))}</h4>${warnings(anomaly,token)}${charts(anomaly,token,events)}<div class="hint">${esc(line)}</div><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:10px 0"><span>${esc(t('total'))} · ${esc(t('count',{n:s.count}))}</span><b>${esc(f(s.total))}</b></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">${tiles}</div>${token?'':`<div class="hint" style="margin-top:8px"><b>${esc(t('interval'))}</b> · ${esc(s.interval?t('interval_values',{avg:s.interval.avgDays,min:s.interval.minDays,max:s.interval.maxDays}):t('no_interval'))}${s.interval?'<br>'+esc(t('last_payment',{at:root.SpendCycle.date(s.interval.lastAt)})):''}</div>`}<div data-spend-change="${highlight?'highlight':'normal'}" style="margin:10px 0;${highlight?'color:var(--red,#b83f42)':''}"><b>${esc(noPrev?t('no_previous'):t('comparison')+' '+t('comparison_values',{amount:f(s.prev.diff),pct:pct(s.prev.pct)}))}</b><div class="sub">${esc(t('previous',{start:s.prev.start,end:s.prev.end,amount:f(s.prev.total)}))}</div></div><h4>${esc(t(splitTitle))}</h4>${bars(s.byKey,token)}${merchants?'<h4>'+esc(t('merchants'))+'</h4>'+bars(merchants,false):''}</div>`;
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
    return `<section data-spend-scope="marketing" style="border-top:1px solid var(--line);margin-top:14px;padding-top:12px;min-width:0"><h3>${esc(t('title'))}</h3>${controls('marketing')}${summary(s,false,'money_title','channels',merchants,root.SpendCycle.anomaly(krw,o),krw)}<div class="hint">${esc(t('foreign_count',{n:foreign}))}</div></section>`;
  }
  async function loadAi(sb,fetchAll){
    if(!enabled('ai')||!root.SpendCycle)return null;const o=options('ai'),w=root.SpendCycle.window(o),baseline=root.SpendCycle.anomaly([],o).baseline,startDate=w.prevStart<baseline.start?w.prevStart:baseline.start,start=startDate+'T00:00:00+09:00',end=w.end+'T23:59:59.999+09:00';
    const [money,tokens]=await Promise.all([
      fetchAll(()=>sb.from('ai_billing_events').select('id,platform,amount_krw,received_at').gte('received_at',start).lte('received_at',end).order('received_at').order('id')),
      fetchAll(()=>sb.from('ai_model_usage_daily').select('usage_date,model,tokens').gte('usage_date',startDate).lte('usage_date',w.end).order('usage_date').order('model'))
    ]);
    return {money:money.data||[],tokens:tokens.data||[],moneyError:!!money.error,tokensError:!!tokens.error};
  }
  function ai(data){
    if(!enabled('ai')||!root.SpendCycle||!data)return '';const o=options('ai');
    const money=data.money.filter(x=>!root.isNaverAdBillingEvent(x)).map(x=>{const key=root.aicostPlatformKey(x.platform);return {at:x.received_at,amount:x.amount_krw,key,label:typeof root.aicostPlatformLabel==='function'?root.aicostPlatformLabel(key):key,kind:Number(x.amount_krw)<0?'cancellation':'purchase'};});
    const tokens=data.tokens.map(x=>({at:x.usage_date+'T00:00:00+09:00',amount:x.tokens,key:x.model,label:x.model,kind:'usage'}));
    const error=`<div class="hint">${esc(t('load_error'))}</div>`;
    return `<section data-spend-scope="ai" style="border-top:1px solid var(--line);margin:14px 0;padding-top:12px;min-width:0"><h3>${esc(t('title'))}</h3>${controls('ai')}<div class="hint">${esc(t('manual_hint'))}</div>${data.moneyError?error:summary(root.SpendCycle.calculate(money,o),false,'money_title','platforms',null,root.SpendCycle.anomaly(money,o),money)}${data.tokensError?error:summary(root.SpendCycle.calculate(tokens,o),true,'tokens_title','models',null,root.SpendCycle.anomaly(tokens,o),tokens)}</section>`;
  }
  root.SpendUi={TEXTS,PERIODS,options,periods,change,marketing,loadAi,ai,format,merchantLabel,detail,closeDetails};
})(typeof window!=='undefined'?window:globalThis);
