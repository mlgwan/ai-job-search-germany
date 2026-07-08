import { describe, test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

interface JobCard {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  date: string | null;
  url: string;
  remote: boolean | null;
}

interface SearchResponse {
  meta: { count: number; page: number };
  results: JobCard[];
}

describe("arbeitnow-cli live smoke test", () => {
  test("search returns real results with populated id/title/url", async () => {
    const result = await runCLI(["search", "-q", "Softwareentwickler:in - C#", "--pages", "5", "--limit", "5"]);
    const body = parseJSON<SearchResponse>(result);
    expect(body.results.length).toBeGreaterThan(0);
    for (const job of body.results) {
      expect(job.id).toBeTruthy();
      expect(job.title).toBeTruthy();
      expect(job.url).toMatch(/^https:\/\/www\.arbeitnow\.com\/jobs\/companies\//);
    }
  });

  test("detail returns a readable description for a job found via search", async () => {
    const searchResult = await runCLI(["search", "-q", "Softwareentwickler:in - C#", "--pages", "5", "--limit", "1"]);
    const { results } = parseJSON<SearchResponse>(searchResult);
    expect(results.length).toBeGreaterThan(0);

    const detailResult = await runCLI(["detail", results[0].id, "--format", "plain"]);
    expect(detailResult.exitCode).toBe(0);
    expect(detailResult.stdout.length).toBeGreaterThan(0);
    expect(detailResult.stdout).not.toMatch(/<[a-z]+>/i);
  });

  test("bogus numeric flag exits 1 with BAD_ARG JSON on stderr", async () => {
    const result = await runCLI(["search", "--jobage", "notanumber"]);
    expect(result.exitCode).not.toBe(0);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("BAD_ARG");
    expect(err.error).toMatch(/jobage/);
  });

  test("detail with no id exits 1 with NO_ID JSON on stderr", async () => {
    const result = await runCLI(["detail"]);
    expect(result.exitCode).not.toBe(0);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("NO_ID");
  });

  test("detail with an unresolvable id exits 1 with BAD_ID JSON on stderr", async () => {
    const result = await runCLI(["detail", "not-a-valid-id!"]);
    expect(result.exitCode).not.toBe(0);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("BAD_ID");
  });
});
