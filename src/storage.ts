import { openDB } from "idb";
import type { DBSchema, IDBPTransaction } from "idb";
import type { Purchase } from "./model";

interface HoldfastDB extends DBSchema {
  purchases: { key: string; value: Purchase };
}

type PurchaseStores = ["purchases"];

const DATABASE = "holdfast-v1";

const db = () =>
  openDB<HoldfastDB>(DATABASE, 1, {
    upgrade(database) {
      database.createObjectStore("purchases", { keyPath: "id" });
    },
  });

/** Load this origin's cabinet, newest created record first; reject storage failures. */
export async function loadPurchases(): Promise<Purchase[]> {
  const database = await db();

  try {
    // oxlint-disable-next-line unicorn/no-array-sort -- IndexedDB returned a fresh array; keep sorting compatible with the ES2022 browser target.
    return (await database.getAll("purchases")).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  } finally {
    database.close();
  }
}

/** Insert or replace one validated purchase; resolve only after IndexedDB commits. */
export async function savePurchase(p: Purchase): Promise<void> {
  const database = await db();

  try {
    await database.put("purchases", p);
  } finally {
    database.close();
  }
}

async function writePurchases(
  tx: IDBPTransaction<HoldfastDB, PurchaseStores, "readwrite">,
  purchases: Purchase[],
  replace: boolean,
) {
  try {
    if (replace) {
      await tx.store.clear();
    }

    for (const p of purchases) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Wait for each write to complete so a failure stops subsequent writes before transaction cleanup.
      await tx.store.put(p);
    }
  } catch (error) {
    try {
      // A synchronous put/clear exception does not abort IndexedDB automatically.
      tx.abort();
    } catch (abortError) {
      // Request failures can already have aborted the native transaction.
      if (!(abortError instanceof DOMException && abortError.name === "InvalidStateError")) {
        throw new AggregateError([error, abortError], "Could not roll back the purchase batch.", {
          cause: abortError,
        });
      }
    }

    throw error;
  }
}

/**
 * Commit a complete batch, optionally replacing the cabinet in the same transaction.
 * On failure, wait for rollback and reject with the original write error. Callers
 * may retry the batch; no successful prefix is left behind.
 */
export async function saveMany(purchases: Purchase[], replace = false): Promise<void> {
  const database = await db();

  try {
    const tx = database.transaction("purchases", "readwrite");
    // Observe both promises immediately, including an abort after a failed request.
    // Prefer the causal write error over the transaction's secondary AbortError.
    const results = await Promise.allSettled([writePurchases(tx, purchases, replace), tx.done]);

    for (const result of results) {
      if (result.status === "rejected") {
        throw result.reason;
      }
    }
  } finally {
    database.close();
  }
}

/** Permanently clear this origin's cabinet; the caller owns user confirmation. */
export async function clearPurchases(): Promise<void> {
  const database = await db();

  try {
    await database.clear("purchases");
  } finally {
    database.close();
  }
}
