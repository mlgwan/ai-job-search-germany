# eures-cli

CLI for searching jobs on **EURES** — the European Commission's official cross-border
job mobility portal, aggregating listings from national employment services (including
Germany's Arbeitsagentur) across ~31 EU/EEA countries plus Switzerland.

**Data source**: `europa.eu/eures/api/jv-searchengine` (search + detail). This is the
same JSON API the public europa.eu/eures Angular app calls — reverse-engineered and
documented by the community at
[github.com/rorar/EURES-API-Documentation](https://github.com/rorar/EURES-API-Documentation).
**Authentication**: None. **Dependencies**: None (plain `bun` + `fetch`). `bun install`
is optional and only pulls dev type defs.

> **API status.** Not an officially published/stable API, but it's the European
> Commission's own public-facing government job board with no robots.txt restriction on
> the paths used here — the most permissive of everything evaluated for this generator
> (StepStone, Xing, and Indeed's automated-access paths were all robots.txt-restricted
> in some structural way; this one isn't).

> **Quirk to know.** Search results only carry a country-level location (e.g.
> `"Germany"`), not a city — city/postal-code/region only appear in `detail`'s
> `locations[]`. See `../url-reference.md`.

## Installation

```bash
cd .agents/skills/eures-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search job listings by title keywords and/or country/region (`--query` or `--location` required) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Software developer roles in Berlin
bun run src/cli.ts search -q "Softwareentwickler" -l "Berlin" --format table

# Data analyst roles anywhere in Germany, posted in the last 7 days
bun run src/cli.ts search -q "Data Analyst" -l Germany --jobage 7 --format table

# Nursing roles in Bavaria
bun run src/cli.ts search -q "Pflegefachkraft" -l Bayern --format table

# Full detail for one job
bun run src/cli.ts detail <id> --format plain
```

See `../SKILL.md` for the full flag reference.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Job title keywords, matched server-side against the title. |
| `--location` | `-l` | Country (name or ISO2, e.g. `"Germany"`/`"de"`) or German Bundesland (name or NUTS-1 code, e.g. `"Berlin"`/`"de3"`). |
| `--jobage` | | Posted within N days — bucketed to EURES's own enum (`LAST_DAY`/`LAST_WEEK`/`LAST_MONTH`). |
| `--page` | | 1-indexed page. |
| `--limit` | `-n` | Cap results emitted; also sets the API's `resultsPerPage` (max 50). |
| `--lang` | | Language for titles/descriptions, e.g. `de`, `en`. Default `de`. |
| `--format` | | `json` \| `table` \| `plain`. |

At least one of `--query`/`-q` or `--location`/`-l` is required for `search`.
