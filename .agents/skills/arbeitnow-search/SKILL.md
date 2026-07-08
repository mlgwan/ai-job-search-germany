---
name: arbeitnow-search
version: 1.0.0
description: >
  Use this skill to search for jobs on Arbeitnow's public Job Board API, an
  aggregator of jobs from Applicant Tracking Systems (Greenhouse, Personio,
  SmartRecruiters, Lever, etc.) across Germany, Europe, and remote, with a strong
  visa-sponsorship focus. Invoke for job openings, vacancies, and hiring across any
  sector or role in Germany/Europe or remote. Trigger phrases: German job search,
  European job search, jobs in Germany, Arbeitnow, visa sponsorship jobs,
  Jobsuche, Stellenangebote, offene Stellen, remote jobs Europe, look up this job
  posting.
context: fork
allowed-tools: Bash(bun run skills/arbeitnow-search/cli/src/cli.ts *)
---

# Arbeitnow Search Skill

Search live job listings from **Arbeitnow's public Job Board API** — an aggregator of
ATS-sourced jobs (Greenhouse, Personio, SmartRecruiters, Lever, and others) across
Germany, Europe, and remote, with a strong visa-sponsorship focus. No authentication,
and **zero runtime dependencies** — it runs with just `bun`.

## Important: how filtering actually works

Arbeitnow's API is genuinely public and documented for this kind of use — but **it only
honors two query parameters server-side: `page` and `visa_sponsorship`**. Every other
plausible filter (`remote`, `tag`, `search`, `location`, `slug`) is silently ignored by
the server and returns the same newest-first list regardless (confirmed by live testing
during generation). So this skill applies `--query`, `--location`, `--jobage`, and
`--remote` **client-side**, scanning the `--pages` most-recently-fetched API pages
(100 jobs/page, default 5 pages / 500 jobs).

**Combining filters narrows fast.** A specific job title *and* a specific city can
easily have zero overlap in that window even though each filter alone returns plenty
(e.g. "Softwareentwickler C#" alone finds matches, "Berlin" alone finds matches, but the
two together may find none among the recently-scanned postings). When a search returns
zero results, the CLI prints a hint explaining this and suggesting a higher `--pages` or
dropping a filter — it's not a broken search, just a small live candidate pool
intersected with an AND filter.

There is also no single-job JSON endpoint — `detail` fetches the job's own web page and
reads its embedded schema.org `JobPosting` structured data, which is far more reliable
than scraping the rendered HTML.

## Courtesy note

This is a free public API meant for this use — its own `meta.terms` field says: *"This
is a free public API for jobs, please do not abuse. I would appreciate linking back to
the site."* Keep request volume reasonable and credit arbeitnow.com if you republish
results.

## When to use this skill

- Search for job openings across Germany, Europe, or remote (client-side keyword/location/recency filtering)
- Find jobs that explicitly offer visa sponsorship (the one filter that's genuinely server-side)
- Get the full description of a specific job listing

## Commands

### Search job listings

```bash
bun run skills/arbeitnow-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords (title, skill, company, tag). Client-side.
- `--location <text>` / `-l <text>` — location substring, e.g. `"Berlin"`. Client-side.
- `--jobage <days>` — posted within N days. Client-side.
- `--remote` — only remote-flagged jobs. Client-side.
- `--visa` — only jobs offering visa sponsorship. **Server-side** (works reliably).
- `--pages <n>` — raw API pages to scan for client-side filtering (100 jobs/page), 1-10. Default `5`.
- `--page <n>` — 1-indexed page of the *filtered* results (not the raw API page).
- `--limit <n>` / `-n <n>` — cap total results emitted; also sets the filtered-results page size.
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run skills/arbeitnow-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the `"<company-slug>/<job-slug>"` composite id from `search` results (e.g.
`distribusion-technologies/senior-qa-engineer-payments-all-genders-berlin-175378`).
You may also pass the full `arbeitnow.com/jobs/companies/...` URL directly. Returns the
full description, employment type, skills/tags, benefits, application deadline
(`validThrough`), and the apply link (not auto-followed — arbeitnow.com's `robots.txt`
disallows crawling the apply-redirect path itself, so it's surfaced as a link only).

## Usage examples

```bash
# C# developer roles in Berlin
bun run skills/arbeitnow-search/cli/src/cli.ts search -q "Softwareentwickler C#" -l "Berlin" --format table

# Remote data roles, scanning a wider window for better recall
bun run skills/arbeitnow-search/cli/src/cli.ts search -q "data engineer" --remote --pages 5 --format table

# Jobs with visa sponsorship
bun run skills/arbeitnow-search/cli/src/cli.ts search --visa -q "backend" --format table

# Posted in the last 7 days
bun run skills/arbeitnow-search/cli/src/cli.ts search -q "product manager" --jobage 7 --format table

# Full details for a specific job
bun run skills/arbeitnow-search/cli/src/cli.ts detail distribusion-technologies/senior-qa-engineer-payments-all-genders-berlin-175378 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from `arbeitnow.com/api/job-board-api` (listings, ~100 jobs/page, newest
  first) plus the job's own HTML page for `detail`.
- **Filtering is mostly client-side** — see "Important" above. This trades search
  precision for the fact that the API is genuinely open with no ToS friction.
- The composite `id` (`<company-slug>/<job-slug>`) is derived from the job's own URL so
  `detail` never needs to guess or re-scan for it.
- `robots.txt` disallows crawling `/jobs/companies/*/apply` (the apply-redirect path) —
  this skill surfaces `applyUrl` as a link for a human to click, and never fetches it.
- The API updates hourly and paginates via `?page=`; `visa_sponsorship=true|false` is
  the only other parameter that reliably filters server-side.
