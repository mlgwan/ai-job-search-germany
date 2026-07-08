---
name: eures-search
version: 1.0.0
description: >
  Use this skill to search for jobs on EURES, the European Commission's official
  cross-border job mobility portal, aggregating listings from national employment
  services (including Germany's Arbeitsagentur) across ~31 EU/EEA countries and
  Switzerland. Invoke for job openings, vacancies, and hiring anywhere in Europe, or
  when the user wants to search across multiple EU countries at once. Trigger phrases:
  EU job search, European job search, EURES, cross-border jobs, jobs in Europe,
  Jobsuche Europa, europäische Stellenangebote, look up this job posting.
context: fork
allowed-tools: Bash(bun run skills/eures-search/cli/src/cli.ts *)
---

# EURES Search Skill

Search live job listings from **EURES** — the European Commission's official
cross-border job mobility portal, aggregating national job-board listings (including
Germany's Arbeitsagentur) across ~31 EU/EEA countries plus Switzerland. No
authentication, and **zero runtime dependencies** — it runs with just `bun`.

## API status

EURES has no officially published/stable API, but this calls the same JSON backend the
public europa.eu/eures Angular app itself uses — documented by the community at
[bundesAPI](https://github.com/rorar/EURES-API-Documentation)-style reverse engineering
(`github.com/rorar/EURES-API-Documentation`). `robots.txt` on both `europa.eu` and
`eures.europa.eu` carries no restriction on the paths this skill uses. Of every German/EU
portal evaluated when this skill was generated (StepStone, Xing, Indeed were all
robots.txt-restricted on their API/detail/pagination in some way), this is the most
open one.

## When to use this skill

- Search for job openings by title, across one or more EU/EEA countries or a German
  Bundesland
- Filter by recency (posted in the last day/week/month)
- Get the full description, employer, contact, and application info for a specific
  listing

## Commands

### Search job listings

```bash
bun run skills/eures-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — job title keywords, matched server-side against the title.
- `--location <text>` / `-l <text>` — a country (name or ISO2 code, e.g. `"Germany"`/`"de"`)
  or, for Germany, a Bundesland (name or NUTS-1 code, e.g. `"Berlin"`/`"de3"`,
  `"Bayern"`/`"de2"`).
- At least one of `--query`/`-q` or `--location`/`-l` is **required**.
- `--jobage <days>` — posted within N days, bucketed to EURES's own coarse windows:
  `1` → `LAST_DAY`, `2`-`7` → `LAST_WEEK`, `8`+ → `LAST_MONTH`.
- `--page <n>` — page number (1-indexed).
- `--limit <n>` / `-n <n>` — cap total results emitted (also sets the API's
  `resultsPerPage`, capped at 50).
- `--lang <code>` — language for titles/descriptions (e.g. `de`, `en`). Default `de`.
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run skills/eures-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the job `id` from `search` results. You may also pass the full
`https://europa.eu/eures/portal/jv-se/jv-details/...` URL. Returns the full description,
employment schedule, sector, the national board that sourced the listing, contact email,
and the first application link found (often pointing back to the original national
board, e.g. Arbeitsagentur, since EURES aggregates rather than originates most listings).

## Usage examples

```bash
# Software developer roles in Berlin
bun run skills/eures-search/cli/src/cli.ts search -q "Softwareentwickler" -l "Berlin" --format table

# Data analyst roles anywhere in Germany, last 7 days
bun run skills/eures-search/cli/src/cli.ts search -q "Data Analyst" -l Germany --jobage 7 --format table

# Nursing roles in Bavaria
bun run skills/eures-search/cli/src/cli.ts search -q "Pflegefachkraft" -l Bayern --format table

# Any role in Luxembourg
bun run skills/eures-search/cli/src/cli.ts search -l Luxembourg --format table

# Full details for a specific job
bun run skills/eures-search/cli/src/cli.ts detail <id> --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from `europa.eu/eures/api/jv-searchengine` — search is a `POST` with a JSON
  body (`keywords`, `locationCodes`, `publicationPeriod`, pagination), detail is a `GET`
  by job `id`.
- **Search results only carry a country-level location** (from `locationMap`, e.g.
  `{"DE": [...]}`) — city, postal code, and region only appear in `detail`'s
  `locations[]`. If you need the exact city, call `detail`.
- **`--location` only reliably filters at country level or German-Bundesland (NUTS-1)
  level.** Finer NUTS-3/city-level codes returned zero results in testing (e.g. Berlin's
  NUTS-3 code `DE300` returned nothing; the NUTS-1 code `de3` — which happens to cover
  exactly Berlin, since Berlin is a city-state — worked). No public location-autocomplete
  endpoint was found to resolve arbitrary cities to codes.
- Many EURES-DE listings are mirrors of the source national board's posting (e.g.
  Germany's Arbeitsagentur) — `detail`'s `source` field and `applyUrl` often point back
  to the origin. See [[arbeitsagentur-search]] for a Germany-only alternative with true
  city-level search.
- `--query` uses `specificSearchCode: "TITLE"` for precision (confirmed via live testing
  to give much cleaner matches than the broader `EVERYWHERE` mode, which matched almost
  any word in the description too).
- **Even `TITLE` search is semantic/occupation-based, not a literal substring match** —
  a query for "Softwareentwickler" alone returned "Golang-Entwickler:in" and "Test
  Automation Engineer" (related occupations via EURES's ESCO taxonomy), and a compound
  query like "Softwareentwickler C#" occasionally pulled in an unrelated result (e.g. a
  "Berufskraftfahrer C/CE" driving job) — almost certainly because "C#" gets tokenized
  and the bare "C" token matches elsewhere. This wasn't "fixed" with client-side
  re-filtering, since that would also drop genuinely-related semantic matches like
  "Golang-Entwickler" for a "Softwareentwickler" search — it's a real tradeoff of the
  underlying occupation-taxonomy search, not a bug to paper over. Prefer a single,
  specific keyword over a compound one for the tightest results, and use `detail` to
  verify relevance on anything borderline.
