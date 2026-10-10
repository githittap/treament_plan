const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fnSrc}=require('./fixtures/hub7-harness.cjs');
const hr=fs.readFileSync('hr.html','utf8').replace(/\r\n/g,'\n'),tick=()=>new Promise(r=>setImmediate(r));
test('건의 화면이 만든 입력칸과 수정 저장 버튼으로 실제 update를 보낸다',async()=>{
 const nodes={'#main':{isConnected:true}},writes=[],c={ME:{id:'example',role:'staff'},SUGGESTION_EDIT_GENERATION:0,SUGGESTION_EDIT_ID:1,SUGGESTION_CAMPAIGN_ID:null,
  $:id=>nodes[id]||null,esc:String,nameOf:()=> '직원 예시',today:()=> '2026-10-10',hubT:(k,d)=>d,setStatus(){},alert(){},render(){},renderSuggestionComments:()=>'',
  sb:{from(table){let op='select',row,id;const q=new Proxy({},{get(_,key){if(key==='then')return (ok,bad)=>{
   if(op==='update')writes.push({table,row,id});
   const data=table==='suggestion_campaigns'?{id:10,title:'가짜 캠페인',starts_at:'2026-10-01',ends_at:'2026-10-20'}:table==='suggestions'?[{id:1,campaign_id:10,user_id:'example',title:'가짜 제목',body:'가짜 내용'}]:[];
   return Promise.resolve({data,error:null}).then(ok,bad);
  };return (...a)=>{if(key==='update'){op=key;row=a[0];}if(key==='eq'&&a[0]==='id')id=a[1];return q;};}});return q;}}};
 vm.createContext(c);vm.runInContext(['summarizeSuggestions','winnerVisibility','renderSuggestions','saveSuggestion'].map(n=>fnSrc(hr,n)).join('\n'),c);
 const main={innerHTML:''};await c.renderSuggestions(main);
 // 노드 자동 생성 금지: 실제 화면 HTML에 있는 입력칸만 등록합니다.
 for(const match of main.innerHTML.matchAll(/<(?:input|textarea)\b[^>]*\bid="([^"]+)"/g))nodes['#'+match[1]]={value:''};
 assert.ok(nodes['#suggestionEditTitle-1']);assert.ok(nodes['#suggestionEditBody-1']);assert.equal(nodes['#suggestionEdit-1Title'],undefined);
 nodes['#suggestionEditTitle-1'].value='바뀐 제목';nodes['#suggestionEditBody-1'].value='바뀐 내용';
 const button=main.innerHTML.match(/<button[^>]*onclick="(saveSuggestion\(1\))"[^>]*>수정 저장<\/button>/);assert.ok(button);
 await vm.runInContext(button[1],c);assert.equal(writes.length,1);assert.equal(writes[0].table,'suggestions');assert.equal(writes[0].id,1);assert.equal(writes[0].row.title,'바뀐 제목');assert.equal(writes[0].row.body,'바뀐 내용');
});
