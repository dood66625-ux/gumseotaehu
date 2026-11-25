import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import { config } from "./config";
import { db } from "./db";
/** Only Caddy supplies this header; it overwrites any browser-supplied value. */
export function visitNetwork(req: NextRequest, now = Date.now()) {
  const ip = req.headers.get("x-gumseo-client-ip")?.trim();
  if (!ip || !isIP(ip)) return null;
  return createHmac("sha256", config().secret)
    .update("visit-network:" + Math.floor(now / (30 * 86400000)) + ":" + ip)
    .digest("hex");
}
export function excludeAdminVisit(req: NextRequest) {
  const key = visitNetwork(req);
  if (!key) return;
  const d = db();
  d.prepare(
    "INSERT INTO visit_exclusions VALUES(?,?) ON CONFLICT(network_key) DO UPDATE SET expires=excluded.expires",
  ).run(key, Date.now() + 30 * 86400000);
  d.prepare(
    "DELETE FROM visits WHERE id IN (SELECT visit_id FROM visit_networks WHERE network_key=?)",
  ).run(key);
}
