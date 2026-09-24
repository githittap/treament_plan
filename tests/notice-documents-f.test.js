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

test('로컬 Storage 정책은 HWPX와 빈·브라우저 MIME를 확장자와 함께 허용하고 차단목록만 거부한다',()=>{
  assert.match(html,/application\/vnd\.hancom\.hwpx|\.hwpx/);
  assert.match(noticeSql,/application\/vnd\.hancom\.hwpx/);assert.match(noticeSql,/allowed_mime_types\) values[^\n]*null|allowed_mime_types=null/);assert.match(employeeSql,/application\/vnd\.hancom\.hwpx/);
  for(const sql of [noticeSql,employeeSql]){assert.match(sql,/!~\*/);assert.match(sql,/exe\|msi\|bat/);}
  assert.match(html,/BLOCKED_DOCUMENT_EXT/);assert.match(html,/실행 파일·압축 파일/);
});

test('공지와 직원 서류는 일반 형식을 허용하고 실행·압축 확장자와 MIME를 거부한다',()=>{
  const noticeStart=html.indexOf('const NOTICE_ATTACHMENT_ALLOWED_TYPES');
  const noticeEnd=html.indexOf('let NOTICE_PASTED_IMAGES',noticeStart);
  const employeeStart=html.indexOf('const BLOCKED_DOCUMENT_EXT=');
  const employeeEnd=html.indexOf('/* employee-documents:test-end */',employeeStart);
  assert.ok(noticeStart>=0&&noticeEnd>noticeStart);
  assert.ok(employeeStart>=0&&employeeEnd>employeeStart);
  const notice={};
  vm.runInNewContext(html.slice(noticeStart,noticeEnd)+';this.isAllowedNoticeAttachment=isAllowedNoticeAttachment;',notice);
  const employee={};
  vm.runInNewContext(html.slice(employeeStart,employeeEnd)+';this.validateGeneralDocument=validateGeneralDocument;',employee);
  const formats=[
    ['기안.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['표.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['발표.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['메모.txt','text/plain'],
    ['양식.hwpx','application/vnd.hancom.hwpx'],
    ['기타.unknown','application/octet-stream'],
    ['빈형식.hwpx','']
  ];
  for(const [name,type] of formats){
    const file={name,type,size:100};
    assert.equal(notice.isAllowedNoticeAttachment(file),true,name);
    assert.equal(employee.validateGeneralDocument(file),'',name);
  }
  for(const [name,type] of [['실행.exe','application/pdf'],['압축.zip','text/plain'],['문서.pdf','application/x-msdownload']]){
    const file={name,type,size:100};
    assert.equal(notice.isAllowedNoticeAttachment(file),false,name);
    assert.match(employee.validateGeneralDocument(file),/실행 파일·압축 파일/,name);
  }
  assert.match(employee.validateGeneralDocument({name:'빈.pdf',type:'application/pdf',size:0}),/0바이트/);
  assert.match(employee.validateGeneralDocument({name:'큰.pdf',type:'application/pdf',size:10*1024*1024+1}),/10MB/);
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

test('실제 paste→submit이 본문 marker를 저장하고 renderNoticeBody가 이미지만 렌더링한다',async()=>{
  const image={name:'capture.gif',type:'image/gif',size:12},bodyField={value:'안전한 본문',dataset:{},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},dispatchEvent(event){this.listeners[event.type]?.(event);}},fileField={files:[],value:''},fields={ntTitle:{value:'공지'},ntBody:bodyField,ntUrl:{value:''},ntPin:{checked:false},ntFiles:fileField,ntMsg:{textContent:''}};
  let inserted,uploaded;
  const sb={storage:{from(){return {upload:async(path,file)=>{uploaded={path,file};return {error:null};},download:async()=>({data:new Blob(['image'],{type:'image/gif'}),error:null}),remove:async()=>{}};}},from(table){return table==='notices'?{insert:async row=>{inserted=row;return {error:null};}}:{}}};
  const base=html.slice(html.indexOf('const NOTICE_ATTACHMENT_ALLOWED_TYPES'),html.indexOf('const isLeaveDocsLead'));
  const source=base+html.slice(html.indexOf('async function submitNotice'),html.indexOf('async function delNotice'))+'; this.submitNotice=submitNotice;';
  const context={sb,ME:{id:'u1'},NOTICE_PASTED_IMAGES:[image],crypto:{randomUUID:()=> 'id'},$:(id)=>id==='#ntBody'?bodyField:id==='#ntFiles'?fileField:fields[id.slice(1)],hide:()=>{},setStatus:()=>{},render:()=>{},renderNoticePastePreview:()=>{}};
  vm.runInNewContext(source,context);bodyField.dispatchEvent({type:'paste',preventDefault(){},clipboardData:{items:[{kind:'file',type:'image/gif',getAsFile:()=>image}]}});await context.submitNotice();
  assert.equal(uploaded.file,image);assert.match(inserted.body,/안전한 본문\n\[\[notice-image:u1\/tmp\/id-capture\.gif\]\]/);assert.equal(inserted.attachments[0].type,'image/gif');
  const renderStart=html.indexOf('let NOTICE_INLINE_OBJECT_URLS'),renderEnd=html.indexOf('async function renderNotice(m)',renderStart);
  const revoked=[],renderedContext={sb,URL:{createObjectURL:()=> 'blob:inline',revokeObjectURL:url=>revoked.push(url)},esc:value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')};
  vm.runInNewContext(html.slice(renderStart,renderEnd)+'; this.renderNoticeBody=renderNoticeBody; this.revokeNoticeInlineObjectUrls=revokeNoticeInlineObjectUrls;',renderedContext);
  const rendered=await renderedContext.renderNoticeBody('본문 <img src=x onerror=alert(1)> [[notice-image:u1/tmp/id-capture.gif]]',[{path:'u1/tmp/id-capture.gif',name:'capture.gif',type:'image/gif'}]);
  assert.match(rendered,/blob:inline/);assert.doesNotMatch(rendered,/<img src=x/);assert.match(rendered,/&lt;img/);
  await renderedContext.renderNoticeBody('두 번째 [[notice-image:u1/tmp/id-capture.gif]]',[{path:'u1/tmp/id-capture.gif',name:'capture.gif',type:'image/gif'}]);renderedContext.revokeNoticeInlineObjectUrls();assert.deepEqual(revoked,['blob:inline','blob:inline']);
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
