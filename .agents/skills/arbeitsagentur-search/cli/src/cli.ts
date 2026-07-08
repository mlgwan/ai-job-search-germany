#!/usr/bin/env bun
// Self-contained CLI for searching jobs on the Bundesagentur für Arbeit's
// "Jobsuche" JSON API — Germany's state employment agency job board. No CLI
// framework, so it runs anywhere `bun` is available with zero install beyond
// the repo clone.
//
// This is the same public JSON API the agency's own website and app call —
// not an officially published API, but robots.txt is fully permissive and no
// terms-of-service restriction on personal/automated use was found. See SKILL.md.

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

const HELP = `arbeitsagentur-cli — search jobs on the Bundesagentur für Arbeit's Jobsuche (Germany)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Job title / skill / role keywords, e.g. "Softwareentwickler C#".
  --location, -l <text>   City, region, or postal code, e.g. "Berlin", "München", "10115".
  --jobage <days>         Posted within N days (1-100). Default: all.
  --radius <km>           Search radius around --location, in kilometers.
  --remote                Only show jobs flagged as home-office possible.
  --page <n>              1-indexed page. Default 1.
  --limit, -n <n>         Cap results emitted (also caps the API page size).
  --format <fmt>          json (default) | table | plain.

  At least one of --query/-q or --location/-l is required for search.

EXAMPLES
  bun run src/cli.ts search -q "Softwareentwickler C#" -l "Berlin" --format table
  bun run src/cli.ts search -q "Data Analyst" -l "München" --jobage 14 --remote --format table
  bun run src/cli.ts detail 12336-a26f964j0448039-S --format plain

Data source: Bundesagentur für Arbeit Jobsuche (rest.arbeitsagentur.de). No official public
API is published by the agency; see SKILL.md for details.
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
    if (flags.radius !== undefined) {
      const v = parseIntFlag("radius", flags.radius)
      if (v === null) return 1
      flags.radius = String(v)
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
      radius: flags.radius ? parseInt(flags.radius as string, 10) : undefined,
      remote: flags.remote === true,
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
