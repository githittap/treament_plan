const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'hr.html'), 'utf8');
const urlKey = 'dentweb.operations_url';
const rolesKey = 'dentweb.access.read_roles';
const ownerKey = 'dentweb.access.owner_only';
const exampleUrl = 'https://workbench.invalid/operations.html';

function harness(role = 'manager', settings = {}, approved = true) {
  const source = html.match(/\/\* dentweb-integration:test-start \*\/([\s\S]*?)\/\* dentweb-integration:test-end \*\//)?.[1];
  assert.ok(source, '덴트웹 업무함 카드 코드가 없습니다.');
  const esc = html.match(/^const esc=.*$/m)?.[0];
  assert.ok(esc, '기존 HTML 이스케이프 함수를 찾을 수 없습니다.');
  const context = { URL, ME: { id: 'synthetic-user', role, approved }, SETTINGS: settings, SETTINGS_LOAD_OK: true };
  vm.createContext(context);
  vm.runInContext(`${esc}\n${source}`, context);
  return context;
}

function settings(overrides = {}) {
  return { [urlKey]: exampleUrl, [rolesKey]: '["manager","chief","owner"]', [ownerKey]: 'true', ...overrides };
}

test('덴트웹 업무함은 기존 업무자료 카드 영역에서만 진입한다', () => {
  const workdocs = html.match(/function renderWorkDocuments\(m\)\{([\s\S]*?)\/\* work-documents:render-end \*\//)?.[1];
  assert.ok(/class="workdocs-grid"[^\n]*\$\{dentwebOperationsCard\(\)\}/.test(workdocs), '업무자료 영역에 덴트웹 업무함 카드가 없습니다.');
  for (const declaration of ['TABS', 'MENU']) {
    const nav = html.match(new RegExp(`const ${declaration}=\\[([\\s\\S]*?)\\n\\];`));
    assert.ok(nav, `${declaration}을 찾을 수 없습니다.`);
    assert.doesNotMatch(nav[1], /dentweb|덴트웹/);
  }
});

test('설정 누락·오류 시 설정 필요를 표시하고 링크를 만들지 않는다', () => {
  for (const config of [{}, settings({ [urlKey]: '' }), settings({ [rolesKey]: '잘못된 형식' }), settings({ [ownerKey]: 'false' })]) {
    const card = harness('manager', config).dentwebOperationsCard();
    assert.match(card, /덴트웹 업무함/);
    assert.match(card, /설정 필요/);
    assert.doesNotMatch(card, /href=/);
  }
  const context = harness('chief', settings());
  context.SETTINGS_LOAD_OK = false;
  assert.match(context.dentwebOperationsCard(), /설정 필요/);
  assert.doesNotMatch(context.dentwebOperationsCard(), /href=/);
});

test('허용한 읽기 역할과 승인 여부를 적용하고 원장 전용 정책을 표시한다', () => {
  const managerOnly = settings({ [rolesKey]: '["manager"]' });
  const card = harness('manager', managerOnly).dentwebOperationsCard();
  assert.match(card, /href="https:\/\/workbench\.invalid\/operations\.html"[^>]*rel="noopener noreferrer"/);
  assert.match(card, /진료비·등록·삭제는 원장만/);
  for (const role of ['chief', 'owner', 'staff']) assert.doesNotMatch(harness(role, managerOnly).dentwebOperationsCard(), /href=/);
  assert.doesNotMatch(harness('manager', settings({ [rolesKey]: '[]' })).dentwebOperationsCard(), /href=/);
  assert.equal(harness('staff', settings({ [rolesKey]: '["staff"]' })).dentwebOperationsCard(), '');
  assert.equal(harness('owner', settings(), false).dentwebOperationsCard(), '');
});

test('환자 자료나 인증 정보가 들어갈 수 있는 주소 구성 요소는 링크에 쓸 수 없다', () => {
  for (const value of [exampleUrl + '?sample=1', exampleUrl + '?', exampleUrl + '#sample', exampleUrl + '#',
    'https://placeholder@workbench.invalid/', '//workbench.invalid/', 'javascript:void(0)', '/operations.html',
    'https://workbench.invalid/operations.html/sample', 'https://workbench.invalid/%6fperations.html']) {
    const card = harness('owner', settings({ [urlKey]: value })).dentwebOperationsCard();
    assert.match(card, /설정 필요/);
    assert.doesNotMatch(card, /href=/);
  }
});

test('운영 설정 양식은 원장에게만 나타나고 저장된 값과 문구를 읽는다', () => {
  const owner = harness('owner', settings({ [rolesKey]: '["chief","owner"]' }));
  vm.runInContext(`DENTWEB_TEXTS['dentweb.card.title']='<맞춤 제목>'`, owner);
  const form = owner.dentwebSettingsCard();
  assert.match(form, /value="https:\/\/workbench\.invalid\/operations\.html"/);
  assert.match(form, /value="chief" checked/);
  assert.doesNotMatch(form, /value="manager" checked/);
  assert.match(form, /&lt;맞춤 제목&gt;/);
  assert.match(owner.dentwebOperationsCard(), /&lt;맞춤 제목&gt;/);
  assert.equal(harness('chief', settings()).dentwebSettingsCard(), '');
  assert.equal(harness('owner', settings(), false).dentwebSettingsCard(), '');
  assert.match(html.match(/async function renderOwner\(m\)\{([\s\S]*?)\nasync function setRole/)?.[1] || '', /\$\{dentwebSettingsCard\(\)\}/);
});

test('원장 설정은 기존 두 표의 해당 키만 저장하고 비원장 호출은 저장하지 않는다', async () => {
  const owner = harness('owner', settings());
  const writes = [];
  owner.sb = { from: table => ({
    select: columns => ({ in: async (column, keys) => {
      assert.equal(table, 'hub_ui_texts');
      assert.equal(columns, 'key,value');
      assert.equal(column, 'key');
      assert.deepEqual(Array.from(keys), ['dentweb.card.title', 'dentweb.card.description', 'dentweb.card.open_label']);
      return { data: [{ key: 'dentweb.card.title', value: '기존 업무함' }], error: null };
    } }),
    upsert: async (rows, options) => {
      writes.push([table, JSON.parse(JSON.stringify(rows)), options.onConflict]);
      return { error: null };
    }
  }) };
  await owner.loadDentwebTexts();
  assert.match(owner.dentwebSettingsCard(), /기존 업무함/);
  owner.setStatus = () => {};
  const message = { textContent: '' };
  const submit = { disabled: false };
  const accessForm = {
    elements: { operations_url: { value: exampleUrl } },
    querySelector: selector => selector === '[role="status"]' ? message : submit,
    querySelectorAll: () => [{ value: 'chief' }]
  };
  const textForm = {
    elements: { title: { value: '새 업무함' }, description: { value: '새 안내' }, open_label: { value: '열기' } },
    querySelector: accessForm.querySelector
  };
  await owner.saveDentwebAccess(accessForm);
  await owner.saveDentwebTexts(textForm);
  assert.deepEqual(writes, [
    ['app_settings', [{ key: urlKey, value: exampleUrl }, { key: rolesKey, value: '["chief"]' }, { key: ownerKey, value: 'true' }], 'key'],
    ['hub_ui_texts', [{ key: 'dentweb.card.title', value: '새 업무함' }, { key: 'dentweb.card.description', value: '새 안내' }, { key: 'dentweb.card.open_label', value: '열기' }], 'key']
  ]);
  assert.match(message.textContent, /저장했습니다/);
  assert.equal(owner.SETTINGS[rolesKey], '["chief"]');
  assert.match(owner.dentwebSettingsCard(), /새 업무함/);

  accessForm.elements.operations_url.value += '?sample=1';
  await owner.saveDentwebAccess(accessForm);
  assert.equal(writes.length, 2);
  assert.equal(owner.SETTINGS[urlKey], exampleUrl);

  owner.ME.role = 'chief';
  await owner.saveDentwebAccess(accessForm);
  await owner.saveDentwebTexts(textForm);
  assert.equal(writes.length, 2);
});

test('늦은 문구 조회 응답이 원장 저장 결과를 덮지 않는다', async () => {
  const owner = harness('owner', settings());
  owner.setStatus = () => {};
  let resolveOldRead;
  const oldResponse = new Promise(resolve => { resolveOldRead = resolve; });
  let readCount = 0;
  owner.sb = { from: () => ({
    select: () => ({ in: () => ++readCount === 1 ? oldResponse : Promise.resolve({ data: [], error: null }) }),
    upsert: async () => ({ error: null })
  }) };
  const pendingRead = owner.loadDentwebTexts();
  await owner.loadDentwebTexts();
  await owner.saveDentwebTexts({
    elements: { title: { value: '방금 저장한 제목' }, description: { value: '업무 안내' }, open_label: { value: '열기' } },
    querySelector: selector => selector === '[type="submit"]' ? { disabled: false } : { textContent: '' }
  });
  resolveOldRead({ data: [{ key: 'dentweb.card.title', value: '이전 제목' }], error: null });
  await pendingRead;
  assert.match(owner.dentwebOperationsCard(), /방금 저장한 제목/);
});

test('SQL은 세 설정 키에 빈 값만 넣고 기존 설정을 덮어쓰지 않는다', () => {
  const sqlPath = path.join(root, 'db', 'dentweb_integration_settings.sql');
  assert.ok(fs.existsSync(sqlPath), '덴트웹 설정 SQL이 없습니다.');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  assert.match(sql, /insert into public\.app_settings\s*\(key,\s*value,\s*label\)/i);
  assert.deepEqual([...sql.matchAll(/\('([^']+)',\s*'([^']*)',\s*'[^']+'\)/g)].map(match => match.slice(1, 3)),
    [[urlKey, ''], [rolesKey, ''], [ownerKey, '']]);
  assert.match(sql, /on conflict \(key\) do nothing/i);
  assert.doesNotMatch(sql, /https?:\/\/|\b(?:update|delete|truncate|drop)\b/i);
});
