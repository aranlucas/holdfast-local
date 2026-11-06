import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Protect the durable cabinet round trip, including user edits and downloaded backup bytes.
test("edited purchase survives reload, backup, clear and restore", async ({
  app,
  screen,
  browser,
}) => {
  await app.open("/");
  await screen.getByRole("button", "Try a sample shelf").tap();
  await screen.getByRole("button", /^Open Studio wireless headphones/).tap();
  await screen.getByLabel("Condition / preparation notes").fill("Synthetic reliability notes");
  await screen.getByLabel("Serial number", { exact: true }).fill("AUDIT-123");
  await screen.getByRole("button", "Save notes", { exact: true }).tap();
  await expect(screen.getByRole("button", "Notes saved")).toBeVisible();
  await screen.getByRole("button", "Close dialog").tap();
  await app.open("/");
  await screen.getByRole("button", /^Open Studio wireless headphones/).tap();
  await expect(screen.getByLabel("Serial number", { exact: true })).toHaveValue("AUDIT-123");
  await expect(screen.getByLabel("Condition / preparation notes")).toHaveValue(
    "Synthetic reliability notes",
  );
  await screen.getByRole("button", "Close dialog").tap();
  await screen.getByRole("button", "My device", { exact: true }).tap();

  const backup = await browser.waitForDownload(() =>
    screen.getByRole("button", "Download device backup").tap(),
  );

  await screen.getByRole("button", "Clear this device", { exact: true }).tap();
  await screen.getByRole("button", "Yes, clear this device", { exact: true }).tap();
  await expect(screen.getByText("This device cabinet is now empty.")).toBeVisible();
  await browser.locator('input[aria-label="Backup file"]').setInputFiles(backup.absolutePath);
  await expect(screen.getByText("Restored 4 purchases.", { exact: false })).toBeVisible();
  await app.open("/");
  await screen.getByRole("button", /^Open Studio wireless headphones/).tap();
  await expect(screen.getByLabel("Serial number", { exact: true })).toHaveValue("AUDIT-123");
  await expect(screen.getByLabel("Condition / preparation notes")).toHaveValue(
    "Synthetic reliability notes",
  );
});
