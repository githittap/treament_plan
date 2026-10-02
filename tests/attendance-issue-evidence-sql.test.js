const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=fs.readFileSync('db/attendance_issue_evidence.sql','utf8');
const rollback=fs.readFileSync('db/attendance_issue_evidence_rollback.sql','utf8');

test('근태 소명 증거 SQL은 기존 소명 함수·트리거·정책·권한을 바꾸지 않는다',()=>{
  assert.doesNotMatch(sql,/create\s+or\s+replace\s+function\s+public\.(submit_attendance_issue|record_auto_attendance_issue|review_attendance_issue)\b/i);
  assert.doesNotMatch(sql,/drop\s+(?:trigger|policy).*attendance_issues/i);
  assert.doesNotMatch(sql,/alter\s+table\s+public\.attendance_issues\s+(?:enable|disable|force|no\s+force)\s+row\s+level\s+security/i);
  assert.doesNotMatch(sql,/grant\s+[^;]*(?:insert|update)[^;]*\s+on\s+(?:table\s+)?public\.attendance_issues/i);
  assert.match(sql,/add column if not exists staff_kind text/i);
  assert.match(sql,/set rule_label=p_kind,staff_kind=p_kind,staff_reason=v_reason,staff_responded_at=now\(\)/i);
  assert.match(sql,/add column if not exists staff_reason text/i);
  assert.match(sql,/add column if not exists staff_responded_at timestamptz/i);
});

test('소명 증거 표는 최소 SELECT만 허용하고 부원장·비허용 프로필을 막는다',()=>{
  assert.match(sql,/create table if not exists public\.attendance_issue_evidence/i);
  assert.match(sql,/issue_id bigint not null references public\.attendance_issues\(id\) on delete restrict/i);
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/revoke all on table public\.attendance_issue_evidence from public,anon,authenticated/i);
  assert.match(sql,/grant select on table public\.attendance_issue_evidence to authenticated/i);
  assert.match(sql,/for select to authenticated using \([\s\S]*employee_hub_access_allowed\(\)[\s\S]*my_role\(\) in \('chief','owner'\)/i);
  assert.match(sql,/as restrictive for all to authenticated using \(public\.my_role\(\)<>'deputy'\)/i);
});

test('세 RPC는 보안 정의자·고정 search_path·활성 승인 프로필을 확인한다',()=>{
  for(const name of ['submit_attendance_issue_v2','respond_attendance_issue','attendance_issue_add_evidence']){
    const def=sql.match(new RegExp(`create or replace function public\\.${name}\\([^)]*\\)[\\s\\S]*?\\$\\$;`,'i'))?.[0];
    assert.ok(def,`${name} 정의가 있어야 한다`);
    assert.match(def,/security definer/i);assert.match(def,/set search_path=public,pg_temp/i);
    assert.match(def,/employee_hub_access_allowed\(\)/i);assert.match(def,/my_role\(\)='deputy'/i);
    assert.match(def,/p\.active and p\.approved and p\.account_access_status='활성'/i);
  }
  assert.equal((sql.match(/p_kind is null or p_kind not in \('지문인식오류','입력오류','기타'\)/g)||[]).length,2,'submit/respond는 NULL 종류도 거부해야 한다');
  assert.match(sql,/revoke all on function public\.submit_attendance_issue_v2\(date,text,text\) from public,anon/i);
  assert.match(sql,/revoke all on function public\.respond_attendance_issue\(bigint,text,text\) from public,anon/i);
  assert.match(sql,/revoke all on function public\.attendance_issue_add_evidence\(bigint,text,text,text,bigint\) from public,anon/i);
  assert.match(sql,/grant execute on function public\.submit_attendance_issue_v2[\s\S]*to authenticated/i);
});

test('Storage는 비공개 10MB 허용형식 버킷과 범위 제한 정책을 둔다',()=>{
  assert.match(sql,/values\('attendance-evidence','attendance-evidence',false,10485760,array\['image\/jpeg','image\/png','image\/webp','application\/pdf'\]\)/i);
  assert.match(sql,/attendance_evidence_insert_own_pending[\s\S]*bucket_id='attendance-evidence'[\s\S]*employee_hub_access_allowed\(\)[\s\S]*status='대기'/i);
  const insertPolicy=sql.match(/create policy attendance_evidence_insert_own_pending[\s\S]*?\n\);/i)?.[0]||'';
  assert.match(insertPolicy,/metadata->>'mimetype'[\s\S]*image\/jpeg[\s\S]*application\/pdf/i);
  assert.doesNotMatch(insertPolicy,/metadata->>'size'/i,'업로드 전 storage 권한 시험 INSERT에는 metadata.size가 없다');
  assert.match(sql,/attendance_evidence_select_scoped[\s\S]*bucket_id='attendance-evidence'[\s\S]*employee_hub_access_allowed\(\)[\s\S]*split_part\(name,'\/',1\)=auth\.uid\(\)::text[\s\S]*my_role\(\) in \('chief','owner'\)[\s\S]*attendance_issue_evidence e where e\.storage_path=name/i);
  assert.match(sql,/attendance_evidence_delete_unlinked_own[\s\S]*split_part\(name,'\/',1\)=auth\.uid\(\)::text[\s\S]*not exists/i);
  assert.match(sql,/attendance_evidence_deputy_block on storage\.objects as restrictive/i);
  assert.doesNotMatch(sql,/create policy attendance_evidence[^;]*for update/i);
});

test('rollback은 데이터 유무를 모두 검사한 뒤에만 변경하며 트랜잭션으로 묶는다',()=>{
  assert.match(rollback,/^begin;/i);
  assert.match(rollback,/attendance issue evidence contains data; rollback stopped/i);
  assert.match(rollback,/attendance issues contain staff response data; rollback stopped/i);
  assert.match(rollback,/attendance evidence bucket contains objects; rollback stopped/i);
  assert.match(rollback,/to_regclass\('public\.attendance_issue_evidence'\)[\s\S]*information_schema\.columns[\s\S]*execute format\('select exists\(select 1 from %s\)'/i);
  assert.match(rollback,/information_schema\.columns[\s\S]*column_name=v_column[\s\S]*execute format\('select exists\(select 1 from %s where %I is not null\)'/i);
  assert.doesNotMatch(rollback,/exists\s*\(select 1 from public\.attendance_issue_evidence\)|exists\s*\(select 1 from storage\.objects/i,'존재 검사보다 먼저 정적 테이블 참조로 데이터를 세면 안 된다');
  const checks=[rollback.indexOf('attendance issue evidence contains data'),rollback.indexOf('attendance issues contain staff response data'),rollback.indexOf('attendance evidence bucket contains objects')];
  const firstDrop=rollback.search(/drop policy/i);assert.ok(checks.every(i=>i>=0&&i<firstDrop),'모든 보존 검사 뒤에만 정책 삭제가 와야 한다');
  const lockRelations=[
    'public.attendance_issues',
    'storage.objects',
    'public.attendance_issue_evidence',
    'storage.buckets'
  ];
  const lockPositions=lockRelations.map(relation=>{
    const marker="v_relation:=to_regclass('"+relation+"')";
    const start=rollback.indexOf(marker);if(start<0)return -1;
    const next=rollback.indexOf('v_relation:=to_regclass(',start+marker.length);
    const relationBlock=rollback.slice(start,next<0?rollback.length:next);
    const lock=relationBlock.search(/if\s+v_relation\s+is\s+not\s+null\s+then\s+execute\s+format\('lock table %s in access exclusive mode',\s*v_relation\);/i);
    return lock<0?-1:start+lock;
  });
  assert.ok(lockPositions.every(i=>i>=0)&&lockPositions.every((i,index)=>index===0||i>lockPositions[index-1])&&lockPositions.at(-1)<checks[0],'각 기존 관계 잠금을 정해진 순서로 검사 전에 잡아야 한다');
  assert.match(rollback,/^commit;\s*$/im);
});
