<script lang="ts">
  import reports from '#lib/data/reports-4471.json';
  import notes from '#lib/data/desk-notes.json';
  import type { Report } from '#lib/kb/causes';
  import { tenantOf } from '#lib/kb/locales';
  import { PROBLEMS, WHAT_GOES_WRONG, splitTicket, type ProblemGroup } from '#lib/kb/problems';

  // `issues`: problem → the ticket filed for it.
  let { ticket, issues = {} }: { ticket: number; issues?: Partial<Record<ProblemGroup['problem'], string>> } = $props();

  const split = $derived(splitTicket(reports as Report[], ticket, tenantOf, notes.oneDayMove));
  const counts = (n: Record<string, number>) =>
    Object.entries(n)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ×${v}`)
      .join(' · ');
  const issueNumber = (url: string) => `#${url.split('/').pop()}`;
  const columns = $derived(PROBLEMS.filter((p) => split.groups.some((g) => g.problem === p)));
</script>

<p class="sum">
  <strong>{split.unique}</strong> reports in #{ticket} ({split.rows} rows in the export, one per id) ·
  <strong>{split.groups.length}</strong>
  {split.groups.length === 1 ? 'problem' : 'problems'}
</p>

<table>
  <thead>
    <tr><th>problem</th><th>reports</th><th>tenants</th><th>came in by</th><th>intake tagged as</th><th>seen</th><th>ticket</th></tr>
  </thead>
  <tbody>
    {#each split.groups as g (g.problem)}
      <tr>
        <td>
          <code>{g.problem}</code>
          {#if g.problem !== 'unplaced'}<br /><span class="what">{WHAT_GOES_WRONG[g.problem]}</span>{/if}
        </td>
        <td class="n">{g.reports.length}</td>
        <td class="list">{g.tenants.join(', ')}</td>
        <td class="list">{counts(g.channels)}</td>
        <td class="list">{counts(g.taggedAs)}</td>
        <td class="list">{g.firstSeen} → {g.lastSeen}</td>
        <td>
          {#if issues[g.problem]}<a href={issues[g.problem]}>{issueNumber(issues[g.problem]!)}</a>{:else}<span class="none">none yet</span>{/if}
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<h3>Subjects that hide more than one problem</h3>

<table>
  <thead>
    <tr><th>subject</th>{#each columns as p (p)}<th><code>{p}</code></th>{/each}</tr>
  </thead>
  <tbody>
    {#each split.sharedSubjects as s (s.subject)}
      <tr>
        <td>{s.subject}</td>
        {#each columns as p (p)}<td class="n">{s.byProblem[p] ?? ''}</td>{/each}
      </tr>
    {/each}
  </tbody>
</table>
<p class="note">
  {split.sharedSubjects.length} subject lines carry reports from more than one problem. Merging on subject alone put them in one ticket.
</p>

<style>
  .sum { font-size: 1.1rem; }
  .what { color: var(--muted); font-size: 0.85em; }
  .list { color: var(--muted); font-size: 0.85em; }
  .n { font-variant-numeric: tabular-nums; text-align: right; }
  .none { color: var(--warn); }
  .note { color: var(--muted); font-size: 0.85em; }
</style>
