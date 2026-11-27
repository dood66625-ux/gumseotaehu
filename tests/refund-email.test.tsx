import { expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RefundPolicy from "../components/RefundPolicy";
import { business } from "../lib/business";
it("provides email-only intake with useful subject and body while preserving refund terms", () => {
  const html = renderToStaticMarkup(<RefundPolicy />);
  expect(html).toContain("이메일로 접수하기");
  expect(html).toContain("mailto:" + business.email);
  expect(html).toContain("subject=");
  expect(html).toContain("body=");
  expect(html).not.toContain('href="/help"');
  expect(html).toContain("3영업일");
  expect(html).toContain("이중결제");
});
