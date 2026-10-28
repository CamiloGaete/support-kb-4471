// What #4471 holds, problem by problem. causes.ts sorts a report by its tenant; the desk's notes add
// what it read in the body: a one-day move is not a flipped month. Like CauseTable, a noted report
// stays counted where it is filed, and the one-day row counts it again on its own.
import { CAUSES, groupByCause, uniqueById, type Cause, type Report, type Tenant } from '#lib/kb/causes';

export type Problem = Cause | 'one-day';
export const PROBLEMS: readonly Problem[] = [...CAUSES, 'one-day'];

export const WHAT_GOES_WRONG: Record<Problem, string> = {
  parser: 'The shared parser reads a day-first date month first: day and month swap.',
  hint: "booking-v3's form prints MM/DD/YYYY under the date field; people type month first and the form reads it day first.",
  'one-day': 'The date lands one day early or late, not on a swapped month.',
};

export type ProblemGroup = {
  problem: Problem | 'unplaced';
  reports: Report[];
  tenants: string[];
  channels: Record<string, number>;
  // What intake guessed for these reports: tag → count. Intake has no tag for a one-day move.
  taggedAs: Record<string, number>;
  firstSeen: string;
  lastSeen: string;
  // For the one-day row: the cause each of its reports is filed and counted under.
  filedUnder: Record<string, number>;
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

  const group = (problem: ProblemGroup['problem'], rs: Report[]): ProblemGroup => {
    const days = rs.map((r) => r.receivedAt.slice(0, 10)).sort();
    return {
      problem,
      reports: rs,
      tenants: [...new Set(rs.map((r) => r.tenant))].sort(),
      channels: tally(rs, (r) => r.channel),
      taggedAs: tally(rs, (r) => r.meta.intakeTag),
      firstSeen: days[0],
      lastSeen: days[days.length - 1],
      filedUnder: problem === 'one-day' ? tally(rs, (r) => causeOfReport.get(r.id)!) : {},
    };
  };

  const oneDay = merged.filter((r) => oneDayMove.includes(r.id));
  const groups = [...causeGroups.map((g) => group(g.cause, g.reports)), ...(oneDay.length ? [group('one-day', oneDay)] : [])];

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
