---
name: arbeitsagentur-search
version: 1.0.0
description: >
  Use this skill to search for jobs on the Bundesagentur für Arbeit's Jobsuche —
  Germany's state employment agency job board and the largest job database in the
  country. Invoke for job openings, vacancies, and hiring in any German city or
  region, across any sector or role. Trigger phrases: German job search, jobs in
  Germany, Arbeitsagentur, Bundesagentur für Arbeit, Jobsuche, Stellenangebote,
  offene Stellen, Stellenausschreibung, Arbeitsstelle finden, Jobbörse, "Jobs in
  Berlin/München/Hamburg", look up this job posting.
context: fork
allowed-tools: Bash(bun run skills/arbeitsagentur-search/cli/src/cli.ts *)
---

# Arbeitsagentur (Bundesagentur für Arbeit) Search Skill

Search live job listings from the **Bundesagentur für Arbeit's Jobsuche** — Germany's
state employment agency and its largest job database. No authentication beyond a fixed
public client key, and **zero runtime dependencies** — it runs with just `bun`.

## Note on API status

The Bundesagentur für Arbeit does not publish an official public API. This skill calls
the same JSON backend the agency's own website and mobile app use, documented by the
community (`bundesAPI/jobsuche-api` on GitHub). `robots.txt` on both `arbeitsagentur.de`
and the API host (`rest.arbeitsagentur.de`) is fully permissive, and no terms-of-service
restriction on personal/automated use was found — but this is unofficial and unsanctioned,
so keep request volume reasonable and treat it as a personal job-search tool.

## When to use this skill

- Search for job openings in a German city, region, or postal code
- Filter by recency (posted in the last N days, up to 100) or home-office availability
- Get the full description of a specific job listing

## Commands

### Search job listings

```bash
bun run skills/arbeitsagentur-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — job title / skill / role keywords, e.g. `"Softwareentwickler C#"`.
- `--location <text>` / `-l <text>` — city, region, or postal code, e.g. `"Berlin"`, `"München"`, `"10115"`.
- At least one of `--query`/`-q` or `--location`/`-l` is **required**.
- `--jobage <days>` — posted within N days. The API caps this at `100`; larger values are clamped.
- `--radius <km>` — search radius around `--location`, in kilometers.
- `--remote` — only show jobs flagged as home-office possible.
- `--page <n>` — page number (1-indexed).
- `--limit <n>` / `-n <n>` — cap total results emitted (also caps the API's page size).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run skills/arbeitsagentur-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the job reference number (`refnr`) from `search` results, e.g.
`12336-a26f964j0448039-S`. You may also pass a full
`https://www.arbeitsagentur.de/jobsuche/jobdetail/...` URL. Returns the full description,
employment type, contract type, home-office flag, compensation (when stated), and the
external apply URL when the posting isn't handled directly by the agency.

## Usage examples

```bash
# Software developer roles (C#) in Berlin
bun run skills/arbeitsagentur-search/cli/src/cli.ts search -q "Softwareentwickler C#" -l "Berlin" --format table

# Data analyst roles in Munich, last 14 days, home-office only
bun run skills/arbeitsagentur-search/cli/src/cli.ts search -q "Data Analyst" -l "München" --jobage 14 --remote --format table

# Any role within 30km of Leipzig
bun run skills/arbeitsagentur-search/cli/src/cli.ts search -l "Leipzig" --radius 30 --format table

# Full details for a specific job
bun run skills/arbeitsagentur-search/cli/src/cli.ts detail 12336-a26f964j0448039-S --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from the Bundesagentur für Arbeit's `rest.arbeitsagentur.de/jobboerse/jobsuche-service` JSON API.
- The search endpoint (`stellenangebote[]`) and the detail endpoint use **different field
  names for the same data** — e.g. the employer is `arbeitgeber` in search results but
  `firma` in job details. The CLI normalizes both to a consistent `company` field.
- The location free-text field (`wo`) expects the German spelling (e.g. `München`, not
  `Muenchen`) — an ASCII-only spelling of an umlaut city name returns zero results
  (`suchmodus: UNGUELTIG`) rather than an error.
- `--jobage` accepts `1`-`100`; the underlying `veroeffentlichtseit` param has no documented
  behavior above 100, so values are clamped.
- Job reference numbers (`refnr`) must be Base64-encoded before being sent to the detail
  endpoint — the CLI handles this automatically; just pass the raw `refnr` or a job URL.
- The API retries 429/5xx with exponential backoff. Keep volume low as a courtesy (see the
  note on API status above).
