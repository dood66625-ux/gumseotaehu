/** Encrypted, conditional external ledger. No network calls unless explicitly configured. */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { z } from "zod";
import { encryptJson, decryptJson } from "./crypto";
import {
  encodeDeletions,
  deletionIdentity,
  decodeDeletions,
  type Deletions,
} from "./deletion-manifest";
import { config } from "./config";
const schema = z
  .object({
    sourceId: z.string().uuid(),
    generatedAt: z.number().int().nonnegative(),
    rows: z
      .array(
        z.object({
          orderId: z.string().uuid(),
          deletedAt: z.number().int().nonnegative(),
          scope: z.enum(["full", "dispute"]).optional(),
        }),
      )
      .max(100000),
    pending: z.boolean().default(false),
  })
  .strict();
export type ExternalDeletionState = z.infer<typeof schema>;
const proof = new AsyncLocalStorage<{ sourceId: string; digest: string }>();
const digest = (rows: Deletions) =>
  createHash("sha256").update(JSON.stringify(rows)).digest("hex");
export class ExternalDeletionLedger {
  constructor(
    private endpoint: string,
    private token: string,
    private key: Buffer,
    private send: typeof fetch = fetch,
  ) {
    const u = new URL(endpoint);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.hash ||
      u.search ||
      !/^[A-Za-z0-9._~-]{32,256}$/.test(token) ||
      key.length !== 32
    )
      throw Error("EXTERNAL_LEDGER_CONFIG_REQUIRED");
  }
  private async request(method: "GET" | "PUT", body?: string, etag?: string) {
    const response = await this.send(this.endpoint, {
      method,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: "Bearer " + this.token,
        ...(method === "PUT"
          ? {
              "Content-Type": "application/json",
              ...(etag ? { "If-Match": etag } : { "If-None-Match": "*" }),
            }
          : {}),
      },
      body,
    });
    if (response.status === 404 && method === "GET") return null;
    if (!response.ok) throw Error("EXTERNAL_LEDGER_UNAVAILABLE");
    if (method === "PUT") return null;
    const tag = response.headers.get("etag");
    if (!tag || !/^"[A-Za-z0-9_.:-]{1,128}"$/.test(tag))
      throw Error("EXTERNAL_LEDGER_VERSION_REQUIRED");
    const reader = response.body?.getReader();
    if (!reader) throw Error("EXTERNAL_LEDGER_INVALID_RESPONSE");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.length;
        if (bytes > 24 * 1024 * 1024) {
          await reader.cancel();
          throw Error("EXTERNAL_LEDGER_TOO_LARGE");
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const outer = z
      .object({ version: z.literal(1), ciphertext: z.string() })
      .strict()
      .parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    return {
      etag: tag,
      state: schema.parse(decryptJson(outer.ciphertext, this.key)),
    };
  }
  async latest(sourceId: string) {
    const result = await this.request("GET");
    if (!result || result.state.sourceId !== sourceId)
      throw Error("EXTERNAL_LEDGER_SOURCE_MISMATCH");
    return result;
  }
  async publish(input: ExternalDeletionState) {
    const next = schema.parse(input);
    decodeDeletions(encodeDeletions(next.rows, this.key), this.key);
    if (
      next.generatedAt > Date.now() + 30000 ||
      next.rows.some((r) => r.deletedAt > next.generatedAt) ||
      new Set(next.rows.map(deletionIdentity)).size !== next.rows.length
    )
      throw Error("EXTERNAL_LEDGER_INVALID_TIME_OR_ROWS");
    const previous = await this.request("GET");
    if (previous) {
      if (
        previous.state.sourceId !== next.sourceId ||
        next.generatedAt < previous.state.generatedAt
      )
        throw Error("EXTERNAL_LEDGER_ROLLBACK_REFUSED");
      const byId = new Map(next.rows.map((r) => [deletionIdentity(r), r]));
      if (
        previous.state.rows.some((old) => {
          const n = byId.get(deletionIdentity(old));
          return (
            !n ||
            n.deletedAt < old.deletedAt ||
            (old.scope === "full" && n.scope !== "full")
          );
        })
      )
        throw Error("EXTERNAL_LEDGER_HISTORY_REGRESSION");
      if (
        previous.state.pending &&
        !next.pending &&
        digest(previous.state.rows) !== digest(next.rows)
      )
        throw Error("EXTERNAL_LEDGER_PENDING_REQUIRES_REVIEW");
      if (JSON.stringify(previous.state) === JSON.stringify(next)) return;
    }
    await this.request(
      "PUT",
      JSON.stringify({ version: 1, ciphertext: encryptJson(next, this.key) }),
      previous?.etag,
    );
    const verified = await this.latest(next.sourceId);
    if (JSON.stringify(verified.state) !== JSON.stringify(next))
      throw Error("EXTERNAL_LEDGER_READBACK_MISMATCH");
  }
  async verify(sourceId: string, rows: Deletions) {
    const { state } = await this.latest(sourceId);
    if (
      state.pending ||
      state.generatedAt > Date.now() + 30000 ||
      Date.now() - state.generatedAt > 86400000 ||
      digest(state.rows) !== digest(rows)
    )
      throw Error("EXTERNAL_LEDGER_RESTORE_BLOCKED");
    return state;
  }
}
export function configuredExternalLedger() {
  const mode = process.env.PRIVACY_EXTERNAL_LEDGER_MODE;
  if (!mode || mode === "disabled") return null;
  if (
    mode !== "conditional-https" ||
    process.env.PRIVACY_EXTERNAL_LEDGER_APPROVAL !==
      "encrypted-deletion-ledger-approved"
  )
    throw Error("EXTERNAL_LEDGER_NOT_APPROVED");
  return new ExternalDeletionLedger(
    process.env.PRIVACY_EXTERNAL_LEDGER_URL ?? "",
    process.env.PRIVACY_EXTERNAL_LEDGER_TOKEN ?? "",
    config().key,
  );
}
export async function withExternalDeletionProof<T>(
  sourceId: string,
  rows: Deletions,
  action: () => T | Promise<T>,
) {
  const remote = configuredExternalLedger();
  if (remote) await remote.verify(sourceId, rows);
  const result = await proof.run({ sourceId, digest: digest(rows) }, action);
  if (remote) await remote.verify(sourceId, rows);
  return result;
}
export function requireExternalDeletionProof(
  sourceId: string | undefined,
  rows: Deletions,
) {
  if (
    !process.env.PRIVACY_EXTERNAL_LEDGER_MODE ||
    process.env.PRIVACY_EXTERNAL_LEDGER_MODE === "disabled"
  )
    return;
  // Configuration and proof must both be valid; legacy/manual restore cannot bypass registration.
  configuredExternalLedger();
  const current = proof.getStore();
  if (
    !sourceId ||
    !current ||
    current.sourceId !== sourceId ||
    current.digest !== digest(rows)
  )
    throw Error("EXTERNAL_DELETION_PROOF_REQUIRED");
}
