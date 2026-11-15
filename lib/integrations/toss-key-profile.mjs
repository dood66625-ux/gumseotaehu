/** Prefix/shape checks only; never claim merchant pairing or key validity from this check. */
export function tossTestSecretKind(secret) {
  if (typeof secret !== "string" || secret.length > 512)
    throw Error("ONLY_TOSS_TEST_KEYS_ALLOWED");
  if (/^test_gsk_[A-Za-z0-9_]+$/.test(secret)) return "widget";
  if (/^test_sk_[A-Za-z0-9_]+$/.test(secret)) return "individual";
  throw Error("ONLY_TOSS_TEST_KEYS_ALLOWED");
}
export function tossTestKeyPair(client, secret) {
  const kind = tossTestSecretKind(secret);
  if (typeof client !== "string" || client.length > 512)
    throw Error("TOSS_KEY_FAMILY_MISMATCH");
  if (
    !(
      kind === "widget" ? /^test_gck_[A-Za-z0-9_]+$/ : /^test_ck_[A-Za-z0-9_]+$/
    ).test(client)
  )
    throw Error("TOSS_KEY_FAMILY_MISMATCH");
  return kind;
}
