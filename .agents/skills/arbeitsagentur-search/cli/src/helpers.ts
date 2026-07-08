// Data source: Bundesagentur für Arbeit "Jobsuche" REST API — Germany's state
// employment agency job board. The agency does not publish an official API, but
// this is the same JSON backend its own website and mobile app call, identified
// by the public client key below (documented at github.com/bundesAPI/jobsuche-api).
// No login/session is required.

export const SEARCH_URL = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/app/jobs"
export const DETAIL_URL = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails"
export const WEB_DETAIL_URL = "https://www.arbeitsagentur.de/jobsuche/jobdetail"

const API_KEY = "jobboerse-jobsuche"
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** Fetch JSON with exponential backoff on 429/5xx. Returns null on a 404. */
export async function jsonFetch<T>(url: string): Promise<T | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "X-API-Key": API_KEY,
      },
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
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return (await response.json()) as T
  }
  throw new Error("Request failed after max retries")
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
  contractType: string | null
  remote: boolean | null
  compensation: string | null
  applyUrl: string | null
}

export interface RawSearchResult {
  refnr: string
  beruf?: string
  titel?: string
  arbeitgeber?: string
  aktuelleVeroeffentlichungsdatum?: string
  arbeitsort?: { ort?: string; plz?: string; region?: string }
}

export interface RawSearchResponse {
  stellenangebote?: RawSearchResult[]
  maxErgebnisse?: number
  page?: number
  size?: number
}

export interface RawJobDetail {
  referenznummer?: string
  stellenangebotsTitel?: string
  firma?: string
  stellenangebotsBeschreibung?: string
  externeURL?: string
  datumErsteVeroeffentlichung?: string
  veroeffentlichungszeitraum?: { von?: string }
  stellenlokationen?: { adresse?: { ort?: string; plz?: string; region?: string } }[]
  arbeitszeitVollzeit?: boolean
  vertragsdauer?: string
  homeofficemoeglich?: boolean
  verguetungsangabe?: string
}

function jobUrl(refnr: string): string {
  return `${WEB_DETAIL_URL}/${encodeURIComponent(refnr)}`
}

function formatLocation(ort?: string | null, region?: string | null): string | null {
  if (!ort) return region || null
  return region && region !== ort ? `${ort}, ${region}` : ort
}

export function mapSearchResult(raw: RawSearchResult): JobCard {
  return {
    id: raw.refnr,
    title: raw.titel || raw.beruf || "(untitled)",
    company: raw.arbeitgeber || null,
    location: formatLocation(raw.arbeitsort?.ort, raw.arbeitsort?.region),
    date: raw.aktuelleVeroeffentlichungsdatum || null,
    url: jobUrl(raw.refnr),
  }
}

/** Parse the search response: one job per entry, each mapped independently so a
 *  malformed entry cannot break the rest. */
export function parseSearchResponse(raw: RawSearchResponse): JobCard[] {
  return (raw.stellenangebote || [])
    .filter((r): r is RawSearchResult => Boolean(r && r.refnr))
    .map(mapSearchResult)
}

export function parseJobDetail(raw: RawJobDetail, refnr: string): JobDetail {
  const loc = raw.stellenlokationen?.[0]?.adresse
  const id = raw.referenznummer || refnr
  return {
    id,
    title: raw.stellenangebotsTitel || "(untitled)",
    company: raw.firma || null,
    location: formatLocation(loc?.ort, loc?.region),
    date: raw.datumErsteVeroeffentlichung || raw.veroeffentlichungszeitraum?.von || null,
    url: jobUrl(id),
    description: raw.stellenangebotsBeschreibung?.trim() || null,
    employmentType:
      raw.arbeitszeitVollzeit === true ? "Vollzeit" : raw.arbeitszeitVollzeit === false ? "Teilzeit" : null,
    contractType: raw.vertragsdauer && raw.vertragsdauer !== "KEINE_ANGABE" ? raw.vertragsdauer : null,
    remote: typeof raw.homeofficemoeglich === "boolean" ? raw.homeofficemoeglich : null,
    compensation:
      raw.verguetungsangabe && raw.verguetungsangabe !== "KEINE_ANGABEN" ? raw.verguetungsangabe : null,
    applyUrl: raw.externeURL || null,
  }
}

/** Base64-encode a refnr for the jobdetails endpoint (the API expects Base64, not URL-encoding). */
export function encodeRefnr(refnr: string): string {
  return Buffer.from(refnr, "utf-8").toString("base64")
}

/** Extract a refnr from a raw id or an arbeitsagentur.de jobdetail URL. */
export function normalizeRefnr(input: string): string | null {
  const webUrl = input.match(/jobdetail\/([^/?#]+)/)
  if (webUrl) return decodeURIComponent(webUrl[1])
  if (/^[\w-]+$/.test(input)) return input
  return null
}

/** Map a jobage-in-days flag to the API's veroeffentlichtseit param (0-100, clamped). */
export function jobageToVeroeffentlichtseit(days: number): number | null {
  if (!days || days <= 0) return null
  return Math.min(days, 100)
}
