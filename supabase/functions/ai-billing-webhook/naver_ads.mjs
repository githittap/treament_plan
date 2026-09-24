export function parseNaverAdSms(rawText){
  const text=String(rawText||'');if(!/네이버\s*광고/.test(text))return null;
  if(/노출\s*중단/.test(text))return {kind:'budget_stop',amount_krw:0,note:'NAVER_AD_STOP'};
  const match=text.match(/비즈머니\s*현금충전\s*([\d,]+)\s*원/);
  return match?{kind:'cash_charge',amount_krw:Number(match[1].replace(/,/g,'')),note:'NAVER_AD_CHARGE'}:null;
}
