# Lithuanian Legal Acts API Research Report

Probed on 2026-03-28. This documents all discovered endpoints, schemas, and the recommended fetching strategy.

---

## 1. data.gov.lt / Spinta API (PRIMARY SOURCE)

The Lithuanian open data portal exposes legal acts through the **Spinta** framework at `get.data.gov.lt`. This is the best source for bulk access -- no authentication required, structured JSON/JSONL responses, full text included.

### Base URL

```
https://get.data.gov.lt/datasets/gov/lrsk/teises_aktai/
```

### Sub-datasets

| Endpoint | Records | Description |
|---|---|---|
| `/Dokumentas` | **468,711** | Legal act metadata + full text |
| `/Suvestine` | **333,293** | Consolidated (amended) versions of acts |
| `/Priedas` | **121,091** | Attachments (annexes, tables, appendices) |

### Query Syntax (Spinta RQL)

The API uses a Resource Query Language (RQL) with function-call syntax in query parameters.

**Format selection:**
```
?format(json)      # JSON with _data array wrapper
?format(jsonl)      # Newline-delimited JSON (best for streaming/bulk)
?format(csv)        # CSV
?format(rdf)        # RDF
```

**Pagination:**
```
?limit(100)                    # Number of records per page
?select(_id,field1,_page)      # MUST include _page in select() to get cursor tokens
?page("TOKEN_HERE")            # Cursor token from previous response's _page.next
                               # Token MUST be wrapped in quotes (URL-encoded %22)
```

Pagination gotcha: when using `select()`, you must include `_page` as a selected field, otherwise the response omits the pagination cursor. Without `select()`, the cursor is always returned.

Token format: base64-encoded JSON array. Contains `=` signs that must be URL-encoded or the token must be wrapped in quotes inside `page()`.

**Filtering:**
```
?rusis="Įstatymas"                          # Exact match (URL-encode Lithuanian chars)
?galioj_busena="galioja"                    # Exact match on status
?rusis="Įstatymas"&galioj_busena="galioja"  # AND (multiple filters)
?contains(pavadinimas,"Konstitucija")       # Substring search
?ge(registracija,"2025-01-01")              # Greater-than-or-equal on dates
?field.lower()="value"                      # Case-insensitive matching
```

**Sorting:**
```
?sort(registracija)    # Ascending
?sort(-registracija)   # Descending (null values sort first with descending)
```

**Field selection:**
```
?select(_id,pavadinimas,rusis,registracija)
?select(_id,_page)     # Include _page for pagination cursors
```

### Dokumentas Schema

All fields returned per record (37 fields total):

| Field | Type | Description | Sample |
|---|---|---|---|
| `_type` | string | Dataset path | `datasets/gov/lrsk/teises_aktai/Dokumentas` |
| `_id` | uuid | Internal record UUID | `32888dc6-1bcb-4961-9c1f-cbec6106986e` |
| `_revision` | uuid | Record revision ID | |
| `_base` | null | Always null | |
| `vda_id` | string | VDA identifier | `00000d8ccfba011` |
| `dokumento_id` | string | **e-TAR document ID** (key for fetching HTML) | `ce0f95d090d111e4bb408baba2bdddf3` or `TAR.876E5906F3C4` |
| `pavadinimas` | string | Full title in Lithuanian | |
| `nuoroda` | string | e-TAR portal URL | `https://e-tar.lt/portal/lt/legalAct/{dokumento_id}` |
| `alt_pavadinimas` | string? | Alternative title | Usually null |
| `tekstas_lt` | string | **Full text** in Lithuanian (plain text, not HTML) | 9,000-90,000+ chars |
| `dok_busena` | string | Document status in registry | `registruotas TA registre` |
| `dok_grupe` | string? | Document group | `valstybės institucijų ir įstaigų teisės aktai` |
| `pobudis` | string? | Document nature | Usually null |
| `galioj_busena` | string | **Validity status** | `galioja` / `negalioja` |
| `parengusi_inst` | string? | Preparing institution | |
| `priemusi_inst` | string? | Adopting institution | |
| `tar_kodas` | string | **TAR code** | `2024-09584` or `1041010ISTA0IX-2335` |
| `rusis` | string | **Document type** | `Įstatymas`, `Nutarimas`, etc. |
| `atv_dok_nr` | string? | Official document number | `D1-181`, `IX-2335` |
| `registracija` | date? | Registration date | `2024-05-29` |
| `isigal_sal_lt` | string? | Entry-into-force conditions (Lithuanian) | |
| `termino_sal` | string? | Term conditions | |
| `es_teises_aktas` | string | EU legal act flag | `0` or `1` |
| `priimtas` | date? | Adoption date | `2024-05-29` |
| `prisijungta` | date? | Accession date | |
| `pakeista` | date? | Last amendment date | |
| `ratifikuota` | date? | Ratification date | |
| `patvirtinta` | date? | Approval date | |
| `paskelbta_tar` | date? | TAR publication date | `2024-05-29` |
| `isigalioja` | date? | **Entry into force date** | `2024-06-01` |
| `isigalioja_po_salygu` | date? | Conditional entry into force | |
| `negalioja` | date? | **Repeal/expiry date** | |
| `negalioja_po_salygu` | date? | Conditional expiry | |
| `pask_atitaisymas` | date? | Correction publication date | |
| `paviesinimas` | date? | Public disclosure date | |
| `ar_nacionalinis` | bool | Is national legislation | `True` |
| `ar_verslo_reg` | bool | Relevant to business register | `False` |

### Suvestine Schema (Consolidated Versions)

| Field | Type | Description |
|---|---|---|
| `_id` | uuid | Record UUID |
| `vda_id` | string | VDA identifier |
| `dokumento_id` | string | Parent document's e-TAR ID |
| `suvestines_id` | string | Consolidated version ID |
| `nuoroda` | string | URL: `https://e-tar.lt/portal/lt/legalAct/{dokumento_id}/{suvestines_id}` |
| `tekstas_lt` | string | **Full consolidated text** (can be 90,000+ chars) |
| `galioja_nuo` | datetime | Valid from |
| `galioja_iki` | datetime | Valid until |
| `suv_duom_atnaujinimas` | datetime | Data last updated |

### Priedas Schema (Attachments)

| Field | Type | Description |
|---|---|---|
| `_id` | uuid | Record UUID |
| `priedo_id` | string | Attachment ID |
| `dokumento_id` | string | Parent document ID |
| `priedo_pav` | string | Attachment filename (`5 priedas.xlsx`) |
| `failo_pletinys` | string | File extension (`xlsx`, `pdf`, etc.) |
| `priedo_tekstas` | string | Extracted text content |
| `priedo_url` | string | Download URL |
| `atnaujinimo_data` | datetime | Last updated |

### Document Type Breakdown (Full Dataset)

```
161,951  Įsakymas              (Order)
102,403  Sprendimas            (Decision)
 75,224  Nutartis              (Ruling/Determination)
 67,169  Nutarimas             (Resolution)
 19,980  Potvarkis             (Directive)
 14,916  Įstatymas             (Law)           <-- primary target
 12,023  Dekretas              (Decree)
  4,464  Informacija           (Information notice)
  3,102  Pranešimas            (Announcement)
  1,480  Atitaisymas           (Correction)
  1,362  Nutartis dėl teismingumo  (Jurisdiction ruling)
  1,065  Rezoliucija           (Resolution)
    622  Protokolas            (Protocol)
    580  Susitarimas           (Agreement)
    450  Raštas                (Letter)
    404  Sutartis              (Treaty)
    300  Konvencija            (Convention)
    231  Aktas                 (Act)
     22  Konstitucinis įstatymas  (Constitutional law)
     12  Kodeksas              (Code)
      3  Konstitucija          (Constitution)
    ... and ~40 more minor types
```

Active laws (Įstatymas + galioja): **12,048**

### Performance

- JSONL bulk metadata download (100k records, select fields): **~10 seconds**
- No authentication required
- No rate limiting observed (5 rapid sequential requests all returned 200)
- Maximum tested limit: **500,000** records in a single request (worked)
- Response caching: `max-age=60, must-revalidate`

---

## 2. e-tar.lt REST Endpoints (HTML/DOCX Content)

The e-TAR portal provides direct access to legal act content in HTML, DOCX, and ODT formats. The `dokumento_id` field from data.gov.lt maps directly to these URLs.

### Working Endpoints

| Endpoint | Returns | Content-Type |
|---|---|---|
| `https://www.e-tar.lt/rs/legalact/{dokumento_id}/` | **Full HTML** of the legal act | `text/html;charset=UTF-8` |
| `https://www.e-tar.lt/rs/legalact/{dokumento_id}/format/MSO2010_DOCX/` | **DOCX download** | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `https://www.e-tar.lt/rs/legalact/{dokumento_id}/format/OO3_ODT/` | **ODT download** | `application/vnd.oasis.opendocument.text` |
| `https://www.e-tar.lt/portal/lt/legalAct/{dokumento_id}` | Portal page (JSF/JavaScript-heavy) | HTML |
| `https://www.e-tar.lt/portal/lt/legalActPrint?documentId={dokumento_id}` | Print view with metadata table | HTML |
| `https://e-tar.lt/rs/lasupplement/{dokumento_id}/{priedo_id}/` | Attachment download | varies |

### HTML Content Structure

The `/rs/legalact/{id}/` endpoint returns clean HTML (Word-generated) with:
- `<html xmlns:ns2="urn:tic.lt:LLAdmDocST">` namespace
- Document parts marked with `id="part_XXXXX"` attributes (e.g., 141 parts for a law)
- Standard Word CSS styles (`MsoNormal`, `WordSection1`)
- UTF-8 encoding
- Typical size: 10-200 KB per document

### The `dokumento_id` Format

Two formats exist in the data:
1. **Legacy TAR format**: `TAR.876E5906F3C4` (prefix + 12-char hex)
2. **UUID format**: `ce0f95d090d111e4bb408baba2bdddf3` (32-char hex, no dashes)

Both formats work as path parameters in the e-tar REST endpoints.

### Rate Limiting / Protection

- **Cloudflare**: e-tar.lt is behind Cloudflare (server header: `cloudflare`)
- **robots.txt**: blocks ClaudeBot, GPTBot, CCBot, and other AI crawlers by user-agent
- **No observed rate limiting** in testing (5 rapid requests all returned 200)
- **Cookies**: Sets `TS017a8150` tracking cookies per request
- Recommended: use polite crawling (1-2 req/sec) and set a descriptive User-Agent

### Non-Working Endpoints

Tested and returned 404:
- `/rs/legalact/{id}/content`, `/rs/legalact/{id}/metadata`, `/rs/legalact/{id}/editions/`
- `/portal/rest/`, `/api/`, `/opendata/`
- No sitemap.xml exists

---

## 3. e-seimas.lrs.lt / lrs.lt (NOT RECOMMENDED)

The Seimas portal uses a **PrimeFaces (JSF)** framework with AJAX-based form submissions. There is no REST API.

### What exists

- `/portal/documentSearch/lt` - Search form with dropdowns for 150+ document types
- `/portal/simpleSearch/lt` - Simple text search
- `/portal/legalActSearch/lt` - Legal act specific search
- All require JSF form POST with CSRF tokens

### Why not use it

- No public API -- all interaction is via JSF form submissions
- JavaScript-heavy rendering -- pages return CSRF tokens and PrimeFaces widget configurations, not content
- Session-based (120-minute timeout)
- `lrs.lt/sip/ws` exists but returns a 404 page (Oracle APEX application)
- All useful data from Seimas acts is already in e-TAR / data.gov.lt

---

## 4. Recommended Fetching Strategy

### Phase 1: Metadata Index

Use data.gov.lt JSONL streaming to build a complete index:

```
GET https://get.data.gov.lt/datasets/gov/lrsk/teises_aktai/Dokumentas
  ?format(jsonl)
  &limit(500000)
  &select(dokumento_id,pavadinimas,tar_kodas,rusis,galioj_busena,priemusi_inst,atv_dok_nr,registracija,priimtas,paskelbta_tar,isigalioja,negalioja,ar_nacionalinis,_page)
```

This fetches all 468k document metadata records in ~30 seconds without pagination. Filter client-side for the types you want (laws: ~15k, all active: ~200k+).

For pagination if needed, use JSONL streaming (reads line by line, no JSON parsing of whole response).

### Phase 2: Full Text (Choose One)

**Option A: data.gov.lt `tekstas_lt` field** (plain text)
- Pro: Single API, already structured, includes full text inline
- Con: Plain text only (no HTML structure), very large responses when fetching full records
- Best for: Initial bulk import, search indexing

**Option B: e-tar.lt `/rs/legalact/{dokumento_id}/`** (HTML)
- Pro: Structured HTML with semantic `part_` IDs, preserves formatting
- Con: Requires per-document HTTP request, behind Cloudflare
- Best for: Converting to Markdown (has heading structure, lists, tables)

**Option C: e-tar.lt DOCX download**
- Pro: Richest formatting, includes tables and images
- Con: Requires DOCX parsing, heaviest per-request
- Best for: Complex documents with tables/annexes

### Recommended: Hybrid Approach

1. **Bulk index** via data.gov.lt JSONL (metadata + plain text for all documents)
2. **HTML fetch** from e-tar.lt `/rs/legalact/{id}/` for documents being converted to Markdown
3. **Consolidated versions** via data.gov.lt Suvestine dataset (has full text of each historical version with date ranges)

### Phase 3: Consolidated Versions (Git History)

The Suvestine dataset provides all consolidated editions with `galioja_nuo` and `galioja_iki` date ranges. Use these to reconstruct the amendment history:

```
GET https://get.data.gov.lt/datasets/gov/lrsk/teises_aktai/Suvestine
  ?format(jsonl)
  &limit(500000)
  &select(dokumento_id,suvestines_id,galioja_nuo,galioja_iki,tekstas_lt,_page)
  &dokumento_id="TAR.XXXXXXXXXXXX"
```

For each document, fetch all Suvestine records, sort by `galioja_nuo`, and create git commits for each version.

---

## 5. Sample API Calls

```bash
# Count all active laws
curl 'https://get.data.gov.lt/datasets/gov/lrsk/teises_aktai/Dokumentas?format(jsonl)&limit(500000)&select(_id)&rusis=%22%C4%AEstatymas%22&galioj_busena=%22galioja%22' | wc -l
# Result: 12,048

# Get 3 constitutional laws with metadata
curl 'https://get.data.gov.lt/datasets/gov/lrsk/teises_aktai/Dokumentas?format(json)&limit(3)&select(_id,pavadinimas,tar_kodas,dokumento_id)&rusis=%22Konstitucinis+%C4%AFstatymas%22'

# Get recent documents (registered in 2026)
curl 'https://get.data.gov.lt/datasets/gov/lrsk/teises_aktai/Dokumentas?format(json)&limit(5)&select(_id,pavadinimas,registracija)&ge(registracija,%222026-01-01%22)'

# Search by title keyword
curl 'https://get.data.gov.lt/datasets/gov/lrsk/teises_aktai/Dokumentas?format(json)&limit(5)&select(_id,pavadinimas)&contains(pavadinimas,%22Konstitucija%22)'

# Fetch HTML content of a specific act from e-tar
curl 'https://www.e-tar.lt/rs/legalact/TAR.876E5906F3C4/'

# Download DOCX
curl -O 'https://www.e-tar.lt/rs/legalact/TAR.876E5906F3C4/format/MSO2010_DOCX/'
```

---

## 6. Key Findings Summary

| Aspect | Detail |
|---|---|
| **Best bulk source** | `get.data.gov.lt` Spinta API (JSONL format) |
| **Best HTML source** | `e-tar.lt/rs/legalact/{id}/` |
| **Total documents** | 468,711 |
| **Active laws** | 12,048 |
| **Consolidated versions** | 333,293 |
| **Authentication** | None required |
| **Rate limits** | None observed (be polite: 1-2 req/sec for e-tar) |
| **Full text available** | Yes (plain text via data.gov.lt, HTML via e-tar.lt) |
| **Pagination** | Cursor-based with `_page` + `page("token")` |
| **Max limit tested** | 500,000 records (works) |
| **Bulk download speed** | ~100k records in 10 seconds (JSONL, metadata only) |
| **e-seimas.lrs.lt** | No API, JSF-only, not useful |
