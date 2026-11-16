/** Default is offline. --dns explicitly opts into public DNS reads only. Never sends mail. */
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { Resolver } from "node:dns/promises";
import { checkMailDns, mailSetupStatus } from "../lib/mail-setup";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
try {
  const args = process.argv.slice(2);
  if (args.length === 0)
    console.log(
      JSON.stringify(
        { mode: "offline", ...mailSetupStatus(process.env) },
        null,
        2,
      ),
    );
  else if (args.length === 2 && args[0] === "--dns") {
    const stat = lstatSync(args[1]);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32768)
      throw Error("INVALID_PLAN_FILE");
    const plan = JSON.parse(readFileSync(args[1], "utf8"));
    const resolver = new Resolver({ timeout: 1500, tries: 1 });
    const timer = setTimeout(() => resolver.cancel(), 5000);
    try {
      const result = await checkMailDns(plan, {
        txt: (n) => resolver.resolveTxt(n),
        mx: (n) => resolver.resolveMx(n),
        cname: (n) => resolver.resolveCname(n),
      });
      console.log(
        JSON.stringify({ mode: "dns-read-only", ...result }, null, 2),
      );
      if (!result.dnsMatchesPlan) process.exitCode = 2;
    } finally {
      clearTimeout(timer);
    }
  } else throw Error("USAGE");
} catch {
  console.error(
    "MAIL_SETUP_CHECK_FAILED: use npm run mail:check [-- --dns <provider-records.json>]. Values suppressed; no email sent.",
  );
  process.exitCode = 1;
}
