import { expect, test } from "@playwright/test";
test("five elements render exact counts, an empty zero bar, and fit the reading panel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.route("**/api/readings/synthetic-elements", (r) =>
    r.fulfill({
      json: {
        id: "synthetic-elements",
        input: { name: "가온", age: "19+" },
        chart: {
          element: "목",
          trait: "새로운 것을 배우고 관계를 가꾸는",
          day: "甲",
          counts: { 목: 3, 화: 0, 토: 2, 금: 1, 수: 2 },
          pillars: ["甲子", "乙丑", "甲寅", "丁卯"],
          tenGods: ["비견", "겁재", "비견", "상관"],
          target: 2027,
        },
        preview: { cards: [] },
      },
    }),
  );
  await page.goto("/reading/preview?id=synthetic-elements");
  for (
    let i = 0;
    i < 4 &&
    !(await page.getByRole("img", { name: /오행 글자 수:/ }).isVisible());
    i++
  )
    await page.locator(".screen-flow-controls button").last().click();
  const chart = page.getByRole("img", {
    name: "오행 글자 수: 목 3개, 화 0개, 토 2개, 금 1개, 수 2개",
  });
  await expect(chart).toBeVisible();
  await expect(chart.locator(".five-elements-count")).toHaveText([
    "3개",
    "0개",
    "2개",
    "1개",
    "2개",
  ]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await chart
      .locator(".five-elements-fill")
      .nth(1)
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBe(0);
  const rect = await chart.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(360);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(740);
  await page.setViewportSize({ width: 320, height: 568 });
  const compact = await chart.boundingBox();
  expect(compact!.x + compact!.width).toBeLessThanOrEqual(320);
  expect(compact!.y + compact!.height).toBeLessThanOrEqual(568);
  await chart.screenshot({
    path: "var/five-elements-chart-" + test.info().project.name + ".png",
  });
  await page.screenshot({
    path: "var/five-elements-" + test.info().project.name + ".png",
  });
});
