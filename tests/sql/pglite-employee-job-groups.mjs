import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packageRoot = process.env.PGLITE_PACKAGE_ROOT;
if (!packageRoot) throw new Error('PGLITE_PACKAGE_ROOT is required');
const { PGlite } = await import(pathToFileURL(path.join(packageRoot, 'dist/index.js')).href);
const migration = fs.readFileSync(path.resolve('db/employee_job_groups.sql'), 'utf8');
const rollback = fs.readFileSync(path.resolve('db/employee_job_groups_rollback.sql'), 'utf8');
const db = new PGlite();
const query = sql => db.query(sql).then(result => result.rows);
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

try {
  await db.exec(`
    CREATE TABLE public.profiles (
      user_id uuid PRIMARY KEY, dept text, role text,
      employment_status text, employment_effective_date date
    );
    CREATE TABLE public.schedule_people (
      id uuid PRIMARY KEY, profile_user_id uuid, name text NOT NULL,
      department text, active boolean NOT NULL DEFAULT true
    );
    INSERT INTO public.profiles(user_id,dept,role) VALUES
      ('${id(1)}','진료실','staff'), ('${id(2)}','데스크','staff'),
      ('${id(3)}','기공팀','staff'), ('${id(4)}','기타','staff'),
      ('${id(5)}','진료실','staff'), ('${id(6)}','기공팀','staff');
    INSERT INTO public.schedule_people(id,profile_user_id,name,department) VALUES
      ('${id(101)}','${id(1)}','연결 일반직원','미지정'),
      ('${id(102)}','${id(2)}','연결 Dr 프로필','Dr.'),
      ('${id(103)}','${id(5)}','Dr 프로필','Dr.'),
      ('${id(104)}','${id(6)}','Dr 기공 프로필','Dr.');
    INSERT INTO public.schedule_people(id,name,department) VALUES
      ('${id(201)}','비로그인 진료실','진료실'), ('${id(202)}','비로그인 상담','상담'),
      ('${id(203)}','비로그인 행정','행정'), ('${id(204)}','비로그인 기공실','기공실'),
      ('${id(205)}','비로그인 데스크','데스크'), ('${id(206)}','비로그인 Dr','Dr.'),
      ('${id(207)}','비로그인 미등록','기타'), ('${id(208)}','비로그인 미지정','미지정');
  `);
  await db.exec(migration);

  const profileGroups = await query(`SELECT user_id::text,job_group FROM public.profiles ORDER BY user_id`);
  assert.deepEqual(profileGroups.map(row => row.job_group), [
    'clinical_consult', null, 'lab', null, null, null,
  ]);
  const scheduleGroups = await query(`SELECT id::text,job_group FROM public.schedule_people ORDER BY id`);
  assert.deepEqual(scheduleGroups.map(row => row.job_group), [
    null, null, null, null,
    'clinical_consult', 'clinical_consult', 'sterilization_admin', 'lab',
    'desk', null, null, null,
  ]);
  const conditionalUpdate = async (table, key, value, oldGroup, nextGroup) => {
    const oldClause = oldGroup === null ? 'job_group IS NULL' : `job_group='${oldGroup}'`;
    const result = await db.query(`UPDATE public.${table} SET job_group='${nextGroup}' WHERE ${key}='${value}' AND ${oldClause} RETURNING ${key}`);
    return result.rows.length;
  };
  assert.equal(await conditionalUpdate('profiles', 'user_id', id(1), 'clinical_consult', 'desk'), 1, 'linked profile updates only from previewed old value');
  assert.equal(await conditionalUpdate('profiles', 'user_id', id(1), 'clinical_consult', 'lab'), 0, 'stale linked profile preview conflicts');
  assert.equal(await conditionalUpdate('schedule_people', 'id', id(201), 'clinical_consult', 'lab'), 1, 'unlinked roster updates conditionally');
  assert.equal(await conditionalUpdate('schedule_people', 'id', id(202), 'desk', 'lab'), 0, 'stale unlinked roster preview conflicts');
  assert.equal((await query(`SELECT job_group FROM public.schedule_people WHERE id='${id(101)}'`))[0].job_group, null, 'linked roster job_group remains untouched');
  assert.deepEqual([
    await conditionalUpdate('profiles', 'user_id', id(3), 'lab', 'desk'),
    await conditionalUpdate('schedule_people', 'id', id(203), 'desk', 'lab'),
  ], [1, 0], 'partial success reports individual successful and conflicting rows');
  const originalRows = await query(`SELECT sp.name,sp.department,p.dept
    FROM public.schedule_people sp LEFT JOIN public.profiles p ON p.user_id=sp.profile_user_id
    ORDER BY sp.id`);

  await db.exec(`UPDATE public.profiles SET job_group='desk' WHERE user_id='${id(1)}';
    UPDATE public.schedule_people SET job_group='lab' WHERE id='${id(201)}';`);
  await db.exec(migration);
  assert.equal((await query(`SELECT job_group FROM public.profiles WHERE user_id='${id(1)}'`))[0].job_group, 'desk');
  assert.equal((await query(`SELECT job_group FROM public.schedule_people WHERE id='${id(201)}'`))[0].job_group, 'lab');
  assert.deepEqual(await query(`SELECT sp.name,sp.department,p.dept
    FROM public.schedule_people sp LEFT JOIN public.profiles p ON p.user_id=sp.profile_user_id
    ORDER BY sp.id`), originalRows);
  for (const table of ['profiles', 'schedule_people']) {
    await assert.rejects(db.exec(`UPDATE public.${table} SET job_group='Dr.'`), /check constraint/i);
    await db.exec('ROLLBACK').catch(() => {});
  }
  await assert.rejects(db.exec(rollback), /job_group|classification/i);
  await db.exec('ROLLBACK').catch(() => {});
  assert.equal((await query(`SELECT job_group FROM public.profiles WHERE user_id='${id(1)}'`))[0].job_group, 'desk',
    'populated rollback refusal preserves profile classification');
  assert.equal((await query(`SELECT job_group FROM public.schedule_people WHERE id='${id(201)}'`))[0].job_group, 'lab',
    'populated rollback refusal preserves unlinked roster classification');
  await db.exec(`UPDATE public.profiles SET job_group=NULL;
    UPDATE public.schedule_people SET job_group=NULL;`);
  const beforeRollbackSources = await query(`SELECT sp.id::text,sp.name,sp.department,p.dept,p.user_id::text AS profile_user_id
    FROM public.schedule_people sp LEFT JOIN public.profiles p ON p.user_id=sp.profile_user_id ORDER BY sp.id`);
  assert.equal((await query(`SELECT count(*)::int AS count FROM public.profiles WHERE job_group IS NOT NULL`))[0].count, 0);
  assert.equal((await query(`SELECT count(*)::int AS count FROM public.schedule_people WHERE job_group IS NOT NULL`))[0].count, 0);
  await db.exec(rollback);
  const columns = await query(`SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='public' AND column_name='job_group'`);
  assert.deepEqual(columns, []);
  assert.deepEqual(await query(`SELECT sp.id::text,sp.name,sp.department,p.dept,p.user_id::text AS profile_user_id
    FROM public.schedule_people sp LEFT JOIN public.profiles p ON p.user_id=sp.profile_user_id ORDER BY sp.id`), beforeRollbackSources,
    'rollback leaves department/dept, Dr. roster rows, and linked profiles intact');
  assert.deepEqual((await query(`SELECT user_id::text,dept,role FROM public.profiles ORDER BY user_id`)).map(row => row.user_id),
    [id(1), id(2), id(3), id(4), id(5), id(6)], 'rollback preserves all source profiles including Dr.-linked profiles');
  console.log('PGLITE_EMPLOYEE_JOB_GROUPS_PASS: mappings, Dr exclusion, no linked-row copy, rerun preservation, constraints, populated rollback refusal, empty rollback, source and Dr/profile preservation');
} finally {
  await db.close();
}
