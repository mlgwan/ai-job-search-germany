import {
  DETAIL_URL,
  jsonFetch,
  parseJobDetail,
  encodeRefnr,
  normalizeRefnr,
  writeError,
  type RawJobDetail,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const refnr = normalizeRefnr(opts.id)
  if (!refnr) {
    writeError(`Could not parse a job reference number from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const raw = await jsonFetch<RawJobDetail>(`${DETAIL_URL}/${encodeRefnr(refnr)}`)
    if (!raw) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(raw, refnr)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.contractType ? `Contract: ${job.contractType}` : "",
        job.remote === true ? "Remote: home office possible" : job.remote === false ? "Remote: not stated" : "",
        job.compensation ? `Compensation: ${job.compensation}` : "",
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
