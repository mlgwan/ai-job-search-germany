# Arbeitnow Job Board API Reference

Genuinely public, documented, no-auth JSON API. Docs:
[arbeitnow.com/blog/job-board-api](https://www.arbeitnow.com/blog/job-board-api),
[Postman collection](https://documenter.getpostman.com/view/18545278/UVJbJdKh).
Verified live 2026-07-08.

## Access notes

- `robots.txt` (`https://www.arbeitnow.com/robots.txt`):
  ```
  User-agent: *
  Disallow:
  Disallow: /*?__hstc
  Disallow: /jobs/companies/*/apply
  ```
  Everything is crawlable except HubSpot tracking query strings and the apply-redirect
  path — this skill never fetches `/apply`, only surfaces it as a link.
- The API response's own `meta.terms` field: *"This is a free public API for jobs,
  please do not abuse. I would appreciate linking back to the site. By using the API,
  you agree to the terms of service present on Arbeitnow.com."* — explicit permission
  with a request for courtesy, not a restriction.
- No API key or authentication required.

## Search / listing

```
GET https://www.arbeitnow.com/api/job-board-api
```

| Param | Meaning | Works server-side? |
|-------|---------|---------------------|
| `page` | 1-indexed page, 100 results/page | **Yes** |
| `visa_sponsorship` | `true`/`false` | **Yes** (confirmed: `?visa_sponsorship=true` returned 8/8 matching results) |
| `remote` | Documented in the blog post as a remote filter | **No** — confirmed via live test: `?remote=true` returns a mixed set, not all `remote: true` |
| `tag`, `search`, `q`, `title`, `location`, `keyword`, `category`, `slug` | Plausible/guessed filter names | **No** — every one of these was tested live and silently ignored; the response is byte-identical to the unfiltered request (`links.first` always echoes back `?tag=Developpeur&page=1` regardless of what was actually sent) |

**Implication:** this skill fetches N raw pages (`--pages`, default 5 = up to 500 jobs)
and does all `--query`/`--location`/`--jobage`/`--remote` filtering client-side over
that window. Only `page` and `visa_sponsorship` are passed to the API itself.

Response shape:

```jsonc
{
  "data": [{
    "slug": "senior-qa-engineer-payments-all-genders-berlin-175378",
    "company_name": "Distribusion Technologies",
    "title": "Senior QA Engineer - Payments (All genders)",
    "description": "<p>...</p>",      // full HTML, same content as the detail page
    "remote": false,
    "url": "https://www.arbeitnow.com/jobs/companies/distribusion-technologies/senior-qa-engineer-payments-all-genders-berlin-175378",
    "tags": ["Engineering", "bachelor's degree"],
    "job_types": ["Full-time permanent", "experienced"],
    "location": "Berlin",
    "created_at": 1783509613          // Unix seconds
  }],
  "links": { "first": "...", "last": null, "prev": null, "next": "...?page=2" },
  "meta": {
    "current_page": 1, "per_page": 100,
    "terms": "This is a free public API for jobs, please do not abuse...",
    "info": "Jobs are updated every hour and order by the `created_at` timestamp..."
  }
}
```

`links.last` is always `null` (no total-count/last-page indicator) — pagination is
walked via `links.next` until it's absent or a page returns zero results.

## Detail

**No separate detail JSON endpoint exists.** Tried and confirmed non-functional:
`/api/job-board-api/<slug>` (302 redirect, not a job payload) and `?slug=<slug>`
(silently ignored, same as other filter params above).

Instead, `detail` fetches the job's own public page and parses the embedded
`schema.org` `JobPosting` JSON-LD block, which is far richer and more stable than
scraping rendered markup:

```
GET https://www.arbeitnow.com/jobs/companies/{companySlug}/{jobSlug}
```

The page contains exactly one `<script type="application/ld+json">` block shaped as
`{ "@context": ..., "@graph": [JobPosting, BreadcrumbList, WebSite] }`. Relevant
`JobPosting` fields:

```jsonc
{
  "title": "Senior QA Engineer - Payments (All genders)",
  "description": "<?xml encoding=\"UTF-8\"><p>...</p>",  // HTML, with a leading XML PI to strip
  "datePosted": "2026-07-08 09:53:47+02",
  "employmentType": "FULL_TIME",
  "hiringOrganization": { "name": "Distribusion Technologies", "url": "..." },
  "jobLocation": { "address": { "addressLocality": "Berlin", "addressRegion": "BERLIN", "postalCode": "13355", "addressCountry": "DE" } },
  "skills": "Engineering, bachelor's degree",
  "directApply": false,
  "validThrough": "2026-09-30T11:20:13.000000Z",
  "jobBenefits": "English speaker friendly"
}
```

No `applyUrl` field is present in the structured data — the apply link is a plain
`<a href="{jobPageUrl}/apply">` in the rendered HTML, extracted by regex. **This path is
disallowed in `robots.txt` — the CLI never fetches it, only reports it as a link.**

## Composite job id

Since there's no single-job lookup endpoint, `detail` needs a URL it can construct
directly rather than searching for a bare `slug`. The CLI derives
`"<companySlug>/<jobSlug>"` from each job's own `url` field
(`/jobs/companies/{companySlug}/{jobSlug}`) and uses that as the canonical `id` in
`search` output — `detail` turns it straight back into the fetch URL with no scanning
or guessing required.

## Quirks recorded during investigation (2026-07-08)

- **Only `page` and `visa_sponsorship` filter server-side.** Every other candidate
  param name tested (`remote`, `tag`, `search`, `q`, `title`, `location`, `keyword`,
  `category`, `slug`) was silently ignored — confirmed by observing `links.first` echo
  the same `?tag=Developpeur&page=1` string regardless of the actual request params.
  This is the single most important quirk; see "Important" section in SKILL.md.
- **`links.last` is always `null`** — there's no total-result-count signal; pagination
  must be walked via `links.next` until absent.
- **The description HTML has a leading `<?xml encoding="UTF-8">` processing
  instruction** in the JSON-LD version (not present in the listing API's `description`
  field) — stripped before tag-stripping, or it leaks into the plain-text output.
- **`/apply` is robots.txt-disallowed** — surfaced as a link only, never fetched.
- No `applyUrl` in the JSON-LD; it must be regex-extracted from the rendered page's
  `<a href="…/apply">`.
- **German-language descriptions use named Latin-1 entities for umlauts/eszett**
  (`&auml;`, `&ouml;`, `&uuml;`, `&Uuml;`, `&szlig;`, ...), not just the usual
  `&amp;`/`&lt;`/numeric refs — discovered live during Step 4 testing (a real posting's
  description rendered as `Vitalit&auml;t` instead of `Vitalität` until the entity table
  was extended). Any HTML-to-text step for this portal needs a proper named-entity table,
  not just the handful of punctuation entities that suffice for English-language portals.
