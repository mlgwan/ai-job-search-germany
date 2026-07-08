import { describe, test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

interface JobCard {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  date: string | null;
  url: string;
}

interface SearchResponse {
  meta: { count: number; page: number };
  results: JobCard[];
}

describe("arbeitsagentur-cli live smoke test", () => {
  test("search returns real results with populated id/title/url", async () => {
    const result = await runCLI(["search", "-q", "Softwareentwickler:in - C#", "-l", "Berlin", "--limit", "5"]);
    const body = parseJSON<SearchResponse>(result);
    expect(body.results.length).toBeGreaterThan(0);
    for (const job of body.results) {
      expect(job.id).toBeTruthy();
      expect(job.title).toBeTruthy();
      expect(job.url).toMatch(/^https:\/\/www\.arbeitsagentur\.de\/jobsuche\/jobdetail\//);
    }
  });

  test("detail returns a readable description for a job found via search", async () => {
    const searchResult = await runCLI(["search", "-q", "Softwareentwickler:in - C#", "-l", "Berlin", "--limit", "1"]);
    const { results } = parseJSON<SearchResponse>(searchResult);
    expect(results.length).toBeGreaterThan(0);

    const detailResult = await runCLI(["detail", results[0].id, "--format", "plain"]);
    expect(detailResult.exitCode).toBe(0);
    expect(detailResult.stdout.length).toBeGreaterThan(0);
    expect(detailResult.stdout).not.toMatch(/<[a-z]+>/i);
  });

  test("missing both --query and --location exits 1 with NO_FILTER", async () => {
    const result = await runCLI(["search"]);
    expect(result.exitCode).not.toBe(0);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("NO_FILTER");
  });

  test("bogus numeric flag exits 1 with BAD_ARG JSON on stderr", async () => {
    const result = await runCLI(["search", "-q", "test", "--jobage", "notanumber"]);
    expect(result.exitCode).not.toBe(0);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("BAD_ARG");
    expect(err.error).toMatch(/jobage/);
  });
});
