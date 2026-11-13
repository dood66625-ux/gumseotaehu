import { workOnce, reconcileRefunds, purgeExpired } from "../lib/service";
console.log("Local durable worker started. External effects disabled.");
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
    if (tick++ % 60 === 0) purgeExpired();
  } catch {
    console.error("WORKER_CYCLE_FAILED (no customer data logged)");
  }
  await new Promise((r) => setTimeout(r, 500));
}
