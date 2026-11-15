/** Next may copy env files independently of tracing exclusions. Never ship that copy. */
import {
  existsSync,
  lstatSync,
  realpathSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { resolve, join } from "node:path";
const root = resolve(".next/standalone");
if (
  !existsSync(root) ||
  lstatSync(root).isSymbolicLink() ||
  realpathSync(root) !== root
)
  throw Error("STANDALONE_DIRECTORY_REQUIRED");
let removed = 0;
function clean(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (
      /^\.env(?:\.|$)/.test(item.name) ||
      (dir === root && item.name === "var")
    ) {
      rmSync(path, { recursive: true, force: true });
      removed++;
    } else if (item.isDirectory()) clean(path);
  }
}
clean(root);
console.log(
  `Standalone sanitized: ${removed} private env/data paths removed; runtime secrets must be injected.`,
);
