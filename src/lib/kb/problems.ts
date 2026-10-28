// What #4471 holds, problem by problem: one per cause, as causes.ts sorts a report by its tenant.
// Like CauseTable, a report the desk read differently (desk-notes.json) stays counted where it is
// filed, and is footnoted under it.
import { groupByCause, readAs, uniqueById, type CauseGroup, type Cause, type Report, type Tenant } from '#lib/kb/causes';

export const WHAT_GOES_WRONG: Record<Cause, string> = {
  parser: 'The shared parser reads a day-first date month first: day and month swap.',
  hint: "booking-v3's form prints MM/DD/YYYY under the date field; people type month first and the form reads it day first.",
};

export type ProblemGroup = {
  problem: Cause | 'unplaced';
  reports: Report[];
  tenants: string[];
  channels: Record<string, number>;
  // What intake guessed for these reports: tag → count. Intake has no tag for a one-day move.
  taggedAs: Record<string, number>;
  firstSeen: string;
  lastSeen: string;
  // Of these, reports the desk read as a one-day move instead of a swapped month.
  readAsOneDay: number;
};

export type Split = {
  rows: number;
  unique: number;
  groups: ProblemGroup[];
  // Subject line → reports per cause, for subjects that span more than one cause.
  sharedSubjects: { subject: string; byCause: Partial<Record<Cause | 'unplaced', number>> }[];
};

const tally = (rs: Report[], key: (r: Report) => string) =>
  rs.reduce<Record<string, number>>((n, r) => ({ ...n, [key(r)]: (n[key(r)] ?? 0) + 1 }), {});

export function splitTicket(
  rows: Report[],
  ticket: number,
  tenantOf: (r: Report) => Tenant | undefined,
  oneDayMove: readonly string[],
): Split {
  const merged = uniqueById(rows).filter((r) => r.mergedInto === ticket);
  const causeGroups = groupByCause(merged, tenantOf);
  const causeOfReport = new Map(causeGroups.flatMap((g) => g.reports.map((r) => [r.id, g.cause] as const)));

  const group = (g: CauseGroup): ProblemGroup => ({
    problem: g.cause,
    reports: g.reports,
    tenants: [...new Set(g.reports.map((r) => r.tenant))].sort(),
    channels: tally(g.reports, (r) => r.channel),
    taggedAs: g.taggedAs,
    firstSeen: g.firstSeen,
    lastSeen: g.lastSeen,
    readAsOneDay: readAs(g, oneDayMove),
  });

  const groups = causeGroups.map(group);

  const bySubject = new Map<string, Partial<Record<Cause | 'unplaced', number>>>();
  for (const r of merged) {
    const counts = bySubject.get(r.subject) ?? {};
    const cause = causeOfReport.get(r.id)!;
    counts[cause] = (counts[cause] ?? 0) + 1;
    bySubject.set(r.subject, counts);
  }
  const sharedSubjects = [...bySubject.entries()]
    .filter(([, counts]) => Object.keys(counts).length > 1)
    .map(([subject, byCause]) => ({ subject, byCause }))
    .sort((a, b) => a.subject.localeCompare(b.subject));

  return { rows: rows.filter((r) => r.mergedInto === ticket).length, unique: merged.length, groups, sharedSubjects };
}
