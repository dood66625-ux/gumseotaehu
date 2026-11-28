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
  // Reader-age examples are private authoring instructions, never customer framing.
  const authoringIntro =
    /(?:(?:12\s*(?:살|세)|열두\s*살)\s*(?:아이|어린이|독자|학생)?|초등학생)(?:도|가|에게)?\s*(?:쉽게\s*)?(?:알아\s*(?:듣기|들을\s*수\s*(?:있게|있도록|있는)|들을)|이해\s*(?:하기|할\s*수\s*(?:있게|있도록|있는)|할))\s*(?:아주\s*)?(?:(?:쉽게|쉬운\s*(?:말|표현)(?:로|으로))\s*)?(?:설명하(?:자면|면)|풀어\s*(?:말하(?:자면|면)|보(?:자면|면))|말하(?:자면|면))/g;
  let result = text.replace(authoringIntro, "쉽게 설명하자면");
  for (const [from, to] of endings) result = result.split(from).join(to);
  return result;
}
