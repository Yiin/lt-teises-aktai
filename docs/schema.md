# Markdown Schema for Lithuanian Legal Acts

This document defines the file naming, directory layout, YAML frontmatter, Markdown body structure, and git commit conventions used to represent Lithuanian legislation as a version-controlled repository.

## Data Source

All content comes from **e-TAR** (Lietuvos teises aktu registras / Lithuanian Legal Acts Register) at https://www.e-tar.lt. Legislative text is public domain. This repository adds structure, version control, and machine-readable metadata.

---

## 1. Directory Layout

```
data/acts/
  istatymai/                  # Laws (Seimas)
  konstitucija/               # Constitution
  konstituciniai-istatymai/   # Constitutional laws
  kodeksai/                   # Codes (Civil, Criminal, etc.)
  nutarimai/                  # Resolutions (Government, Seimas)
  isakymai/                   # Orders (Ministers, agencies)
  dekretai/                   # Presidential decrees
  tarptautines-sutartys/      # International treaties
  kiti/                       # Other act types
```

### Why by type, not by year?

- Lithuanian legal act types have distinct authoring authorities, amendment patterns, and structural conventions. Grouping by type mirrors how lawyers and e-TAR itself categorize acts.
- Year-based grouping would scatter related acts (e.g., a law and its implementing resolution) across directories. The TAR identifier already encodes the year, so temporal queries work via metadata.
- A flat directory per type keeps things simple. With ~3,000 active laws and ~10,000 total acts in force, a single directory per type remains navigable. If a type grows unwieldy, we can add year subdirectories later (e.g., `nutarimai/2024/`).

---

## 2. File Naming Convention

```
{tar-id}.md
```

The **TAR identifier** is the canonical, permanent identifier for every legal act in the Lithuanian register. It looks like `TAR.47BB952431DA` (a prefix `TAR.` followed by a 12-character hex string).

Examples:
```
data/acts/konstitucija/TAR.47BB952431DA.md       # Konstitucija
data/acts/istatymai/TAR.0BDFFD850A66.md          # Viešojo administravimo įstatymas
data/acts/kodeksai/TAR.8A39C83848CB.md            # Civilinis kodeksas
```

### Why TAR identifiers?

- **Permanent**: TAR IDs never change, unlike document numbers (e.g., `VIII-1234`) which are reused across Seimas convocations.
- **Unique**: One act, one ID, no collisions.
- **Linkable**: `https://www.e-tar.lt/portal/lt/legalAct/{TAR_ID}` always resolves.
- **Machine-friendly**: No Lithuanian characters, no spaces.

The human-readable title and document number live in the frontmatter, not the filename.

---

## 3. YAML Frontmatter

Every `.md` file begins with a YAML frontmatter block containing structured metadata.

```yaml
---
# --- Identity ---
tar_id: "TAR.47BB952431DA"
dok_nr: "IX-2324"                          # Official document number
pavadinimas: "Lietuvos Respublikos Konstitucija"
pavadinimas_en: "Constitution of the Republic of Lithuania"  # optional

# --- Classification ---
rusis: "konstitucija"                      # Act type (see enum below)
leidziantis_organas: "piliečių referendumas"  # Issuing authority
sritis: []                                 # Subject areas, optional

# --- Dates ---
priemimo_data: "1992-10-25"               # Adoption date
isigaliojimo_data: "1992-11-02"           # Entry into force
paskelbimo_data: "1992-11-10"             # Publication date
paskutinio_pakeitimo_data: "2022-04-21"   # Last amendment date

# --- Status ---
statusas: "galioja"                        # See enum below

# --- Publication ---
skelbimo_saltinis: "Lietuvos aidas, 1992-11-10, Nr. 220-0"
valstybes_zinios: "1992, Nr. 33-1014"     # Valstybės žinios reference, if applicable

# --- Links ---
etar_url: "https://www.e-tar.lt/portal/lt/legalAct/TAR.47BB952431DA"
eli_url: ""                                # European Legislation Identifier, if available

# --- Relations (optional) ---
keicia: []                                 # TAR IDs of acts this act amends
panaikina: []                              # TAR IDs of acts this act repeals
igyvendina: []                             # TAR IDs of acts this implements
pakeistas: []                              # TAR IDs of acts that amended this one
---
```

### Field Reference

| Field | Required | Type | Description |
|---|---|---|---|
| `tar_id` | yes | string | e-TAR registry identifier (`TAR.XXXXXXXXXXXX`) |
| `dok_nr` | yes | string | Official document number (e.g., `VIII-1234`, `Nr. 1234`) |
| `pavadinimas` | yes | string | Full title in Lithuanian |
| `pavadinimas_en` | no | string | English translation of title |
| `rusis` | yes | enum | Type of legal act |
| `leidziantis_organas` | yes | string | Issuing/adopting authority |
| `sritis` | no | string[] | Subject areas / legal domains |
| `priemimo_data` | yes | date | Date the act was adopted/signed |
| `isigaliojimo_data` | yes | date | Date the act entered into force |
| `paskelbimo_data` | yes | date | Date the act was published |
| `paskutinio_pakeitimo_data` | no | date | Date of the most recent amendment |
| `statusas` | yes | enum | Current legal status |
| `skelbimo_saltinis` | no | string | Original publication source |
| `valstybes_zinios` | no | string | Valstybės žinios reference |
| `etar_url` | yes | string | Canonical e-TAR URL |
| `eli_url` | no | string | European Legislation Identifier URL |
| `keicia` | no | string[] | TAR IDs this act amends |
| `panaikina` | no | string[] | TAR IDs this act repeals |
| `igyvendina` | no | string[] | TAR IDs this act implements |
| `pakeistas` | no | string[] | TAR IDs of amending acts |

### Enums

**`rusis`** (act type):

| Value | Lithuanian | English |
|---|---|---|
| `konstitucija` | Konstitucija | Constitution |
| `konstitucinis_istatymas` | Konstitucinis įstatymas | Constitutional law |
| `konstitucinis_aktas` | Konstitucinis aktas | Constitutional act |
| `istatymas` | Įstatymas | Law / Statute |
| `kodeksas` | Kodeksas | Code |
| `seimo_nutarimas` | Seimo nutarimas | Seimas resolution |
| `vyriausybes_nutarimas` | Vyriausybės nutarimas | Government resolution |
| `prezidento_dekretas` | Prezidento dekretas | Presidential decree |
| `ministro_isakymas` | Ministro įsakymas | Minister's order |
| `institucijos_isakymas` | Institucijos įsakymas | Agency order |
| `tarptautine_sutartis` | Tarptautinė sutartis | International treaty |
| `kitas` | Kitas | Other |

**`statusas`** (status):

| Value | Lithuanian | English |
|---|---|---|
| `galioja` | Galioja | In force |
| `negalioja` | Negalioja | Repealed / No longer in force |
| `dar_neisigaliojo` | Dar neįsigaliojo | Not yet in force |
| `galioja_is_dalies` | Galioja iš dalies | Partially in force |

**`leidziantis_organas`** (common issuing authorities):

- `Lietuvos Respublikos Seimas` -- Parliament
- `Lietuvos Respublikos Vyriausybė` -- Government
- `Lietuvos Respublikos Prezidentas` -- President
- `piliečių referendumas` -- Citizens' referendum
- Ministry names (e.g., `Lietuvos Respublikos finansų ministerija`)
- Agency names as needed

---

## 4. Markdown Body Structure

The body of each file represents the **consolidated text** of the legal act (the currently in-force version, with all amendments applied).

### Structural hierarchy

Lithuanian legal acts use a consistent structural hierarchy. Map it to Markdown headings as follows:

| Lithuanian | English | Markdown | Example |
|---|---|---|---|
| Dalis | Part | `# PIRMOJI DALIS` | `# PIRMOJI DALIS. BENDROSIOS NUOSTATOS` |
| Skyrius | Chapter | `## I SKYRIUS` | `## I SKYRIUS. BENDROSIOS NUOSTATOS` |
| Skirsnis | Section | `### I SKIRSNIS` | `### I SKIRSNIS. PAGRINDINĖS SĄVOKOS` |
| Straipsnis | Article | `#### 1 straipsnis` | `#### 1 straipsnis. Įstatymo paskirtis` |

Within articles, use regular paragraph text. Numbered parts (dalys) within an article use an ordered list. Points (punktai) within a part use a nested ordered list.

### Title

The document title (act name) is rendered as a centered or prominent element before the structural body. Use a top-level heading:

```markdown
# Lietuvos Respublikos viešojo administravimo įstatymas
```

This appears once, immediately after the frontmatter.

### Articles

Each article gets an `####` heading with its number and title (if any):

```markdown
#### 1 straipsnis. Įstatymo paskirtis

Šis įstatymas nustato viešojo administravimo principus...

#### 2 straipsnis. Pagrindinės šio įstatymo sąvokos

1. Administracinis aktas – ...
2. Administracinis sprendimas – ...
3. Individualus administracinis aktas – ...
```

### Numbered parts within articles

Use ordered lists starting from 1:

```markdown
#### 5 straipsnis. Viešojo administravimo principai

1. Viešojo administravimo subjektai savo veikloje vadovaujasi šiais principais:
    1) įstatymo viršenybės...
    2) objektyvumo...
    3) proporcingumo...
2. Šio straipsnio 1 dalyje nurodyti principai...
```

### Preambles and signatures

Preamble text (preambulė) goes between the title heading and the first structural heading, as regular paragraphs.

Signature blocks at the end of acts are rendered as regular paragraphs, separated by a blank line:

```markdown
Respublikos Prezidentas
GITANAS NAUSĖDA
```

### Annexes

Annexes (priedai) are appended after the main body, each starting with a heading:

```markdown
## PRIEDAS. Mokesčio tarifų lentelė

| ... | ... |
```

### Footnotes and editorial notes

Use standard Markdown footnotes for editorial notes about amendments:

```markdown
*Straipsnio redakcija nuo 2024-01-01, įstatymas Nr. XIV-1234.*
```

These are rendered as italic text at the end of the modified article.

---

## 5. Complete Example Mapping

```
data/acts/
  konstitucija/
    TAR.47BB952431DA.md           # Konstitucija
  konstituciniai-istatymai/
    TAR.59F99B2B61F2.md           # Dėl Lietuvos Valstybės
  istatymai/
    TAR.0BDFFD850A66.md           # Viešojo administravimo įstatymas
    TAR.ED5913B741D5.md           # Darbo kodeksas (patvirtinimo įstatymas)
  kodeksai/
    TAR.8A39C83848CB.md           # Civilinis kodeksas
  nutarimai/
    TAR.ABC123DEF456.md           # (example government resolution)
```

---

## 6. Git Conventions

### Initial import

When a legal act is first added to the repository, the commit represents the **original publication** of the act:

- **Author date**: Set to the act's `paskelbimo_data` (publication date)
- **Commit date**: Current date (when the import was performed)
- **Message format**:

```
Paskelbtas: Lietuvos Respublikos viešojo administravimo įstatymas (VIII-1234)

Šaltinis: https://www.e-tar.lt/portal/lt/legalAct/TAR.0BDFFD850A66
Priėmimo data: 1999-06-17
Įsigaliojimo data: 1999-07-09
```

### Amendments

When an act is modified by an amending act, each amendment is a separate commit to the amended file:

- **Author date**: Set to the amendment's publication date
- **Commit date**: Current date
- **Message format**:

```
Pakeistas: Viešojo administravimo įstatymas (XV-661)

Keičiantis aktas: TAR.XYZ123ABC456
Šaltinis: https://www.e-tar.lt/portal/lt/legalAct/TAR.XYZ123ABC456
Įsigaliojimo data: 2025-12-24
```

### Repeals

When an act is repealed:

- Update the frontmatter `statusas` to `negalioja`
- Commit message:

```
Panaikintas: Lietuvos Respublikos XYZ įstatymas (VIII-1234)

Panaikinantis aktas: TAR.ABC123DEF456
```

### Bulk imports

For initial repository population (importing all current consolidated acts):

```
Pradinis importas: 150 įstatymų iš e-TAR

Konsoliduotos redakcijos pagal 2026-03-28 būklę.
```

---

## 7. Design Rationale

### Why one file per act (not one file per article)?

- Legal acts are amended as a whole. An amendment commit touching one file clearly shows "this act changed."
- `git diff` on one file shows exactly what changed in context.
- Cross-references within an act use article numbers, which are stable within the file.
- Splitting into one file per article (like the Lithuanian Constitution repo does) makes `git log` per-act harder and scatters related content.

### Why consolidated text (not original + diffs)?

- The primary use case is reading the **current law**. Consolidated text serves this directly.
- Git history captures the evolution. `git log -p -- path/to/file.md` shows every change.
- This mirrors how e-TAR itself works: it publishes consolidated editions.

### Why Lithuanian field names in frontmatter?

- The content is Lithuanian legislation. Lithuanian field names reduce translation ambiguity.
- Developers working with this data will need to understand Lithuanian legal terminology regardless.
- Consistent with the legalize-es approach (Spanish field names for Spanish law).

### Comparison with legalize-es

| Aspect | legalize-es | lt-teises-aktai |
|---|---|---|
| Directory | Flat (`spain/`) | By act type (`data/acts/istatymai/`) |
| Filename | BOE identifier | TAR identifier |
| Frontmatter | 8 fields | 16+ fields (richer metadata) |
| Language | Spanish fields | Lithuanian fields |
| Body structure | Minimal formatting | Strict heading hierarchy |
| Relations | Not tracked | `keicia`, `panaikina`, `igyvendina`, `pakeistas` |

We add richer metadata because Lithuanian legal practice relies heavily on inter-act relationships (implementing resolutions, amendment chains), and the TAR registry provides this data.
