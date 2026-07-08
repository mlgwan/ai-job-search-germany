import { DETAIL_URL, detailFetch, parseJobDetail, writeError, type RawJobDetail } from "../helpers.js"

export interface DetailOpts {
  id: string
  lang: string
  format: "json" | "plain"
}

/** Accept a bare id or a full jv-details web URL and extract the raw id. */
function normalizeId(input: string): string | null {
  const url = input.match(/jv-details\/([^/?#]+)/)
  if (url) return decodeURIComponent(url[1])
  if (/^[\w-]+$/.test(input)) return input
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a job id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const raw = await detailFetch<RawJobDetail>(`${DETAIL_URL}/${encodeURIComponent(id)}?requestLang=${opts.lang}`)
    if (!raw) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(raw, id, opts.lang)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.employmentType ? `Schedule: ${job.employmentType}` : "",
        job.sector ? `Sector: ${job.sector}` : "",
        job.source ? `Source board: ${job.source}` : "",
        job.contactEmail ? `Contact: ${job.contactEmail}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Apply: ${job.applyUrl}` : "",
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
