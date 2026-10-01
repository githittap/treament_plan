// 차례 3(출퇴근 · 근무표 · 연차) 화면 시험 도구 — hr.html에서 세 화면의 코드 조각을 떼어 가짜 자료로 실제로 실행하고, 나온 HTML·메시지·알림창 글을 모아 돌려준다.
// 같은 도구를 옛 코드(허브 글 옮기기 전, 커밋 84053a7)와 새 코드에 똑같이 돌려 「기본값만 있을 때 글자 하나까지 같음」을 대조한다.
// 옛 코드의 결과는 tests/fixtures/hub3-golden-84053a7.json 에 저장돼 있다(만든 법: node tests/manual/make-hub3-golden.cjs <옛 hr.html 경로>).
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const lf=s=>String(s).replace(/\r\n/g,'\n');

function region(html,startMarker,endMarker,includeEnd){
  const a=html.indexOf(startMarker);
  if(a<0)throw new Error('시작 표시를 못 찾음: '+startMarker);
  const b=html.indexOf(endMarker,a);
  if(b<0)throw new Error('끝 표시를 못 찾음: '+endMarker);
  return html.slice(a,b+(includeEnd?endMarker.length:0));
}
// supabase 흉내: 어떤 메서드 사슬이든 받아서 표마다 정해진 결과를 돌려준다. single/maybeSingle로 끝나면 spec.single, 아니면 spec.list.
function chain(spec){
  const s=spec||{};
  let mode='list';
  const p=new Proxy(function(){},{
    get(_,k){
      if(k==='then')return function(res,rej){return Promise.resolve({data:s.error?null:(mode==='single'?(s.single===undefined?null:s.single):(s.list===undefined?[]:s.list)),error:s.error||null}).then(res,rej);};
      return function(){if(k==='single'||k==='maybeSingle')mode='single';return p;};
    },
    apply(){return p;}
  });
  return p;
}
function makeDom(){
  const reg={},hist=[]; // hist: 화면 칸에 글을 쓴 순서(잠깐 떴다 사라지는 「확인 중…」 같은 글도 잡으려고)
  function el(sel){
    if(!reg[sel]){
      const e={value:'',checked:false,files:[],disabled:false,hidden:false,style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},
        addEventListener(){},removeAttribute(){},setAttribute(){},toggleAttribute(){},focus(){},scrollIntoView(){},querySelector(){return null;},querySelectorAll(){return [];}};
      let t='',h='';
      Object.defineProperty(e,'textContent',{get(){return t;},set(v){t=v;hist.push([sel,'t',String(v)]);},enumerable:true});
      Object.defineProperty(e,'innerHTML',{get(){return h;},set(v){h=v;hist.push([sel,'h',String(v)]);},enumerable:true});
      reg[sel]=e;
    }
    return reg[sel];
  }
  return {reg,$:el,hist};
}
// 하루가 지나도 결과가 안 바뀌게 시계를 고정(2026-10-01 12:00 한국 시간)하고, 지역 시간대에 따라 날짜 글이 달라지지 않게 한다.
const REAL_DATE=Date,FIXED=REAL_DATE.UTC(2026,9,1,3,0,0);
class FakeDate extends REAL_DATE{
  constructor(...a){if(a.length===0)super(FIXED);else super(...a);}
  static now(){return FIXED;}
  toLocaleDateString(){return this.toISOString().slice(0,10);}
}

const PROFILES=[
  {user_id:'u1',name:'김직원',role:'staff',active:true,approved:true,hire_date:'2025-03-01',dept:'진료실'},
  {user_id:'u2',name:'이매니저',role:'manager',active:true,approved:true,hire_date:'2026-09-01',dept:'데스크'},
  {user_id:'u3',name:'박<신입>',role:'staff',active:true,approved:true,hire_date:null,dept:'기공팀',employment_status:'재직'},
  {user_id:'u4',name:'최퇴사',role:'staff',active:false,approved:true,hire_date:'2024-01-01',dept:'진료실'}
];
const PEOPLE=[
  {id:'p1',profile_user_id:'u1',name:'김직원',department:'진료실',active:true,included_in_schedule:true},
  {id:'p2',profile_user_id:'u2',name:'이매니저',department:'데스크',active:true,included_in_schedule:true},
  {id:'p3',profile_user_id:null,name:'원장Dr',department:'Dr.',active:true,included_in_schedule:true},
  {id:'p4',profile_user_id:null,name:'과거<근무자>',department:'기공실',active:false,included_in_schedule:false},
  {id:'p5',profile_user_id:null,name:'이상한부서',department:'없는부서',active:true,included_in_schedule:true}
];

function tablesFor(name){ // 표마다 줄 자료(필요한 것만)
  const T={
    att_months:{single:null},
    attendance_issues:{list:[
      {id:1,user_id:'u1',work_date:'2026-09-10',rule_label:'지문인식오류',type:'정정',reason:'<b>사유</b>',status:'대기'},
      {id:2,user_id:'u2',work_date:'2026-09-11',rule_label:null,type:'종업누락',reason:'누락',status:'실장승인'},
      {id:3,user_id:'u1',work_date:'2026-09-12',rule_label:'입력오류',type:'정정',reason:'',status:'원장확정'},
      {id:4,user_id:'u3',work_date:'2026-09-13',rule_label:'기타',type:'정정',reason:'반려사유',status:'반려'}]},
    attendance_manual_entries:{list:[
      {id:1,user_id:'u1',work_date:'2026-09-24',status:'대기',clock_in:'09:00',clock_out:'18:00',reason:'정정<사유>',manual_note:'메모',half_day:'오후 반차',lunch_overtime_min:10,clockout_overtime_min:20,evening_overtime_min:0},
      {id:2,user_id:'u2',work_date:'2026-09-25',status:'실장승인',clock_in:null,clock_out:null,half_day:'없음'},
      {id:3,user_id:'u3',work_date:'2026-09-26',status:'원장확정',clock_in:'10:00',clock_out:'19:00'},
      {id:4,user_id:'u1',work_date:'2026-10-01',status:'반려',clock_in:'09:30',clock_out:'18:30'}]},
    attendance:{list:[
      {user_id:'u1',work_date:'2026-09-24',clock_in:'09:01',clock_out:'18:02',source:'fp',late_min:0,overtime_min:0},
      {user_id:'u1',work_date:'2026-10-01',clock_in:'09:50',clock_out:'18:40',source:'fp',late_min:10,overtime_min:10},
      {user_id:'u1',work_date:'2026-10-02',clock_in:'10:00',clock_out:'18:30',source:'manual',late_min:0,overtime_min:0}]},
    attendance_issue_resolutions:{list:[
      {user_id:'u1',work_date:'2026-10-01',clock_in:'09:00',clock_out:'18:00',late_min:3,early_min:0,overtime_min:5,source:'issue_adjustment',approved_at:'2026-10-01T03:00:00Z'}]},
    schedules:{list:[
      {person_id:'p1',user_id:'u1',week_start:'2026-10-01',day:4,shift:'work'},
      {person_id:'p2',user_id:'u2',week_start:'2026-10-02',day:5,shift:'evening'},
      {person_id:'p1',user_id:'u1',week_start:'2026-09-28',day:1,shift:'off'},
      {person_id:'p3',user_id:null,week_start:'2026-09-28',day:2,shift:'work'}]},
    schedule_weeks:{list:[{week_start:'2026-09-28',status:'공표'},{week_start:'2026-10-05',status:'초안'}],single:{status:'초안'}},
    leave_requests:{list:[
      {id:1,user_id:'u1',type:'연차',type_note:null,date_from:'2026-10-05',date_to:'2026-10-06',days:2,reason:'가족<행사>',contact:'010',special:false,special_reason:null,status:'대기',created_at:'2026-09-30T02:00:00Z'},
      {id:2,user_id:'u2',type:'반차',type_note:'09:00~13:00',date_from:'2026-10-07',date_to:'2026-10-07',days:0.5,reason:'',special:true,special_reason:'급한 일',status:'1차승인',created_at:'2026-09-30T02:00:00Z'},
      {id:3,user_id:'u1',type:'조퇴',type_note:'13:00~15:00',date_from:'2026-10-08',date_to:'2026-10-08',days:0.5,status:'승인',chief_by:'실장',chief_at:'2026-10-01T03:00:00Z',owner_by:'원장',owner_at:'2026-10-01T03:00:00Z',created_at:'2026-09-30T02:00:00Z'},
      {id:4,user_id:'u3',type:'기타',type_note:'<경조사>',date_from:'2026-10-09',date_to:'2026-10-10',days:2,status:'반려',created_at:'2026-09-30T02:00:00Z'},
      {id:5,user_id:'u1',type:'연차',type_note:null,date_from:'2026-10-11',date_to:'2026-10-11',days:1,status:'취소',cancelled_by:'원장',cancelled_at:'2026-10-01T03:00:00Z',created_at:'2026-09-30T02:00:00Z'}],
      single:{id:3,user_id:'u1',type:'조퇴',type_note:'13:00~15:00',date_from:'2026-10-08',date_to:'2026-10-08',days:0.5,reason:'병원',contact:'010-1',special:true,special_reason:'특별',status:'대기',chief_by:'실장',chief_at:'2026-10-01T03:00:00Z',owner_by:'원장',owner_at:'2026-10-01T03:00:00Z',created_at:'2026-09-30T02:00:00Z'}},
    v_leave_balance:{single:{balance:12.5}},
    profiles:{list:PROFILES,single:{name:'김직원',dept:'진료실'}},
    holidays:{list:[]}
  };
  return T[name];
}
function makeSb(over){
  const o=over||{};
  const rpcCalls=[];
  const sb={
    from(t){const spec=Object.prototype.hasOwnProperty.call(o.tables||{},t)?o.tables[t]:tablesFor(t);return chain(spec||{list:[],single:null});},
    rpc(name,args){rpcCalls.push([name,args]);const r=(o.rpc||{})[name];return Promise.resolve(r!==undefined?(typeof r==='function'?r(args):r):{data:[{}],error:null});},
    storage:{from(){return {upload:async()=>({error:null})};}}
  };
  sb.rpcCalls=rpcCalls;
  return sb;
}

async function renderAll(html,opts){
  const o=opts||{};
  const text=lf(html);
  const out={};
  const hubHelpers=text.includes('function hubN(')?region(text,'function hubN(','/* hub-texts.js(원장이 고치는 허브 글·목록)를 못 불러와도',false):''; // 옛 화면에는 없음
  const helperSrc=hubHelpers+'\n'+region(text,'function jongeop(','\n}\n',true)+'\n'+region(text,'const nameOf=uid=>','const SHIFTS={work:',false)+text.slice(text.indexOf('const SHIFTS={work:'),text.indexOf('\n',text.indexOf('const SHIFTS={work:'))+1);
  const bigSrc=region(text,'/* ── 출퇴근 ── */','/* ── 결재함 ── */',false);
  const hubJs=o.engine?lf(fs.readFileSync(path.join(__dirname,'..','..','hub-texts.js'),'utf8')):null;
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const md=s=>s?String(s).slice(5).replace('-','/'):'';

  async function makeCtx(extra,sbOver){
    const dom=makeDom(),log=[],statuses=[];
    const ctx={console,esc,md,$:dom.$,Date:FakeDate,Intl,Promise,Math,JSON,Set,Map,Number,String,Array,Object,parseInt,parseFloat,isNaN,
      PROFILES:PROFILES.map(p=>Object.assign({},p)),SCHEDULE_PEOPLE:PEOPLE.map(p=>Object.assign({},p)),SCHEDULE_PEOPLE_ERROR:'',
      ME:{id:'u1',name:'김직원',role:'staff',department:'진료실'},
      SETTINGS:{late_cut:'09:40',ot_unit_min:'10',siueop:'10:00',absence_confirm_after_minutes:'0',absence_confirm_after_days:'1',absence_exclude_pending_manual:'true',jongeop_weekday_evening:'20:00',jongeop_weekday_day:'18:30',jongeop_sat:'17:00',jongeop_sun:'14:00'},
      SETTINGS_LOAD_OK:true,
      isLead:()=>['chief','owner'].includes(ctx.ME.role),isMgr:()=>['manager','chief','owner'].includes(ctx.ME.role),
      today:()=>'2026-10-01',
      setStatus:s=>statuses.push(s),render:()=>{log.push('render');},refreshBadges:()=>{log.push('badges');},show:id=>log.push('show:'+id),hide:id=>log.push('hide:'+id),
      loadSchedulePeople:async()=>{},loadProfiles:async()=>{},
      alert:m=>log.push('alert:'+m),confirm:m=>{log.push('confirm:'+m);return ctx.__confirm!==false;},prompt:(m,d)=>{log.push('prompt:'+m+'|'+d);return ctx.__prompts&&ctx.__prompts.length?ctx.__prompts.shift():null;},
      setTimeout:()=>0,document:{createElement:()=>({click(){}}),querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},body:{classList:{add(){},remove(){}}}},
      FileReader:function(){},XLSX:{},
      sb:makeSb(sbOver)};
    ctx.window=ctx;
    Object.assign(ctx,extra||{});
    vm.createContext(ctx);
    if(o.shim){
      const m=text.match(/if\(typeof window\.hubText!=='function'\)\{[\s\S]*?\n\}/);
      if(m)vm.runInContext(m[0],ctx);
    }
    if(hubJs){
      vm.runInContext(hubJs,ctx);
      ctx.HubUi.setSettings(Object.assign(ctx.SETTINGS,o.settings||{}));
      if(o.textRows||o.loadFail){
        await ctx.HubUi.load({from(){const api={select(){return api;},then(res,rej){return Promise.resolve(o.loadFail?{data:null,error:{message:'x'}}:{data:o.textRows,error:null}).then(res,rej);}};return api;}});
      }
    }else if(o.settings)Object.assign(ctx.SETTINGS,o.settings);
    vm.runInContext(helperSrc+'\n'+bigSrc+'\n;this.api={renderAtt,checkAbsent,issueBtns,issueAct,openIssue,closeMonth,reviewManualAttendance,manualAttendanceFormHtml,manualAttendanceDetailText,renderManualAttendanceDayDetail,submitManualAttendance,saveAbsenceSettings,absenceSettingsHtml,buildPreview,parseXls,saveAttendance,renderXlTable,'
      +'renderSched,renderScheduleMonth,scheduleRosterAdminCard,scheduleRoleCell,saveSchedulePerson,setSchedulePersonDepartment,setSchedulePersonIncluded,setSchedulePersonActive,copyPrevWeek,'
      +'renderLeave,openLeaveForm,openLeaveEdit,openLeave,cancelPendingLeave,checkClash,submitLeave,leaveAct,cancelApprovedLeave,grantLeave,previewLeaveAccrual,applyLeaveAccrual,computeLeaveDays,leaveDisplayText,appStamp,'
      +'setState:(k,v)=>{if(k==="MANUAL_DETAIL_OPEN")MANUAL_DETAIL_OPEN=v;if(k==="SCHED_VIEW")SCHED_VIEW=v;if(k==="SCHED_WEEK")SCHED_WEEK=v;if(k==="SCHED_MONTH")SCHED_MONTH=v;if(k==="xlRows")xlRows=v;if(k==="LEAVE_EDIT_ID")LEAVE_EDIT_ID=v;if(k==="LEAVE_ARCHIVE_MONTH")LEAVE_ARCHIVE_MONTH=v;},getState:k=>k==="xlRows"?xlRows:undefined};'
      +'this.api2={leaveApplyModalPrepare:typeof leaveApplyModalPrepare==="function"?leaveApplyModalPrepare:null,leaveTypeItems:typeof leaveTypeItems==="function"?leaveTypeItems:null,leaveTypeLabel:typeof leaveTypeLabel==="function"?leaveTypeLabel:null,hubStaticFill:typeof hubStaticFill==="function"?hubStaticFill:null,hubN:typeof hubN==="function"?hubN:null};',ctx);
    return {ctx,dom,log,statuses,api:ctx.api,api2:ctx.api2};
  }
  const flush=()=>new Promise(res=>setImmediate(res));
  const asMgr=async(role,extra,sbOver)=>{const r=await makeCtx(extra,sbOver);r.ctx.ME={id:'u1',name:'김직원',role,department:'진료실'};return r;};
  const fail=m=>({error:{message:m}});
  if(o.probe)return {makeCtx,asMgr,fail,flush,makeDom,chain,makeSb,text}; // 시험이 장면을 직접 짜서 돌릴 때

  /* ───────── 출퇴근 ───────── */
  for(const role of ['manager','chief','owner']){
    const r=await asMgr(role,null,role==='owner'?{tables:{att_months:{single:{status:'확정'}}}}:(role==='chief'?{tables:{att_months:{single:{status:'집계중'}}}}:null));
    const m={innerHTML:''};await r.api.renderAtt(m);
    out['att.render.'+role]=m.innerHTML;out['att.render.'+role+'.calendar']=r.dom.$('#manualAttendanceCalendar').innerHTML;out['att.render.'+role+'.detail']=r.dom.$('#manualAttendanceDayDetailText').innerHTML;
  }
  for(const [name,tables] of [['err_msg',{attendance_manual_entries:fail('수기<조회>실패')}],['err_none',{attendance_manual_entries:{error:{}}}],['empty',{attendance_manual_entries:{list:[]},attendance_issues:{list:[]},attendance_issue_resolutions:{list:[]}}]]){
    const r=await asMgr('chief',null,{tables});const m={innerHTML:''};await r.api.renderAtt(m);out['att.render.chief.'+name]=m.innerHTML;
  }
  for(const [name,tables] of [['data',null],['empty',{attendance:{list:[]},attendance_manual_entries:{list:[]},attendance_issue_resolutions:{list:[]}}],['err',{attendance_manual_entries:fail('개인<오류>')}],['err_none',{attendance_manual_entries:{error:{}}}]]){
    const r=await asMgr('staff',null,tables?{tables}:null);const m={innerHTML:''};await r.api.renderAtt(m);out['att.render.staff.'+name]=m.innerHTML;
  }
  {
    const r=await asMgr('owner');
    out['att.absenceSettings.owner']=r.api.absenceSettingsHtml();
    r.ctx.ME.role='chief';out['att.absenceSettings.chief']=r.api.absenceSettingsHtml();
    r.api.setState('MANUAL_DETAIL_OPEN',false);
    out['att.manualForm.closed']=r.api.manualAttendanceFormHtml([{work_date:'2026-10-01',half_day:'오전 반차',manual_note:'<메모>',reason:'사유',lunch_overtime_min:10,clockout_overtime_min:0,evening_overtime_min:20}]);
    r.api.setState('MANUAL_DETAIL_OPEN',true);
    out['att.manualForm.open_empty']=r.api.manualAttendanceFormHtml([]);
    out['att.detailText']=JSON.stringify([r.api.manualAttendanceDetailText({}),r.api.manualAttendanceDetailText({reason:'R<',manual_note:'N',half_day:'오후 반차',lunch_overtime_min:10}),r.api.manualAttendanceDetailText({manual_note:'N'})]);
    out['att.issueBtns']=JSON.stringify(['chief','owner','manager'].flatMap(role=>['대기','실장승인','원장확정','반려'].map(st=>{r.ctx.ME.role=role;return r.api.issueBtns({id:7,status:st});})));
  }
  // 결근/미기록 후보
  for(const [name,extra,sbOver,pre] of [
    ['cands',null,{tables:{attendance:{list:[]},schedules:{list:[{user_id:'u1',day:4,week_start:'2026-10-01',shift:'work'},{user_id:'u2',day:4,week_start:'2026-10-01',shift:'evening'},{user_id:'u3',day:4,week_start:'2026-10-01',shift:'<x>'}]}}},null],
    ['settings_warn',{SETTINGS_LOAD_OK:false},{tables:{attendance:{list:[]}}},null],
    ['none',null,{tables:{schedules:{list:[]}}},null],
    ['err',null,{tables:{schedules:fail('후보<오류>')}},null]
  ]){
    const r=await asMgr('chief',extra,sbOver);
    await r.api.checkAbsent('2026-10');
    out['att.absent.'+name]=r.dom.$('#absentBox').innerHTML;
    if(name==='cands')out['att.absent.hist']=JSON.stringify(r.dom.hist.filter(h=>h[0]==='#absentBox'));
  }
  // 알림창·확인창·메시지
  {
    const r=await asMgr('chief',null,{rpc:{review_manual_attendance:fail('수기처리실패'),review_attendance_issue:fail('소명처리실패'),submit_attendance_issue:fail('소명저장실패')}});
    await r.api.reviewManualAttendance(1,'approve');await r.api.issueAct(1,'chief');
    r.ctx.__prompts=['2026-09-30','지문인식오류','지문 누락'];await r.api.openIssue();
    r.ctx.__prompts=['2026-09-30','엉뚱한유형'];await r.api.openIssue();
    r.ctx.__prompts=['2026-09-30','입력오류',''];await r.api.openIssue();
    r.ctx.__prompts=[null];await r.api.openIssue();
    const r2=await asMgr('chief',null,{rpc:{submit_attendance_issue:{error:null}}});
    r2.ctx.__prompts=['2026-09-30','기타','사유'];await r2.api.openIssue();
    r2.ctx.__confirm=false;await r2.api.closeMonth('2026-10');
    out['att.msgs.owner_chief_flows']=JSON.stringify([r.log,r2.log]);
  }
  {
    const set=(vals)=>{const d=makeDom();Object.entries(vals).forEach(([k,v])=>{d.$(k).value=v;});d.$('#manualReasonRequired').checked=false;return d.$;};
    const base={'#manualWorkDate':'2026-10-01','#manualLunchOvertimeRaw':'','#manualClockoutOvertimeRaw':'','#manualEveningOvertimeRaw':'','#manualReason':'','#manualNote':'','#manualLate':'0','#manualEarly':'0','#manualHalfDay':'없음'};
    const run=async(name,vals,rpc)=>{const r=await asMgr('staff',{$:set(Object.assign({},base,vals))},{rpc});await r.api.submitManualAttendance();out['att.submitManual.'+name]=JSON.stringify([r.ctx.$('#manualAttMsg').textContent,r.log]);};
    await run('bad_format',{'#manualLunchOvertimeRaw':'abc'},{});
    await run('fail',{},{submit_manual_attendance_d:fail('제출<실패>')});
    await run('ok',{},{submit_manual_attendance_d:{error:null}});
    const runSet=async(name,vals,upsertErr)=>{const d=makeDom();Object.entries(vals).forEach(([k,v])=>{d.$(k).value=v;});d.$('#absenceManualExclude').checked=true;
      const r=await asMgr('owner',{$:d.$,sb:{from:()=>({upsert:async()=>({error:upsertErr})})}});await r.api.saveAbsenceSettings();out['att.saveAbsence.'+name]=JSON.stringify([d.$('#absenceSettingsMsg').textContent,r.statuses]);};
    await runSet('bad',{'#absenceSiueop':'x','#absenceDelay':'0','#absenceDays':'1'},null);
    await runSet('fail',{'#absenceSiueop':'10:00','#absenceDelay':'0','#absenceDays':'1'},{message:'저장<오류>'});
    await runSet('ok',{'#absenceSiueop':'10:00','#absenceDelay':'0','#absenceDays':'1'},null);
  }
  // 지문 엑셀 올리기
  {
    const r=await asMgr('chief');
    const r1=await asMgr('chief');await r1.api.buildPreview([['x','y']]);out['att.xl.no_col']=JSON.stringify(r1.log);
    const mk=async(rows,pre)=>{const q=await asMgr('chief',null,{tables:{schedules:{list:[{user_id:'u1',day:4,shift:'evening',week_start:'2026-09-28'}]}},rpc:{update_employee_profile_field:{error:null}}});await q.api.buildPreview(rows);return q;};
    const d1=new FakeDate(2026,9,1,9,50),d2=new FakeDate(2026,9,1,18,40),d3=new FakeDate(2026,9,2,10,0);
    const q=await mk([['성명','발생일','발생시각'],['김직원',d1,d1],['김직원',d2,d2],['모르는사람<b>',d3,d3],['박<신입>',d3,d3]]);
    out['att.xl.preview']=JSON.stringify([q.ctx.$('#xlSummary').innerHTML,q.ctx.$('#xlUnmapped').innerHTML,q.ctx.$('#xlTable').innerHTML,q.log]);
    const q3=await asMgr('chief',null,{tables:{schedules:{list:[{user_id:'u1',day:4,shift:'off',week_start:'2026-09-28'}]}}});await q3.api.buildPreview([['성명','발생일','발생시각'],['김직원',d1,d1],['김직원',d2,d2],['알수없음1',d3,d3],['알수없음2',d3,d3]]);
    out['att.xl.preview_off']=JSON.stringify([q3.ctx.$('#xlTable').innerHTML,q3.ctx.$('#xlUnmapped').innerHTML]);
    await q3.ctx.window.mapToken('알수없음1','u2');out['att.xl.preview_one_mapped']=JSON.stringify([q3.ctx.$('#xlUnmapped').innerHTML]);
    const q2=await mk([['성명','발생일','발생시각'],['김직원',d1,d1],['김직원',d2,d2]]);
    out['att.xl.preview_allmapped']=JSON.stringify([q2.ctx.$('#xlSummary').innerHTML,q2.ctx.$('#xlUnmapped').innerHTML,q2.ctx.$('#xlTable').innerHTML]);
    // 전원 매핑 안내(미매핑 → 매핑 뒤)
    await q.ctx.window.mapToken('모르는사람<b>','u2');
    out['att.xl.preview_after_map']=JSON.stringify([q.ctx.$('#xlUnmapped').innerHTML]);
    // 저장
    const save=async(name,rows,rpc,upsertErr)=>{const x=await asMgr('chief',{sb:{from:t=>t==='holidays'?{select:async()=>({data:[]})}:{upsert:async()=>({error:upsertErr||null})},rpc:async(n,a)=>{x.log.push('rpc:'+n+JSON.stringify(a));return rpc||{error:null};}}});
      x.api.setState('xlRows',rows);await x.api.saveAttendance();out['att.xl.save.'+name]=JSON.stringify([x.ctx.$('#xlMsg').textContent,x.statuses,x.log,x.dom.hist.filter(h=>h[0]==='#xlMsg')]);};
    await save('no_rows',[]);
    await save('upsert_fail',[{user_id:'u1',ds:'2026-10-01',ci:600,co:1100,evening:false,single:false}],null,{message:'엑셀<저장>실패'});
    await save('issue_fail',[{user_id:'u1',ds:'2026-10-01',ci:600,co:null,evening:false,single:true}],{error:{message:'소명실패'}});
    await save('ok_miss',[{user_id:'u1',ds:'2026-10-01',ci:600,co:null,evening:false,single:true}]);
    await save('ok',[{user_id:'u1',ds:'2026-10-01',ci:600,co:1100,evening:false,single:false}]);
    {const fr={onload:null,readAsArrayBuffer(){fr.onload({target:{result:new ArrayBuffer(1)}});}};const x=await asMgr('chief',{FileReader:function(){return fr;},XLSX:{read(){throw new Error('엑셀<오류>');},utils:{}}});await x.api.parseXls({target:{files:[{}]}});out['att.xl.parse_fail']=JSON.stringify(x.log);}
    const rr=await asMgr('chief');rr.api.setState('xlRows',[]);
    await rr.api.parseXls({target:{files:[]}});
    out['att.xl.parse_nofile']=JSON.stringify(rr.log);
  }

  {
    const modalText=id=>{const a=text.indexOf('<div class="mask" id="'+id+'"');const b=text.indexOf('\n\n',a);const blk=text.slice(a,b);return JSON.stringify({text:blk.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(),placeholders:[...blk.matchAll(/placeholder="([^"]*)"/g)].map(m=>m[1])});};
    for(const id of ['lvMask','lvFormMask','xlMask'])out['static.modal.'+id]=modalText(id);
  }
  /* ───────── 근무표 ───────── */
  for(const [name,view,role,sbOver] of [
    ['week.staff','week','staff',null],['week.chief','week','chief',null],['week.owner','week','owner',null],
    ['week.err_week','week','staff',{tables:{schedule_weeks:fail('주차<오류>')}}],['week.nobody','week','staff',{__people:[]}],['month.nobody','month','staff',{__people:[]}],['week.err_week_none','week','staff',{tables:{schedule_weeks:{error:{}}}}],
    ['week.err_rows','week','staff',{tables:{schedules:fail('근무<오류>')}}],['week.err_leave','week','staff',{tables:{leave_requests:fail('연차<오류>')}}],
    ['week.published','week','staff',{tables:{schedule_weeks:{single:{status:'공표'}}}}],
    ['month.staff','month','staff',null],['month.chief','month','chief',null],['month.err','month','staff',{tables:{schedules:fail('월간<오류>')}}],['month.err_none','month','staff',{tables:{schedules:{error:{}}}}]
  ]){
    const nobody=sbOver&&sbOver.__people;const r=await asMgr(role,null,nobody?null:sbOver);if(nobody)r.ctx.SCHEDULE_PEOPLE=[];r.api.setState('SCHED_VIEW',view);r.api.setState('SCHED_WEEK','2026-09-28');r.api.setState('SCHED_MONTH','2026-10');
    const m={innerHTML:''};await r.api.renderSched(m);out['sched.'+name]=m.innerHTML;
  }
  {
    const r=await asMgr('chief');
    out['sched.roster.card']=r.api.scheduleRosterAdminCard();
    r.ctx.SCHEDULE_PEOPLE=[];out['sched.roster.card_empty']=r.api.scheduleRosterAdminCard();
    r.ctx.SCHEDULE_PEOPLE=PEOPLE.map(p=>Object.assign({},p));
    out['sched.roleCell.historical']=r.api.scheduleRoleCell('기공','2026-09-28','2026-09-29',r.ctx.SCHEDULE_PEOPLE,[{week_start:'2026-09-28',day:2,person_id:'p4',shift:'work'}],{},true);
    out['sched.roleCell.leave']=r.api.scheduleRoleCell('진료·상담','2026-09-28','2026-09-29',r.ctx.SCHEDULE_PEOPLE,[{week_start:'2026-09-28',day:2,person_id:'p1',shift:'work'}],{'u1|p1|2026-09-29':{date:'2026-09-29',label:'연차'}},false);
    out['sched.roleCell.empty']=r.api.scheduleRoleCell('Dr.','2026-09-28','2026-09-29',[],[],{},true);
  }
  for(const [name,role,extra,fn,args] of [
    ['noperm','staff',null,'saveSchedulePerson',[]],
    ['need_both','chief',{$:(()=>{const d=makeDom();d.$('#rosterName').value='';d.$('#rosterDepartment').value='';return d.$;})()},'saveSchedulePerson',[]],
    ['bad_dept','chief',null,'setSchedulePersonDepartment',['p1','엉뚱']],
    ['deact_cancel','chief',{__confirm:false},'setSchedulePersonActive',['p1',false]]
  ]){
    const r=await asMgr(role,extra);await r.api[fn](...args);out['sched.roster.flow.'+name]=JSON.stringify([r.ctx.$('#rosterMsg').textContent,r.log,r.statuses]);
  }
  for(const [name,fn,args,sbExtra] of [
    ['add_fail','saveSchedulePerson',[],{insert:{error:{message:'추가<실패>'}}}],
    ['dept_fail','setSchedulePersonDepartment',['p1','진료실'],{update:{error:{message:'부서실패'}}}],
    ['incl_fail','setSchedulePersonIncluded',['p1',true],{update:{error:{message:'포함실패'}}}],
    ['react_fail','setSchedulePersonActive',['p1',true],{update:{error:{message:'재활성실패'}}}],
    ['deact_fail','setSchedulePersonActive',['p1',false],{update:{error:{message:'비활성실패'}}}],
    ['reload_fail','setSchedulePersonIncluded',['p1',true],{reload:true}]
  ]){
    const d=makeDom();d.$('#rosterName').value='새사람';d.$('#rosterDepartment').value='진료실';
    const eqc=res=>({eq:async()=>res});
    const sbx={from:()=>({insert:async()=>sbExtra.insert||{error:null},update:()=>eqc(sbExtra.update||{error:null})})};
    const r=await asMgr('chief',{$:d.$,sb:sbx,loadSchedulePeople:async()=>{if(sbExtra.reload)throw new Error('새로고침<실패>');}});
    await r.api[fn](...args);out['sched.roster.mut.'+name]=JSON.stringify([d.$('#rosterMsg').textContent,r.log,r.statuses]);
  }
  for(const [name,tables,rpc] of [['no_prev',{schedules:{list:[]}},null],['read_err',{schedules:fail('읽기실패')},null],['rpc_fail',{schedules:{list:[{person_id:'p1'}]}},{copy_schedule_week:{error:{message:'복사<실패>'}}}],['rpc_fail_none',{schedules:{list:[{person_id:'p1'}]}},{copy_schedule_week:{error:{}}}],['ok',{schedules:{list:[{person_id:'p1'}]}},{copy_schedule_week:{error:null}}]]){
    const r=await asMgr('chief',null,{tables,rpc:rpc||{}});await r.api.copyPrevWeek('2026-10-05');out['sched.copy.'+name]=JSON.stringify([r.log,r.statuses]);
  }

  /* ───────── 연차 ───────── */
  for(const role of ['staff','chief','owner']){
    const r=await asMgr(role);const m={innerHTML:''};await r.api.renderLeave(m);out['leave.render.'+role]=m.innerHTML;
  }
  {
    const r=await asMgr('owner',null,{tables:{leave_requests:{list:[]},v_leave_balance:{single:null}}});const m={innerHTML:''};await r.api.renderLeave(m);out['leave.render.owner_empty']=m.innerHTML;
    const q=await asMgr('staff');out['leave.displayText']=JSON.stringify([q.api.leaveDisplayText('연차',null),q.api.leaveDisplayText('반차','09:00~13:00'),q.api.leaveDisplayText('조퇴','13:00~15:00'),q.api.leaveDisplayText('기타','사유'),q.api.leaveDisplayText('이상한',null)]);
    out['leave.appStamp']=JSON.stringify([q.api.appStamp('원장','2026-10-01T03:00:00Z'),q.api.appStamp('나','2026-10-01T03:00:00Z','신청')]);
    q.ctx.ME.role='manager';
    const holidays={holidays:{list:[]}};
    const days=async(t)=>{const x=await asMgr('staff',null,{tables:Object.assign({},holidays,{schedules:{list:[]}})});return x.api.computeLeaveDays('u1','2026-10-05','2026-10-07',t);};
    out['leave.computeDays']=JSON.stringify([await days('연차'),await days('반차'),await days('조퇴')]);
  }
  {
    const r=await asMgr('staff');
    for(const id of [3]){await r.api.openLeaveForm(id);}
    out['leave.form.html']=r.ctx.$('#lvFormBody').innerHTML;
    const r2=await asMgr('staff',null,{tables:{leave_requests:{single:{id:9,user_id:'u1',type:'연차',date_from:'2026-10-01',date_to:'2026-10-01',days:1,status:'승인',created_at:null},error:null},profiles:{single:null}}});
    await r2.api.openLeaveForm(9);out['leave.form.html_plain']=r2.ctx.$('#lvFormBody').innerHTML;
    const r3=await asMgr('staff',null,{tables:{leave_requests:{single:null}}});await r3.api.openLeaveForm(9);out['leave.form.none']=JSON.stringify(r3.log);
  }
  {
    // 신청 창 열기·수정
    for(const [name,sbOver] of [['notpending',{tables:{leave_requests:{single:{id:1,status:'승인',type:'연차'}}}}],['missing',{tables:{leave_requests:{single:null}}}],['pending',{tables:{leave_requests:{single:{id:1,status:'대기',type:'반차',type_note:'09:00~13:00',date_from:'2026-10-01',date_to:'2026-10-01',reason:'',contact:'',special_reason:''}}}}]]){
      const r=await asMgr('staff',null,sbOver);await r.api.openLeaveEdit(1);await flush();out['leave.edit.'+name]=JSON.stringify([r.log,r.ctx.$('#lvMsg').textContent,r.dom.hist.filter(h=>h[0]==='#lvMsg')]);
    }
    const o=await asMgr('staff');await o.api.openLeave();await flush();out['leave.open']=JSON.stringify([o.log,o.ctx.$('#lvMsg').textContent]);
    for(const [name,rpc,confirmOk] of [['declined',{},false],['fail',{process_leave_request:{error:{message:'취소<실패>'}}},true],['unknown',{process_leave_request:{data:[],error:null}},true],['ok',{process_leave_request:{data:[{request_id:1}],error:null}},true]]){
      const r=await asMgr('staff',{__confirm:confirmOk},{rpc});await r.api.cancelPendingLeave(1);out['leave.cancelPending.'+name]=JSON.stringify([r.log,r.statuses]);
    }
  }
  // 겹침 안내·신청
  {
    const mk=async(conflicts,vals,extra,sbOver)=>{
      const d=makeDom();Object.entries(vals).forEach(([k,v])=>{d.$(k).value=v;});
      const r=await asMgr('staff',Object.assign({$:d.$},extra||{}),sbOver);return {r,d};
    };
    const mkTables=n=>({leave_requests:{list:Array.from({length:n},(_,i)=>({user_id:'u'+(i+2),date_from:'2026-10-05',date_to:'2026-10-05'}))}});
    for(const n of [0,1,2,3]){
      const {r,d}=await mk(n,{'#lvFrom':'2026-10-05','#lvTo':'2026-10-05'},null,{tables:mkTables(n)});
      await r.api.checkClash();out['leave.clash.'+n]=JSON.stringify([d.$('#lvOverlap').textContent,d.$('#lvSpecialWrap').style.display,d.$('#lvMsg').textContent]);
    }
    {const {r,d}=await mk(0,{'#lvFrom':'2026-10-06','#lvTo':'2026-10-05'},null,{tables:mkTables(0)});await r.api.checkClash();out['leave.clash.badperiod']=JSON.stringify([d.$('#lvSpecialWrap').style.display]);}
    const submit=async(name,vals,n,rpc,insertRes)=>{
      const {r,d}=await mk(n,Object.assign({'#lvFrom':'2026-10-05','#lvTo':'2026-10-05','#lvType':'연차','#lvTimeFrom':'','#lvTimeTo':'','#lvReason':'','#lvContact':'','#lvSpecial':'','#lvNote':''},vals),{
        sb:Object.assign(makeSb({tables:mkTables(n),rpc:rpc||{}}),{from:t=>t==='leave_requests'?(()=>{const c=chain({list:Array.from({length:n},(_,i)=>({user_id:'u'+(i+2),date_from:'2026-10-05',date_to:'2026-10-05'}))});return new Proxy(c,{get(tg,k){if(k==='insert')return ()=>({select:()=>({maybeSingle:async()=>insertRes||{data:{id:1},error:null}})});return tg[k];}});})():chain({list:[]})})});
      await r.api.submitLeave();out['leave.submit.'+name]=JSON.stringify([d.$('#lvMsg').textContent,d.$('#lvMsg').innerHTML,r.log]);
    };
    await submit('noperiod',{'#lvFrom':''},0);
    await submit('badperiod',{'#lvFrom':'2026-10-06','#lvTo':'2026-10-05'},0);
    await submit('badtime',{'#lvType':'반차'},0);
    await submit('full',{},2);
    await submit('need_reason',{},1);
    await submit('with_reason',{'#lvSpecial':'급한 일'},1);
    await submit('insert_fail',{},0,null,{data:null,error:{message:'신청<실패>'}});
    await submit('insert_unknown',{},0,null,{data:null,error:null});
    await submit('ok',{},0);
  }
  // 승인·취소·부여·적립
  for(const [name,fn,args,rpc,confirmOk] of [
    ['act_ok_declined','leaveAct',[1,'ok'],{},false],['act_rej_declined','leaveAct',[1,'rej'],{},false],
    ['act_fail','leaveAct',[1,'ok'],{process_leave_request:{error:{message:'처리<실패>'}}},true],['act_unknown','leaveAct',[1,'rej'],{process_leave_request:{data:[],error:null}},true],['act_ok','leaveAct',[1,'ok'],{process_leave_request:{data:[{request_id:1}],error:null}},true],
    ['cancelok_declined','cancelApprovedLeave',[3],{},false],['cancelok_fail','cancelApprovedLeave',[3],{process_leave_request:{error:{message:'복구<실패>'}}},true],['cancelok_unknown','cancelApprovedLeave',[3],{process_leave_request:{data:[],error:null}},true],['cancelok_ok','cancelApprovedLeave',[3],{process_leave_request:{data:[{request_id:3}],error:null}},true]
  ]){
    const sbOver=name.startsWith('cancelok')?{rpc,tables:{leave_requests:{single:{id:3,user_id:'u1',status:'승인',date_from:'2026-10-08',date_to:'2026-10-08'}}}}:{rpc};
    const r=await asMgr('chief',{__confirm:confirmOk},sbOver);await r.api[fn](...args);out['leave.'+name]=JSON.stringify([r.log,r.statuses]);
  }
  {
    const r0=await asMgr('chief',null,{tables:{leave_requests:{single:{id:3,user_id:'u1',status:'대기'}}}});await r0.api.cancelApprovedLeave(3);out['leave.cancelok_state']=JSON.stringify(r0.log);
    for(const [name,vals,rpc] of [['bad_days',{'#gvKind':'조정','#gvDays':'-1'},{}],['fail',{'#gvKind':'조정','#gvDays':'3'},{set_leave_balance:{error:{message:'기록<실패>'}}}],['unknown',{'#gvKind':'조정','#gvDays':'3'},{set_leave_balance:{data:[],error:null}}],['ok',{'#gvKind':'조정','#gvDays':'3'},{set_leave_balance:{data:[{ok:1}],error:null}}],['grant',{'#gvKind':'부여','#gvDays':'1'},{preview_monthly_leave_accruals:{data:[],error:null}}]]){
      const d=makeDom();d.$('#gvUser').value='u1';Object.entries(vals).forEach(([k,v])=>{d.$(k).value=v;});d.$('#gvNote').value='';
      const r=await asMgr('owner',{$:d.$},{rpc});await r.api.grantLeave();out['leave.grant.'+name]=JSON.stringify([r.log,r.statuses,d.$('#laMsg').textContent]);
    }
    const accrualRows=[{already_recorded:false,user_id:'u1',user_name:'김<직원>',hire_date:'2025-01-01',due_date:'2026-10-01',past:true,accrual_kind:'annual',target_days:15,existing_credit_days:3,grant_days:12},{already_recorded:true,user_id:'u2',user_name:'',hire_date:'2025-02-01',due_date:'2026-09-01',past:false,accrual_kind:'monthly',target_days:1,existing_credit_days:1,grant_days:0}];
    for(const [name,date,rpc] of [['bad_date','2027-01-01',{}],['fail','2026-10-01',{preview_monthly_leave_accruals:{error:{message:'미리<실패>'}}}],['empty','2026-10-01',{preview_monthly_leave_accruals:{data:[],error:null}}],['rows','2026-10-01',{preview_monthly_leave_accruals:{data:accrualRows,error:null}}]]){
      const d=makeDom();d.$('#laAsOf').value=date;
      const r=await asMgr('owner',{$:d.$},{rpc});await r.api.previewLeaveAccrual();out['leave.accrual.preview.'+name]=JSON.stringify([d.$('#laMsg').textContent,d.$('#laRows').innerHTML,d.$('#laApply').disabled,d.hist.filter(h=>h[0]==='#laMsg')]);
    }
    {
      const d=makeDom();d.$('#laAsOf').value='2026-10-01';
      const picked=[{dataset:{laIndex:'0'}}];d.$('#laRows').querySelectorAll=()=>picked;
      const mkApply=async(name,asOfMismatch,pick,rpcRes,confirmOk,secondPreviewFails)=>{
        const dd=makeDom();dd.$('#laAsOf').value='2026-10-01';
        dd.$('#laRows').querySelectorAll=()=>pick?[{dataset:{laIndex:'0'}}]:[];
        let n=0;
        const r=await asMgr('owner',{$:dd.$,__confirm:confirmOk,renderLeave:async()=>{}},{rpc:{preview_monthly_leave_accruals:()=>{n++;return (secondPreviewFails&&n>1)?{data:null,error:{message:'재조회<실패>'}}:{data:accrualRows,error:null};},apply_monthly_leave_accruals:rpcRes}});
        // 먼저 미리보기로 기준일·행을 채운 뒤 적용
        await r.api.previewLeaveAccrual();
        if(asOfMismatch)dd.$('#laAsOf').value='2026-09-30';
        dd.$('#laRows').querySelectorAll=()=>pick?[{dataset:{laIndex:'0'}}]:[];
        await r.api.applyLeaveAccrual();
        out['leave.accrual.apply.'+name]=JSON.stringify([dd.$('#laMsg').textContent,r.log,dd.hist.filter(h=>h[0]==='#laMsg')]);
      };
      await mkApply('mismatch',true,true,{data:[],error:null},true);
      await mkApply('none_picked',false,false,{data:[],error:null},true);
      await mkApply('declined',false,true,{data:[],error:null},false);
      await mkApply('fail',false,true,{data:null,error:{message:'적용<실패>'}},true);
      await mkApply('ok',false,true,{data:[{granted_days:12,created_runs:1}],error:null},true);
      await mkApply('ok_none',false,true,{data:[],error:null},true);
      await mkApply('ok_recheck_fail',false,true,{data:[{granted_days:12,created_runs:1}],error:null},true,true);
    }
  }
  return out;
}
module.exports={renderAll,region,chain,lf,makeSb,tablesFor,FakeDate,PROFILES,PEOPLE};
