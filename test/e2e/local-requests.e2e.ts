import { test, expect } from "@playwright/test";
import { collectExternalRequests } from "@test/helpers/external-requests";

test("local-request checks reject prefix-matching ports across pages", async ({
  page,
  context,
  baseURL,
}) => {
  const external = collectExternalRequests(context, baseURL);
  // Every probe is fulfilled in memory; no connection reaches another port.
  await context.route("**/*", (route) =>
    route.fulfill({ contentType: "text/plain", body: "origin probe" }),
  );
  const local = new URL("/origin-probe?case=local", baseURL);
  await page.goto(local.href);
  expect(external).toEqual([]);

  const other = new URL(local);
  other.port += "0";
  expect(other.origin).not.toBe(local.origin);
  const anotherPage = await context.newPage();
  await anotherPage.goto(other.href);
  expect(external).toContain(other.href);
});
