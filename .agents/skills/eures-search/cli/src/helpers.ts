// Data source: EURES (European Employment Services) — the European Commission's
// official cross-border job mobility portal, covering ~31 EU/EEA countries. This is
// the same JSON API the public europa.eu/eures Angular app calls
// (jv-searchengine/public/jv-search/search and .../jv/id/{id}), reverse-engineered and
// documented by the community at github.com/rorar/EURES-API-Documentation. No auth,
// robots.txt on both europa.eu and eures.europa.eu is unrestricted for these paths.
//
// QUIRK: search results only carry country-level location (a NUTS country code, e.g.
// "DE"), not city/region — city-level location only appears in the `detail` response's
// `locations[]`. See url-reference.md.

export const SEARCH_URL = "https://europa.eu/eures/api/jv-searchengine/public/jv-search/search"
export const DETAIL_URL = "https://europa.eu/eures/api/jv-searchengine/public/jv/id"
export const WEB_DETAIL_URL = "https://europa.eu/eures/portal/jv-se/jv-details"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

async function fetchWithBackoff(url: string, init: RequestInit): Promise<Response> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      ...init,
      headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers || {}) },
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

/** POST search request. Returns null on a 404. */
export async function searchFetch<T>(body: unknown): Promise<T | null> {
  const response = await fetchWithBackoff(SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
  return (await response.json()) as T
}

/** GET detail request. Returns null on a 404. */
export async function detailFetch<T>(url: string): Promise<T | null> {
  const response = await fetchWithBackoff(url, { method: "GET" })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
  return (await response.json()) as T
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  sector: string | null
  source: string | null
  contactEmail: string | null
  applyUrl: string | null
}

export interface RawSearchResult {
  id: string
  title?: string
  description?: string
  creationDate?: number
  employer?: { name?: string }
  locationMap?: Record<string, string[]>
}

export interface RawSearchResponse {
  numberRecords?: number
  jvs?: RawSearchResult[]
}

export interface RawJobDetail {
  id?: string
  source?: string
  preferredLanguage?: string
  jvProfiles?: Record<
    string,
    {
      title?: string
      description?: string
      employmentPeriod?: { startDate?: number }
      positionScheduleCodes?: string[]
      locations?: { cityName?: string | null; region?: string; countryCode?: string; postalCode?: string }[]
      employer?: { name?: string; sectorCodes?: string[]; website?: string | null }
      applicationInstructions?: string[]
      personContacts?: { communications?: { emails?: { uri?: string }[] } }[]
    }
  >
}

// EURES's ~31 member countries (EU27 + EEA + Switzerland). Small, stable, public data —
// used to resolve a country name typed on the command line to the code the API expects,
// and to render a search result's country code back to a readable name.
export const COUNTRY_CODES: Record<string, string> = {
  at: "Austria", be: "Belgium", bg: "Bulgaria", hr: "Croatia", cy: "Cyprus", cz: "Czechia",
  dk: "Denmark", ee: "Estonia", fi: "Finland", fr: "France", de: "Germany", gr: "Greece",
  hu: "Hungary", is: "Iceland", ie: "Ireland", it: "Italy", lv: "Latvia", li: "Liechtenstein",
  lt: "Lithuania", lu: "Luxembourg", mt: "Malta", nl: "Netherlands", no: "Norway", pl: "Poland",
  pt: "Portugal", ro: "Romania", sk: "Slovakia", si: "Slovenia", es: "Spain", se: "Sweden",
  ch: "Switzerland",
}

// German Bundesländer, NUTS-1 level — the finest granularity confirmed to filter
// correctly server-side (see url-reference.md; NUTS-3/city-level codes returned zero
// results in testing).
export const GERMAN_REGION_CODES: Record<string, string> = {
  de1: "Baden-Württemberg", de2: "Bayern", de3: "Berlin", de4: "Brandenburg", de5: "Bremen",
  de6: "Hamburg", de7: "Hessen", de8: "Mecklenburg-Vorpommern", de9: "Niedersachsen",
  dea: "Nordrhein-Westfalen", deb: "Rheinland-Pfalz", dec: "Saarland", ded: "Sachsen",
  dee: "Sachsen-Anhalt", def: "Schleswig-Holstein", deg: "Thüringen",
}

/** Resolve a --location value (code or English/German name) to the API's lowercase code. */
export function resolveLocationCode(input: string): string {
  const key = input.trim().toLowerCase()
  if (COUNTRY_CODES[key] || GERMAN_REGION_CODES[key]) return key
  const byCountryName = Object.entries(COUNTRY_CODES).find(([, name]) => name.toLowerCase() === key)
  if (byCountryName) return byCountryName[0]
  const byRegionName = Object.entries(GERMAN_REGION_CODES).find(([, name]) => name.toLowerCase() === key)
  if (byRegionName) return byRegionName[0]
  return key
}

function displayLocation(locationMap: Record<string, string[]> | undefined): string | null {
  if (!locationMap) return null
  const countries = Object.keys(locationMap).map((code) => COUNTRY_CODES[code.toLowerCase()] || code)
  return countries.length > 0 ? countries.join(", ") : null
}

function jobUrl(id: string, lang: string): string {
  return `${WEB_DETAIL_URL}/${encodeURIComponent(id)}?jvDisplayLanguage=${lang}`
}

export function mapSearchResult(raw: RawSearchResult, lang: string): JobCard {
  return {
    id: raw.id,
    title: raw.title || "(untitled)",
    company: raw.employer?.name || null,
    location: displayLocation(raw.locationMap),
    date: raw.creationDate ? new Date(raw.creationDate).toISOString().slice(0, 10) : null,
    url: jobUrl(raw.id, lang),
  }
}

/** Parse the search response: one job per entry, mapped independently so a
 *  malformed entry cannot break the rest. */
export function parseSearchResponse(raw: RawSearchResponse): RawSearchResult[] {
  return (raw.jvs || []).filter((r): r is RawSearchResult => Boolean(r && r.id))
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Extract the first http(s) link from EURES's free-text application instructions. */
function firstLink(text: string): string | null {
  const m = text.match(/href="([^"]+)"/i) || text.match(/(https?:\/\/[^\s"<]+)/i)
  return m ? m[1] : null
}

export function parseJobDetail(raw: RawJobDetail, fallbackId: string, lang: string): JobDetail {
  const profiles = raw.jvProfiles || {}
  const profile = profiles[lang] || profiles[raw.preferredLanguage || ""] || Object.values(profiles)[0]
  const id = raw.id || fallbackId
  const loc = profile?.locations?.[0]
  const location = loc ? [loc.cityName, loc.region].filter(Boolean).join(", ") || null : null
  const instructions = (profile?.applicationInstructions || []).join(" ")
  const contactEmail = profile?.personContacts?.[0]?.communications?.emails?.[0]?.uri || null

  return {
    id,
    title: profile?.title || "(untitled)",
    company: profile?.employer?.name || null,
    location,
    date: profile?.employmentPeriod?.startDate
      ? new Date(profile.employmentPeriod.startDate).toISOString().slice(0, 10)
      : null,
    url: jobUrl(id, lang),
    description: profile?.description ? stripHtml(profile.description) || null : null,
    employmentType: profile?.positionScheduleCodes?.join(", ") || null,
    sector: profile?.employer?.sectorCodes?.join(", ") || null,
    source: raw.source || null,
    contactEmail,
    applyUrl: instructions ? firstLink(instructions) : null,
  }
}

/** Map a jobage-in-days flag to EURES's coarse publicationPeriod enum (confirmed values). */
export function jobageToPublicationPeriod(days: number | undefined): "LAST_DAY" | "LAST_WEEK" | "LAST_MONTH" | null {
  if (!days || days <= 0) return null
  if (days <= 1) return "LAST_DAY"
  if (days <= 7) return "LAST_WEEK"
  return "LAST_MONTH"
}
