/** Display prose only. Never rewrites saved calculation evidence or policy documents. */
export function taehouNarration(text: string) {
  const endings: [string, string][] = [
    ["아닙니다", "아니니라"],
    ["않습니다", "않느니라"],
    ["없습니다", "없느니라"],
    ["있습니다", "있느니라"],
    ["가리킵니다", "가리키느니라"],
    ["같습니다", "같구나"],
    ["됩니다", "되느니라"],
    ["합니다", "하느니라"],
    ["입니다", "이니라"],
  ];
  let result = text;
  for (const [from, to] of endings) result = result.split(from).join(to);
  return result;
}
