const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('hr.html','utf8');
test('새 파일 입력도 드롭 영역을 받고 여러 파일은 기존 change 처리로 전달한다',()=>{
  const source=html.match(/function enhanceFileDrops\(\)\{[\s\S]*?\n\}/)?.[0];assert.ok(source);
  function input(multiple){const events=[];return {multiple,dataset:{},events,closest:()=>null,insertAdjacentElement(_where,zone){this.zone=zone},dispatchEvent(event){events.push(event.type)},click(){events.push('click')}};}
  const single=input(false),multi=input(true),alerts=[];
  const document={querySelectorAll:()=>[single,multi],createElement:()=>({classList:{add(){},remove(){}},handlers:{},setAttribute(){},addEventListener(name,fn){this.handlers[name]=fn}})};
  class DataTransfer{constructor(){const files=[];this.files=files;this.items={add:file=>files.push(file)}}}
  const context={document,DataTransfer,Event:class{constructor(type){this.type=type}},alert:message=>alerts.push(message)};
  vm.createContext(context);vm.runInContext(source+';enhanceFileDrops();enhanceFileDrops()',context);
  assert.ok(single.zone&&multi.zone);assert.equal(single.zone.textContent.includes('여러 개'),false);assert.equal(multi.zone.textContent.includes('여러 개'),true);
  const files=[{name:'a.pdf'},{name:'b.pdf'}],drop={dataTransfer:{files},preventDefault(){}};
  single.zone.handlers.drop(drop);assert.equal(single.files,undefined);assert.equal(alerts.length,1);
  multi.zone.handlers.drop(drop);assert.deepEqual(multi.files,files);assert.deepEqual(multi.events,['change']);
  assert.equal(multi.dataset.dropReady,'1');
});
test('문의함은 리콜 상태와 부정 키워드를 판별한다',()=>{
  const block=html.match(/const INBOX_STATUSES=[\s\S]*?function inboxAssigneeOptions/)?.[0];assert.ok(block);
  const context={};vm.createContext(context);vm.runInContext(block.replace(/function inboxAssigneeOptions$/,'')+';this.status=inboxStatusLabel;this.negative=inboxNegative',context);
  assert.equal(context.status('recall_3'),'리콜 3차');
  assert.equal(context.negative({subject:'문의',message:'환불 부탁'}),true);
  assert.equal(context.negative({subject:'예약',message:'날짜 문의'}),false);
});
