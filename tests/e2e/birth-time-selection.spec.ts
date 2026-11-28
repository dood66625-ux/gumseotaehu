import { expect, test } from "@playwright/test";

for (const time of ["00:00", "12:00", "23:30", null]) {
  test(`half-hour birth selection submits ${time ?? "unknown"} exactly`, async ({
    page,
  }) => {
    let submitted: Record<string, unknown> | undefined;
    await page.route("**/api/session", (route) =>
      route.fulfill({ json: { ok: true } }),
    );
    await page.route("**/api/readings", (route) => {
      submitted = route.request().postDataJSON();
      return route.fulfill({ json: { id: "synthetic-half-hour" } });
    });
    await page.route("**/reading/preview?*", (route) =>
      route.fulfill({ contentType: "text/html", body: "<p>Submitted</p>" }),
    );
    await page.goto("/start");
    await page.getByLabel("이름 또는 별명").fill("검증");
    await page.getByRole("button", { name: "다음 →" }).click();
    await page.getByLabel("생년월일").fill("1995-05-15");
    await page.getByRole("button", { name: "다음 →" }).click();
    const select = page.getByLabel("출생시간", { exact: true });
    const values = await select
      .locator("option:not([disabled])")
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value),
      );
    expect(values).toHaveLength(48);
    expect(new Set(values).size).toBe(48);
    expect(
      values.every((value) => /^(?:[01]\d|2[0-3]):(?:00|30)$/.test(value)),
    ).toBe(true);
    await page.getByRole("button", { name: "다음 →" }).click();
    await expect(page.locator(".birth-step")).toContainText("3 / 5");
    if (time === null) {
      await select.selectOption("08:30");
      await page.getByLabel("출생시간을 모릅니다").check();
      await expect(select).toBeDisabled();
    } else {
      await select.selectOption(time);
      await expect(select).toHaveValue(time);
    }
    await page.getByRole("button", { name: "다음 →" }).click();
    await page.getByRole("button", { name: "다음 →" }).click();
    await page.getByRole("checkbox", { name: /풀이 대상자는 본인/ }).check();
    await page.getByRole("checkbox", { name: /개인정보 수집/ }).check();
    await page.getByRole("button", { name: "무료 사주풀이 펼치기" }).click();
    await expect.poll(() => submitted?.date).toBe("1995-05-15");
    expect(submitted?.time).toBe(time);
  });
}
