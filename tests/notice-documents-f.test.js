const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','hr.html'),'utf8');
const noticeSql=fs.readFileSync(path.join(__dirname,'..','db','notice_attachments_deposit_access_draft.sql'),'utf8');
const employeeSql=fs.readFileSync(path.join(__dirname,'..','db','employee_documents_onboarding_hardening_draft.sql'),'utf8');

test('F장 공지 첨부와 서류 허용 형식이 xlsx·pptx·txt·hwpx를 포함한다',()=>{
  assert.match(html,/\.xlsx/);assert.match(html,/\.pptx/);assert.match(html,/\.txt/);assert.match(html,/\.hwpx/);
});

test('로컬 Storage 정책 SQL도 공지·서류 형식 목록을 함께 허용한다',()=>{
  for(const type of ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain'])assert.match(noticeSql,new RegExp(type.replace(/[.+]/g,'\\$&')));
  for(const type of ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain'])assert.match(employeeSql,new RegExp(type.replace(/[.+]/g,'\\$&')));
  assert.match(html,/BLOCKED_DOCUMENT_EXT/);assert.match(html,/실행 파일·압축 파일/);
});

test('실제 공지 붙여넣기 이벤트가 캡처 이미지를 보관한다',()=>{
  const start=html.indexOf('function renderNoticePastePreview');
  const bindEnd=html.indexOf("bindNoticePaste($('#ntBody'));",start);
  const end=bindEnd+"bindNoticePaste($('#ntBody'));".length;
  assert.ok(start>=0&&end>start);
  const body={dataset:{},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},dispatchEvent(event){this.listeners[event.type]?.(event);}};
  const context={NOTICE_PASTED_IMAGES:[],URL:{createObjectURL:()=> 'blob:test'},File:global.File,esc:value=>String(value||''),$:()=>body};
  vm.runInNewContext(html.slice(start,end)+'; this.bindNoticePaste=bindNoticePaste;',context);
  context.bindNoticePaste(body);
  const file={name:'capture.png',type:'image/png',size:12};
  let prevented=false;
  body.dispatchEvent({type:'paste',preventDefault:()=>{prevented=true;},clipboardData:{items:[{kind:'file',type:'image/png',getAsFile:()=>file}]}});
  assert.equal(prevented,true);assert.deepEqual(context.NOTICE_PASTED_IMAGES,[file]);
});

test('실제 submitNotice가 xlsx 첨부를 Storage 업로드와 notices INSERT에 전달한다',async()=>{
  const fields={ntTitle:{value:'공지'},ntBody:{value:'본문'},ntUrl:{value:''},ntPin:{checked:false},ntFiles:{files:[{name:'자료.xlsx',type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',size:12}],value:''},ntMsg:{textContent:''}};
  let uploaded,inserted;
  const sb={storage:{from(bucket){return {upload:async(path,file,opts)=>{uploaded={bucket,path,file,opts};return {error:null};},remove:async()=>{}};}},from(table){assert.equal(table,'notices');return {insert:async row=>{inserted=row;return {error:null};}};}};
  const base=html.slice(html.indexOf('const NOTICE_ATTACHMENT_ALLOWED_TYPES'),html.indexOf('const isLeaveDocsLead'));
  const source=base+html.slice(html.indexOf('async function submitNotice'),html.indexOf('async function delNotice'))+'; this.submitNotice=submitNotice;';
  const pasteBody={dataset:{},addEventListener(){}};
  const context={sb,ME:{id:'u1'},NOTICE_PASTED_IMAGES:[],crypto:{randomUUID:()=> 'id'},$:(id)=>id==='#ntBody'?pasteBody:fields[id.slice(1)],hide:()=>{},setStatus:()=>{},render:()=>{},renderNoticePastePreview:()=>{}};
  vm.runInNewContext(source,context);
  await context.submitNotice();
  assert.equal(uploaded.bucket,'notice-attachments');assert.equal(inserted.attachments[0].name,'자료.xlsx');
});

test('실제 이미지·PDF 미리보기 함수는 새 창 대신 허브 미리보기 영역을 채운다',async()=>{
  const box={innerHTML:'',style:{display:'none'}};const mask={classList:{add(){}}};
  const context={sb:{storage:{from:()=>({download:async()=>({data:new Blob(['x'],{type:'application/pdf'}),error:null})})}},$:id=>id==='#noticePreviewBody'?box:mask,URL:{createObjectURL:()=> 'blob:test'},setTimeout:()=>{},show:()=>{}};
  const start=html.indexOf('async function previewNoticeAttachment');const end=html.indexOf('async function downloadNoticeAttachment',start);
  assert.ok(start>=0&&end>start);
  vm.runInNewContext('function documentPreviewMarkup(url,name,type){return type===\'application/pdf\'?`<iframe src="${url}"></iframe>`:`<img src="${url}">`;};'+html.slice(start,end)+'; this.previewNoticeAttachment=previewNoticeAttachment;',context);
  await context.previewNoticeAttachment('x.pdf','문서.pdf','application/pdf');
  assert.match(box.innerHTML,/iframe/);assert.equal(box.style.display,'block');
});
