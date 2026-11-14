import { expect, it } from "vitest";
import { readJsonObject } from "../lib/http-body";
it("bounds JSON while streaming without a content-length header", async () => {
  let canceled = false;
  const body = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode("x".repeat(17000)));
    },
    cancel() {
      canceled = true;
    },
  });
  const request = new Request("http://local.invalid", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
  await expect(readJsonObject(request)).rejects.toMatchObject({ status: 413 });
  expect(canceled).toBe(true);
});
it("rejects array/null/malformed JSON and supports valid fragmented objects", async () => {
  for (const body of ["[]", "null", "{bad"])
    await expect(
      readJsonObject(
        new Request("http://local.invalid", { method: "POST", body }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  const chunks = ['{"ok":', "true}"];
  const body = new ReadableStream({
    pull(c) {
      const part = chunks.shift();
      if (part) c.enqueue(new TextEncoder().encode(part));
      else c.close();
    },
  });
  await expect(
    readJsonObject(
      new Request("http://local.invalid", {
        method: "POST",
        body,
        duplex: "half",
      } as RequestInit),
    ),
  ).resolves.toEqual({ ok: true });
});
it("does not trust an understated content-length", async () => {
  const req = new Request("http://local.invalid", {
    method: "POST",
    headers: { "content-length": "1" },
    body: "x".repeat(17000),
  });
  await expect(readJsonObject(req)).rejects.toMatchObject({ status: 413 });
});
