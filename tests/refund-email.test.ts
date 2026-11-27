import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RefundPolicy from "../components/RefundPolicy";
import { business } from "../lib/business";
it("provides a copyable email address without opening a mail app while preserving refund terms", () => {
  const html = renderToStaticMarkup(createElement(RefundPolicy));
  expect(html).not.toContain("이메일로 접수하기");
  expect(html).toContain(business.email);
  expect(html).not.toContain("mailto:");
  expect(html).not.toContain('href="/help"');
  expect(html).toContain("3영업일");
  expect(html).toContain("이중결제");
});
