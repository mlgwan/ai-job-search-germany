// Data source: Arbeitnow's public "Job Board API" (arbeitnow.com/api/job-board-api).
// A genuinely public, documented, no-auth API — arbeitnow.com/blog/job-board-api and
// the API's own `meta.terms` field both invite this kind of use ("free public API for
// jobs, please do not abuse... I would appreciate linking back to the site").
//
// IMPORTANT API QUIRK: only `page` and `visa_sponsorship` are honored server-side.
// Every other documented/plausible filter (`remote`, `tag`, `search`, `location`,
// `slug`, ...) is silently ignored — the server always returns the same newest-first
// firehose regardless. So `--query`/`--location`/`--jobage`/`--remote` are applied
// CLIENT-SIDE against a window of recently-fetched pages. See url-reference.md.
//
// There is also no single-job JSON endpoint. `detail` fetches the job's own HTML page
// and reads the embedded schema.org JobPosting JSON-LD block, which is far more
// reliable than scraping the rendered markup.

export const SEARCH_URL = "https://www.arbeitnow.com/api/job-board-api"
export const JOB_PAGE_BASE = "https://www.arbeitnow.com/jobs/companies"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

async function fetchWithBackoff(url: string, accept: string): Promise<Response> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: accept },
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    return response
  }
  throw new Error("Request failed after max retries")
}

/** Fetch JSON with exponential backoff on 429/5xx. Returns null on a 404. */
export async function jsonFetch<T>(url: string): Promise<T | null> {
  const response = await fetchWithBackoff(url, "application/json")
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
  return (await response.json()) as T
}

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const response = await fetchWithBackoff(url, "text/html,application/xhtml+xml")
  if (response.status === 404) return ""
  if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
  return response.text()
}

export interface RawJob {
  slug: string
  company_name?: string
  title?: string
  description?: string
  remote?: boolean
  url: string
  tags?: string[]
  job_types?: string[]
  location?: string
  created_at?: number
}

export interface RawSearchResponse {
  data?: RawJob[]
  links?: { first?: string | null; last?: string | null; prev?: string | null; next?: string | null }
  meta?: { current_page?: number; per_page?: number; terms?: string; info?: string }
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  remote: boolean | null
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  validThrough: string | null
  skills: string | null
  benefits: string | null
  applyUrl: string | null
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points decode correctly, and
 * drops out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

// German-language listings (this portal's largest source) lean heavily on named Latin-1
// entities for umlauts/eszett (&auml; &Uuml; &szlig; ...) in addition to the usual
// punctuation entities — both are common enough here to need an explicit table rather
// than a handful of one-off replacements.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
  eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", ccedil: "ç", ntilde: "ñ",
  aring: "å", oslash: "ø", aelig: "æ", Aring: "Å", Oslash: "Ø", AElig: "Æ",
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&(#39|#x27);/g, "'")
    // Numeric character references: decimal (&#233;) and hexadecimal (&#xE9;).
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m)
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

/** Strip tags while keeping paragraph/list boundaries as newlines. */
function cleanRichText(html: string): string {
  const withBreaks = html
    .replace(/<\?xml[^>]*\?>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  return decodeHtmlEntities(stripTags(withBreaks)).replace(/\n{3,}/g, "\n\n").trim()
}

/** Extract "<companySlug>/<jobSlug>" from a job's arbeitnow.com URL. */
export function idFromUrl(url: string): string | null {
  const m = url.match(/\/companies\/([^/]+)\/([^/?#]+)/)
  return m ? `${m[1]}/${m[2]}` : null
}

export function mapSearchResult(raw: RawJob): JobCard {
  return {
    id: idFromUrl(raw.url) || raw.slug,
    title: raw.title ? decodeHtmlEntities(raw.title) : "(untitled)",
    company: raw.company_name || null,
    location: raw.location || null,
    date: raw.created_at ? new Date(raw.created_at * 1000).toISOString().slice(0, 10) : null,
    url: raw.url,
    remote: typeof raw.remote === "boolean" ? raw.remote : null,
  }
}

/** Parse the search response: one job per entry, mapped independently so a
 *  malformed entry cannot break the rest. */
export function parseSearchResponse(raw: RawSearchResponse): RawJob[] {
  return (raw.data || []).filter((r): r is RawJob => Boolean(r && r.slug && r.url))
}

/**
 * Split a free-text query into match tokens, keeping "#"/"+" so "c#"/"c++" survive.
 * Requires length >= 3 to drop noisy 2-letter tokens (e.g. "in") that substring-match
 * almost anything — except tokens containing "#"/"+", which stay meaningful even short.
 */
export function normalizeQueryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}#+]+/u)
    .filter((t) => t.length >= 3 || /[#+]/.test(t))
}

export function matchesQuery(job: RawJob, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  const haystack = [job.title, job.company_name, job.location, ...(job.tags || []), ...(job.job_types || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return tokens.some((t) => haystack.includes(t))
}

export function matchesLocation(job: RawJob, location: string): boolean {
  if (!location) return true
  return (job.location || "").toLowerCase().includes(location.toLowerCase())
}

export function matchesRemote(job: RawJob, remoteOnly: boolean): boolean {
  return !remoteOnly || job.remote === true
}

export function withinJobage(job: RawJob, days: number | undefined): boolean {
  if (!days || days <= 0) return true
  if (!job.created_at) return true
  const ageDays = (Date.now() / 1000 - job.created_at) / 86400
  return ageDays <= days
}

/** Resolve a `detail` argument (full URL or "<companySlug>/<jobSlug>" id) to a fetchable job-page URL. */
export function jobUrlFromId(id: string): string | null {
  if (/^https?:\/\//.test(id)) {
    return /arbeitnow\.com\/jobs\/companies\//.test(id) ? id.split("?")[0] : null
  }
  const m = id.match(/^([\w-]+)\/([\w-]+)$/)
  return m ? `${JOB_PAGE_BASE}/${m[1]}/${m[2]}` : null
}

interface JobPostingLd {
  title?: string
  description?: string
  datePosted?: string
  employmentType?: string
  hiringOrganization?: { name?: string }
  jobLocation?: { address?: { addressLocality?: string; addressRegion?: string } }
  skills?: string
  jobBenefits?: string
  validThrough?: string
}

/** Extract the schema.org JobPosting block from the page's JSON-LD (@graph or bare). */
function extractJobPostingLd(html: string): JobPostingLd | null {
  const scripts = html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)
  for (const m of scripts) {
    try {
      const parsed = JSON.parse(m[1])
      const graph = Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed]
      const jp = graph.find((g: { "@type"?: string }) => g?.["@type"] === "JobPosting")
      if (jp) return jp as JobPostingLd
    } catch {
      continue
    }
  }
  return null
}

export function parseJobDetail(html: string, fallbackId: string, pageUrl: string): JobDetail {
  const jp = extractJobPostingLd(html)
  const addr = jp?.jobLocation?.address
  const location = addr ? [addr.addressLocality, addr.addressRegion].filter(Boolean).join(", ") || null : null
  const applyMatch = html.match(/href="([^"]*\/apply)"/)

  return {
    id: idFromUrl(pageUrl) || fallbackId,
    title: jp?.title ? decodeHtmlEntities(jp.title) : "(untitled)",
    company: jp?.hiringOrganization?.name || null,
    location,
    date: jp?.datePosted ? jp.datePosted.slice(0, 10) : null,
    url: pageUrl,
    remote: null,
    description: jp?.description ? cleanRichText(jp.description) || null : null,
    employmentType: jp?.employmentType || null,
    validThrough: jp?.validThrough ? jp.validThrough.slice(0, 10) : null,
    skills: jp?.skills || null,
    benefits: jp?.jobBenefits || null,
    applyUrl: applyMatch ? applyMatch[1] : null,
  }
}
