import { enrollLiveToss } from "../lib/toss-live-runtime";
try {
  if (process.argv.slice(2).join(" ") !== "--enroll --approve-live-payments")
    throw Error("TOSS_LIVE_ENROLL_ARGUMENTS_REQUIRED");
  console.log(JSON.stringify(enrollLiveToss()));
} catch (error) {
  const code =
    error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.message)
      ? error.message
      : "TOSS_LIVE_ENROLL_BLOCKED";
  console.error(code + " (no payment details logged)");
  process.exitCode = 1;
}
