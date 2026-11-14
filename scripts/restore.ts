import { config } from "../lib/config";
import { restoreEncryptedBackup } from "../lib/backup";
const [source, target, ...extra] = process.argv.slice(2);
if (!source || !target || extra.length)
  throw Error(
    "Usage: npm run restore -- <archive.gsb> <NEW offline database path>",
  );
restoreEncryptedBackup(source, target, config().key);
console.log(
  "Restored database integrity verified. Original database unchanged. No server started or external request made.",
);
