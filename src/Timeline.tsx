import { useState } from "react";
import { ArrowRight, CalendarDays, ShieldCheck } from "lucide-react";
import type { Purchase } from "./model";
import {
  daysLeft,
  formatDate,
  returnDeadline,
  todayInZone,
  warrantyDeadline,
} from "./model";
import { calendarBlob, calendarEvents } from "./calendar";
import { downloadBlob } from "./exports";

export function Timeline({
  purchases,
  onSelect,
}: {
  purchases: Purchase[];
  onSelect: (id: string) => void;
}) {
  const [kind, setKind] = useState("all");
  const today = todayInZone();
  const active = purchases.filter((p) => p.outcome === "active");

  const events = active
    .flatMap((p) => [
      { p, kind: "return", deadline: returnDeadline(p) },
      { p, kind: "warranty", deadline: warrantyDeadline(p) },
    ])
    .filter((e) => e.deadline.date && (kind === "all" || e.kind === kind))
    .sort((a, b) => a.deadline.date!.localeCompare(b.deadline.date!));

  const unknown = purchases.filter(
    (p) =>
      p.outcome === "active" &&
      (returnDeadline(p).state === "unknown" ||
        warrantyDeadline(p).state === "unknown"),
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Room to decide.</h1>
          <p>Your confirmed dates, in order. Unknowns stay visible.</p>
        </div>
        <CalendarDays size={42} strokeWidth={1.3} />
      </div>
      <div className="timeline-toolbar">
        <p>Today · {formatDate(today, true)}</p>
        <div className="tabs" aria-label="Timeline type">
          {[
            ["all", "All dates"],
            ["return", "Returns"],
            ["warranty", "Warranties"],
          ].map(([v, l]) => (
            <button
              key={v}
              className={kind === v ? "selected" : ""}
              aria-pressed={kind === v}
              onClick={() => setKind(v)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="calendar-export">
        <button
          className="button secondary"
          disabled={!calendarEvents(active, kind).length}
          onClick={() =>
            downloadBlob(
              calendarBlob(active, kind),
              "Holdfast-recorded-dates.ics",
            )
          }
        >
          <CalendarDays size={17} /> Export visible dates (.ics)
        </button>
        <p className="quiet footnote">
          A one-time calendar file with item, merchant and policy source. No
          receipt details. All-day dates stay fixed across time zones. Imports
          do not update automatically; calendar settings may add alerts.
        </p>
      </div>
      <div className="event-list">
        {events.map((e) => {
          const left = daysLeft(e.deadline.date, today)!;

          return (
            <button
              key={`${e.p.id}-${e.kind}`}
              className={`event ${left < 0 ? "past" : ""}`}
              onClick={() => onSelect(e.p.id)}
            >
              <div className="event-date">
                <strong>{formatDate(e.deadline.date).split(",")[0]}</strong>
                <small>{e.deadline.date!.slice(0, 4)}</small>
              </div>
              <span className="event-dot" />
              <div className="event-body">
                <small>
                  {e.kind === "return"
                    ? "Recorded return end"
                    : "Recorded warranty end"}
                </small>
                <strong>{e.p.item}</strong>
                <span>
                  {e.p.merchant} ·{" "}
                  {left < 0
                    ? "Recorded date passed"
                    : left === 0
                      ? "Today"
                      : `${left} days away`}
                </span>
              </div>
              {e.kind === "return" ? (
                <CalendarDays size={20} />
              ) : (
                <ShieldCheck size={20} />
              )}
              <ArrowRight size={17} />
            </button>
          );
        })}
        {!events.length ? (
          <div className="empty-results">
            <CalendarDays size={32} />
            <h3>No recorded dates here yet.</h3>
            <p>
              Add a receipt and confirm the policy to place a date on the
              timeline.
            </p>
          </div>
        ) : null}
      </div>
      {unknown.length ? (
        <section className="unknown-list">
          <h2>Still a question mark.</h2>
          <p>
            These items need a return or warranty rule. We have not guessed a
            date.
          </p>
          {unknown.map((p) => (
            <button key={p.id} onClick={() => onSelect(p.id)}>
              <span>
                <strong>{p.item}</strong>
                <small>{p.merchant}</small>
              </span>
              <span className="status unknown">Rule needed</span>
              <ArrowRight size={16} />
            </button>
          ))}
        </section>
      ) : null}
      <p className="timeline-disclaimer">
        Calendar planning dates from your inputs. Confirm item eligibility,
        final-day cutoffs, and terms with the merchant.
      </p>
    </>
  );
}
