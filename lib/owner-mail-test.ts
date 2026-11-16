/** Exactly one immutable owner-only mail attempt. No app DB, customer input or default sender. */
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  lstatSync,
  realpathSync,
  chmodSync,
  existsSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { encryptJson, decryptJson } from "./crypto";
import { business } from "./business";
import {
  blockedMailGateway,
  type MailGateway,
} from "./integrations/mail-gateway";
import type { MailEnvelope } from "./mail-content";
export const ownerMailProfile = {
  sender: "archive@mail.gumseo.kr",
  replyTo: business.email,
  accountScope: "gumseo-mail",
} as const;
export function ownerTestEnvelope(id: string): MailEnvelope {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("INVALID_OWNER_TEST_ID");
  const text =
    "금서태후 이메일 연결 확인\n\n발신 도메인 인증 후 보내는 테스트 메일입니다.\n메일이 도착했다면 원래 대화에서 수신 확인을 알려주세요.\n\n테스트 식별자: " +
    id;
  return {
    from: ownerMailProfile.sender,
    to: business.email,
    replyTo: business.email,
    subject: "[금서태후] 이메일 연결 확인",
    text,
    html:
      '<!doctype html><html lang="ko"><meta charset="utf-8"><body style="margin:0;padding:32px;background:#171511;color:#f5ead3;font:16px/1.8 system-ui"><h1 style="font-size:24px">금서태후 이메일 연결 확인</h1><p>발신 도메인 인증 후 보내는 테스트 메일입니다.</p><p>메일이 도착했다면 원래 대화에서 수신 확인을 알려주세요.</p><p style="font-size:12px">테스트 식별자: ' +
      id +
      "</p></body></html>",
  };
}
const digest = (m: MailEnvelope) =>
  createHash("sha256").update(JSON.stringify(m)).digest("hex");
export function openOwnerMailTest(directory: string, key: Buffer) {
  if (key.length !== 32) throw Error("OWNER_TEST_KEY_REQUIRED");
  const dir = resolve(directory);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (lstatSync(dir).isSymbolicLink() || realpathSync(dir) !== dir)
    throw Error("UNSAFE_OWNER_TEST_DIRECTORY");
  chmodSync(dir, 0o700);
  const file = join(dir, "attempt.sqlite");
  if (
    existsSync(file) &&
    (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink())
  )
    throw Error("UNSAFE_OWNER_TEST_FILE");
  const database = new DatabaseSync(file);
  chmodSync(file, 0o600);
  database.exec(
    "PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS attempt(slot INTEGER PRIMARY KEY CHECK(slot=1),id TEXT NOT NULL,envelope_enc TEXT NOT NULL,digest TEXT NOT NULL,state TEXT NOT NULL,created INTEGER NOT NULL,provider_id TEXT)",
  );
  function read() {
    const r = database.prepare("SELECT * FROM attempt WHERE slot=1").get();
    if (!r) throw Error("OWNER_TEST_NOT_PREPARED");
    const envelope = decryptJson<MailEnvelope>(String(r.envelope_enc), key);
    if (
      !isDeepStrictEqual(envelope, ownerTestEnvelope(String(r.id))) ||
      digest(envelope) !== r.digest
    )
      throw Error("OWNER_TEST_ENVELOPE_MISMATCH");
    return { row: r, envelope };
  }
  return {
    prepare() {
      database
        .prepare(
          "INSERT OR IGNORE INTO attempt VALUES(1,?,?,?,'prepared',?,NULL)",
        )
        .run(
          ...(() => {
            const id = randomUUID(),
              message = ownerTestEnvelope(id);
            return [
              id,
              encryptJson(message, key),
              digest(message),
              Date.now(),
            ] as const;
          })(),
        );
      const { row, envelope } = read();
      return {
        approvalHash: String(row.digest),
        state: String(row.state),
        envelope,
      };
    },
    async send(
      approvalHash: string,
      gateway: MailGateway = blockedMailGateway,
    ) {
      const { row, envelope } = read();
      if (approvalHash !== row.digest)
        throw Error("OWNER_TEST_APPROVAL_REQUIRED");
      if (row.state === "accepted")
        return { state: "accepted", alreadyAccepted: true };
      if (row.state !== "prepared")
        throw Error("OWNER_TEST_RECONCILIATION_REQUIRED");
      if (Date.now() - Number(row.created) > 86400000)
        throw Error("OWNER_TEST_DRAFT_EXPIRED");
      if (gateway.name === "disabled")
        throw Error("EXTERNAL_TRANSMISSION_NOT_APPROVED");
      const claim = database
        .prepare(
          "UPDATE attempt SET state='dispatched' WHERE slot=1 AND state='prepared'",
        )
        .run();
      if (!claim.changes) throw Error("OWNER_TEST_ALREADY_DISPATCHED");
      try {
        const ack = await gateway.send(envelope, "mail-" + row.id);
        if (
          ack.key !== "mail-" + row.id ||
          !/^[a-f0-9-]{36}$/.test(ack.providerId)
        )
          throw Error("OWNER_TEST_RESPONSE_MISMATCH");
        database
          .prepare(
            "UPDATE attempt SET state='accepted',provider_id=? WHERE slot=1 AND state='dispatched'",
          )
          .run(ack.providerId);
        return { state: "accepted", alreadyAccepted: false };
      } catch {
        database
          .prepare(
            "UPDATE attempt SET state='uncertain' WHERE slot=1 AND state='dispatched'",
          )
          .run();
        throw Error("OWNER_TEST_RECONCILIATION_REQUIRED");
      }
    },
    status() {
      const { row } = read();
      return { state: String(row.state), providerIdKnown: !!row.provider_id };
    },
    close() {
      if (database.isOpen) database.close();
    },
  };
}
