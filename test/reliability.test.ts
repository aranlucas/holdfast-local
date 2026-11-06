import { required } from "@test/helpers/required";
import { expect, it } from "vitest";
import JSZip from "jszip";
import { blankPurchase } from "@/model";
import { exportBackup, importBackup } from "@/backup";
import { exportPacket, packetHTML } from "@/exports";

it("exports proof after restoring evidence extension metadata", async () => {
  const purchase = {
    ...blankPurchase(),
    merchant: "Extension shop",
    item: "Extension proof",
    purchaseDate: "2026-10-02",
  };

  Object.assign(purchase.evidence, { futureField: null });
  const parts = await exportBackup([purchase]);
  const [restored] = await importBackup(parts.map((part) => new File([part.blob], part.name)));
  expect(restored.evidence).toHaveProperty("futureField", null);
  expect(packetHTML(restored)).toContain("Extension proof");
  const zip = await JSZip.loadAsync(await (await exportPacket(restored)).arrayBuffer());
  expect(await zip.file("proof-packet.html")?.async("string")).toContain("Extension proof");

  const metadata: unknown = JSON.parse(
    await required(zip.file("purchase.json"), "Expected packet metadata").async("string"),
  );

  expect(metadata).toHaveProperty("evidence.futureField", null);
});
