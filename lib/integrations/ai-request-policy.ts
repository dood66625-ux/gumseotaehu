/** Synthetic review can wait longer; customer work remains inside its existing lease. */
export type AiGenerationProfile = "standard" | "synthetic-review-v1";
export function aiRequestPolicy(profile: AiGenerationProfile = "standard") {
  if (profile === "standard")
    return { maxOutputTokens: 9000, timeoutMs: 45000 } as const;
  if (profile === "synthetic-review-v1")
    return { maxOutputTokens: 12000, timeoutMs: 120000 } as const;
  throw Error("AI_REQUEST_PROFILE_NOT_APPROVED");
}
