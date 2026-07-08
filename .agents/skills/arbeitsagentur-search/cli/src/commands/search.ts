import {
  SEARCH_URL,
  jsonFetch,
  parseSearchResponse,
  jobageToVeroeffentlichtseit,
  writeError,
  type JobCard,
  type RawSearchResponse,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage?: number
  radius?: number
  remote?: boolean
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("was", opts.query)
  if (opts.location) params.set("wo", opts.location)
  const days = opts.jobage !== undefined ? jobageToVeroeffentlichtseit(opts.jobage) : null
  if (days !== null) params.set("veroeffentlichtseit", String(days))
  if (opts.radius) params.set("umkreis", String(opts.radius))
  if (opts.remote) params.set("arbeitszeit", "ho")
  params.set("page", String(opts.page))
  params.set("size", String(opts.limit && opts.limit > 0 ? Math.min(opts.limit, 100) : 25))
  return `${SEARCH_URL}?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 26).padEnd(26)
    const loc = (c.location || "—").slice(0, 24).padEnd(24)
    const date = c.date || "—"
    return `${c.id.padEnd(24)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(24) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(26) + " " + "LOCATION".padEnd(24) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  if (!opts.query && !opts.location) {
    writeError(
      "search requires at least one of --query/-q or --location/-l (Arbeitsagentur returns an unfiltered generic list otherwise)",
      "NO_FILTER",
    )
    return 1
  }
  try {
    const raw = await jsonFetch<RawSearchResponse>(buildUrl(opts))
    let cards = raw ? parseSearchResponse(raw) : []
    if (opts.limit && opts.limit > 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: cards.length, page: opts.page }, results: cards }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
