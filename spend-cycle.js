/* 기간·주기 분석: 한국 자정 기준, DOM·DB에 의존하지 않는 공용 계산. */
(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SpendCycle=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DAY=86400000,KST=9*3600000;
  function date(value){
    if(/^\d{4}-\d{2}-\d{2}$/.test(String(value))){
      const t=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==value)throw new Error('Invalid date');return value;
    }
    const t=new Date(value).getTime();if(!Number.isFinite(t))throw new Error('Invalid date');return new Date(t+KST).toISOString().slice(0,10);
  }
  const stamp=d=>Date.parse(d+'T00:00:00Z');
  const shift=(d,n)=>new Date(stamp(d)+n*DAY).toISOString().slice(0,10);
  const length=(a,b)=>Math.round((stamp(b)-stamp(a))/DAY)+1;
  const week=(d,start)=>shift(d,-((new Date(stamp(d)).getUTCDay()-start+7)%7));
  function window(opts){
    opts=opts||{};const today=date(opts.now==null?new Date():opts.now),preset=opts.preset||'last_n_days';
    const weekStart=Number.isInteger(opts.weekStart)&&opts.weekStart>=0&&opts.weekStart<=6?opts.weekStart:1;
    let start,end=today,prevStart,prevEnd;
    if(preset==='today')start=today;
    else if(preset==='this_week')start=week(today,weekStart);
    else if(preset==='this_month')start=today.slice(0,7)+'-01';
    else if(preset==='custom'){
      start=date(opts.from||today);end=date(opts.to||today);if(start>end)[start,end]=[end,start];
      if(end>today)end=today;if(start>end)start=end;
    }else {const n=Number.isFinite(Number(opts.days))?Math.max(1,Math.min(3660,Math.floor(Number(opts.days)))):30;start=shift(today,1-n);}
    const days=length(start,end);
    if(preset==='this_week'){prevStart=shift(start,-7);prevEnd=shift(prevStart,days-1);}
    else if(preset==='this_month'){
      const last=shift(start,-1);prevStart=last.slice(0,7)+'-01';prevEnd=shift(prevStart,Math.min(days,Number(last.slice(-2)))-1);
    }else {prevEnd=shift(start,-1);prevStart=shift(prevEnd,1-days);}
    return {start,end,days,prevStart,prevEnd,weekStart};
  }
  function calculate(events,opts){
    const w=window(opts),valid=[];
    for(const event of events||[]){
      if(!event||event.at==null||!Number.isFinite(Number(event.amount)))continue;
      try{valid.push({...event,date:date(event.at),amount:Number(event.amount)});}catch{}
    }
    const selected=valid.filter(e=>e.date>=w.start&&e.date<=w.end),previous=valid.filter(e=>e.date>=w.prevStart&&e.date<=w.prevEnd);
    const total=selected.reduce((sum,e)=>sum+e.amount,0),prevTotal=previous.reduce((sum,e)=>sum+e.amount,0),byKey=new Map();
    const day=new Map(),weeks=new Map(),months=new Map();
    for(let d=w.start;d<=w.end;d=shift(d,1)){day.set(d,0);weeks.set(week(d,w.weekStart),0);months.set(d.slice(0,7),0);}
    for(const e of selected){
      day.set(e.date,day.get(e.date)+e.amount);const wk=week(e.date,w.weekStart),mo=e.date.slice(0,7);weeks.set(wk,weeks.get(wk)+e.amount);months.set(mo,months.get(mo)+e.amount);
      const key=String(e.key||''),item=byKey.get(key)||{key,label:String(e.label||key),amount:0,count:0};item.amount+=e.amount;item.count++;byKey.set(key,item);
    }
    const unit=(map,key)=>{const max=[...map].reduce((a,b)=>b[1]>a[1]?b:a);return {avg:total/map.size,max:max[1],[key]:max[0]};};
    const purchases=selected.filter(e=>e.kind==='purchase').sort((a,b)=>new Date(a.at)-new Date(b.at));let interval=null;
    if(purchases.length>=2){const gaps=purchases.slice(1).map((e,i)=>(new Date(e.at)-new Date(purchases[i].at))/DAY),round=n=>Math.round(n*10)/10;interval={avgDays:round(gaps.reduce((a,b)=>a+b,0)/gaps.length),minDays:round(Math.min(...gaps)),maxDays:round(Math.max(...gaps)),lastAt:purchases.at(-1).at};}
    return {start:w.start,end:w.end,days:w.days,total,count:selected.length,purchaseCount:purchases.length,
      byKey:[...byKey.values()].map(e=>({...e,share:total===0?0:e.amount/total*100})).sort((a,b)=>b.amount-a.amount||a.label.localeCompare(b.label)),
      day:unit(day,'maxDate'),week:unit(weeks,'maxStart'),month:unit(months,'maxMonth'),interval,
      prev:{start:w.prevStart,end:w.prevEnd,total:prevTotal,count:previous.length,diff:total-prevTotal,pct:prevTotal===0?null:(total-prevTotal)/Math.abs(prevTotal)*100}};
  }

  /* 선택 기간 바로 앞의 완전한 주들을 기준선으로 쓴다(결제 없는 날도 0으로 포함). */
  function anomaly(events,opts){
    opts=opts||{};const w=window(opts);
    const setting=(key,def,min,max,integer)=>{const value=Number(opts[key]);return Number.isFinite(value)&&opts[key]!=null&&value>=min&&value<=max&&(!integer||Number.isInteger(value))?value:def;};
    const baselineWeeks=setting('baseline_weeks',8,1,104,true),zThreshold=setting('z_threshold',2,0,20),excessPct=setting('excess_pct',50,0,1000),shrinkPct=setting('shrink_pct',40,0,100),recentPayments=setting('recent_payments',5,2,100,true),minimum=setting('min_baseline_events',5,1,1000,true);
    const start=shift(w.start,-baselineWeeks*7),end=shift(w.start,-1),valid=[];
    for(const e of events||[]){
      if(!e||e.at==null||!Number.isFinite(Number(e.amount)))continue;
      try{valid.push({date:date(e.at),at:e.at,time:new Date(e.at).getTime(),amount:Number(e.amount),kind:e.kind});}catch{}
    }
    const before=valid.filter(e=>e.date>=start&&e.date<=end),selected=valid.filter(e=>e.date>=w.start&&e.date<=w.end);
    const daily=(rows,from,to)=>{const sums=new Map();for(let d=from;d<=to;d=shift(d,1))sums.set(d,0);for(const e of rows)sums.set(e.date,sums.get(e.date)+e.amount);return [...sums].map(([date,amount])=>({date,amount}));};
    const stats=values=>{const avg=values.reduce((a,b)=>a+b,0)/values.length;return {avg,sd:Math.sqrt(values.reduce((sum,x)=>sum+(x-avg)**2,0)/values.length)};};
    const baseDays=daily(before,start,end),days=daily(selected,w.start,w.end),dayStats=stats(baseDays.map(x=>x.amount)),weekTotals=[];
    for(let i=0;i<baseDays.length;i+=7)weekTotals.push(baseDays.slice(i,i+7).reduce((sum,x)=>sum+x.amount,0));
    const weekStats=stats(weekTotals),purchases=rows=>rows.filter(e=>e.kind==='purchase'&&e.amount>=0).sort((a,b)=>a.time-b.time),gaps=rows=>rows.slice(1).map((e,i)=>({date:e.date,days:(e.time-rows[i].time)/DAY})),gapAvg=points=>points.length?points.reduce((sum,x)=>sum+x.days,0)/points.length:null;
    const basePurchases=purchases(before),payments=purchases(selected),points=gaps(payments),recent=payments.slice(-recentPayments),baselineAvg=gapAvg(gaps(basePurchases)),recentAvg=gapAvg(gaps(recent));
    const baselineEvents=before.filter(e=>(e.kind==='purchase'||e.kind==='usage')&&e.amount>=0).length,insufficient=baselineEvents<minimum;
    const recent7=days.slice(-7).reduce((sum,x)=>sum+x.amount,0),z=weekStats.sd===0?null:(recent7-weekStats.avg)/weekStats.sd,pct=weekStats.avg===0?null:(recent7-weekStats.avg)/Math.abs(weekStats.avg)*100,intervalPct=baselineAvg>0&&recentAvg!=null?(baselineAvg-recentAvg)/baselineAvg*100:null;
    return {insufficient,baseline:{start,end,events:baselineEvents,dayAvg:dayStats.avg,daySd:dayStats.sd,weekAvg:weekStats.avg,weekSd:weekStats.sd,intervalAvg:baselineAvg},
      excess:{flag:!insufficient&&((z!=null&&z>=zThreshold)||(pct!=null&&pct>=excessPct)),recent7,z,pct},
      spikes:insufficient?[]:days.filter(x=>x.amount>dayStats.avg+zThreshold*dayStats.sd),
      interval:{flag:!insufficient&&intervalPct!=null&&intervalPct>=shrinkPct,recentAvg,baselineAvg,pct:intervalPct},
      days,points:points.map((p,i)=>({...p,recent:i>=payments.length-recent.length}))};
  }
  return {calculate,window,date,anomaly};
});
