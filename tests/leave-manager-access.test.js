import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync('hr.html', 'utf8');
const migration = fs.readFileSync('db/leave_manager_access.sql', 'utf8');
const rollback = fs.readFileSync('db/leave_manager_access_rollback.sql', 'utf8');
const helpers = html.match(/\/\* leave-manager-access-ui:test-start \*\/([\s\S]*?)\/\* leave-manager-access-ui:test-end \*\//)?.[1];
assert.ok(helpers, 'manager leave UI helpers have test markers');
const build = new Function('ME', 'SETTINGS', 'SETTINGS_LOAD_OK', helpers + '; return {canManageLeave:canManageLeave(),canApproveLeave:canApproveLeave(),canViewLeaveQueue:canViewLeaveQueue()};');

function permissions(role, settings, loaded = true) {
  return build({ role }, settings, loaded);
}

assert.deepEqual(permissions('manager', { 'leave.manager_access_enabled': 'true', 'leave.manager_can_approve': 'true' }, false), {
  canManageLeave: false, canApproveLeave: false, canViewLeaveQueue: false
});
assert.deepEqual(permissions('staff', { 'leave.manager_access_enabled': 'true', 'leave.manager_can_approve': 'true' }), {
  canManageLeave: false, canApproveLeave: false, canViewLeaveQueue: false
});
assert.deepEqual(permissions('manager', { 'leave.manager_access_enabled': 'false', 'leave.manager_can_approve': 'true' }), {
  canManageLeave: false, canApproveLeave: false, canViewLeaveQueue: false
});
assert.deepEqual(permissions('manager', { 'leave.manager_access_enabled': 'true', 'leave.manager_can_approve': 'false' }), {
  canManageLeave: true, canApproveLeave: false, canViewLeaveQueue: true
});
assert.deepEqual(permissions('manager', { 'leave.manager_access_enabled': 'true', 'leave.manager_can_approve': 'true' }), {
  canManageLeave: true, canApproveLeave: true, canViewLeaveQueue: true
});
assert.equal(permissions('chief', {}).canApproveLeave, true);
assert.equal(permissions('owner', {}).canManageLeave, true);

assert.match(html, /if\(!canAccrueLeave\(\)\)return;[\s\S]*preview_monthly_leave_accruals/);
assert.match(html, /canAccrueLeave\(\)\?monthlyLeaveCandidatesHtml/);
assert.match(html, /if\(!canAccrueLeave\(\)\|\|!LEAVE_ACCRUAL_AS_OF[\s\S]*apply_monthly_leave_accruals/);
const accruePermission=new Function('ME','SETTINGS','SETTINGS_LOAD_OK',helpers+';return canAccrueLeave();');
assert.equal(accruePermission({role:'manager'},{'leave.manager_access_enabled':'true','leave.manager_can_accrue':'true'},true),true);
assert.equal(accruePermission({role:'manager'},{'leave.manager_access_enabled':'false','leave.manager_can_accrue':'true'},true),false);
assert.equal(accruePermission({role:'manager'},{'leave.manager_access_enabled':'true','leave.manager_can_accrue':'false'},true),false);
assert.equal(accruePermission({role:'staff'},{'leave.manager_access_enabled':'true','leave.manager_can_accrue':'true'},true),false);
assert.match(html, /leaveManagerSettingsCard\(\)/);
assert.match(html, /if\(ME\.role!=='owner'\)return;[\s\S]*app_settings/);
assert.match(html, /leaveAct\(\$\{r\.id\},'rej'\)[\s\S]*canApproveLeave\(\)/);
assert.match(html, /ME\.role==='manager'&&canApproveLeave\(\)[\s\S]*cancelApprovedLeave/);
assert.match(html, /function uploadLeaveApplicationDocument\(\)[\s\S]*leave_requests'[\s\S]*targetUserId\+'\/tmp\/'\+request\.id\+'\//);
assert.match(html, /function leaveLedgerHistoryHtml\(error,metadataError\)[\s\S]*!canManageLeave\(\)[\s\S]*leave\.ledger\.history_th_note/);
assert.match(html, /fetchAttendancePages\(\(\)=>sb\.from\('leave_ledger'\)\.select\('id,user_id,kind,days,note,ref,effective_date,created_at'\)/);
assert.match(html, /function deleteLeaveApplicationDocument\(id\)[\s\S]*storage\.from\('leave-docs'\)\.remove\(\[doc\.storage_path\]\)[\s\S]*from\('leave_application_documents'\)\.delete/);
const uploadFunction = html.slice(
  html.indexOf('async function uploadLeaveApplicationDocument('),
  html.indexOf('async function deleteLeaveApplicationDocument(')
);
assert.match(uploadFunction, /\$\('#edFile'\)/);
assert.match(uploadFunction, /\$\('#edLeaveRequest'\)/);
assert.match(uploadFunction, /\$\('#edMsg'\)/);
assert.doesNotMatch(html, /function leaveApplicationDocumentsCard\(/);

for (const marker of ['employee_hub_access_gate', 'deputy_contract_only_block', 'deputy_contract_only_v4_block',
  'deputy_contract_only_storage_block', 'deputy_contract_only_storage_block_v4', 'deputy_contract_only_v4_storage', 'deputy_hr_docs_contract_only',
  'employee_hub_storage_access_gate']) {
  assert.doesNotMatch(migration, new RegExp('drop policy if exists ' + marker, 'i'), marker + ' policy is retained');
}
assert.match(migration, /r\.id::text=\(storage\.foldername\(storage\.objects\.name\)\)\[3\][\s\S]*r\.user_id::text=\(storage\.foldername\(storage\.objects\.name\)\)\[1\]/);
assert.match(migration, /status='승인'/);
assert.match(rollback, /leave_application_documents_insert_self[\s\S]*user_id=auth\.uid\(\)[\s\S]*r\.user_id=auth\.uid\(\)/);
assert.match(rollback, /leave_docs_insert_self[\s\S]*\(storage\.foldername\(name\)\)\[1\]=auth\.uid\(\)::text/);

function documentCard(role, accessEnabled, rows, requests) {
  const start = html.indexOf('function employeeDocumentsCard(');
  const end = html.indexOf('\nfunction filterEmployeeDocuments(', start);
  assert.ok(start >= 0 && end > start, 'existing employee document card is present');
  const profileNames = { staff1: 'Staff One', manager1: 'Manager One' };
  const context = {
    ME: { id: role === 'manager' ? 'manager1' : 'staff1', role },
    PROFILES: [{ user_id: 'staff1', name: 'Staff One', active: true, approved: true }],
    EMPLOYEE_CONTRACT_PREVIEWS: {},
    esc: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
    hubT: (_key, fallback) => fallback,
    isMgr: () => ['manager', 'chief', 'owner'].includes(role),
    canManageLeave: () => accessEnabled,
    nameOf: userId => profileNames[userId] || userId,
    md: value => String(value || '').slice(5),
    contractDate: value => String(value || ''),
    docKindLabel: value => value,
    docKindSelectHtml: () => '<select id="edType"></select>',
    mergeEmployeeDocumentRows: () => [],
    employeeDocumentsErrorMessages: () => ({ documents: '', contracts: '' }),
    paymentRequestCard: () => ''
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end) + ';this.renderCard=employeeDocumentsCard;', context);
  return context.renderCard([], null, [], null, rows, null, requests, [], null, [], null, [], null, []);
}

test('employee documents card exposes manager leave evidence on the existing form', () => {
  const docs = [{ id: 21, user_id: 'staff1', original_name: 'proof.pdf', document_type: '연차 신청서', created_at: '2040-01-02' }];
  const requests = [{ id: 10, user_id: 'staff1', date_from: '2040-01-01', date_to: '2040-01-01', type: '연차' }];
  const managerHtml = documentCard('manager', true, docs, requests);
  assert.match(managerHtml, /<tr data-doc-filter="연차증빙"><td>Staff One<\/td>/);
  assert.match(managerHtml, /deleteLeaveApplicationDocument\(21\)/);
  assert.match(managerHtml, /id="edLeaveRequest"[\s\S]*Staff One \|/);
  assert.match(managerHtml, /id="edFile"[\s\S]*id="edMsg"/);
  assert.doesNotMatch(managerHtml, /ladFile|ladRequest|ladMsg/);

  const managerReadOnlyHtml = documentCard('manager', false, docs, [{ ...requests[0], user_id: 'manager1' }]);
  assert.match(managerReadOnlyHtml, /<td>Staff One<\/td>/);
  assert.doesNotMatch(managerReadOnlyHtml, /deleteLeaveApplicationDocument\(21\)|Manager One \|/);
  assert.match(managerReadOnlyHtml, /id="edLeaveRequest"/);

  const staffHtml = documentCard('staff', false, docs, requests);
  assert.doesNotMatch(staffHtml, /deleteLeaveApplicationDocument\(21\)/);
  assert.match(staffHtml, /id="edLeaveRequest"/);
});

function uploadHarness(role, canManage, requestUserId) {
  const elements = {
    '#edFile': { files: [{ name: 'proof.pdf', type: 'application/pdf', size: 100 }] },
    '#edLeaveRequest': { value: '10' },
    '#edMsg': { textContent: '' }
  };
  const actions = { uploads: [], inserts: [], statuses: [] };
  const requestQuery = {
    select() { return this; },
    eq(_column, value) { this.requestId = Number(value); return this; },
    async maybeSingle() { return { data: { id: this.requestId, user_id: requestUserId }, error: null }; }
  };
  const context = {
    ME: { id: role === 'manager' ? 'manager1' : 'staff1', role },
    LEAVE_APPLICATION_DOCUMENT_SAVING: false,
    canManageLeave: () => canManage,
    validateLeaveApplicationDocument: () => '',
    hubT: (_key, fallback) => fallback,
    $: selector => elements[selector],
    crypto: { randomUUID: () => 'uuid-1' },
    setStatus: value => actions.statuses.push(value),
    render: async () => {},
    sb: {
      from(table) {
        if (table === 'leave_requests') return requestQuery;
        return { insert: async row => { actions.inserts.push(row); return { error: null }; } };
      },
      storage: { from: bucket => ({ upload: async (path, file, options) => { actions.uploads.push({ bucket, path, file, options }); return { error: null }; } }) }
    }
  };
  vm.createContext(context);
  vm.runInContext(uploadFunction, context);
  return { context, actions, elements };
}

test('uploadLeaveApplicationDocument uses real ed controls and preserves self uploads', async () => {
  const manager = uploadHarness('manager', true, 'staff1');
  await manager.context.uploadLeaveApplicationDocument();
  assert.equal(manager.actions.uploads.length, 1, manager.elements['#edMsg'].textContent);
  assert.equal(manager.actions.uploads[0].path, 'staff1/tmp/10/uuid-1-proof.pdf');
  assert.deepEqual(JSON.parse(JSON.stringify(manager.actions.inserts[0])), {
    request_id: 10, user_id: 'staff1', document_type: '연차 신청서', original_name: 'proof.pdf',
    storage_path: 'staff1/tmp/10/uuid-1-proof.pdf', mime_type: 'application/pdf', size_bytes: 100
  });

  const staff = uploadHarness('staff', false, 'staff1');
  await staff.context.uploadLeaveApplicationDocument();
  assert.equal(staff.actions.uploads[0].path, 'staff1/tmp/uuid-1-proof.pdf');
  assert.equal(staff.actions.inserts[0].user_id, 'staff1');

  const mismatchedStaffRequest = uploadHarness('staff', false, 'other1');
  await mismatchedStaffRequest.context.uploadLeaveApplicationDocument();
  assert.equal(mismatchedStaffRequest.actions.uploads.length, 0);
  assert.equal(mismatchedStaffRequest.actions.inserts.length, 0);
  assert.match(mismatchedStaffRequest.elements['#edMsg'].textContent, /본인 연차 신청만 선택/);
});

test('owner can render and save the three switches with edited hub text', async () => {
  const start=html.indexOf('function leaveManagerSettingsCard(');
  const end=html.indexOf('async function saveAbsenceSettings(',start);
  assert.ok(start>=0&&end>start);
  const elements={'#leaveManagerAccessEnabled':{checked:false},'#leaveManagerCanApprove':{checked:true},'#leaveManagerCanAccrue':{checked:true},'#leaveManagerSettingsMsg':{}};
  const settings={}, writes=[];
  let error={message:'test error'};
  const ctx=vm.createContext({
    ME:{role:'owner'},SETTINGS:settings,esc:String,hubT:key=>'«'+key+'»',$:id=>elements[id],
    sb:{from(table){assert.equal(table,'app_settings');return {async upsert(rows){writes.push(JSON.parse(JSON.stringify(rows)));return {error};}};}},
    setStatus(){},async render(){}
  });
  vm.runInContext(html.slice(start,end),ctx);
  const card=ctx.leaveManagerSettingsCard();
  for(const suffix of ['title','hint','access','approve','accrue','save'])assert.ok(card.includes('«leave.settings.'+suffix+'»'));
  await ctx.saveLeaveManagerSettings();
  assert.equal(elements['#leaveManagerSettingsMsg'].textContent,'«leave.settings.fail»');
  assert.deepEqual(settings,{});
  error=null;
  await ctx.saveLeaveManagerSettings();
  assert.deepEqual(settings,{'leave.manager_access_enabled':'false','leave.manager_can_approve':'true','leave.manager_can_accrue':'true'});
  ctx.ME.role='manager';
  await ctx.saveLeaveManagerSettings();
  assert.equal(writes.length,2);
});

test('manager manual ledger entry uses edited prompts and rejects invalid days before writing', async () => {
  const start=html.indexOf('async function grantLeaveEntry(');
  const end=html.indexOf('/* leave-status:test-end */',start);
  assert.ok(start>=0&&end>start);
  const prompts=[], alerts=[], writes=[];
  let inputs=['부여','0.3'];
  const ctx=vm.createContext({
    LEAVE_STATUS_ROWS:[{profile:{user_id:'worker-1'}}],canManageLeave:()=>true,isManagerOwnLeave:()=>false,hubT:key=>'«'+key+'»',
    prompt(label){prompts.push(label);return inputs.shift();},alert:text=>alerts.push(text),setStatus(){},async render(){},
    sb:{async rpc(name,params){writes.push([name,JSON.parse(JSON.stringify(params))]);return {data:[{ledger_id:1}]};}}
  });
  vm.runInContext(html.slice(start,end),ctx);
  await ctx.grantLeaveEntry(0);
  assert.deepEqual(alerts,['«leave.m_grant_days_invalid»']);
  assert.equal(writes.length,0);
  inputs=['조정','0.5',' test memo ']; prompts.length=0;
  await ctx.grantLeaveEntry(0);
  assert.deepEqual(prompts,['«leave.m_grant_kind»','«leave.m_grant_days_prompt»','«leave.m_grant_note»']);
  assert.deepEqual(writes,[['grant_leave_entry',{p_user_id:'worker-1',p_kind:'조정',p_days:0.5,p_note:'test memo'}]]);
});

console.log('LEAVE_MANAGER_ACCESS_STATIC_PASS: manager gates, owner switches, approval cancel UI, document paths, restrictive policy retention');
