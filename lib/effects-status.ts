/** Configuration summary only; it does not prove credentials, delivery or launch readiness. */
export function externalEffectsStatus(
  env: Record<string, string | undefined> = process.env,
) {
  return [env.AI_WORKER_MODE, env.MAIL_WORKER_MODE, env.TOSS_PAYMENT_MODE].some(
    (mode) => !!mode && mode !== "disabled",
  )
    ? ("scoped-opt-in" as const)
    : ("disabled" as const);
}
