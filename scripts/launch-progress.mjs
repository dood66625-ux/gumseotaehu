/** Read-only summary by default; --write updates the reviewable Markdown checklist. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const plan = JSON.parse(readFileSync("docs/launch-progress.json", "utf8"));
const tasks = plan.majors.flatMap((m) => m.sections.flatMap((s) => s.tasks));
if (new Set(tasks.map((t) => t.id)).size !== tasks.length)
  throw Error("DUPLICATE_PROGRESS_TASK");
for (const task of tasks) {
  if (!["done", "pending", "in_progress"].includes(task.status))
    throw Error("INVALID_PROGRESS_STATE");
  if (task.status === "done" && (!task.evidence || !existsSync(task.evidence)))
    throw Error("PROGRESS_EVIDENCE_REQUIRED");
  if (
    task.status !== "done" &&
    !["development", "verification", "decision"].includes(task.remainingKind)
  )
    throw Error("REMAINING_WORK_KIND_REQUIRED");
}
const count = (xs) => ({
  done: xs.filter((t) => t.status === "done").length,
  total: xs.length,
  remaining: xs.filter((t) => t.status !== "done").length,
});
const totals = count(tasks),
  remaining = { development: 0, verification: 0, decision: 0 };
for (const t of tasks) if (t.status !== "done") remaining[t.remainingKind]++;
const summary = {
  updatedKst: plan.updatedKst,
  ...totals,
  remainingByKind: remaining,
  majors: plan.majors.map((m) => ({
    id: m.id,
    title: m.title,
    ...count(m.sections.flatMap((s) => s.tasks)),
    sections: m.sections.map((s) => ({
      id: s.id,
      title: s.title,
      ...count(s.tasks),
    })),
  })),
};
if (process.argv.includes("--write")) {
  const lines = [
    "# 출시 진행표 · 대단원 / 중단원 / 소단원",
    "",
    `기준일: ${plan.updatedKst} KST. **${totals.done}/${totals.total} 소단원 완료 · ${totals.remaining}개 남음.**`,
    "",
    plan.basis,
    "",
    plan.previousEstimate,
    "",
    `남은 작업량: 개발 ${remaining.development}개 / 현장·전문 검증·심사 ${remaining.verification}개 / 운영 결정·승인 ${remaining.decision}개. 단위별 크기가 달라 같은 기간을 뜻하지 않으며 심사 대기 시간은 예측하지 않습니다.`,
    "",
    "| 대단원 | 완료/전체 | 남음 |",
    "|---|---:|---:|",
    ...summary.majors.map(
      (m) => `| ${m.id}. ${m.title} | ${m.done}/${m.total} | ${m.remaining} |`,
    ),
    "",
  ];
  const labels = {
    development: "개발",
    verification: "현장·전문 검증/심사",
    decision: "운영 결정/승인",
  };
  for (const m of plan.majors) {
    lines.push(`## ${m.id}. ${m.title}`, "");
    for (const s of m.sections) {
      const n = count(s.tasks);
      lines.push(`### ${s.id} ${s.title} · ${n.done}/${n.total} 완료`, "");
      for (const t of s.tasks)
        lines.push(
          `- [${t.status === "done" ? "x" : " "}] **${t.id}** ${t.title}${t.status === "done" ? ` — 근거: [${t.evidence.split("/").pop()}](${t.evidence.startsWith("docs/") ? t.evidence.slice(5) : "../" + t.evidence})` : ` — 남음: ${labels[t.remainingKind]}`}`,
        );
      lines.push("");
    }
  }
  lines.push(
    "## 별도 확장 범위",
    "",
    ...plan.excludedFutureScope.map((t) => "- " + t),
    "",
    "이 항목들은 현재 남은 소단원 수에 포함하지 않습니다. 실제 출시 범위로 결정하면 목록 버전과 수량을 갱신합니다.",
    "",
  );
  writeFileSync("docs/launch-progress.md", lines.join("\n"));
}
console.log(JSON.stringify(summary, null, 2));
