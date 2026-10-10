const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const hr=fs.readFileSync(path.join(__dirname,'..','hr.html'),'utf8');
const help=fs.readFileSync(path.join(__dirname,'..','hub-help.js'),'utf8');

test('실제 render는 늦은 화면이 현재 main을 덮지 않도록 속성을 보존한 새 main을 사용한다',async()=>{
 let current;const targets=[],watches=[],stops=[];
 function element(){return {id:'main',className:'panel',isConnected:true,innerHTML:'',cloneNode(deep){assert.equal(deep,false);const next=element();assert.equal(next.id,this.id);assert.equal(next.className,this.className);return next;},replaceWith(next){this.isConnected=false;current=next;}};}
 current=element();let release;
 const c={TAB:'home',$(){return current;},hubStaticFill(){},apprKindSelectFill(){},SCHEDULE_PEOPLE_ERROR:'',
  HubHelp:{watch(m){watches.push(m);},unwatch(m){stops.push(m);}},mountHubTabHelp(m){assert.equal(m,current,'현재 화면에만 안내를 붙임');},
  async renderHome(m){targets.push(m);await new Promise(r=>release=r);m.innerHTML='이전 화면';},async renderNotice(m){targets.push(m);m.innerHTML='새 화면';},console,esc:s=>s};
 vm.createContext(c);vm.runInContext(hr.match(/async function render\(\)\{[\s\S]*?\n\}/)[0],c);
 const first=current,old=c.render();c.TAB='notice';await c.render();release();await old;
 assert.notEqual(targets[0],targets[1]);assert.equal(current.innerHTML,'새 화면');assert.equal(targets[0].isConnected,false);
 assert.equal(stops[0],first);assert.equal(stops[1],targets[0]);assert.deepEqual(watches,targets);
});

test('이전 main의 관찰자와 예약된 프레임은 끊고 새 main에는 하나만 연결한다',()=>{
 const observers=[],frames=new Map();let serial=0,calls=0;
 const window={MutationObserver:class{constructor(fn){this.fn=fn;this.disconnected=false;observers.push(this);}observe(target){this.target=target;}disconnect(){this.disconnected=true;}},requestAnimationFrame(fn){frames.set(++serial,fn);return serial;},cancelAnimationFrame(id){frames.delete(id);}};
 vm.runInNewContext(help,{window,document:{}});
 const old={},next={},onChange=()=>calls++;
 window.HubHelp.watch(old,onChange);window.HubHelp.watch(old,onChange);assert.equal(observers.length,1);
 observers[0].fn();observers[0].fn();assert.equal(frames.size,1);
 window.HubHelp.unwatch(old);assert.equal(observers[0].disconnected,true);assert.equal(frames.size,0);
 window.HubHelp.unwatch(old);window.HubHelp.watch(next,onChange);window.HubHelp.watch(next,onChange);assert.equal(observers.length,2);
 observers[1].fn();for(const [id,fn] of frames){frames.delete(id);fn();}assert.equal(calls,1);
});

test('실제 진료기록 화면은 탭을 다시 연 뒤 옛 조회가 공유 목록에 들어오지 않는다',async()=>{
 let release,filtered=0;
 const main={isConnected:true,innerHTML:''},c={window:{_cfRecords:['새 기록']},sb:{from(){return {select(){return this;},order(){return new Promise(r=>release=r);}};}},filterConfid(){filtered++;},confFill:s=>s,esc:s=>s,hubT:(k,d)=>d,ME:{role:'owner'}};
 vm.createContext(c);vm.runInContext(hr.match(/async function renderConfid\(m\)\{[\s\S]*?\n\}/)[0],c);
 const request=c.renderConfid(main);main.isConnected=false;release({data:['옛 기록'],error:null});await request;
 assert.equal(main.innerHTML,'');assert.deepEqual(c.window._cfRecords,['새 기록']);assert.equal(filtered,0);
});
