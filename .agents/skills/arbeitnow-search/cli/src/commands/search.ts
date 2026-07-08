import {
  SEARCH_URL,
  jsonFetch,
  parseSearchResponse,
  mapSearchResult,
  normalizeQueryTokens,
  matchesQuery,
  matchesLocation,
  matchesRemote,
  withinJobage,
  writeError,
  type JobCard,
  type RawJob,
  type RawSearchResponse,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage?: number
  remote?: boolean
  visa?: boolean
  pages: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

/**
 * Fetch up to `opts.pages` raw API pages (100 jobs each). The API only honors
 * `page` and `visa_sponsorship` server-side — see helpers.ts for why every
 * other filter is applied client-side against this fetched window.
 */
async function fetchCandidates(opts: SearchOpts): Promise<RawJob[]> {
  const all: RawJob[] = []
  for (let p = 1; p <= opts.pages; p++) {
    const params = new URLSearchParams()
    params.set("page", String(p))
    if (opts.visa) params.set("visa_sponsorship", "true")
    const raw = await jsonFetch<RawSearchResponse>(`${SEARCH_URL}?${params.toString()}`)
    const jobs = raw ? parseSearchResponse(raw) : []
    if (jobs.length === 0) break
    all.push(...jobs)
    if (!raw?.links?.next) break
  }
  return all
}

/**
 * Arbeitnow has no server-side keyword/location search (see helpers.ts), so a
 * zero-result search is often just "no overlap in the scanned window," not a
 * failure. Explain that instead of returning a silent, unexplained empty list.
 */
export function zeroResultHint(opts: SearchOpts, candidateCount: number): string | null {
  const filters: string[] = []
  if (opts.query) filters.push(`--query "${opts.query}"`)
  if (opts.location) filters.push(`--location "${opts.location}"`)
  if (opts.remote) filters.push("--remote")
  if (opts.jobage) filters.push(`--jobage ${opts.jobage}`)
  if (filters.length === 0 || candidateCount === 0) return null
  return (
    `No matches for ${filters.join(" + ")} among the ${candidateCount} most recent postings scanned ` +
    `(--pages ${opts.pages}). Arbeitnow has no server-side keyword/location search, so combining filters ` +
    `narrows to whatever overlaps in that window — try a higher --pages, or drop one of the filters above.`
  )
}

function renderTable(cards: JobCard[], hint: string | null): string {
  if (cards.length === 0) return hint ? `No results.\n${hint}` : "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 26).padEnd(26)
    const loc = (c.location || "—").slice(0, 20).padEnd(20)
    const remote = c.remote === true ? "remote" : c.remote === false ? "on-site" : "—"
    const date = c.date || "—"
    return `${c.id.slice(0, 34).padEnd(34)} ${title} ${company} ${loc} ${remote.padEnd(8)} ${date}`
  })
  const header =
    "ID".padEnd(34) +
    " " +
    "TITLE".padEnd(42) +
    " " +
    "COMPANY".padEnd(26) +
    " " +
    "LOCATION".padEnd(20) +
    " " +
    "REMOTE".padEnd(8) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const candidates = await fetchCandidates(opts)
    const tokens = opts.query ? normalizeQueryTokens(opts.query) : []
    const filtered = candidates.filter(
      (j) =>
        matchesQuery(j, tokens) &&
        matchesLocation(j, opts.location || "") &&
        matchesRemote(j, !!opts.remote) &&
        withinJobage(j, opts.jobage),
    )

    const pageSize = opts.limit && opts.limit > 0 ? opts.limit : 20
    const start = (opts.page - 1) * pageSize
    const cards = filtered.slice(start, start + pageSize).map(mapSearchResult)
    const hint = filtered.length === 0 ? zeroResultHint(opts, candidates.length) : null

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards, hint) + "\n")
    } else if (opts.format === "plain") {
      if (cards.length === 0) {
        process.stdout.write((hint || "No results.") + "\n")
      } else {
        process.stdout.write(
          cards
            .map(
              (c) =>
                `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
            )
            .join("\n\n") + "\n",
        )
      }
    } else {
      const meta: { count: number; page: number; hint?: string } = { count: filtered.length, page: opts.page }
      if (hint) meta.hint = hint
      process.stdout.write(JSON.stringify({ meta, results: cards }, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
