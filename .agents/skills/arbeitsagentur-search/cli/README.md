# arbeitsagentur-cli

CLI for searching jobs on the **Bundesagentur für Arbeit's Jobsuche** — Germany's
state employment agency job board, the largest job database in the country.

**Data source**: `rest.arbeitsagentur.de/jobboerse/jobsuche-service` (`pc/v4/app/jobs` and
`pc/v4/jobdetails/<id>`). This is the same JSON API the agency's own website and mobile app
call. **Authentication**: A fixed public client key (`X-API-Key: jobboerse-jobsuche`), the
same one used by the official apps — no personal credentials needed.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev
type defs.

> **Note on API status.** The Bundesagentur für Arbeit does not publish or officially support
> this API. It is documented by the community (`bundesAPI/jobsuche-api` on GitHub) from
> reverse-engineering the agency's own apps. `robots.txt` on both `arbeitsagentur.de` and the
> `rest.arbeitsagentur.de` API host is fully permissive, and no terms-of-service restriction
> on personal/automated use was found — but treat this as unofficial, keep request volume
> reasonable, and don't rely on it for anything beyond personal job search.

## Installation

```bash
cd .agents/skills/arbeitsagentur-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--query` or `--location` required) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Software developer roles (C#) in Berlin
bun run src/cli.ts search -q "Softwareentwickler C#" -l "Berlin" --format table

# Data analyst roles in Munich, posted in the last 14 days, home-office only
bun run src/cli.ts search -q "Data Analyst" -l "München" --jobage 14 --remote --format table

# Full detail for one job
bun run src/cli.ts detail 12336-a26f964j0448039-S --format plain
```

See `../SKILL.md` for the full flag reference.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Job title / skill / role keywords. |
| `--location` | `-l` | City, region, or postal code, e.g. `"Berlin"`, `"München"`, `"10115"`. |
| `--jobage` | | Posted within N days (1-100 — the API's own cap). |
| `--radius` | | Search radius around `--location`, in kilometers. |
| `--remote` | | Only show jobs flagged home-office possible (`arbeitszeit=ho`). |
| `--page` | | 1-indexed page. |
| `--limit` | `-n` | Cap results emitted (also caps the API's `size` page-size param). |
| `--format` | | `json` \| `table` \| `plain`. |

At least one of `--query`/`-q` or `--location`/`-l` is required for `search`.
