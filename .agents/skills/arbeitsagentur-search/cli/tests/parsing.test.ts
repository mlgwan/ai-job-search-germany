import { describe, test, expect } from "bun:test";
import {
  mapSearchResult,
  parseSearchResponse,
  parseJobDetail,
  normalizeRefnr,
  encodeRefnr,
  jobageToVeroeffentlichtseit,
} from "../src/helpers";

describe("mapSearchResult", () => {
  test("prefers titel over beruf, joins ort+region when they differ", () => {
    const card = mapSearchResult({
      refnr: "12336-a26f964j0448039-S",
      beruf: "Softwareentwickler/in",
      titel: "Lead Entwickler C# /.NET (w/m/d)",
      arbeitgeber: "Value AG",
      aktuelleVeroeffentlichungsdatum: "2026-07-03",
      arbeitsort: { ort: "Berlin", plz: "10178", region: "Berlin" },
    });
    expect(card.id).toBe("12336-a26f964j0448039-S");
    expect(card.title).toBe("Lead Entwickler C# /.NET (w/m/d)");
    expect(card.company).toBe("Value AG");
    expect(card.location).toBe("Berlin");
    expect(card.date).toBe("2026-07-03");
    expect(card.url).toBe("https://www.arbeitsagentur.de/jobsuche/jobdetail/12336-a26f964j0448039-S");
  });

  test("falls back to beruf when titel is missing", () => {
    const card = mapSearchResult({ refnr: "1", beruf: "Bürokaufmann/-frau" });
    expect(card.title).toBe("Bürokaufmann/-frau");
  });

  test("falls back to (untitled) when both titel and beruf are missing", () => {
    const card = mapSearchResult({ refnr: "1" });
    expect(card.title).toBe("(untitled)");
  });

  test("nulls out missing company/location/date rather than omitting them", () => {
    const card = mapSearchResult({ refnr: "1", titel: "X" });
    expect(card.company).toBeNull();
    expect(card.location).toBeNull();
    expect(card.date).toBeNull();
  });
});

describe("parseSearchResponse", () => {
  test("skips malformed entries without a refnr instead of throwing", () => {
    const cards = parseSearchResponse({
      stellenangebote: [
        { refnr: "1", titel: "Good" },
        { titel: "No refnr" } as any,
        { refnr: "2", titel: "Also good" },
      ],
    });
    expect(cards.map((c) => c.id)).toEqual(["1", "2"]);
  });

  test("empty response yields empty array", () => {
    expect(parseSearchResponse({})).toEqual([]);
  });
});

describe("parseJobDetail", () => {
  test("maps firma (not arbeitgeber) to company, and treats KEINE_ANGABE(N) as null", () => {
    const job = parseJobDetail(
      {
        referenznummer: "12336-a26f964j0448039-S",
        stellenangebotsTitel: "Lead Entwickler C# /.NET (w/m/d)",
        firma: "Value AG",
        stellenangebotsBeschreibung: "  Some description  ",
        externeURL: "https://gute-jobs.de/viewjob-bkxa2",
        datumErsteVeroeffentlichung: "2026-07-03",
        stellenlokationen: [{ adresse: { ort: "Göttingen", region: "NIEDERSACHSEN" } }],
        arbeitszeitVollzeit: true,
        vertragsdauer: "KEINE_ANGABE",
        homeofficemoeglich: false,
        verguetungsangabe: "KEINE_ANGABEN",
      },
      "12336-a26f964j0448039-S",
    );
    expect(job.company).toBe("Value AG");
    expect(job.location).toBe("Göttingen, NIEDERSACHSEN");
    expect(job.description).toBe("Some description");
    expect(job.employmentType).toBe("Vollzeit");
    expect(job.contractType).toBeNull();
    expect(job.remote).toBe(false);
    expect(job.compensation).toBeNull();
    expect(job.applyUrl).toBe("https://gute-jobs.de/viewjob-bkxa2");
  });

  test("falls back to the refnr argument when referenznummer is absent", () => {
    const job = parseJobDetail({ stellenangebotsTitel: "X" }, "fallback-refnr");
    expect(job.id).toBe("fallback-refnr");
    expect(job.url).toBe("https://www.arbeitsagentur.de/jobsuche/jobdetail/fallback-refnr");
  });
});

describe("normalizeRefnr", () => {
  test("extracts refnr from a web jobdetail URL", () => {
    expect(normalizeRefnr("https://www.arbeitsagentur.de/jobsuche/jobdetail/12336-a26f964j0448039-S")).toBe(
      "12336-a26f964j0448039-S",
    );
  });

  test("accepts a bare refnr", () => {
    expect(normalizeRefnr("12336-a26f964j0448039-S")).toBe("12336-a26f964j0448039-S");
  });

  test("rejects strings with disallowed characters", () => {
    expect(normalizeRefnr("not a refnr!")).toBeNull();
  });
});

describe("encodeRefnr", () => {
  test("base64-encodes the raw refnr", () => {
    expect(encodeRefnr("12336-a26f964j0448039-S")).toBe("MTIzMzYtYTI2Zjk2NGowNDQ4MDM5LVM=");
  });
});

describe("jobageToVeroeffentlichtseit", () => {
  test("clamps to the API's 100-day ceiling", () => {
    expect(jobageToVeroeffentlichtseit(365)).toBe(100);
  });

  test("passes through values within range", () => {
    expect(jobageToVeroeffentlichtseit(14)).toBe(14);
  });

  test("treats zero/negative/undefined as no filter", () => {
    expect(jobageToVeroeffentlichtseit(0)).toBeNull();
    expect(jobageToVeroeffentlichtseit(-5)).toBeNull();
  });
});
