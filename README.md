# lt-teises-aktai

Lithuanian Legal Acts as a Git Repository.

This project fetches Lithuanian legislation from [e-TAR](https://www.e-tar.lt) (the official Legal Acts Register) and converts it into version-controlled Markdown files. Each legal act becomes a Markdown file with YAML frontmatter metadata. Amendments are tracked as git commits, with author dates set to the actual publication dates, so `git log` and `git diff` reveal the full legislative history of any act.

## Inspiration

Inspired by [AdrianVazquezQ/legalize-es](https://github.com/AdrianVazquezQ/legalize-es), which does the same for Spanish legislation from BOE.

## Quick Start

```bash
git clone https://github.com/yiin/lt-teises-aktai.git
cd lt-teises-aktai
bun install
```

Fetch the metadata index (all legal acts from data.gov.lt):

```bash
bun src/main.ts fetch-index
```

Fetch and convert acts to Markdown:

```bash
bun src/main.ts fetch-acts --type istatymas --status galioja --limit 100
```

Run the full pipeline (fetch + convert + git commit):

```bash
bun src/main.ts build --type istatymas --limit 50
```

## CLI Commands

```
bun src/main.ts <command> [options]
```

| Command | Description |
|---|---|
| `fetch-index` | Download metadata for all legal acts from data.gov.lt |
| `fetch-acts [options]` | Fetch HTML from e-TAR and convert to Markdown |
| `fetch-history <tar-id>` | Show the amendment timeline for a specific act |
| `build [options]` | Full pipeline: fetch index, convert acts, git commit |
| `build-history [options]` | Build git history from consolidated versions (all acts) |
| `build-single <tar-id>` | Build full git history for one specific act |
| `stats` | Show statistics about the fetched index |
| `help` | Print usage information |

**Options** (for `fetch-acts`, `build`, `build-history`):

| Option | Description |
|---|---|
| `--type <type>` | Filter by act type (`istatymas`, `kodeksas`, `konstitucija`, etc.) |
| `--status <status>` | Filter by status (`galioja`, `negalioja`, `dar_neisigaliojo`) |
| `--limit <n>` | Limit the number of acts to process |

## Data Sources

| Source | What it provides |
|---|---|
| [data.gov.lt](https://get.data.gov.lt/datasets/gov/lrsk/teises_aktai/) (Spinta API) | Bulk metadata for all 468k+ legal documents, consolidated version texts, attachment info. No authentication required. |
| [e-tar.lt](https://www.e-tar.lt) (REST endpoints) | Structured HTML of individual legal acts at `/rs/legalact/{id}/`. Used for Markdown conversion since it preserves heading structure, lists, and tables. |

The metadata index is fetched in bulk from data.gov.lt (fast, JSONL streaming). The full act text is fetched per-document from e-tar.lt as HTML, then converted to Markdown using cheerio.

## File Format

Each act is stored as a Markdown file with YAML frontmatter:

```
data/acts/
  konstitucija/             # Constitution
  konstituciniai-istatymai/ # Constitutional laws
  istatymai/                # Laws
  kodeksai/                 # Codes (Civil, Criminal, etc.)
  seimo-nutarimai/          # Seimas resolutions
  vyriausybes-nutarimai/    # Government resolutions
  prezidento-dekretai/      # Presidential decrees
  ministru-isakymai/        # Minister orders
  instituciju-isakymai/     # Agency orders
  tarptautines-sutartys/    # International treaties
  kiti/                     # Other
```

Files are named by their TAR identifier (e.g., `TAR.47BB952431DA.md`). The frontmatter includes the act title, type, issuing authority, dates, validity status, and e-TAR URL. The body contains the consolidated (currently in-force) text with a strict heading hierarchy mapping Lithuanian legal structure to Markdown headings.

See [docs/schema.md](docs/schema.md) for the full specification.

## Numbers

- ~14,900 laws indexed from data.gov.lt
- ~12,000 currently active (status: `galioja`)
- ~333,000 consolidated versions across all acts (the raw material for git history)

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Language**: TypeScript
- **HTML parsing**: [cheerio](https://cheerio.js.org)
- **Data source (bulk)**: data.gov.lt Spinta API (JSONL)
- **Data source (HTML)**: e-TAR REST endpoints
- **Version control**: Git (commits with backdated author dates)

## License

MIT
