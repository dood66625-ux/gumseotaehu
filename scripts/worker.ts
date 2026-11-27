import { runCounselCycle } from "../lib/taehou-counsel-worker";
import { finishErasure } from "../lib/financial-erasure";
import { runConfiguredRetentionCycle } from "../lib/retention-runtime";
import { configuredExternalLedger } from "../lib/external-deletion-ledger";
import { readPrivacyCheckpoint } from "../lib/privacy-checkpoint";
import { recoverLiveToss } from "../lib/toss-live-runtime";
import { runConfiguredAiCycle } from "../lib/ai-worker-runtime";
import { runConfiguredMailCycle } from "../lib/mail-worker-runtime";
import { db } from "../lib/db";
import { config } from "../lib/config";
import {
  publishPrivacyCheckpoint,
  privacyCheckpointDirectory,
  recordPrivacyCheckpointFailure,
} from "../lib/privacy-checkpoint";
import { workOnce, reconcileRefunds, purgeExpired } from "../lib/service";
console.log(
  "Local durable worker started. Payment/AI/mail require separate enrollment; default disabled.",
);
let stopped = false;
process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});
let tick = 0;
while (!stopped) {
  try {
    workOnce();
    reconcileRefunds();
    try {
      if (!stopped) await recoverLiveToss(undefined, () => stopped);
    } catch {
      console.error("TOSS_LIVE_RECOVERY_FAILED (no customer data logged)");
    }
    try {
      await runConfiguredAiCycle({ stopping: () => stopped });
    } catch {
      console.error("AI_WORKER_CYCLE_FAILED (no customer data logged)");
    }
    try {
      if (!stopped) await runCounselCycle();
    } catch {
      console.error("COUNSEL_WORKER_CYCLE_FAILED (no customer data logged)");
    }
    // Sequential await: never overlap sends; stop prevents another cycle.
    try {
      if (!stopped) await runConfiguredMailCycle();
    } catch {
      console.error("MAIL_WORKER_CYCLE_FAILED (no customer data logged)");
    }
    if (tick++ % 60 === 0) {
      purgeExpired();
      let retentionFailed = false;
      try {
        if (!stopped) await runConfiguredRetentionCycle(db());
      } catch {
        recordPrivacyCheckpointFailure(db());
        retentionFailed = true;
        console.error("RETENTION_ERASURE_FAILED (no customer data logged)");
      }
      try {
        const checkpoint = publishPrivacyCheckpoint(
          db(),
          privacyCheckpointDirectory(config().db, config().key),
          config().key,
        );
        const remote = configuredExternalLedger();
        if (remote) {
          finishErasure(db());
          const latest = readPrivacyCheckpoint(checkpoint.path, config().key);
          await remote.publish({
            sourceId: latest.sourceId,
            generatedAt: latest.generatedAt,
            rows: latest.rows,
            pending: false,
          });
        }
        if (retentionFailed) recordPrivacyCheckpointFailure(db());
      } catch {
        recordPrivacyCheckpointFailure(db());
        console.error("PRIVACY_CHECKPOINT_FAILED (no customer data logged)");
      }
    }
  } catch {
    console.error("WORKER_CYCLE_FAILED (no customer data logged)");
  }
  await new Promise((r) => setTimeout(r, 500));
}
