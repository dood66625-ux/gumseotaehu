import { expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
it.each(["regular", "bold"])(
  "includes every modern Korean syllable in the bundled %s font",
  (weight) => {
    const font = fontkit.openSync(`public/korean-reading-${weight}.woff2`);
    const missing = [];
    for (let n = 0xac00; n <= 0xd7a3; n++)
      if (!font.hasGlyphForCodePoint(n)) missing.push(n);
    expect(missing).toEqual([]);
  },
);
