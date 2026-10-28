// What #4471 holds, problem by problem. causes.ts sorts a report by its tenant; this file adds what
// the desk read in the body: a one-day move is not a flipped month, whatever the tenant.
import { causeOf, uniqueById, type Report, type Tenant } from '#lib/kb/causes';

export type Problem = 'parser' | 'hint' | 'one-day';
export const PROBLEMS: readonly Problem[] = ['parser', 'hint', 'one-day'];

export const WHAT_GOES_WRONG: Record<Problem, string> = {
  parser: 'The shared parser reads a day-first date month first: day and month swap.',
  hint: "booking-v3's form prints MM/DD/YYYY under the date field; people type month first and the form reads it day first.",
  'one-day': 'The date lands one day early or late, not on a swapped month.',
};

export function problemOf(r: Report, t: Tenant | undefined, oneDayMove: readonly string[]): Problem | 'unplaced' {
  if (oneDayMove.includes(r.id)) return 'one-day';
  return causeOf(r, t) ?? 'unplaced';
}

export type ProblemGroup = {
  problem: Problem | 'unplaced';
  reports: Report[];
  tenants: string[];
  channels: Record<string, number>;
  // What intake guessed for these reports: tag → count. Intake has no tag for a one-day move.
  taggedAs: Record<string, number>;
  firstSeen: string;
  lastSeen: string;
};

export type Split = {
  rows: number;
  unique: number;
  groups: ProblemGroup[];
  // Subject line → reports per problem, for subjects that span more than one problem.
  sharedSubjects: { subject: string; byProblem: Partial<Record<ProblemGroup['problem'], number>> }[];
};

export function splitTicket(
  rows: Report[],
  ticket: number,
  tenantOf: (r: Report) => Tenant | undefined,
  oneDayMove: readonly string[],
): Split {
  const merged = uniqueById(rows).filter((r) => r.mergedInto === ticket);
  const of = (r: Report) => problemOf(r, tenantOf(r), oneDayMove);

  const byProblem = new Map<ProblemGroup['problem'], Report[]>();
  for (const r of merged) byProblem.set(of(r), [...(byProblem.get(of(r)) ?? []), r]);

  const groups = [...byProblem.entries()]
    .map(([problem, rs]) => {
      const days = rs.map((r) => r.receivedAt.slice(0, 10)).sort();
      return {
        problem,
        reports: rs,
        tenants: [...new Set(rs.map((r) => r.tenant))].sort(),
        channels: rs.reduce<Record<string, number>>((n, r) => ({ ...n, [r.channel]: (n[r.channel] ?? 0) + 1 }), {}),
        taggedAs: rs.reduce<Record<string, number>>((n, r) => ({ ...n, [r.meta.intakeTag]: (n[r.meta.intakeTag] ?? 0) + 1 }), {}),
        firstSeen: days[0],
        lastSeen: days[days.length - 1],
      };
    })
    .sort((a, b) => b.reports.length - a.reports.length);

  const bySubject = new Map<string, Partial<Record<ProblemGroup['problem'], number>>>();
  for (const r of merged) {
    const counts = bySubject.get(r.subject) ?? {};
    counts[of(r)] = (counts[of(r)] ?? 0) + 1;
    bySubject.set(r.subject, counts);
  }
  const sharedSubjects = [...bySubject.entries()]
    .filter(([, counts]) => Object.keys(counts).length > 1)
    .map(([subject, byProblem]) => ({ subject, byProblem }))
    .sort((a, b) => a.subject.localeCompare(b.subject));

  return { rows: rows.filter((r) => r.mergedInto === ticket).length, unique: merged.length, groups, sharedSubjects };
}
