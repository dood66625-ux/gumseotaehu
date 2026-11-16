import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { config } from "../lib/config";
import { openOwnerMailTest } from "../lib/owner-mail-test";
import { createResendMailGateway } from "../lib/integrations/resend-mail";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
let ledger: ReturnType<typeof openOwnerMailTest> | undefined;
try {
  const cfg = config(),
    args = process.argv.slice(2);
  ledger = openOwnerMailTest("var/owner-mail-test", cfg.key);
  if (args.length === 1 && args[0] === "--prepare") {
    const draft = ledger.prepare(),
      file = "var/owner-mail-test/preview.html";
    const html = draft.envelope.html.replace(
      '<meta charset="utf-8">',
      '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">',
    );
    if (existsSync(file)) {
      if (readFileSync(file, "utf8") !== html)
        throw Error("OWNER_TEST_PREVIEW_CHANGED");
    } else writeFileSync(file, html, { flag: "wx", mode: 0o600 });
    console.log(
      JSON.stringify({
        state: draft.state,
        from: draft.envelope.from,
        to: draft.envelope.to,
        subject: draft.envelope.subject,
        approvalHash: draft.approvalHash,
        preview: file,
        mailSent: false,
      }),
    );
  } else if (args.length === 1 && args[0] === "--status")
    console.log(JSON.stringify(ledger.status()));
  else if (
    args.length === 3 &&
    args[0] === "--send" &&
    args[1] === "--approve"
  ) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw Error("RESEND_CREDENTIAL_REQUIRED");
    console.log(
      JSON.stringify(
        await ledger.send(
          args[2],
          createResendMailGateway({
            apiKey: key,
            accountScope: "gumseo-mail",
            enabled: true,
          }),
        ),
      ),
    );
  } else throw Error("OWNER_TEST_USAGE");
} catch (error) {
  const code =
    error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "OWNER_TEST_FAILED";
  console.error(code + " (details suppressed; no automatic resend)");
  process.exitCode = 1;
} finally {
  ledger?.close();
}
