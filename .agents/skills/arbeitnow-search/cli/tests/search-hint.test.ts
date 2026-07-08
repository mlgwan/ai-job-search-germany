import { describe, test, expect } from "bun:test";
import { zeroResultHint, type SearchOpts } from "../src/commands/search";

function opts(overrides: Partial<SearchOpts> = {}): SearchOpts {
  return { pages: 5, page: 1, format: "json", ...overrides };
}

describe("zeroResultHint", () => {
  test("explains a zero-overlap AND-combined search (the reported bug scenario)", () => {
    const hint = zeroResultHint(opts({ query: "Softwareentwickler C#", location: "Berlin" }), 500);
    expect(hint).toContain('--query "Softwareentwickler C#"');
    expect(hint).toContain('--location "Berlin"');
    expect(hint).toContain("--pages 5");
    expect(hint).toContain("500 most recent postings");
  });

  test("returns null when no client-side filter was applied", () => {
    expect(zeroResultHint(opts(), 500)).toBeNull();
  });

  test("returns null when the candidate window itself was empty (different problem)", () => {
    expect(zeroResultHint(opts({ query: "anything" }), 0)).toBeNull();
  });

  test("includes --remote and --jobage in the filter list when set", () => {
    const hint = zeroResultHint(opts({ remote: true, jobage: 7 }), 500);
    expect(hint).toContain("--remote");
    expect(hint).toContain("--jobage 7");
  });
});
