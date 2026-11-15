import { db } from "../lib/db";
import { config } from "../lib/config";
import {
  privacyCheckpointDirectory,
  publishPrivacyCheckpoint,
} from "../lib/privacy-checkpoint";
const cfg = config();
const directory =
  process.argv[2] || privacyCheckpointDirectory(cfg.db, cfg.key);
try {
  const result = publishPrivacyCheckpoint(db(), directory, cfg.key);
  console.log(JSON.stringify(result));
} catch {
  console.error(
    "PRIVACY_CHECKPOINT_FAILED (details suppressed; no external upload)",
  );
  process.exitCode = 1;
}
