import { returnDeadline, warrantyDeadline } from "./model";
import type { Purchase } from "./model";

export function policyEvents(purchases: Purchase[], kind = "all") {
  return purchases
    .flatMap((p) =>
      p.confirmedAt
        ? [
            { p, kind: "return", deadline: returnDeadline(p) },
            { p, kind: "warranty", deadline: warrantyDeadline(p) },
          ]
        : [],
    )
    .flatMap((e) => {
      const { date } = e.deadline;

      return e.deadline.state === "known" && date && (kind === "all" || e.kind === kind)
        ? [{ ...e, date }]
        : [];
    });
}
