/** Explicit operator queue action only; provider HTTP is performed by the enrolled worker. */
import { db, closeDb } from "../lib/db";
import { aiEnrollmentOptions } from "../lib/ai-worker-runtime";
import { readAiWorkerEnrollment } from "../lib/ai-worker-enrollment";
import { queuePaidAiRecovery } from "../lib/ai-paid-recovery";
try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[1] !== "--approve-one-new-generation")
    throw Error("AI_EXPLICIT_RECOVERY_APPROVAL_REQUIRED");
  if (
    process.env.AI_WORKER_MODE !== "openai" ||
    process.env.CUSTOMER_AI_APPROVAL !== "customer-data-approved"
  )
    throw Error("AI_RECOVERY_MODE_NOT_APPROVED");
  const setup = aiEnrollmentOptions();
  const { createdAtOrAfter } = readAiWorkerEnrollment(db(), setup);
  const queued = queuePaidAiRecovery(args[0], setup.policy, createdAtOrAfter);
  console.log(
    queued
      ? "RECOVERY_QUEUED; 기존 결제 유지 · 이전 비용 기록 유지 · 기존 예산 안에서 새 생성 1회 대기"
      : "RECOVERY_ALREADY_SELECTED; 추가 작업 없음",
  );
} catch (error) {
  const code =
    error instanceof Error && /^[A-Z0-9_]{2,90}$/.test(error.message)
      ? error.message
      : "AI_RECOVERY_BLOCKED";
  console.error(code + "; 비밀값 출력 없음");
  process.exitCode = 1;
} finally {
  closeDb();
}
