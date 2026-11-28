import { PRODUCT_PRICE_TEXT, PRODUCT_REGULAR_PRICE_TEXT } from "../lib/product";
export default function DiscountCheckoutLabel() {
  return (
    <span className="discount-button-copy">
      <del aria-hidden="true">{PRODUCT_REGULAR_PRICE_TEXT}원</del>
      <span>{PRODUCT_PRICE_TEXT}원 할인 결제하기</span>
    </span>
  );
}
