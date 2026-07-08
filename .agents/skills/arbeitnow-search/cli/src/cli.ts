#!/usr/bin/env bun
// Self-contained CLI for searching jobs on Arbeitnow's public Job Board API
// (Germany-focused, Europe/remote coverage). No CLI framework, so it runs
// anywhere `bun` is available with zero install beyond the repo clone.
//
// This is a genuinely public, documented, no-auth API meant for exactly this kind
// of use. Its own `meta.terms` field asks that use "not abuse" it and appreciates
// linking back to arbeitnow.com — keep volume reasonable and credit the source.
// See SKILL.md for the important API quirk: most filters are applied client-side
// because the server only honors `page` and `visa_sponsorship`.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `arbeitnow-cli — search jobs on Arbeitnow's public Job Board API (Germany/Europe/remote)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (title, skill, company, tag). Applied client-side.
  --location, -l <text>   Location substring, e.g. "Berlin". Applied client-side.
  --jobage <days>         Posted within N days. Applied client-side.
  --remote                Only home-office/remote-flagged jobs. Applied client-side.
  --visa                  Only jobs offering visa sponsorship. Server-side filter (works).
  --pages <n>             Raw API pages to scan for filtering (100 jobs/page). Default 5.
  --page <n>              1-indexed page of the FILTERED results. Default 1.
  --limit, -n <n>         Cap results emitted; also sets the filtered-results page size.
  --format <fmt>          json (default) | table | plain.

  IMPORTANT: Arbeitnow's API only honors --page and --visa server-side. Every other
  filter above is applied client-side against the --pages most-recent API pages — if
  you get zero results for a narrow --query, raise --pages. See SKILL.md.

EXAMPLES
  bun run src/cli.ts search -q "Softwareentwickler C#" -l "Berlin" --format table
  bun run src/cli.ts search -q "data engineer" --remote --pages 5 --format table
  bun run src/cli.ts search --visa -q "backend" --format table
  bun run src/cli.ts detail distribusion-technologies/senior-qa-engineer-payments-all-genders-berlin-175378 --format plain

Data source: Arbeitnow public Job Board API (arbeitnow.com/api/job-board-api). Please don't
abuse it — see the API's own terms note surfaced in SKILL.md.
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = parseInt(raw as string, 10)
      if (isNaN(val)) {
        process.stderr.write(JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n")
        return null
      }
      return val
    }

    if (flags.jobage !== undefined) {
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
      flags.jobage = String(v)
    }
    if (flags.pages !== undefined) {
      const v = parseIntFlag("pages", flags.pages)
      if (v === null) return 1
      flags.pages = String(v)
    }
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      flags.page = String(v)
    }
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      flags.limit = String(v)
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : undefined,
      remote: flags.remote === true,
      visa: flags.visa === true,
      pages: flags.pages ? Math.max(1, Math.min(10, parseInt(flags.pages as string, 10))) : 5,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main().then((code) => process.exit(code))
