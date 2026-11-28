/** Shared display/server price. Historic orders retain the amount captured when issued. */
export const REPORT_WEB_PAGE_COUNT = 24;
export const REPORT_WEB_PAGE_NOTE =
  "웹 열람 화면 기준이며, PDF 쪽수는 본문 길이에 따라 달라집니다.";
export const PRODUCT_PRICE_KRW = 22000;
export const PRODUCT_PRICE_TEXT = PRODUCT_PRICE_KRW.toLocaleString("ko-KR");
export function isSupportedOrderAmount(value: number) {
  return value === PRODUCT_PRICE_KRW || value === 33000;
}
