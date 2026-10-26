import type { BrowserContext } from "@playwright/test";

/** Collect requests outside this test's app origin, preserving inline/blob fixtures. */
export function collectExternalRequests(context: BrowserContext, baseURL: string | undefined) {
  if (baseURL === undefined) {
    throw new Error("Local-request checks require Playwright's baseURL.");
  }

  const origin = new URL(baseURL).origin;
  const external: string[] = [];

  context.on("request", (request) => {
    const url = new URL(request.url());

    if (url.origin !== origin && url.protocol !== "blob:" && url.protocol !== "data:") {
      external.push(request.url());
    }
  });

  return external;
}
