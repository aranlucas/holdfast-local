import { openDB } from "idb";
import type { DBSchema } from "idb";
import type { Purchase } from "./model";
interface HoldfastDB extends DBSchema {
  purchases: { key: string; value: Purchase };
}
const DATABASE = "holdfast-v1";
const db = () =>
  openDB<HoldfastDB>(DATABASE, 1, {
    upgrade(database) {
      database.createObjectStore("purchases", { keyPath: "id" });
    },
  });
export async function loadPurchases(): Promise<Purchase[]> {
  const database = await db();
  try {
    return (await database.getAll("purchases")).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  } finally {
    database.close();
  }
}
export async function savePurchase(p: Purchase): Promise<void> {
  const database = await db();
  try {
    await database.put("purchases", p);
  } finally {
    database.close();
  }
}
export async function saveMany(
  purchases: Purchase[],
  replace = false,
): Promise<void> {
  const database = await db();
  try {
    const tx = database.transaction("purchases", "readwrite");
    if (replace) await tx.store.clear();
    for (const p of purchases) await tx.store.put(p);
    await tx.done;
  } finally {
    database.close();
  }
}
export async function clearPurchases(): Promise<void> {
  const database = await db();
  try {
    await database.clear("purchases");
  } finally {
    database.close();
  }
}
