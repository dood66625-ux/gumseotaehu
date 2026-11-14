import { launchReadiness } from "../lib/readiness";
const report = launchReadiness();
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--expect-blocked")) {
  if (report.launchReady || report.externalEffectsEnabled) process.exitCode = 1;
} else process.exitCode = report.launchReady ? 0 : 1;
