#!/usr/bin/env bun
// Self-contained CLI for searching jobs on EURES — the European Commission's official
// cross-border job mobility portal (~31 EU/EEA countries). No CLI framework, so it runs
// anywhere `bun` is available with zero install beyond the repo clone.
//
// This is a genuinely public, unauthenticated, government-run JSON API with no
// robots.txt restriction on the paths used here. See SKILL.md for the one real quirk:
// search results only carry a country-level location, not a city — city/postal-code
// only shows up in `detail`.

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

const HELP = `eures-cli — search jobs on EURES, the EU's official cross-border job portal (~31 countries)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Job title keywords, e.g. "Softwareentwickler". Matched against the title.
  --location, -l <text>   A country (name or ISO2 code, e.g. "Germany"/"de") or, for Germany, a
                          Bundesland name/NUTS-1 code (e.g. "Berlin"/"de3", "Bayern"/"de2").
  --jobage <days>         Posted within N days — bucketed to EURES's own windows:
                          1 day -> LAST_DAY, <=7 -> LAST_WEEK, else -> LAST_MONTH.
  --page <n>              1-indexed page. Default 1.
  --limit, -n <n>         Cap results emitted; also sets the API's resultsPerPage (max 50).
  --lang <code>           Language for titles/descriptions, e.g. "de", "en". Default "de".
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "Softwareentwickler" -l "Berlin" --format table
  bun run src/cli.ts search -q "Data Analyst" -l Germany --jobage 7 --format table
  bun run src/cli.ts search -q "Pflegefachkraft" -l Bayern --format table
  bun run src/cli.ts detail <id> --format plain

Data source: EURES public API (europa.eu/eures/api/jv-searchengine). Unofficial documentation:
github.com/rorar/EURES-API-Documentation. See SKILL.md for details.
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
    if (!hasQueryOrLocation(flags)) {
      process.stderr.write(
        JSON.stringify({
          error: "search requires at least one of --query/-q or --location/-l",
          code: "NO_FILTER",
        }) + "\n",
      )
      return 1
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : undefined,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      lang: typeof flags.lang === "string" ? flags.lang : "de",
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
      lang: typeof flags.lang === "string" ? flags.lang : "de",
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

function hasQueryOrLocation(flags: Flags): boolean {
  return typeof flags.query === "string" || typeof flags.location === "string"
}

main().then((code) => process.exit(code))
