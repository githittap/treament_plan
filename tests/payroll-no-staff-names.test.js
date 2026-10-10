const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),base='764abdc';
function staffNames(){
 const sql=fs.readFileSync(path.join(root,'db/employee_job_groups.sql'),'utf8'),names=new Set();
 for(const block of sql.matchAll(/\bname\s+NOT\s+IN\s*\(([\s\S]*?)\)/gi))for(const value of block[1].matchAll(/'((?:[^']|'')*)'/g))names.add(value[1].replace(/''/g,"'"));
 const confirmed=sql.match(/SELECT \* FROM \(VALUES([\s\S]*?)\) AS confirmed\(name, job_group\)/i);
 if(confirmed)for(const row of confirmed[1].matchAll(/\(\s*'((?:[^']|'')*)'\s*,/g))names.add(row[1].replace(/''/g,"'"));
 assert.ok(names.size>=10,'기존 이름 목록을 실제로 읽어야 함');return [...names];
}
function addedLines(diff){return diff.split(/\r?\n/).filter(line=>line.startsWith('+')&&!line.startsWith('+++')).join('\n');}
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
test('공개 대상의 더한 줄과 커밋 글에 기존 직원 실명이 없고 부서 단어는 검사에서 제외한다',()=>{
 const names=staffNames();assert.ok(!names.includes('진료실'));
 const changes=addedLines(git(['diff','--no-ext-diff','--unified=0',base]));
 const messages=git(['log','--format=%B',base+'..HEAD']);
 const counts=[changes,messages].map(text=>names.filter(name=>text.includes(name)).length);
 assert.deepEqual(counts,[0,0],'실명 검출 수 [더한 줄, 커밋 글]은 모두 0이어야 함');
});
