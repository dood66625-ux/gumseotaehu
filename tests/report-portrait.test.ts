import { expect, it } from "vitest";
import { reportPortrait } from "../lib/report-portrait";
it("offers five distinct fictional roles with three optional actions and named color swatches", () => {
  const roles = new Set();
  for (const element of ["목", "화", "토", "금", "수"]) {
    const p = reportPortrait(element)!;
    roles.add(p.role);
    expect(p.actions).toHaveLength(3);
    expect(new Set(p.actions).size).toBe(3);
    expect(p.colors).toHaveLength(2);
    for (const [name, hex] of p.colors) {
      expect(name).toBeTruthy();
      expect(hex).toMatch(/^#[A-Fa-f0-9]{6}$/);
    }
    expect(p.note).toContain("상상 속 캐릭터");
    expect(p).not.toHaveProperty("score");
    expect(p.story).toContain("상상");
  }
  expect(roles.size).toBe(5);
});
it("does not invent a persona when a saved record has no valid element", () => {
  for (const value of [null, undefined, "", "__proto__", "木", {}])
    expect(reportPortrait(value)).toBeNull();
});
