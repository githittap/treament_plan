# 예스폼 1차 반영: 직원별 월 근태 요약

사용자 지시: 예스폼을 다시 분석하고 실제 운영에 필요한 누락 기능을 반영한다.
1차 범위는 기존 근태의 읽기 요약·개인 확인용 출력·Excel 내보내기다.
기준 커밋 `4b260e4a768226f50aa2265ef0faea7956db7469`, 브랜치 `codex/yesform-monthly-summary-20261004`.

## 선택 근거

- 전체 조사 58파일·256시트의 기존 Library 보고서: `libfile_8816c55853148191974ec1752dc1c4f6`, `예스폼_전체서식_분석및직원허브대조_2026-10-04.html`.
- F28 `예스폼_근태관리엑셀서식모음.xlsm`: 17시트 중 `월간 근태기록대장`은 직원별 일수·지각/조퇴/시간외 기록을 한 행에 배치한다. `개인 근태기록표`는 개인별 근거와 합계를 출력한다.
- F28 `월간 근태통계표!P9`는 `L9/H9`의 근무율, `개인 근태기록표!G31`은 날짜 기록 COUNTA, `G32`는 수량 SUM이다. 저장 수식 전체 64셀은 인원·횟수 중심이며 분 단위 판정 엔진이 아니다.
- F45 `예스폼_인사관리필수엑셀번들팩27종.xlsx`의 `근태현황 집계표`: 직원 한 행에 출근/결근/지각/조퇴/연차/초과근무/출장 열을 둔다.
- 기존 `2026-09-08-payroll-payslip-design.md` F.3–4는 횟수+분 월 요약과 개인 A4를 계획했지만 구현되지 않았다. 지문·수기 차이 Excel은 이 월 요약과 목적이 다르다.
- 현재 데이터로 확정된 결근·출장을 식별할 정본이 없으므로 이를 추정해 원본의 모든 열을 채우지 않는다. 인수인계는 저장·담당·완료의 별도 업무 절차가 필요해 후속 범위로 분리한다.

## 구현

`hr.html`의 기존 근태 탭 내부에 원장 전용 월 요약을 추가했다. 새 상단 탭은 없다.

- 직원별 기록일, 출퇴근 완료일, 지각/조퇴 횟수와 분, 연장 분(일치하는 확정 저녁 분 포함), 휴일 출퇴근 시각 구간, 시각 검토일, 수기 대기일.
- 월 선택 후 조회. 기존 `attendance`, `attendance_manual_entries`, `attendance_issue_resolutions`, `att_months`를 SELECT로만 읽는다.
- `applyAttendanceResolutions`, `payslipAttendanceRows`, `aggregateAttendanceForPayslip`, `attendanceMonthBounds`, `fetchAttendancePages`를 재사용한다. 직원별로 분리해 같은 날짜의 다른 직원과 섞이지 않는다.
- 원장 확정과 일치하는 수기 저녁 분만 추가한다. 대기/실장승인 수기는 날짜별 검토 건으로만 표시한다. 원본 없는 확정 수기로 근무일을 생성하지 않는다.
- 개인 확인용 자료: 한 달 날짜별 출퇴근·지각·조퇴·연장·휴일 구간·집계 근거, A4 인쇄.
- Excel 3시트: 기준, 직원별요약, 일별근거. 기준과 월 마감 상태를 함께 내보낸다.
- 조회 실패·페이지 상한·이전 월 지연 응답 시 이전 합계를 남기거나 내보내지 않는다. 새 조회를 시작하면 이전 개인 출력 창을 닫는다.
- 이름/부서 HTML을 이스케이프한다. 직원명 문자열은 SheetJS의 문자열 셀로 내보내며 수식 속성을 생성하지 않는다.

휴일은 저장된 `is_holiday`만 사용한다. 출퇴근 시각 구간에는 휴게시간을 임의 차감하지 않고 해당 기준을 화면·출력·Excel에 명시한다. 저장된 지각·조퇴·연장 분을 재판정하거나 반올림하지 않는다. 시급제 금액 계산과 별개다.

## 검증

신규 `tests/attendance-monthly-summary.test.js` 11개: 직원/날짜 분리, 승인 보정, 확정 저녁 분, 대기 제외, 원본 불변, 월 경계, 자료 없음/시각 누락, 출력 범위/XSS, Excel 근거, 원장 제한, 페이지 조회/상한, 조회 실패/지연 응답.
첫 8개는 기능이 없는 상태에서 실패를 확인했다. 추가 재조회 시험으로 이전 개인 출력이 남는 문제를 재현하고 수정했다.

최종 focused 회귀시험 66/66:

```powershell
node --test --test-isolation=none tests/attendance-monthly-summary.test.js tests/payroll-payslip.test.js tests/payslip-issue-audit.test.js tests/attendance-manual-v2.test.js tests/attendance-resolution-release-static.test.js tests/attendance-d-phase2.test.js tests/attendance-date-switch.test.js tests/wage-hourly.test.js
```

전체 인라인 스크립트 2개 `vm.Script` 문법 검사 통과. 가상 직원의 31일 자료를 사용자 브라우저와 분리된 headless Chrome으로 인쇄했고, A4 1페이지·31일·하단 기준 문구와 시각적 잘림/배경을 확인했다. 신규 DB 변경이 없어 PGlite 전체/대규모 시험은 반복하지 않았다.

## 배포 영향과 남은 확인

- 서비스 변경 파일은 `hr.html` 1개다. 시험·이 문서는 배포 대상이 아니다.
- SQL/DB/권한/RLS, 급여액·보험 설정·연차 확정, 직원 통지, 외부 AI 연락 변경 없음.
- 운영 미배포. 해당 변경의 배포는 별도 승인 대상이며 이미 배포된 시급제 4b260e4와 구분한다.
- 병합 시 동시 작업의 최신 `hr.html`과 충돌을 확인하고 4b260e4의 시급제 스크립트 연결을 보존한다. 이 브랜치를 main으로 강제 복사하거나 force-push하지 않는다.
- 배포 승인 후 원장 근태 화면에서 월 선택→요약→개인 출력/Excel 조회 확인을 한다. 현재 조사는 실제 로그인 운영 UI/실제 직원 DB를 추가 조회하지 않았다.
- 되돌림은 이 변경의 `hr.html` 부분을 되돌리는 것으로 충분하며 DB rollback은 없다.
- 후속: 인수인계 담당/기한/반환 완료, 교육 이수, 시설 점검. 연차·세금·보험·촉진 문서 자동화는 공식 기준과 사용자 정책을 확인하는 별도 범위다.
