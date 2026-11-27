import { aiSpendLedger } from "./ai-spend-ledger";
/** Paid-owner-only, durable three-question queue. Question text never enters logs or audit. */
import { aiEnrollmentOptions } from "./ai-worker-runtime";
import { readAiWorkerEnrollment } from "./ai-worker-enrollment";
import { db, all, one, run, tx } from "./db";
import { Fault, id, open, seal } from "./security";
import { getReport, type Session } from "./service";
export type CounselEntry = {
  id: string;
  number: number;
  question: string;
  answer: string | null;
  state: string;
  created: number;
};
export function counselEntries(orderId: string): CounselEntry[] {
  return all(
    "SELECT * FROM taehou_counsel WHERE order_id=? ORDER BY number",
    orderId,
  ).map((r) => ({
    id: r.id,
    number: r.number,
    question: open<string>(r.question_enc),
    answer: r.answer_enc ? open<string>(r.answer_enc) : null,
    state: r.state,
    created: r.created,
  }));
}
export function readCounsel(s: Session, orderId: string) {
  getReport(s, orderId);
  return counselView(orderId);
}
export function counselView(orderId: string) {
  const entries = counselEntries(orderId);
  return { entries, remaining: 3 - entries.length, total: 3 };
}
export function queueCounsel(
  s: Session,
  orderId: string,
  question: unknown,
  requestId: unknown,
) {
  const report = getReport(s, orderId);
  if (
    typeof question !== "string" ||
    !question.trim() ||
    Array.from(question.trim()).length > 50
  )
    throw new Fault("질문은 1~50자로 적어주거라.");
  if (typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId))
    throw new Fault("질문 접수 정보를 확인해 주거라.");
  // Mock orders can be read as before; they never gain a network-capable queue.
  if (
    report.report.provider !== "openai" ||
    process.env.AI_WORKER_MODE !== "openai" ||
    process.env.CUSTOMER_AI_APPROVAL !== "customer-data-approved"
  )
    throw new Fault("자문은 AI 운명서에서 이용할 수 있느니라.", 409);
  const setup = aiEnrollmentOptions();
  readAiWorkerEnrollment(db(), setup);
  const ledger = aiSpendLedger(db(), setup.policy);
  return tx(() => {
    // Recheck inside the write lock, including revocation during authentication.
    getReport(s, orderId);
    if (
      one(
        "SELECT 1 FROM taehou_counsel WHERE order_id=? AND request_id=?",
        orderId,
        requestId,
      )
    )
      return counselView(orderId);
    const entries = all(
      "SELECT number,state FROM taehou_counsel WHERE order_id=?",
      orderId,
    );
    if (entries.length >= 3)
      throw new Fault("세 번의 자문을 모두 사용했느니라.", 409);
    if (entries.some((e) => ["queued", "working"].includes(e.state)))
      throw new Fault("앞선 자문에 답하고 있으니 잠시 기다리거라.", 409);
    let reservation: string;
    try {
      reservation = ledger.reserve(
        orderId,
        1000001 + entries.length,
        Date.now(),
        "counsel",
      );
    } catch {
      throw new Fault(
        "지금은 자문을 준비할 여력이 부족하구나. 횟수는 차감하지 않았으니 잠시 후 다시 찾아오거라.",
        503,
      );
    }
    run(
      "INSERT INTO taehou_counsel(id,order_id,number,report_version,reservation_id,request_id,question_enc,state,created) VALUES(?,?,?,?,?,?,?,'queued',?)",
      id(),
      orderId,
      entries.length + 1,
      report.order.version,
      reservation,
      requestId,
      seal(question.trim()),
      Date.now(),
    );
    return counselView(orderId);
  });
}
