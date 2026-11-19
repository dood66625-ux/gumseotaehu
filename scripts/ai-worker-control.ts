import { DatabaseSync } from "node:sqlite";
import { config } from "../lib/config";
/** Offline operator control only: this CLI never invokes a provider transport. */
import { db, tx } from "../lib/db";
import { aiEnrollmentOptions } from "../lib/ai-worker-runtime";
import {
  enrollAiWorker,
  readAiWorkerEnrollment,
} from "../lib/ai-worker-enrollment";
import { prepareAiOrder } from "../lib/order-generation";
import { inspectAiWorkerQueue } from "../lib/ai-worker-cycle";
try {
  const args = process.argv.slice(2);
  if (
    !(args.length === 1 && args[0] === "--status") &&
    !(
      args.length === 2 &&
      args[0] === "--enroll" &&
      args[1] === "--approve-customer-ai"
    ) &&
    !(
      args.length === 2 &&
      args[0] === "--select-order" &&
      /^[0-9a-f-]{36}$/i.test(args[1])
    )
  )
    throw Error("AI_WORKER_CONTROL_ARGUMENTS_REQUIRED");
  const setup = aiEnrollmentOptions(),
    database =
      args[0] === "--status"
        ? new DatabaseSync(config().db, { readOnly: true })
        : db();
  if (args[0] === "--enroll") {
    enrollAiWorker(database, { ...setup, approval: "customer-data-approved" });
    console.log(
      JSON.stringify({ state: "enrolled", generationEnabledByCommand: false }),
    );
  } else if (args[0] === "--select-order") {
    const selected = tx(() => {
      const { createdAtOrAfter } = readAiWorkerEnrollment(database, setup);
      const order = database
        .prepare("SELECT created FROM orders WHERE id=?")
        .get(args[1].toLowerCase());
      if (!order || Number(order.created) < createdAtOrAfter)
        throw Error("AI_ORDER_BEFORE_CUTOVER");
      // Use the same transaction helper so selection is atomic with the cutover check.
      return prepareAiOrder(args[1]);
    });
    console.log(
      JSON.stringify({
        state: selected ? "selected" : "already-selected",
        generationEnabledByCommand: false,
      }),
    );
  } else {
    const { createdAtOrAfter } = readAiWorkerEnrollment(database, setup);
    const queue = inspectAiWorkerQueue(
      database,
      setup.policy,
      1,
      createdAtOrAfter,
    );
    database.close();
    console.log(
      JSON.stringify({
        state: queue.state,
        ...(queue.state === "blocked"
          ? { reason: queue.reason }
          : { eligibleCount: queue.eligible.length, held: queue.held }),
        generationEnabledByCommand: false,
      }),
    );
  }
} catch (error) {
  const code =
    error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.message)
      ? error.message
      : "AI_WORKER_CONTROL_BLOCKED";
  console.error(code + " (no customer data logged)");
  process.exitCode = 1;
}
