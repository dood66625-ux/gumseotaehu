import {
  publishPrivacyCheckpoint,
  privacyCheckpointDirectory,
} from "../lib/privacy-checkpoint";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { config } from "../lib/config";
import { createEncryptedBackup } from "../lib/backup";
const path = "var/backups/geumseo-" + Date.now() + "-" + randomUUID() + ".gsb";
const checkpoint = publishPrivacyCheckpoint(
  db(),
  privacyCheckpointDirectory(config().db, config().key),
  config().key,
);
await createEncryptedBackup(db(), path, config().key);
console.log(
  "Encrypted consistent backup created:",
  path,
  "Local deletion checkpoint:",
  checkpoint.path,
  "Keep DATA_KEY separately; no external upload.",
);
