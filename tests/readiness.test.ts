import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { launchReadiness } from "../lib/readiness";
it("reports incomplete implementation separately from missing accounts and never exposes secrets", () => {
  const report = launchReadiness();
  expect(report.launchReady).toBe(false);
  expect(report.externalEffectsEnabled).toBe(false);
  expect(report.blockers.map((x) => x.id)).toEqual(
    expect.arrayContaining([
      "toss",
      "ai",
      "mail",
      "privacy",
      "admin",
      "approval",
    ]),
  );
  const text = JSON.stringify(report);
  for (const name of [
    "OPENAI_API_KEY",
    "DATA_KEY",
    "AUTH_SECRET",
    "ADMIN_PASSWORD",
    "ADMIN_TOTP_SECRET",
    "TOSS_TEST_SECRET_KEY",
  ]) {
    const secret = process.env[name];
    if (secret) expect(text).not.toContain(secret);
  }
  expect(text).not.toContain("mjreview3@");
});

it("uses the same remaining launch conditions as the progress CLI without inferring production approval", () => {
  const expected = JSON.parse(
    execFileSync(process.execPath, ["scripts/launch-progress.mjs"], {
      encoding: "utf8",
    }),
  );
  const report = launchReadiness(),
    checklist = report.checklist;
  expect(checklist).toMatchObject({
    completed: expected.done,
    total: expected.total,
    remaining: expected.remaining,
    percent: expected.percent,
    remainingByKind: expected.remainingByKind,
    productionApprovalInferred: false,
  });
  const unfinished = expected.majors.flatMap((major: any) =>
    major.sections.flatMap((section: any) =>
      section.tasks
        .filter((task: any) => task.status !== "done")
        .map((task: any) => task.id),
    ),
  );
  expect(checklist.remainingWork.map((task) => task.id)).toEqual(unfinished);
  for (const completed of ["5.2.4", "5.2.5", "5.3.2"])
    expect(checklist.remainingWork.map((task) => task.id)).not.toContain(
      completed,
    );
  expect(report.launchReady).toBe(false);
  expect(report.externalEffectsEnabled).toBe(false);
  expect(checklist.excludedFutureScope).toContain("다중 호스트 DB 확장");
});
