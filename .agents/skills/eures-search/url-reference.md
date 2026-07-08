# EURES API Reference

Unofficial-but-open JSON API backing the EU's official EURES job portal (the same
backend `europa.eu/eures/portal` itself calls). No official API is published;
documented by the community at
[github.com/rorar/EURES-API-Documentation](https://github.com/rorar/EURES-API-Documentation).
Verified live 2026-07-08.

## Access notes

- `eures.europa.eu/robots.txt`: only disallows generic Drupal admin/search/login paths
  (`/admin/`, `/search/`, `/user/login/`, etc.) — nothing job-search specific.
- `europa.eu/robots.txt`: no `/eures/` rules at all.
- No authentication, API key, or session required for search or detail.
- Of StepStone, Xing, Indeed, and EURES — the four portals evaluated when this skill was
  generated — this is the only one with no structural robots.txt restriction on its
  search API, detail page, or pagination.

## Search

```
POST https://europa.eu/eures/api/jv-searchengine/public/jv-search/search
Content-Type: application/json
```

Request body (confirmed live):

```jsonc
{
  "resultsPerPage": 20,           // capped at 50 in testing
  "page": 1,                      // 1-indexed
  "sortSearch": "MOST_RECENT",    // "BEST_MATCH" also documented
  "keywords": [{ "keyword": "Softwareentwickler", "specificSearchCode": "TITLE" }],
  // specificSearchCode: TITLE | DESCRIPTION | EMPLOYER | EVERYWHERE | LEGAL_ID | JOB_VACANCY_ID
  // "EVERYWHERE" was tested and gave much noisier matches than "TITLE" for multi-word
  // queries — likely OR-style matching per word rather than a phrase match.
  "locationCodes": ["de"],        // ISO2 country code, lowercase; or a NUTS-1 code for Germany
  "publicationPeriod": "LAST_WEEK" // "LAST_DAY" | "LAST_WEEK" | "LAST_MONTH" — confirmed enum values;
                                    // other guesses ("TODAY", "LAST_3_DAYS", raw day counts) were rejected
                                    // with {"key":"invalid-json",...}
}
```

Response:

```jsonc
{
  "numberRecords": 2255,
  "jvs": [{
    "id": "MTAwMDAtMTIwNDQyNjA0MC1TIDE",   // opaque id — pass directly to the detail endpoint, no re-encoding needed
    "title": "Softwareentwickler/Softwareentwicklerin (m/w/d) (Softwareentwickler/in)",
    "description": "...",                   // full HTML description, duplicated in translations.<lang>.description
    "creationDate": 1762817433895,           // epoch millis
    "lastModificationDate": 1782170433134,
    "locationMap": { "DE": ["DE911"] },      // country code -> NUTS-3 code(s); NOT a city name
    "employer": { "name": "TEQYARD GmbH", "sectorCodes": [], ... },
    "translations": { "de": { "title": "...", "description": "..." } }
  }]
}
```

**Quirk — location filtering granularity.** `locationCodes` reliably filters at:
- **Country level** (ISO2, lowercase): `"de"`, `"lu"`, `"fr"`, etc. — confirmed (counts
  drop from the full unfiltered total to a per-country subset).
- **German NUTS-1 (Bundesland) level**: `"de3"` (Berlin), `"de2"` (Bayern), etc. — confirmed.

**NUTS-3 (city-level) codes did not work** — `"de300"` / `"DE300"` (Berlin's own NUTS-3
code) both returned `numberRecords: 0`. No public location-autocomplete endpoint was
found to resolve arbitrary city names to a working code (a guessed
`autocomplete-repository-rest-api/public/v2.0/locations` path returned `401`, unlike the
confirmed-working `.../v2.0/occupations` autocomplete). So `--location` in this skill
only ships a static lookup table for EURES's ~31 member countries and Germany's 16
Bundesländer — both small, stable, public reference data — rather than attempting
full city resolution.

## Detail

```
GET https://europa.eu/eures/api/jv-searchengine/public/jv/id/{id}?requestLang={lang}
```

`{id}` is the opaque `id` from a search result (already suitable for the URL, no
Base64/decoding step needed — unlike Arbeitsagentur's `refnr`).

Response shape (notably different from the search response):

```jsonc
{
  "id": "MTAwMDAtMTIwNDQyNjA0MC1TIDE",
  "reference": "10000-1204426040-S",     // the underlying national board's own reference number
  "source": "DE001",                      // which national board/connection point sourced this listing
  "preferredLanguage": "de",
  "jvProfiles": {                         // NOTE: an object keyed by language code, NOT an array
    "de": {
      "title": "...",
      "description": "...",               // HTML with <br> line breaks
      "employmentPeriod": { "startDate": 1782086400000 },
      "positionScheduleCodes": ["fulltime"],
      "locations": [{ "cityName": "Braunschweig", "region": "de911", "postalCode": "38126", "countryCode": "de" }],
      "employer": { "name": "TEQYARD GmbH", "sectorCodes": ["k62.1.0"], "website": null },
      "applicationInstructions": ["... often contains an <a href> back to the source board, e.g. arbeitsagentur.de ..."],
      "personContacts": [{ "communications": { "emails": [{ "uri": "..." }], "telephoneNumbers": [...] } }]
    }
  },
  "translationType": "REQUESTED",
  "translation": null                     // populated if requestLang required an on-the-fly translation
}
```

**Only `detail` carries city-level location** (`locations[].cityName`/`postalCode`) —
the search response's `locationMap` is country+NUTS-3-code only, and the NUTS-3 code
alone isn't human-readable without an external lookup table this skill doesn't ship.

## Autocomplete (occupations only — confirmed working)

```
GET https://europa.eu/eures/api/autocomplete-repository-rest-api/public/v2.0/occupations?language=de&keyword=Softwareentwickler&nbResults=3
```

Returns ESCO occupation suggestions with frequency counts. Not used by this CLI (title
keyword search via `specificSearchCode: "TITLE"` was precise enough without it), but
useful context: the analogous-looking `.../v2.0/locations` path returned `401`
(auth-gated or simply doesn't exist at that path), which is why this skill relies on a
static country/Bundesland table instead.

## Public web detail page (used for the `url` field)

```
https://europa.eu/eures/portal/jv-se/jv-details/{id}?jvDisplayLanguage={lang}
```

Confirmed live (HTTP 200) — this is the human-clickable URL surfaced in `search`/`detail`
output.

## Quirks recorded during investigation (2026-07-08)

- **`specificSearchCode: "EVERYWHERE"` is much noisier than `"TITLE"`** for multi-word
  queries — a title-only search for "Softwareentwickler" returned 2,255 precise title
  matches; the same phrase under `"EVERYWHERE"` combined with a country filter returned
  22,536 mostly-irrelevant results, suggesting per-word OR matching across the whole
  document rather than a phrase match. This skill defaults to `"TITLE"`.
- **EURES aggregates from national boards.** Many DE listings' `source` field and
  `applicationInstructions` link straight back to `arbeitsagentur.de` — EURES is a
  meta-aggregator, not always the origin. Expect overlap with [[arbeitsagentur-search]].
- **`locationCodes` city-level (NUTS-3) filtering silently returns zero results** rather
  than erroring — easy to mistake for "no jobs" when it's actually "wrong code
  granularity." Only country and NUTS-1 (German Bundesland) codes are confirmed to work.
- **`jvProfiles` in the detail response is a language-keyed object, not an array** —
  a naive `Array.isArray(jvProfiles)` check (as this generator initially assumed) is
  `false`; index into it by language code instead.
- **`specificSearchCode: "TITLE"` does semantic/occupation-based matching, not literal
  substring matching** — discovered live: a plain "Softwareentwickler" title search
  returned "Golang-Entwickler:in" and "Test Automation Engineer" (related via ESCO
  occupation categorization, not string containment), and a compound query
  "Softwareentwickler C#" surfaced one unrelated "Berufskraftfahrer C/CE" (truck-driver
  license) result — most likely "C#" gets tokenized server-side and the bare "C" token
  loosely matches "C/CE". Deliberately not "fixed" with a client-side AND-token
  post-filter (unlike the similar-looking issue in `arbeitnow-search`), because that
  would also remove genuinely relevant occupation-taxonomy matches like
  "Golang-Entwickler" — this is a real precision/recall tradeoff in EURES's own search,
  not a parsing bug.
