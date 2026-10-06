const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('hr.html','utf8'),texts=fs.readFileSync('hub-texts.js','utf8');
function block(source,name){const m=source.match(new RegExp('/\\* '+name+':test-start \\*/([\\s\\S]*?)/\\* '+name+':test-end \\*/'));assert.ok(m,name);return m[1];}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function context(role='staff'){
  const calls=[],fields={},alerts=[],c={ME:{id:'me',role},esc,nameOf:id=>id==='me'?'내 이름':'다른 직원',today:()=> '2026-10-06',$:s=>fields[s],alert:s=>alerts.push(s),confirm:()=>true,setStatus:s=>calls.push(s),render:()=>calls.push('render')};
  vm.createContext(c);
  vm.runInContext(block(texts,'hub-texts')+';this.h={hubTextDefs,hubText,hubTextSetOverrides,hubNotifyEnabled,hubNotifyWrite,hubP7SettingsHtml};',c);
  c.hubT=c.h.hubText;
  vm.runInContext(block(html,'suggestion-comments')+';this.api={validateSuggestionComment,renderSuggestionComments,saveSuggestionComment,deleteSuggestionComment,toggleSuggestionComments,beginSuggestionCommentEdit,cancelSuggestionCommentEdit};',c);
  c.sb={from:table=>({insert:async row=>{calls.push({table,method:'insert',row});return {error:null};},update:row=>({eq:async(k,id)=>{calls.push({table,method:'update',row,k,id});return {error:null};}}),delete:()=>({eq:async(k,id)=>{calls.push({table,method:'delete',k,id});return {error:null};}})})};
  return {c,calls,fields,alerts};
}
const comment={id:11,suggestion_id:7,user_id:'me',body:'피드백 <script>alert(1)</script>',created_at:'2026-10-06T01:23:00Z',updated_at:'2026-10-06T01:23:00Z'};
test('댓글 접기·펼치기와 본문·이름 esc 및 날짜 시각',()=>{
  const {c}=context();let output=c.api.renderSuggestionComments(7,[comment]);
  assert.match(output,/💬 댓글 1/);assert.doesNotMatch(output,/suggestionCommentNew-7/);
  c.api.toggleSuggestionComments(7);output=c.api.renderSuggestionComments(7,[comment]);
  assert.match(output,/suggestionCommentNew-7/);assert.match(output,/피드백 &lt;script&gt;/);assert.doesNotMatch(output,/<script>/);assert.match(output,/내 이름/);assert.match(output,/2026/);assert.match(output,/\d{2}:\d{2}/);
  c.api.toggleSuggestionComments(7);assert.doesNotMatch(c.api.renderSuggestionComments(7,[comment]),/suggestionCommentNew-7/);
});
test('본인만 수정하고 본인·원장만 삭제 단추가 보임',()=>{
  for(const [role,userId,edit,del] of [['staff','me',true,true],['staff','other',false,false],['owner','other',false,true]]){
    const {c}=context(role);c.api.toggleSuggestionComments(7);const output=c.api.renderSuggestionComments(7,[{...comment,user_id:userId}]);
    assert.equal(output.includes('beginSuggestionCommentEdit(7,11)'),edit);assert.equal(output.includes('deleteSuggestionComment(7,11)'),del);
  }
});
test('댓글 길이는 빈 글과 1000자 초과를 거절하고 DB와 같은 유니코드 문자 수로 검사함',()=>{
  const {c}=context();assert.equal(c.api.validateSuggestionComment('   ').ok,false);assert.equal(c.api.validateSuggestionComment('x'.repeat(1001)).ok,false);assert.equal(c.api.validateSuggestionComment('x'.repeat(1000)).ok,true);assert.equal(c.api.validateSuggestionComment('😀'.repeat(1000)).ok,true);assert.equal(c.api.validateSuggestionComment(' '+ 'x'.repeat(1000)).ok,false);
});
test('댓글 등록·수정·삭제 함수는 실제 저장 경로를 실행하고 실패 시 입력을 유지함',async()=>{
  const {c,calls,fields,alerts}=context();fields['#suggestionCommentNew-7']={value:' 새 댓글 '};
  await c.api.saveSuggestionComment(7,null);let saved=calls.find(x=>x.method==='insert');assert.equal(saved.table,'suggestion_comments');assert.deepEqual({...saved.row},{suggestion_id:7,user_id:'me',body:'새 댓글'});assert.ok(calls.includes('render'));
  fields['#suggestionCommentEdit-11']={value:'수정 글'};await c.api.saveSuggestionComment(7,11);saved=calls.find(x=>x.method==='update');assert.equal(saved.id,11);assert.equal(saved.row.body,'수정 글');assert.deepEqual(Object.keys(saved.row),['body']);
  await c.api.deleteSuggestionComment(7,11);assert.equal(calls.find(x=>x.method==='delete').id,11);
  calls.length=0;fields['#suggestionCommentNew-7'].value=' ';await c.api.saveSuggestionComment(7,null);assert.equal(calls.length,0);assert.match(alerts.pop(),/입력/);
  fields['#suggestionCommentNew-7'].value='보존할 글';c.sb={from:()=>({insert:async()=>({error:{message:'offline'}})})};await c.api.saveSuggestionComment(7,null);assert.equal(fields['#suggestionCommentNew-7'].value,'보존할 글');assert.ok(!calls.includes('render'));assert.match(alerts.pop(),/offline/);
});
test('댓글 화면·알림 문구 키가 등록되어 실제 설정 값으로 바뀜',()=>{
  const {c}=context();const defs=c.h.hubTextDefs();for(const key of ['toggle','empty','placeholder','submit','edit','delete','save','cancel','invalid_empty','invalid_long','error_load','error_save','error_delete','confirm_delete','push_title','push_body'])assert.ok(defs.some(d=>d.key==='sug.cmt.'+key),key);
  c.h.hubTextSetOverrides([{key:'sug.cmt.toggle',value:'의견 {n}개'},{key:'sug.cmt.submit',value:'답글 남기기'}]);c.api.toggleSuggestionComments(7);const output=c.api.renderSuggestionComments(7,[]);assert.match(output,/의견 0개/);assert.match(output,/답글 남기기/);
});
test('알림 받는 사람에 건의 작성자·원장·앞선 댓글자 3칸이 있고 저장 가능함',async()=>{
  const {c}=context();const markup=c.h.hubP7SettingsHtml();for(const col of ['author','owner','commenters']){assert.match(markup,new RegExp('data-hub-suggestion-notify="notify.suggestion_comment.'+col+'"'));assert.equal(c.h.hubNotifyEnabled('suggestion_comment',col),true);}
  const rows=[],sb={from:table=>({upsert:async row=>{rows.push({table,row});return {error:null};}})};assert.equal((await c.h.hubNotifyWrite(sb,'notify.suggestion_comment.commenters',false)).ok,true);assert.equal(c.h.hubNotifyEnabled('suggestion_comment','commenters'),false);assert.equal(rows[0].table,'app_settings');assert.equal((await c.h.hubNotifyWrite(sb,'notify.suggestion_comment.chief',true)).ok,false);
});
test('실제 renderSuggestions는 종료된 캠페인에서도 댓글 입력을 표시하며 카드별 조회 오류를 알림',async()=>{
  const {c}=context();vm.runInContext(block(html,'suggestion-board'),c);
  vm.runInContext(html.match(/\/\* suggestion-board:render-start \*\/([\s\S]*?)\/\* suggestion-board:render-end \*\//)[1],c);
  let error=null;const data={suggestion_campaigns:{id:1,title:'마감 건의함',starts_at:'2026-09-01',ends_at:'2026-09-30',prize_1:50000,prize_2:30000,prize_3:10000},suggestions:[{id:7,campaign_id:1,user_id:'other',title:'개선안',body:'내용'}],suggestion_likes:[],suggestion_awards_public:[],suggestion_comments:[comment]};
  c.sb={from:table=>{const b={select:()=>b,eq:()=>b,in:()=>b,order:()=>b,limit:()=>b,maybeSingle:()=>b,then:resolve=>resolve({data:data[table],error:table==='suggestion_comments'?error:null})};return b;}};
  c.api.toggleSuggestionComments(7);const m={innerHTML:''};await c.renderSuggestions(m);assert.match(m.innerHTML,/suggestionCommentNew-7/);assert.doesNotMatch(m.innerHTML,/id="suggestionNewBody"/);assert.match(m.innerHTML,/피드백 &lt;script&gt;/);
  error={message:'댓글 DB 오류'};await c.renderSuggestions(m);assert.match(m.innerHTML,/댓글 DB 오류/);
});

test('10-06: Ctrl+Enter(맥 Cmd+Enter)로 저장 · 그냥 Enter는 줄바꿈 · 한글 조합 중엔 무시 · 다시 그려도 보던 자리 유지',()=>{
  assert.match(html,/id="suggestionCommentNew-\$\{suggestionId\}"[^>]*onkeydown="suggestionCommentKey\(event,\$\{suggestionId\},null\)"/);
  assert.match(html,/id="suggestionCommentEdit-\$\{c\.id\}"[^>]*onkeydown="suggestionCommentKey\(event,\$\{suggestionId\},\$\{c\.id\}\)"/);
  const fn=html.match(/function suggestionCommentKey\(e,suggestionId,id\)\{.*\}/)[0];const saved=[];
  const run=new Function('saveSuggestionComment',fn+';return suggestionCommentKey;')((a,b)=>saved.push([a,b]));
  const ev=o=>Object.assign({key:'Enter',ctrlKey:false,metaKey:false,isComposing:false,preventDefault(){this.p=true;}},o);
  const plain=ev({});run(plain,7,null);assert.equal(saved.length,0);assert.ok(!plain.p);
  run(ev({isComposing:true,ctrlKey:true}),7,null);assert.equal(saved.length,0);
  const c=ev({ctrlKey:true});run(c,7,null);assert.deepEqual(saved,[[7,null]]);assert.ok(c.p);
  run(ev({metaKey:true}),7,11);assert.deepEqual(saved[1],[7,11]);
  assert.match(html,/setStatus\('saved'\);await suggestionRenderKeep\(suggestionId\);/);
  assert.match(html,/setStatus\('saved'\);suggestionRenderKeep\(suggestionId\);/);
});
