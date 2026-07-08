import { describe, test, expect } from "bun:test";
import {
  mapSearchResult,
  parseSearchResponse,
  parseJobDetail,
  resolveLocationCode,
  jobageToPublicationPeriod,
  type RawSearchResult,
  type RawJobDetail,
} from "../src/helpers";

describe("mapSearchResult", () => {
  test("maps country code(s) in locationMap to display names", () => {
    const card = mapSearchResult(
      { id: "abc123", title: "Softwareentwickler", employer: { name: "Acme GmbH" }, locationMap: { DE: ["DE911"] }, creationDate: 1762817433895 },
      "de",
    );
    expect(card.id).toBe("abc123");
    expect(card.company).toBe("Acme GmbH");
    expect(card.location).toBe("Germany");
    expect(card.date).toBe(new Date(1762817433895).toISOString().slice(0, 10));
    expect(card.url).toBe("https://europa.eu/eures/portal/jv-se/jv-details/abc123?jvDisplayLanguage=de");
  });

  test("joins multiple countries", () => {
    const card = mapSearchResult({ id: "x", title: "T", locationMap: { DE: ["DE1"], FR: ["FR1"] } }, "en");
    expect(card.location).toBe("Germany, France");
  });

  test("nulls out missing fields rather than omitting them", () => {
    const card = mapSearchResult({ id: "x", title: "T" }, "en");
    expect(card.company).toBeNull();
    expect(card.location).toBeNull();
    expect(card.date).toBeNull();
  });

  test("falls back to (untitled) when title is missing", () => {
    const card = mapSearchResult({ id: "x" } as RawSearchResult, "en");
    expect(card.title).toBe("(untitled)");
  });
});

describe("parseSearchResponse", () => {
  test("skips entries missing an id", () => {
    const results = parseSearchResponse({
      jvs: [{ id: "1", title: "A" }, { title: "no id" } as RawSearchResult, { id: "2", title: "B" }],
    });
    expect(results.map((r) => r.id)).toEqual(["1", "2"]);
  });

  test("empty response yields empty array", () => {
    expect(parseSearchResponse({})).toEqual([]);
  });
});

describe("resolveLocationCode", () => {
  test("passes through an already-valid country code", () => {
    expect(resolveLocationCode("de")).toBe("de");
    expect(resolveLocationCode("DE")).toBe("de");
  });

  test("resolves a country name to its code", () => {
    expect(resolveLocationCode("Germany")).toBe("de");
    expect(resolveLocationCode("luxembourg")).toBe("lu");
  });

  test("resolves a German Bundesland name or NUTS-1 code", () => {
    expect(resolveLocationCode("Berlin")).toBe("de3");
    expect(resolveLocationCode("bayern")).toBe("de2");
    expect(resolveLocationCode("DE9")).toBe("de9");
  });

  test("passes through an unrecognized value as-is (lowercased)", () => {
    expect(resolveLocationCode("Unknownistan")).toBe("unknownistan");
  });
});

describe("jobageToPublicationPeriod", () => {
  test("maps day thresholds to the confirmed EURES enum values", () => {
    expect(jobageToPublicationPeriod(1)).toBe("LAST_DAY");
    expect(jobageToPublicationPeriod(7)).toBe("LAST_WEEK");
    expect(jobageToPublicationPeriod(30)).toBe("LAST_MONTH");
    expect(jobageToPublicationPeriod(365)).toBe("LAST_MONTH");
  });

  test("treats zero/negative/undefined as no filter", () => {
    expect(jobageToPublicationPeriod(0)).toBeNull();
    expect(jobageToPublicationPeriod(-5)).toBeNull();
    expect(jobageToPublicationPeriod(undefined)).toBeNull();
  });
});

describe("parseJobDetail", () => {
  const raw: RawJobDetail = {
    id: "abc123",
    source: "DE001",
    preferredLanguage: "de",
    jvProfiles: {
      de: {
        title: "Softwareentwickler (m/w/d)",
        description: "Wir suchen<br><br>eine <b>tolle</b> Person &amp; Team",
        employmentPeriod: { startDate: 1782086400000 },
        positionScheduleCodes: ["fulltime"],
        locations: [{ cityName: "Braunschweig", region: "de911", countryCode: "de" }],
        employer: { name: "TEQYARD GmbH", sectorCodes: ["k62.1.0"] },
        applicationInstructions: ['Bewerbung: <a href="https://www.arbeitsagentur.de/jobsuche/jobdetail/x">link</a>'],
        personContacts: [{ communications: { emails: [{ uri: "bewerbung@teqyard.de" }] } }],
      },
    },
  };

  test("extracts fields from the requested-language jvProfile", () => {
    const job = parseJobDetail(raw, "fallback", "de");
    expect(job.id).toBe("abc123");
    expect(job.title).toBe("Softwareentwickler (m/w/d)");
    expect(job.company).toBe("TEQYARD GmbH");
    expect(job.location).toBe("Braunschweig, de911");
    expect(job.date).toBe(new Date(1782086400000).toISOString().slice(0, 10));
    expect(job.employmentType).toBe("fulltime");
    expect(job.sector).toBe("k62.1.0");
    expect(job.source).toBe("DE001");
    expect(job.contactEmail).toBe("bewerbung@teqyard.de");
    expect(job.applyUrl).toBe("https://www.arbeitsagentur.de/jobsuche/jobdetail/x");
  });

  test("strips HTML from the description and keeps paragraph breaks", () => {
    const job = parseJobDetail(raw, "fallback", "de");
    expect(job.description).not.toMatch(/<[a-z]+>/i);
    expect(job.description).toContain("tolle Person & Team");
  });

  test("falls back to preferredLanguage, then any available profile, when the requested lang is absent", () => {
    const job = parseJobDetail(raw, "fallback", "fr");
    expect(job.title).toBe("Softwareentwickler (m/w/d)");
  });

  test("falls back gracefully when jvProfiles is empty", () => {
    const job = parseJobDetail({ id: "x" }, "fallback-id", "de");
    expect(job.id).toBe("x");
    expect(job.title).toBe("(untitled)");
    expect(job.description).toBeNull();
  });
});
