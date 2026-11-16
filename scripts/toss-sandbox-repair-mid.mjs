// One observed synthetic order only. Independent GET evidence before rebinding MID.
import { DatabaseSync } from 'node:sqlite';
const orderId = '22bf49c5-a032-46a5-a472-214412ec63f1';
const oldMid = 'q_gdood65qf7', testMid = 'tq_gdood65qf7';
let db;
try {
  if (!/^test_gsk_[A-Za-z0-9_]{1,480}$/.test(process.env.TOSS_TEST_SECRET_KEY || '') || process.env.APP_MODE !== 'local' || process.env.EXTERNAL_EFFECTS !== 'disabled') throw Error();
  db = new DatabaseSync('/app/var/toss-sandbox/journey.sqlite');
  const row = db.prepare('SELECT a.payment_key,a.merchant_id,o.amount,o.payment_status FROM toss_attempts a JOIN orders o ON o.id=a.order_id WHERE o.id=?').get(orderId);
  if (!row || row.amount !== 22000 || row.payment_status !== 'pending' || row.merchant_id !== oldMid || typeof row.payment_key !== 'string' || row.payment_key.length > 200) throw Error();
  const response = await fetch('https://api.tosspayments.com/v1/payments/' + encodeURIComponent(row.payment_key), { headers: { Authorization: 'Basic ' + Buffer.from(process.env.TOSS_TEST_SECRET_KEY + ':').toString('base64') }, redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error();
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength; if (size > 256 * 1024) { await reader.cancel(); throw Error(); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const evidence = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (evidence.mId !== testMid || evidence.orderId !== orderId || evidence.paymentKey !== row.payment_key || evidence.totalAmount !== 22000 || evidence.status !== 'DONE' || evidence.currency !== 'KRW' || evidence.type !== 'NORMAL') throw Error();
  db.exec('BEGIN IMMEDIATE');
  try {
    if (db.prepare('SELECT 1 FROM pg_ledger WHERE order_id=?').get(orderId)) throw Error();
    const changed = db.prepare("UPDATE toss_attempts SET merchant_id=?,needs_check=1,next_check=0,failures=0,generation=generation+1,lease_until=0,updated=? WHERE order_id=? AND merchant_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND amount=22000 AND payment_status='pending')").run(testMid, Date.now(), orderId, oldMid, orderId);
    if (changed.changes !== 1) throw Error();
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  console.log('SYNTHETIC_TEST_MID_REBOUND_AFTER_INDEPENDENT_LOOKUP; payment remains pending until ordinary verification');
} catch {
  console.error('TEST_MID_REPAIR_REFUSED; keys and payment details suppressed'); process.exitCode = 1;
} finally { db?.close(); }
