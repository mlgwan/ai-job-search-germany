# arbeitnow-cli

CLI for searching jobs on **Arbeitnow's public Job Board API** — an aggregator of jobs
from Applicant Tracking Systems (Greenhouse, Personio, SmartRecruiters, Lever, etc.)
across Germany, Europe, and remote, with a strong visa-sponsorship focus.

**Data source**: `arbeitnow.com/api/job-board-api` (listings) + the job's own HTML page
for `detail` (parsed from its embedded schema.org JobPosting JSON-LD — no separate
detail API exists). **Authentication**: None. **Dependencies**: None (plain `bun` +
`fetch`). `bun install` is optional and only pulls dev type defs.

> **API quirk you should know.** Only `page` and `visa_sponsorship` are honored
> server-side by this API — `remote`, `tag`, `search`, `location`, and `slug` params are
> all silently ignored (confirmed by live testing during generation, 2026-07-08). So
> `--query`, `--location`, `--jobage`, and `--remote` are applied **client-side** against
> a window of the `--pages` most-recently-fetched API pages (100 jobs/page, default 5
> pages / 500 jobs) — and combining several of them (e.g. a job title *and* a city) can
> easily have zero overlap in that window even though each filter alone returns plenty.
> When that happens, the CLI prints a hint explaining why and suggesting a higher
> `--pages` or dropping a filter, rather than silently returning nothing. See
> `../url-reference.md` for the full investigation notes.

> **Courtesy note.** This is a genuinely public API meant for this use, but its own
> `meta.terms` field asks not to abuse it and appreciates a link back to arbeitnow.com.
> Keep request volume reasonable.

## Installation

```bash
cd .agents/skills/arbeitnow-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search recent job listings (client-side filtered — see quirk above) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# C# developer roles in Berlin
bun run src/cli.ts search -q "Softwareentwickler C#" -l "Berlin" --format table

# Remote data roles, scanning a wider window
bun run src/cli.ts search -q "data engineer" --remote --pages 5 --format table

# Jobs offering visa sponsorship (real server-side filter)
bun run src/cli.ts search --visa -q "backend" --format table

# Full detail for one job (id is "<company-slug>/<job-slug>" from search results, or the full URL)
bun run src/cli.ts detail distribusion-technologies/senior-qa-engineer-payments-all-genders-berlin-175378 --format plain
```

See `../SKILL.md` for the full flag reference.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (title/skill/company/tag). Client-side. |
| `--location` | `-l` | Location substring, e.g. `"Berlin"`. Client-side. |
| `--jobage` | | Posted within N days. Client-side. |
| `--remote` | | Only remote-flagged jobs. Client-side. |
| `--visa` | | Only visa-sponsorship jobs. **Server-side** (the one filter that actually works). |
| `--pages` | | Raw API pages to scan (100/page), 1-10. Default `5`. |
| `--page` | | 1-indexed page of the *filtered* results. |
| `--limit` | `-n` | Cap results emitted; also sets the filtered-results page size. |
| `--format` | | `json` \| `table` \| `plain`. |
