import { expect, it } from "vitest";
import { safeTossReceiptUrl } from "../lib/toss-receipt";
it("allows the fixed HTTPS provider receipt and rejects redirect/auth/query ambiguity", () => {
  const good =
    "https://dashboard.tosspayments.com/receipt/redirection?transactionId=x&ref=PX";
  expect(safeTossReceiptUrl(good)).toBe(good);
  for (const bad of [
    null,
    "javascript:alert(1)",
    good.replace("https:", "http:"),
    good.replace("dashboard.", "evil."),
    good.replace("/receipt/redirection", "/other"),
    good + "&redirect=https://evil.invalid",
    good + "&transactionId=y",
    good + "#x",
    good.replace("https://", "https://user@"),
    good.replace("?transactionId=x&ref=PX", ""),
  ])
    expect(safeTossReceiptUrl(bad)).toBeNull();
});
