/** Rich customer work uses a separately extended AI job lease; standard requests stay unchanged. */
export type AiGenerationProfile =
  "standard" | "synthetic-review-v1" | "rich-ko-v1";
export function aiRequestPolicy(profile: AiGenerationProfile = "standard") {
  if (profile === "standard")
    return { maxOutputTokens: 9000, timeoutMs: 45000 } as const;
  if (profile === "rich-ko-v1")
    return { maxOutputTokens: 20000, timeoutMs: 120000 } as const;
  if (profile === "synthetic-review-v1")
    return { maxOutputTokens: 12000, timeoutMs: 120000 } as const;
  throw Error("AI_REQUEST_PROFILE_NOT_APPROVED");
}
