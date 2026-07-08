# Arbeitsagentur Jobsuche API Reference

Unofficial-but-open JSON API backing the Bundesagentur für Arbeit's job search (the
same backend `arbeitsagentur.de` and the official mobile app use). No official API is
published by the agency; this is documented by the community at
[bundesAPI/jobsuche-api](https://github.com/bundesAPI/jobsuche-api). Verified live
2026-07-08.

## Access notes

- `robots.txt` on `https://www.arbeitsagentur.de` is fully permissive (`Disallow:` empty, `Allow: /`).
- `https://rest.arbeitsagentur.de/robots.txt` returns empty (no restrictions declared).
- No terms-of-service statement restricting personal/automated use was found.
- Requires a fixed public client key sent as a header — not a personal credential, the
  same key the official apps embed.

## Authentication

All requests require:

```
X-API-Key: jobboerse-jobsuche
```

## Search

```
GET https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/app/jobs
```

| Param | Meaning | Example |
|-------|---------|---------|
| `was` | Free-text query (title/skill/role) | `Softwareentwickler C#` |
| `wo` | Location — city, region, or postal code. **Requires German spelling** (e.g. `München`, not `Muenchen`) or it silently returns 0 results with `woOutput.suchmodus: "UNGUELTIG"` | `Berlin`, `München`, `10115` |
| `berufsfeld` | Profession-field search | — |
| `arbeitgeber` | Employer name | — |
| `veroeffentlichtseit` | Days since publication, `0`-`100` | `14` |
| `umkreis` | Radius in km around `wo` | `30` |
| `arbeitszeit` | `vz` full-time · `tz` part-time · `snw` shift/night · `ho` home-office · `mj` mini-job | `ho` |
| `angebotsart` | `1` work · `2` self-employment · `4` training · `34` internship | — |
| `befristung` | `1` fixed-term · `2` permanent (semicolon-separated for multiple) | — |
| `zeitarbeit` | Include temp-agency jobs (boolean) | — |
| `behinderung` | Disability-suitable positions (boolean) | — |
| `page` | 1-indexed page | `1` |
| `size` | Results per page | `25` |

Response shape (`stellenangebote[]`, one per job):

```jsonc
{
  "stellenangebote": [{
    "refnr": "12336-a26f964j0448039-S",   // reference number — the canonical job id
    "beruf": "Softwareentwickler/in",      // profession category (broad)
    "titel": "Lead Entwickler C# /.NET (w/m/d)", // actual posting title (may be absent — fall back to beruf)
    "arbeitgeber": "Value AG",             // employer name (search response only — see quirk below)
    "aktuelleVeroeffentlichungsdatum": "2026-07-03",
    "eintrittsdatum": "2026-07-03",
    "arbeitsort": {
      "ort": "Berlin", "plz": "10178", "strasse": "...",
      "region": "Berlin", "land": "Deutschland",
      "koordinaten": { "lat": 52.52, "lon": 13.41 }
    },
    "kundennummerHash": "...",             // optional, for the employer-logo endpoint
    "externeUrl": "https://..."            // optional, external posting URL
  }],
  "maxErgebnisse": 17,
  "page": 1,
  "size": 5,
  "woOutput": { "bereinigterOrt": "Berlin", "suchmodus": "UMKREISSUCHE" },
  "facetten": { /* aggregated filter counts, unused by this CLI */ }
}
```

## Detail

```
GET https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails/{base64(refnr)}
```

The path parameter is the job's `refnr`, **Base64-encoded** (plain, not URL-safe —
`Buffer.from(refnr).toString("base64")`). A `v3` endpoint also exists but `v4` is current.

Response shape (field-name quirk: **not the same names as search**):

```jsonc
{
  "referenznummer": "12336-a26f964j0448039-S",
  "stellenangebotsTitel": "Lead Entwickler C# /.NET (w/m/d)",
  "firma": "Value AG",                       // NOTE: "firma", not "arbeitgeber" as in search
  "stellenangebotsBeschreibung": "Als **Lead Entwickler** ...", // plain text with markdown-style bold, no HTML
  "stellenlokationen": [{
    "adresse": { "plz": "10178", "ort": "Berlin", "region": "BERLIN", "land": "DEUTSCHLAND" },
    "breite": 52.52, "laenge": 13.41
  }],                                          // NOTE: array (a posting can list multiple locations)
  "arbeitszeitVollzeit": true,
  "arbeitszeitTeilzeit*": false,               // several *Teilzeit* / *Schicht* booleans
  "homeofficemoeglich": false,
  "verguetungsangabe": "KEINE_ANGABEN",        // "KEINE_ANGABEN" means "not stated" — treat as null
  "vertragsdauer": "KEINE_ANGABE",             // "KEINE_ANGABE" means "not stated" — treat as null
  "veroeffentlichungszeitraum": { "von": "2026-07-03" },
  "datumErsteVeroeffentlichung": "2026-07-03",
  "externeURL": "https://...",                 // apply/external posting link, when set
  "allianzpartnerName": "...", "allianzpartnerUrl": "..."  // job-board partner that sourced the listing, if any
}
```

## Public web detail page (used for the `url` field)

```
https://www.arbeitsagentur.de/jobsuche/jobdetail/{refnr}
```

Plain (non-encoded) `refnr` in the path. Confirmed live (HTTP 200) — this is the
human-clickable URL surfaced in `search`/`detail` output, distinct from the JSON API
endpoint above.

## Employer logo (not used by this CLI)

```
GET https://rest.arbeitsagentur.de/vermittlung/ag-darstellung-service/ct/v1/arbeitgeberlogo/{kundennummerHash}
```

Returns an image (webp/png) or 404. `kundennummerHash` comes from the search or detail
response when present.

## Quirks recorded during investigation (2026-07-08)

- **Field names differ between search and detail** for the same concepts (`arbeitgeber` vs
  `firma`). Handled by normalizing both into the CLI's shared `JobCard`/`JobDetail` shape.
- **Umlaut locations require correct German spelling.** `wo=München` works; `wo=Muenchen`
  returns zero results with no error (`woOutput.suchmodus: "UNGUELTIG"`). This is a genuine
  API behavior, not a shell/encoding artifact — verified by sending a manually
  percent-encoded UTF-8 `wo=M%C3%BCnchen` payload directly.
- **`titel` can be absent** on some listings (only `beruf`, the broad profession category,
  is present) — the CLI falls back to `beruf` and then to `"(untitled)"`.
- **`"KEINE_ANGABE"` / `"KEINE_ANGABEN"`** ("no information given") are the API's sentinel
  values for "not stated," used for `vertragsdauer` and `verguetungsangabe` respectively —
  the CLI maps these to `null` rather than surfacing the German sentinel string.
- Zero query parameters is accepted (returns a generic, unfiltered result set) rather than
  erroring — the CLI itself requires at least `--query` or `--location` for a more useful
  default UX, not because the API demands it.
