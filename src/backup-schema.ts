import { z } from "zod";
import { CHECKLIST, validatePurchase } from "./model";
import type { Purchase } from "./model";

export function purchaseMetadata(p: Purchase) {
  return {
    ...p,
    attachments: p.attachments.map(({ id, name, type, size }) => ({ id, name, type, size })),
  };
}

const backupText = z.string();

const backupId = z.string().regex(/^[a-zA-Z0-9-]{1,80}$/);

const evidence = z
  .object({
    confidence: z.enum(["high", "medium", "unknown", "confirmed"]),
    excerpt: backupText,
    note: backupText,
    line: z.number().int().min(1).optional(),
  })
  .passthrough();

export const backupRecord = z
  .object({
    id: backupId,
    merchant: backupText,
    item: backupText,
    amount: backupText,
    currency: backupText,
    purchaseDate: backupText,
    arrivalDate: backupText,
    orderNumber: backupText,
    serialNumber: backupText,
    receiptText: backupText,
    sourceLabel: backupText,
    notes: backupText,
    createdAt: backupText,
    updatedAt: backupText,
    confirmedAt: backupText,
    outcome: z.enum(["active", "returned", "kept"]),
    synthetic: z.boolean(),
    policy: z
      .object({
        returnMode: z.enum(["unknown", "days", "date", "none"]),
        warrantyMode: z.enum(["unknown", "months", "date", "none"]),
        startOn: z.enum(["purchase", "arrival"]),
        warrantyStartOn: z.enum(["purchase", "arrival"]),
        countStart: z.boolean(),
        returnDays: z.number(),
        warrantyMonths: z.number(),
        returnDate: backupText,
        warrantyDate: backupText,
        sourceLabel: backupText,
        text: backupText,
        appliesTo: backupText,
        notes: backupText,
      })
      .passthrough(),
    evidence: z
      .object({
        merchant: evidence,
        item: evidence,
        amount: evidence,
        purchaseDate: evidence,
      })
      .passthrough(),
    checklist: z.record(
      z.string().refine((key) => CHECKLIST.some((item) => item.id === key)),
      z.boolean(),
    ),
    attachments: z
      .array(
        z
          .object({
            id: backupId,
            name: z.string(),
            type: z.string(),
            size: z
              .number()
              .int()
              .min(0)
              .max(12 * 1024 * 1024),
          })
          .passthrough(),
      )
      .max(10),
  })
  .passthrough()
  .superRefine((record, context) => {
    if (new Set(record.attachments.map((item) => item.id)).size !== record.attachments.length) {
      context.addIssue({
        code: "custom",
        message: "Duplicate attachment IDs in backup.",
      });
    }

    // Purchase validation uses purchase facts and policy; blobs are reconstructed from the ZIP only after metadata validation.
    const errors = validatePurchase({ ...record, attachments: [] });

    if (errors.length) {
      context.addIssue({
        code: "custom",
        message: `Backup purchase is invalid: ${errors[0]}`,
      });
    }
  });

// Zod owns the untrusted-input boundary and preserves the precise parsed return contract.
export const validateBackupRecord = backupRecord.parse.bind(backupRecord);

export const legacyBackupManifest = z.object({
  schemaVersion: z.literal(1),
  purchases: z.array(backupRecord),
});

export const backupManifest = z.object({
  schemaVersion: z.literal(2),
  backupId: z.uuid(),
  exportedAt: z.iso.datetime(),
  purchaseCount: z.number().int().nonnegative().safe(),
});

export const recordManifest = z.object({
  id: backupId,
  metadataChunks: z.number().int().positive().safe(),
  metadataBytes: z.number().int().positive().safe(),
});

export type BackupRecord = z.infer<typeof backupRecord>;

export type BackupManifest = z.infer<typeof backupManifest>;

export const backupHeader = z.discriminatedUnion("schemaVersion", [
  legacyBackupManifest,
  backupManifest,
]);
