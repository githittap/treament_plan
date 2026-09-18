# Contract Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Korean employment-contract preview page with role-driven duties and weekday schedules.

**Architecture:** `contract-preview.html` is a self-contained static page. Browser JavaScript owns role duties and editable schedule rows. It never calls Supabase or changes `hr.html`.

**Tech Stack:** HTML, CSS, browser JavaScript, Node built-in test runner.

## Global Constraints

- Do not modify `hr.html`, Supabase, or the live template.
- Create one offline preview at `contract-preview.html`.
- Employee name comes only from the employee selector.
- Public-holiday work is always included.

---

### Task 1: Role duties and helper behavior

**Files:**
- Create: `contract-preview.html`
- Create: `tests/contract-preview.test.js`

**Interfaces:**
- Produces `ROLE_DUTIES` and `indefiniteContractState(endDate)` in the test-marked script block.

- [ ] Write a failing test that checks `ROLE_DUTIES.마케터` includes `광고심의` and `내부 사이니지`, and `indefiniteContractState('2026-12-31')` returns `{ checked:false, disabled:true }`.
- [ ] Run `node --test tests/contract-preview.test.js`; expect a missing-file failure.
- [ ] Add the minimal helper implementation and role duties for 통역사, 진료실, 리셉션, 상담실장, 마케터, 부원장, 기공소.
- [ ] Run `node --test tests/contract-preview.test.js`; expect PASS.
- [ ] Commit with `git add contract-preview.html tests/contract-preview.test.js` and `git commit -m "feat: add contract preview role helpers"`.

### Task 2: Standalone form and live preview

**Files:**
- Modify: `contract-preview.html`
- Modify: `tests/contract-preview.test.js`

**Interfaces:**
- Consumes `ROLE_DUTIES` and `indefiniteContractState(endDate)`.
- Produces `renderScheduleRows()` and `renderContractPreview()`.

- [ ] Write a failing test for weekday labels 월~일, 주간·야간·별도 options, and fixed `공휴일 근무 포함` text.
- [ ] Run `node --test tests/contract-preview.test.js`; expect the schedule assertions to fail.
- [ ] Implement employee selector, 주민등록번호, role-driven duty, start/end dates, gross monthly pay, optional net estimate, collapsed details, schedule rows, and contract result table.
- [ ] Keep the three retirement/pay clauses and contract termination wording exactly as the current template.
- [ ] Run `node --test tests/contract-preview.test.js`; expect PASS.
- [ ] Commit with `git add contract-preview.html tests/contract-preview.test.js` and `git commit -m "feat: add contract preview form"`.

### Task 3: Verification

**Files:**
- Modify: `contract-preview.html` only for a discovered defect.

- [ ] Run all preview tests with `node --test tests/contract-preview.test.js`; expect PASS.
- [ ] Extract the inline script to a temporary file and run `node --check`; expect exit code 0.
- [ ] Commit any verification-only correction with `git commit -m "test: verify contract preview"`.
