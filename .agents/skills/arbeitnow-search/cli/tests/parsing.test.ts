import { describe, test, expect } from "bun:test";
import {
  idFromUrl,
  mapSearchResult,
  parseSearchResponse,
  normalizeQueryTokens,
  matchesQuery,
  matchesLocation,
  matchesRemote,
  withinJobage,
  jobUrlFromId,
  parseJobDetail,
  type RawJob,
} from "../src/helpers";

function job(overrides: Partial<RawJob> = {}): RawJob {
  return {
    slug: "senior-qa-engineer-payments-all-genders-berlin-175378",
    company_name: "Distribusion Technologies",
    title: "Senior QA Engineer - Payments (All genders)",
    url: "https://www.arbeitnow.com/jobs/companies/distribusion-technologies/senior-qa-engineer-payments-all-genders-berlin-175378",
    remote: false,
    tags: ["Engineering", "bachelor's degree"],
    job_types: ["Full-time permanent"],
    location: "Berlin",
    created_at: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

describe("idFromUrl", () => {
  test("extracts companySlug/jobSlug from a full job URL", () => {
    expect(idFromUrl(job().url)).toBe(
      "distribusion-technologies/senior-qa-engineer-payments-all-genders-berlin-175378",
    );
  });

  test("returns null for a URL that doesn't match the companies/ pattern", () => {
    expect(idFromUrl("https://www.arbeitnow.com/blog/some-post")).toBeNull();
  });
});

describe("mapSearchResult", () => {
  test("maps a raw job to a JobCard with composite id and ISO date", () => {
    const card = mapSearchResult(job({ created_at: 1783509613 }));
    expect(card.id).toBe("distribusion-technologies/senior-qa-engineer-payments-all-genders-berlin-175378");
    expect(card.company).toBe("Distribusion Technologies");
    expect(card.location).toBe("Berlin");
    expect(card.date).toBe(new Date(1783509613 * 1000).toISOString().slice(0, 10));
    expect(card.remote).toBe(false);
  });

  test("falls back to raw slug as id when the URL doesn't match the expected pattern", () => {
    const card = mapSearchResult(job({ url: "https://www.arbeitnow.com/weird/path" }));
    expect(card.id).toBe("senior-qa-engineer-payments-all-genders-berlin-175378");
  });

  test("nulls out missing fields rather than omitting them", () => {
    const card = mapSearchResult({ slug: "x", url: "https://www.arbeitnow.com/jobs/companies/a/x" });
    expect(card.company).toBeNull();
    expect(card.location).toBeNull();
    expect(card.date).toBeNull();
    expect(card.remote).toBeNull();
  });
});

describe("parseSearchResponse", () => {
  test("skips entries missing slug or url", () => {
    const jobs = parseSearchResponse({
      data: [job({ slug: "1" }), { title: "no slug/url" } as RawJob, job({ slug: "2" })],
    });
    expect(jobs.map((j) => j.slug)).toEqual(["1", "2"]);
  });

  test("empty response yields empty array", () => {
    expect(parseSearchResponse({})).toEqual([]);
  });
});

describe("normalizeQueryTokens / matchesQuery", () => {
  test("keeps '#' and '+' attached to tokens (C#, C++ survive tokenizing), drops noisy short tokens", () => {
    expect(normalizeQueryTokens("Softwareentwickler:in - C#")).toEqual(["softwareentwickler", "c#"]);
  });

  test("matches when any token appears in title/company/location/tags", () => {
    const tokens = normalizeQueryTokens("Softwareentwickler:in - C#");
    expect(matchesQuery(job({ title: "Java Softwareentwickler" }), tokens)).toBe(true);
  });

  test("does not match when no token appears anywhere", () => {
    const tokens = normalizeQueryTokens("Nurse Practitioner");
    expect(matchesQuery(job(), tokens)).toBe(false);
  });

  test("empty query matches everything", () => {
    expect(matchesQuery(job(), [])).toBe(true);
  });
});

describe("matchesLocation", () => {
  test("case-insensitive substring match", () => {
    expect(matchesLocation(job({ location: "Berlin, Germany" }), "berlin")).toBe(true);
    expect(matchesLocation(job({ location: "Munich" }), "berlin")).toBe(false);
  });

  test("empty filter matches everything", () => {
    expect(matchesLocation(job(), "")).toBe(true);
  });
});

describe("matchesRemote", () => {
  test("remoteOnly=false always matches", () => {
    expect(matchesRemote(job({ remote: false }), false)).toBe(true);
  });

  test("remoteOnly=true requires remote===true", () => {
    expect(matchesRemote(job({ remote: true }), true)).toBe(true);
    expect(matchesRemote(job({ remote: false }), true)).toBe(false);
  });
});

describe("withinJobage", () => {
  test("job posted 2 days ago is within a 7-day window", () => {
    const created_at = Math.floor(Date.now() / 1000) - 2 * 86400;
    expect(withinJobage(job({ created_at }), 7)).toBe(true);
  });

  test("job posted 30 days ago is outside a 7-day window", () => {
    const created_at = Math.floor(Date.now() / 1000) - 30 * 86400;
    expect(withinJobage(job({ created_at }), 7)).toBe(false);
  });

  test("undefined/zero days means no filter", () => {
    const created_at = Math.floor(Date.now() / 1000) - 365 * 86400;
    expect(withinJobage(job({ created_at }), undefined)).toBe(true);
    expect(withinJobage(job({ created_at }), 0)).toBe(true);
  });
});

describe("jobUrlFromId", () => {
  test("accepts a full arbeitnow.com job URL", () => {
    expect(jobUrlFromId(job().url)).toBe(job().url);
  });

  test("rejects a URL from a different host", () => {
    expect(jobUrlFromId("https://example.com/jobs/companies/a/b")).toBeNull();
  });

  test("accepts a bare '<companySlug>/<jobSlug>' id", () => {
    expect(jobUrlFromId("acme/backend-engineer")).toBe(
      "https://www.arbeitnow.com/jobs/companies/acme/backend-engineer",
    );
  });

  test("rejects a malformed id", () => {
    expect(jobUrlFromId("not-a-valid-id")).toBeNull();
  });
});

describe("parseJobDetail", () => {
  const html = `<html><body>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[
      {"@type":"JobPosting","title":"World&rsquo;s Best Engineer","description":"<p>Great role &amp; team</p><ul><li>Item one</li></ul>",
       "datePosted":"2026-07-08 09:53:47+02","employmentType":"FULL_TIME",
       "hiringOrganization":{"name":"Acme GmbH"},
       "jobLocation":{"address":{"addressLocality":"Berlin","addressRegion":"BERLIN"}},
       "skills":"Engineering, bachelor's degree","jobBenefits":"English speaker friendly",
       "validThrough":"2026-09-30T11:20:13.000000Z"}
    ]}
    </script>
    <a href="https://www.arbeitnow.com/jobs/companies/acme/backend-engineer/apply">Apply</a>
  </body></html>`;

  test("extracts fields from the embedded JobPosting JSON-LD", () => {
    const detail = parseJobDetail(html, "fallback-id", "https://www.arbeitnow.com/jobs/companies/acme/backend-engineer");
    expect(detail.id).toBe("acme/backend-engineer");
    expect(detail.title).toBe("World’s Best Engineer");
    expect(detail.company).toBe("Acme GmbH");
    expect(detail.location).toBe("Berlin, BERLIN");
    expect(detail.employmentType).toBe("FULL_TIME");
    expect(detail.validThrough).toBe("2026-09-30");
    expect(detail.applyUrl).toBe("https://www.arbeitnow.com/jobs/companies/acme/backend-engineer/apply");
  });

  test("strips HTML from the description and keeps paragraph breaks", () => {
    const detail = parseJobDetail(html, "fallback-id", "https://www.arbeitnow.com/jobs/companies/acme/backend-engineer");
    expect(detail.description).not.toMatch(/<[a-z]+>/i);
    expect(detail.description).toContain("Great role & team");
    expect(detail.description).toContain("Item one");
  });

  test("falls back gracefully when no JobPosting JSON-LD is present", () => {
    const detail = parseJobDetail("<html><body>no ld+json here</body></html>", "fallback-id", "https://www.arbeitnow.com/jobs/companies/x/y");
    expect(detail.id).toBe("x/y");
    expect(detail.title).toBe("(untitled)");
    expect(detail.description).toBeNull();
  });
});
