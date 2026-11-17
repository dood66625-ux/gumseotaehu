import { expect, test } from "@playwright/test";
import { buildSync } from "esbuild";
// Real hook in a browser-only fixture; this route is intercepted by the test, never shipped.
const fixture = buildSync({
  stdin: {
    contents: `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useLoad} from './components/client';
function Fixture(){const [path,setPath]=useState('readings/a');const {data,error,load}=useLoad(path);
return <><button onClick={()=>setPath('readings/b')}>Switch B</button><button onClick={load}>Reload</button><output data-testid="data">{data?.id??'loading'}</output><p role="alert">{error}</p></>;}
createRoot(document.getElementById('root')).render(<Fixture/>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  define: { "process.env.NODE_ENV": '"production"' },
}).outputFiles[0].text;
async function setup(page: import("@playwright/test").Page) {
  await page.route("**/synthetic-load-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body><div id="root"></div><script>${fixture}</script></body></html>`,
    }),
  );
}

test("late success from previous path cannot overwrite newer data", async ({
  page,
}) => {
  await setup(page);
  let old: import("@playwright/test").Route | undefined;
  await page.route("**/api/readings/a", (route) => {
    old = route;
  });
  await page.route("**/api/readings/b", (route) =>
    route.fulfill({ json: { id: "B" } }),
  );
  await page.goto("/synthetic-load-fixture");
  await expect.poll(() => !!old).toBe(true);
  await page.getByRole("button", { name: "Switch B" }).click();
  await expect(page.getByTestId("data")).toHaveText("B");
  await old!.fulfill({ json: { id: "A" } });
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("data")).toHaveText("B");
});

test("path change hides previous content while new request is pending", async ({
  page,
}) => {
  await setup(page);
  let next: import("@playwright/test").Route | undefined;
  await page.route("**/api/readings/a", (route) =>
    route.fulfill({ json: { id: "A" } }),
  );
  await page.route("**/api/readings/b", (route) => {
    next = route;
  });
  await page.goto("/synthetic-load-fixture");
  await expect(page.getByTestId("data")).toHaveText("A");
  await page.getByRole("button", { name: "Switch B" }).click();
  await expect(page.getByTestId("data")).toHaveText("loading");
  await expect.poll(() => !!next).toBe(true);
  await next!.fulfill({ json: { id: "B" } });
  await expect(page.getByTestId("data")).toHaveText("B");
});

test("old request failure cannot replace a successful manual refresh", async ({
  page,
}) => {
  await setup(page);
  let old: import("@playwright/test").Route | undefined,
    calls = 0;
  await page.route("**/api/readings/a", (route) => {
    calls++;
    if (calls === 1) {
      old = route;
      return;
    }
    return route.fulfill({ json: { id: "fresh" } });
  });
  await page.goto("/synthetic-load-fixture");
  await expect.poll(() => !!old).toBe(true);
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(page.getByTestId("data")).toHaveText("fresh");
  await old!.fulfill({ status: 503, json: { error: "old synthetic failure" } });
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("data")).toHaveText("fresh");
  await expect(page.getByRole("alert")).toHaveText("");
});

test("old success cannot clear the current path error", async ({ page }) => {
  await setup(page);
  let old: import("@playwright/test").Route | undefined;
  await page.route("**/api/readings/a", (route) => {
    old = route;
  });
  await page.route("**/api/readings/b", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "current synthetic failure" },
    }),
  );
  await page.goto("/synthetic-load-fixture");
  await expect.poll(() => !!old).toBe(true);
  await page.getByRole("button", { name: "Switch B" }).click();
  await expect(page.getByRole("alert")).toHaveText("current synthetic failure");
  await old!.fulfill({ json: { id: "A" } });
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("alert")).toHaveText("current synthetic failure");
  await expect(page.getByTestId("data")).toHaveText("loading");
});
