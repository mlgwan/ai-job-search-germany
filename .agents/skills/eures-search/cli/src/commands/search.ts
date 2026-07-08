import {
  searchFetch,
  parseSearchResponse,
  mapSearchResult,
  resolveLocationCode,
  jobageToPublicationPeriod,
  writeError,
  type JobCard,
  type RawSearchResponse,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage?: number
  page: number
  limit?: number
  lang: string
  format: "json" | "table" | "plain"
}

function buildBody(opts: SearchOpts): Record<string, unknown> {
  const body: Record<string, unknown> = {
    resultsPerPage: opts.limit && opts.limit > 0 ? Math.min(opts.limit, 50) : 20,
    page: opts.page,
    sortSearch: "MOST_RECENT",
  }
  if (opts.query) {
    body.keywords = [{ keyword: opts.query, specificSearchCode: "TITLE" }]
  }
  if (opts.location) {
    body.locationCodes = [resolveLocationCode(opts.location)]
  }
  const period = jobageToPublicationPeriod(opts.jobage)
  if (period) body.publicationPeriod = period
  return body
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 44).padEnd(44)
    const company = (c.company || "—").slice(0, 26).padEnd(26)
    const loc = (c.location || "—").slice(0, 16).padEnd(16)
    const date = c.date || "—"
    return `${c.id.slice(0, 20).padEnd(20)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(20) + " " + "TITLE".padEnd(44) + " " + "COMPANY".padEnd(26) + " " + "LOCATION".padEnd(16) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const raw = await searchFetch<RawSearchResponse>(buildBody(opts))
    let results = raw ? parseSearchResponse(raw) : []
    if (opts.limit && opts.limit > 0) results = results.slice(0, opts.limit)
    const cards = results.map((r) => mapSearchResult(r, opts.lang))

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards.length === 0
          ? "No results.\n"
          : cards
              .map(
                (c) =>
                  `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
              )
              .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: raw?.numberRecords ?? cards.length, page: opts.page }, results: cards }, null, 2) +
          "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
