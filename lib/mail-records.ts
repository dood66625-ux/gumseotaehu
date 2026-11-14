import { z } from "zod";
import { all, one, run } from "./db";
import { hash, open, seal } from "./security";
const email = z.string().trim().toLowerCase().email().max(254);
/** Resolve only authenticated/transactional records; never guess a recipient from a hash. */
export function contactFor(emailHash: string): string | null {
  const sources = [
    () =>
      all(
        "SELECT email_enc FROM orders WHERE email_hash=? ORDER BY created DESC LIMIT 5",
        emailHash,
      ),
    () =>
      all(
        "SELECT email_enc FROM challenges WHERE email_hash=? ORDER BY expires DESC LIMIT 5",
        emailHash,
      ),
    () =>
      all(
        "SELECT c.email_enc FROM ticket_contacts c JOIN tickets t ON t.id=c.ticket_id WHERE t.email_hash=? ORDER BY t.created DESC LIMIT 5",
        emailHash,
      ),
    () =>
      all(
        "SELECT new_email_enc AS email_enc FROM email_changes WHERE new_hash=? ORDER BY expires DESC LIMIT 5",
        emailHash,
      ),
  ];
  for (const source of sources)
    for (const row of source()) {
      try {
        const value = email.parse(open(row.email_enc));
        if (hash(value) === emailHash) return value;
      } catch {
        /* No plaintext or decrypt errors logged. */
      }
    }
  return null;
}
export function snapshotMailRecipient(
  outboxId: string,
  emailHash: string,
  payload: unknown,
  explicit?: string,
) {
  const recipient = explicit ? email.parse(explicit) : contactFor(emailHash);
  if (recipient && hash(recipient) !== emailHash)
    throw Error("MAIL_RECIPIENT_MISMATCH");
  const template =
    typeof payload === "object" &&
    payload !== null &&
    "template" in payload &&
    typeof payload.template === "string"
      ? payload.template.slice(0, 40)
      : "unknown";
  run(
    "INSERT INTO mail_queue(outbox_id,recipient_enc,message_enc,template,state,last_error,updated) VALUES(?,?,?,?,?,?,?)",
    outboxId,
    seal(recipient),
    seal(null),
    template,
    recipient ? "local_only" : "blocked",
    recipient ? null : "MISSING_CONTACT",
    Date.now(),
  );
}
export function snapshotTicketContact(ticketId: string, emailHash: string) {
  const recipient = contactFor(emailHash);
  run("INSERT INTO ticket_contacts VALUES(?,?)", ticketId, seal(recipient));
}
