# lt-teises-aktai

Lithuanian legislation as a Git repo -- every law is a Markdown file, every reform a commit.

All laws from the [Register of Legal Acts (e-TAR)](https://www.e-tar.lt) converted to Markdown with YAML frontmatter. Git history tracks every amendment with the actual historical date, so `git log` and `git diff` reveal the full legislative evolution.

Inspired by [legalize-es](https://github.com/EnriqueLop/legalize-es) which does the same for Spanish legislation.

## Usage

```bash
# View the current text of the Constitution
cat konstitucija/TAR.47BB952431DA.md

# See all amendments to a law
git log --oneline -- istatymai/TAR.0BDFFD850A66.md

# Diff a specific amendment
git diff abc123^..abc123 -- istatymai/TAR.0BDFFD850A66.md

# Search across all laws
grep -rl "asmens duomenų" istatymai/
```

## Structure

```
konstitucija/               # Constitution
konstituciniai-istatymai/   # Constitutional laws
istatymai/                  # Laws (Seimas)
kodeksai/                   # Codes (Civil, Criminal, etc.)
```

Each file has YAML frontmatter with metadata (TAR ID, title, dates, status, issuing authority) followed by the full consolidated text.

## Data Source

All content from [e-TAR](https://www.e-tar.lt) via [data.gov.lt](https://data.gov.lt) open data API. Legislative text is public domain.

Tooling: see the [`tooling`](../../tree/tooling) branch.

## License

Legislative text is public domain. Tooling code is MIT.
