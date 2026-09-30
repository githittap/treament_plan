export function parseNaverAdSms(rawText) {
  const text = String(rawText || '').replace(/\r/g, '');
  if (!/네이버\s*광고/i.test(text)) return null;

  const account = text.match(/^\s*(.+?)\s*\((\d{5,})\)\s*(?=잔액|비즈머니)/m);
  const accountName = account?.[1]?.replace(/^.*\]\s*/, '').replace(/^제목\s*:\s*/i, '').trim() || null;
  const accountId = account?.[2] || null;

  if (/노출\s*중단/i.test(text)) {
    return { kind: 'budget_stop', amount_krw: 0, note: 'NAVER_AD_STOP', account_id: accountId, account_name: accountName, threshold_krw: null };
  }

  const balance = text.match(/잔액\s*([\d,]+)\s*원\s*이하/i);
  if (balance) {
    return { kind: 'low_balance', amount_krw: 0, note: 'NAVER_AD_LOW_BALANCE', account_id: accountId, account_name: accountName, threshold_krw: Number(balance[1].replace(/,/g, '')) };
  }

  const charge = text.match(/비즈머니\s*현금충전\s*([\d,]+)\s*원/i);
  if (charge) {
    return { kind: 'cash_charge', amount_krw: Number(charge[1].replace(/,/g, '')), note: 'NAVER_AD_CHARGE', account_id: accountId, account_name: accountName, threshold_krw: null };
  }

  return { kind: 'unknown', amount_krw: 0, note: 'NAVER_AD_UNKNOWN', account_id: accountId, account_name: accountName, threshold_krw: null };
}
