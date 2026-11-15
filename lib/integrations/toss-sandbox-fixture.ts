import { isDeepStrictEqual } from "node:util";
import { one } from "../db";
import { open } from "../security";
import { ownOrder, type Session } from "../service";
import { syntheticBirths } from "./ai-synthetic-fixtures";
/** Validate the owned order's stored fixture, including after email-authenticated session rotation. */
export function assertTossSyntheticOrder(customer: Session, orderId: string) {
  const order = ownOrder(customer, orderId);
  const reading = one(
    "SELECT input_enc FROM readings WHERE id=?",
    order.reading_id,
  );
  if (
    !reading ||
    !isDeepStrictEqual(open(reading.input_enc), syntheticBirths.known) ||
    order.amount !== 22000
  )
    throw Error("SYNTHETIC_ORDER_REQUIRED");
  return order;
}
