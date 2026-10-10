/* 모든 안내는 hub-texts.js의 help.<key>를 읽습니다. */
(function(root){
'use strict';
/* hub-help:test-start */
function hubHelpEscape(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function hubHelpParse(text){
  const fields={what:[],who:[],steps:[],notes:[]};let key='what';
  String(text||'').replace(/\r\n/g,'\n').split('\n').forEach(line=>{
    const m=/^\s*(무엇|누가(?: 보고 쓰나)?|쓰는 법|알아둘 점)\s*[:：]\s*(.*)$/.exec(line);
    if(m){key=({'무엇':'what','누가':'who','누가 보고 쓰나':'who','쓰는 법':'steps','알아둘 점':'notes'})[m[1]];line=m[2];}
    if(line.trim())fields[key].push(line.trim());
  });return fields;
}
function hubHelpCardHtml(key,text,label,open){
  const f=hubHelpParse(text),esc=hubHelpEscape;
  const headings={what:'무엇',who:'누가 보고 쓰나',steps:'쓰는 법',notes:'알아둘 점'};
  return '<section class="hub-help-card" id="hub-help-'+esc(key)+'" data-hub-help-card="'+esc(key)+'" aria-label="'+esc(label)+' 사용법"'+(open?'':' hidden')+'>'+Object.keys(f).filter(k=>f[k].length).map(k=>
    '<div class="hub-help-field"><h3>'+esc(headings[k])+'</h3>'+(k==='steps'?'<ol>'+f[k].map(s=>'<li>'+esc(s.replace(/^\d+[.)]\s*/,''))+'</li>').join('')+'</ol>':'<p>'+f[k].map(esc).join('<br>')+'</p>')+'</div>').join('')+'</section>';
}
function hubHelpButtonHtml(key,text,open){return String(text||'').trim()?'<button type="button" class="mini hub-help-button" data-hub-help="'+hubHelpEscape(key)+'" aria-expanded="'+!!open+'" aria-controls="hub-help-'+hubHelpEscape(key)+'">❓ 사용법</button>':'';}
const HUB_HELP_CSS='.hub-help-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0;max-width:100%;box-sizing:border-box}.hub-help-row>h2{flex:1;min-width:0;margin:0;overflow-wrap:anywhere}.hub-help-button{margin-left:auto;flex:0 0 auto;white-space:nowrap}.hub-help-card{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;background:var(--panel,#142631);border:1px solid var(--line,#3b515e);border-radius:10px;padding:14px;margin:10px 0 16px;max-width:100%;box-sizing:border-box;overflow-wrap:anywhere}.hub-help-card[hidden]{display:none}.hub-help-field{min-width:0}.hub-help-field h3{font-size:14px;margin:0 0 6px;color:var(--mint,#6ee7b7)}.hub-help-field p{margin:0;white-space:pre-wrap;line-height:1.65;font-size:13px}.hub-help-field ol{margin:0;padding-left:22px;line-height:1.65;font-size:13px}@media(max-width:640px){.hub-help-card{grid-template-columns:minmax(0,1fr);padding:12px;gap:10px}}@media print{.hub-help-button,.hub-help-card{display:none!important}}';
/* hub-help:test-end */
const memory={};
function readOpen(key){try{const value=root.localStorage.getItem('hub.help.open.'+key);if(value!=null)return value==='true';}catch(e){}return memory[key]===true;}
function saveOpen(key,value){memory[key]=value;try{root.localStorage.setItem('hub.help.open.'+key,String(value));}catch(e){}}
function text(key){const d=root.HubUi&&root.HubUi.helpers.hubTextDefByKey('help.'+key);return d&&typeof root.hubText==='function'?root.hubText('help.'+key,d.def):'';}
function mount(container,key,label,anchor){
  if(!container||container.querySelector('[data-hub-help="'+key+'"]'))return;
  const value=text(key);if(!value.trim())return;
  if(!document.getElementById('hubHelpStyle')){const style=document.createElement('style');style.id='hubHelpStyle';style.textContent=HUB_HELP_CSS;document.head.appendChild(style);}
  let row=anchor;
  if(!row){row=document.createElement('div');row.className='hub-help-row';const h=document.createElement('h2');h.textContent=label;row.appendChild(h);container.prepend(row);}
  else if(/^H[23]$/.test(row.tagName)){const h=row;row=document.createElement('div');h.before(row);row.appendChild(h);}
  row.classList.add('hub-help-row');
  const opened=readOpen(key);row.insertAdjacentHTML('beforeend',hubHelpButtonHtml(key,value,opened));row.insertAdjacentHTML('afterend',hubHelpCardHtml(key,value,label,opened));
  const button=row.querySelector('[data-hub-help="'+key+'"]'),panel=row.nextElementSibling;
  button.addEventListener('click',function(){const opened=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(opened));panel.hidden=!opened;saveOpen(key,opened);});
}
function mountRow(container,key,label,button){
  if(!button)return;
  let row=button.parentElement;
  if(row.classList.contains('card')){
    const buttons=Array.from(row.children).filter(el=>el.tagName==='BUTTON'&&/setPayView/.test(el.getAttribute('onclick')||''));
    const line=document.createElement('div');line.className='rowflex';buttons[0].before(line);buttons.forEach(el=>line.appendChild(el));row=line;
  }
  mount(container,key,label,row);
}
// main은 그대로 두고 내용만 다시 그리는 조회·저장 경로도 안내를 유지합니다.
const watched=new WeakMap();
function watch(container,onChange){
  if(!container||watched.has(container))return;
  const state={frame:null,active:true,observer:null};
  const observer=new root.MutationObserver(function(){
    if(!state.active||state.frame!==null)return;
    state.frame=root.requestAnimationFrame(function(){state.frame=null;if(state.active)onChange();});
  });
  state.observer=observer;
  observer.observe(container,{childList:true,subtree:true});
  watched.set(container,state);
}
function unwatch(container){
  const state=watched.get(container);if(!state)return;
  state.active=false;state.observer.disconnect();
  if(state.frame!==null)root.cancelAnimationFrame(state.frame);
  watched.delete(container);
}
root.HubHelp={mount:mount,mountRow:mountRow,watch:watch,unwatch:unwatch};
})(typeof window!=='undefined'?window:globalThis);
