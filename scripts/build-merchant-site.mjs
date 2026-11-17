import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
// Public files only; no API key is needed or embedded in this domain build.
rmSync("public/merchant-review", { recursive: true, force: true });
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "scripts/build-public-preview.tsx"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PREVIEW_BASE_PATH: "",
      PREVIEW_OUTPUT: "public/merchant-review",
      PREVIEW_TOSS_TEST_REVIEW: "1",
      PREVIEW_TOSS_REVIEW_TARGET: "https://pay.gumseo.kr/",
    },
  },
);
process.exitCode = result.status ?? 1;
