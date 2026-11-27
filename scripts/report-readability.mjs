/** Self-contained browser function: inspect detail-button contrast and brief text on every paper-gradient stop. */
export function measureReportEvidence(articles) {
  const rgb = (value) => {
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) throw Error("COLOR_UNRESOLVED");
    return m[1].split(",").slice(0, 3).map(Number);
  };
  const luminance = (color) =>
    color
      .map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => {
    const x = luminance(a),
      y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  let minimum = Infinity,
    minFont = Infinity;
  for (const article of articles) {
    const backgrounds = [
      ...getComputedStyle(article).backgroundImage.matchAll(/rgba?\([^)]+\)/g),
    ].map((m) => rgb(m[0]));
    if (!backgrounds.length) throw Error("PAPER_BACKGROUND_UNRESOLVED");
    const targets = article.querySelectorAll(".reading-inline-full p");
    if (!article.querySelector(".reading-inline-full"))
      throw Error("REPORT_INLINE_READING_MISSING");
    if (article.querySelector(".chapter-evidence"))
      throw Error("REMOVED_EVIDENCE_REMAINS");
    for (const target of targets) {
      const style = getComputedStyle(target);
      for (const background of target.matches("button")
        ? [rgb(style.backgroundColor)]
        : backgrounds)
        minimum = Math.min(minimum, contrast(rgb(style.color), background));
      minFont = Math.min(minFont, parseFloat(style.fontSize));
    }
  }
  return { minimumContrast: minimum, minimumEvidenceFontPx: minFont };
}
