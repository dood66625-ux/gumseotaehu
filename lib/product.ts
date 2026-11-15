/** Shared display/server price. Historic orders retain the amount captured when issued. */
export const PRODUCT_PRICE_KRW = 22000;
export const PRODUCT_PRICE_TEXT = PRODUCT_PRICE_KRW.toLocaleString("ko-KR");
export function isSupportedOrderAmount(value: number) {
  return value === PRODUCT_PRICE_KRW || value === 33000;
}
