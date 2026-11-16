// Read-only diagnosis of the fixed test order. Never approve/cancel or print keys.
import { DatabaseSync } from 'node:sqlite';
const result = {};
try {
  if (!/^test_gsk_[A-Za-z0-9_]{1,480}$/.test(process.env.TOSS_TEST_SECRET_KEY || '')) throw Error('TEST_KEYS_REQUIRED');
  const database = new DatabaseSync('/app/var/toss-sandbox/journey.sqlite', { readOnly: true });
  let attempt;
  try {
    attempt = database.prepare('SELECT a.payment_key,a.state,a.failures,a.last_error,o.id,o.amount,o.created FROM toss_attempts a JOIN orders o ON o.id=a.order_id ORDER BY a.created DESC LIMIT 1').get();
  } finally { database.close(); }
  if (!attempt) {
    console.log(JSON.stringify({ attemptRecorded: false }));
  } else {
    result.attemptRecorded = true;
    result.localState = ['uncertain','review','verified','processing'].includes(attempt.state) ? attempt.state : 'other';
    result.failures = Number(attempt.failures);
    if (typeof attempt.payment_key !== 'string' || attempt.payment_key.length > 200) throw Error('INVALID_BOUND_TEST_PAYMENT');
    const response = await fetch('https://api.tosspayments.com/v1/payments/' + encodeURIComponent(attempt.payment_key), {
      headers: { Authorization: 'Basic ' + Buffer.from(process.env.TOSS_TEST_SECRET_KEY + ':').toString('base64') },
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    result.httpStatus = response.status;
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.byteLength;
        if (size > 256 * 1024) { await reader.cancel(); throw Error('RESPONSE_TOO_LARGE'); }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!response.ok) {
      result.providerCode = /^[A-Z0-9_]{1,80}$/.test(data.code || '') ? data.code : 'unclassified';
    } else {
      result.providerState = /^[A-Z_]{1,40}$/.test(data.status || '') ? data.status : 'unclassified';
      result.merchantMatches = data.mId === process.env.TOSS_TEST_MID?.trim();
      result.merchantId = /^[A-Za-z0-9_-]{1,100}$/.test(data.mId || '') ? data.mId : 'unclassified';
      result.orderMatches = data.orderId === attempt.id;
      result.amountMatches = data.totalAmount === attempt.amount;
      result.currencyMatches = data.currency === 'KRW';
      result.typeMatches = data.type === 'NORMAL';
      result.hasCancelList = Array.isArray(data.cancels) || data.cancels == null;
      result.validApprovalTime = typeof data.approvedAt === 'string' && Number.isFinite(Date.parse(data.approvedAt));
      result.approvalWithinOrderWindow = result.validApprovalTime && Date.parse(data.approvedAt) >= attempt.created - 60000 && Date.parse(data.approvedAt) <= Date.now() + 60000;
    }
    console.log(JSON.stringify(result));
  }
} catch {
  console.log(JSON.stringify({ ...result, diagnosticFailed: true }));
  process.exitCode = 1;
}
