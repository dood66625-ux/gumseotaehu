import { chromium } from "playwright";
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import { writeFileSync } from "node:fs";
const origin = process.env.PERF_ORIGIN || "http://localhost:3000";
const browser = await chromium.launch();
const lab = [];
for (let i = 0; i < 5; i++) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage(),
    cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: 200000,
    uploadThroughput: 93750,
    connectionType: "cellular4g",
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    window.__lab = {
      lcp: 0,
      cls: 0,
      session: 0,
      last: 0,
      start: 0,
      interactions: {},
    };
    const m = window.__lab;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) m.lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue;
        if (e.startTime - m.last > 1000 || e.startTime - m.start > 5000) {
          m.session = 0;
          m.start = e.startTime;
        }
        m.session += e.value;
        m.last = e.startTime;
        m.cls = Math.max(m.cls, m.session);
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        if (e.interactionId)
          m.interactions[e.interactionId] = Math.max(
            m.interactions[e.interactionId] || 0,
            e.duration,
          );
    }).observe({ type: "event", buffered: true, durationThreshold: 16 });
  });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const bounds = await page
    .getByRole("link", { name: "내 사주 펼쳐보기" })
    .boundingBox();
  for (const name of [
    "무료로 어디까지 볼 수 있나요?",
    "출생시간을 몰라도 되나요?",
    "보고서를 잃어버리면 다시 결제해야 하나요?",
  ])
    await page.getByText(name, { exact: true }).click();
  await page.waitForTimeout(250);
  const result = await page.evaluate(() => {
    const m = window.__lab,
      events = Object.values(m.interactions);
    return {
      lcpMs: m.lcp,
      cls: m.cls,
      scriptedInpMs: events.length ? Math.max(...events) : null,
      interactionCount: events.length,
      resources: performance.getEntriesByType("resource").map((r) => ({
        name: new URL(r.name).pathname,
        bytes: r.transferSize,
        type: r.initiatorType,
      })),
      navigationTtfb:
        performance.getEntriesByType("navigation")[0].responseStart,
    };
  });
  result.ctaInitiallyInViewport = !!bounds && bounds.y + bounds.height <= 844;
  lab.push(result);
  await context.close();
}
await browser.close();
const lh = [];
const chrome = await launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  for (let i = 1; i <= 3; i++) {
    const r = await lighthouse(origin, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices"],
      formFactor: "mobile",
      screenEmulation: {
        mobile: true,
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
        disabled: false,
      },
      throttling: {
        rttMs: 150,
        throughputKbps: 1600,
        cpuSlowdownMultiplier: 4,
        requestLatencyMs: 150,
        downloadThroughputKbps: 1600,
        uploadThroughputKbps: 750,
      },
    });
    writeFileSync(`docs/lighthouse-${i}.json`, r.report);
    const a = r.lhr.audits;
    lh.push({
      performance: r.lhr.categories.performance.score,
      accessibility: r.lhr.categories.accessibility.score,
      bestPractices: r.lhr.categories["best-practices"].score,
      lcpMs: a["largest-contentful-paint"].numericValue,
      cls: a["cumulative-layout-shift"].numericValue,
      tbtMs: a["total-blocking-time"].numericValue,
      fcpMs: a["first-contentful-paint"].numericValue,
      transferBytes: a["total-byte-weight"].numericValue,
    });
  }
} finally {
  await chrome.kill();
}
const p75 = (xs) =>
  [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.75) - 1];
const summary = {
  date: new Date().toISOString(),
  environment:
    "Local production build; Chromium; 390x844; cold context; 150ms RTT/1.6Mbps/4x CPU. Lab samples, not field p75.",
  lab,
  lighthouse: lh,
  labP75: {
    lcpMs: p75(lab.map((x) => x.lcpMs)),
    cls: p75(lab.map((x) => x.cls)),
    scriptedInpMs: p75(
      lab.filter((x) => x.scriptedInpMs !== null).map((x) => x.scriptedInpMs),
    ),
  },
};
writeFileSync(
  "docs/performance-results.json",
  JSON.stringify(summary, null, 2),
);
console.log(
  JSON.stringify(
    {
      lighthouse: lh,
      labP75: summary.labP75,
      ctaInViewport: lab.every((x) => x.ctaInitiallyInViewport),
    },
    null,
    2,
  ),
);
