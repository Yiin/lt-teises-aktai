import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fetchDocuments, fetchConsolidatedVersions } from './clients/data-gov';
import { fetchActHtml } from './clients/e-tar';
import { htmlToMarkdown } from './parsers/html-to-markdown';
import { parseAmendmentAct } from './parsers/amendment-parser';
import { applyAmendment } from './parsers/amendment-applier';
import { rawToLegalAct, writeActFile, getActFilePath } from './generators/markdown';
import { commitAmendment, commitBulkImport, initRepo, processActHistory } from './generators/git';
import type { LegalAct, ActType, ActStatus, ConsolidatedVersion, SuvestineRaw } from './types';

const INDEX_PATH = 'data/index.json';

// Types we care about for this repository
const RELEVANT_RAW_TYPES = [
  'Konstitucija',
  'Lietuvos Respublikos Konstitucija',
  'Konstitucinis įstatymas',
  'Konstitucinis aktas',
  'Įstatymas',
  'Kodeksas',
];

const RELEVANT_ACT_TYPES: ActType[] = [
  'konstitucija',
  'konstitucinis_istatymas',
  'istatymas',
  'kodeksas',
];

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  command: string;
  type?: string;
  status?: string;
  limit?: number;
  tarId?: string;
  [key: string]: string | number | undefined;
}

function parseArgs(): CliArgs {
  const args = Bun.argv.slice(2);
  const command = args[0] ?? 'help';

  const flags: Record<string, string> = {};
  let positional: string | undefined;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        flags[key] = value;
        i++;
      } else {
        flags[key] = 'true';
      }
    } else if (!positional) {
      positional = arg;
    }
  }

  const result: CliArgs = {
    command,
    type: flags['type'],
    status: flags['status'],
    limit: flags['limit'] ? parseInt(flags['limit'], 10) : undefined,
    tarId: positional,
  };
  // Pass through all --flags for command-specific options
  for (const [k, v] of Object.entries(flags)) {
    if (!(k in result)) result[`--${k}`] = v;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Index management
// ---------------------------------------------------------------------------

async function loadIndex(): Promise<LegalAct[]> {
  const file = Bun.file(INDEX_PATH);
  if (!(await file.exists())) {
    throw new Error(`Index not found at ${INDEX_PATH}. Run "fetch-index" first.`);
  }
  return file.json() as Promise<LegalAct[]>;
}

async function saveIndex(acts: LegalAct[]): Promise<void> {
  await mkdir('data', { recursive: true });
  await Bun.write(INDEX_PATH, JSON.stringify(acts, null, 2));
}

function filterIndex(
  acts: LegalAct[],
  options: { type?: string; status?: string; limit?: number },
): LegalAct[] {
  let filtered = acts;

  if (options.type) {
    const typeFilter = options.type as ActType;
    filtered = filtered.filter((a) => a.rusis === typeFilter);
  }

  if (options.status) {
    const statusFilter = options.status as ActStatus;
    filtered = filtered.filter((a) => a.statusas === statusFilter);
  }

  if (options.limit && options.limit > 0) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdFetchIndex(): Promise<void> {
  console.log('Fetching document metadata from data.gov.lt...');
  console.log('Filtering for types:', RELEVANT_RAW_TYPES.join(', '));

  const raw = await fetchDocuments({
    includeText: false,
  });

  // Filter for relevant types and convert
  const acts: LegalAct[] = [];
  for (const doc of raw) {
    const act = rawToLegalAct(doc);
    if (RELEVANT_ACT_TYPES.includes(act.rusis)) {
      acts.push(act);
    }
  }

  await saveIndex(acts);

  // Show stats
  console.log(`\nIndex saved to ${INDEX_PATH}`);
  console.log(`Total acts: ${acts.length}\n`);

  const byType = new Map<string, number>();
  const byStatus = new Map<string, number>();

  for (const act of acts) {
    byType.set(act.rusis, (byType.get(act.rusis) ?? 0) + 1);
    byStatus.set(act.statusas, (byStatus.get(act.statusas) ?? 0) + 1);
  }

  console.log('By type:');
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  console.log('\nBy status:');
  for (const [status, count] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status}: ${count}`);
  }
}

async function cmdFetchActs(args: CliArgs): Promise<void> {
  const index = await loadIndex();
  const acts = filterIndex(index, args);

  console.log(`Fetching ${acts.length} acts from e-TAR...\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < acts.length; i++) {
    const act = acts[i]!;

    try {
      const html = await fetchActHtml(act.dokumentoId);
      const markdown = htmlToMarkdown(html);
      const path = await writeActFile(act, markdown, REPO_DIR);

      success++;

      if ((i + 1) % 10 === 0 || i + 1 === acts.length) {
        console.log(`[${i + 1}/${acts.length}] ${success} ok, ${failed} failed`);
      }
    } catch (err) {
      failed++;
      console.error(
        `Failed: ${act.tarId} (${act.pavadinimas}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log(`\nDone. ${success} fetched, ${failed} failed.`);
}

async function cmdFetchHistory(args: CliArgs): Promise<void> {
  const tarId = args.tarId;
  if (!tarId) {
    console.error('Usage: fetch-history <tar-id or dokumento-id>');
    console.error('Example: fetch-history TAR.47BB952431DA');
    process.exit(1);
  }

  // Try to find the dokumento_id from the index first
  let dokumentoId = tarId;
  const indexFile = Bun.file(INDEX_PATH);
  if (await indexFile.exists()) {
    const index: LegalAct[] = await indexFile.json();
    const match = index.find((a) => a.tarId === tarId || a.dokumentoId === tarId);
    if (match) {
      dokumentoId = match.dokumentoId;
      console.log(`Found in index: ${match.pavadinimas}`);
      console.log(`dokumento_id: ${dokumentoId}\n`);
    }
  }

  console.log(`Fetching consolidated versions for ${dokumentoId}...\n`);

  const versions = await fetchConsolidatedVersions(dokumentoId);

  if (versions.length === 0) {
    console.log('No consolidated versions found.');
    return;
  }

  console.log(`Found ${versions.length} version(s):\n`);
  console.log('  #  | Valid from   | Valid until   | Text size');
  console.log('  ---|-------------|--------------|----------');

  for (let i = 0; i < versions.length; i++) {
    const v = versions[i]!;
    const from = v.galioja_nuo?.slice(0, 10) ?? '?';
    const until = v.galioja_iki?.slice(0, 10) ?? 'now';
    const size = v.tekstas_lt ? `${(v.tekstas_lt.length / 1024).toFixed(1)} KB` : 'no text';
    console.log(
      `  ${String(i + 1).padStart(2)} | ${from.padEnd(11)} | ${until.padEnd(12)} | ${size}`,
    );
  }
}

async function cmdBuild(args: CliArgs): Promise<void> {
  // Step 1: Ensure index exists
  const indexFile = Bun.file(INDEX_PATH);
  let index: LegalAct[];

  if (await indexFile.exists()) {
    console.log('Using cached index from data/index.json');
    index = await indexFile.json();
  } else {
    console.log('No cached index found, fetching...');
    await cmdFetchIndex();
    index = await loadIndex();
  }

  // Step 2: Filter
  const acts = filterIndex(index, args);
  console.log(`\nBuilding ${acts.length} acts...\n`);

  // Step 3: Fetch HTML, convert, write
  const written: string[] = [];
  let failed = 0;

  for (let i = 0; i < acts.length; i++) {
    const act = acts[i]!;

    try {
      const html = await fetchActHtml(act.dokumentoId);
      const markdown = htmlToMarkdown(html);
      const path = await writeActFile(act, markdown, REPO_DIR);
      written.push(path);
    } catch (err) {
      failed++;
      console.error(
        `Failed: ${act.tarId}: ${err instanceof Error ? err.message : err}`,
      );
    }

    if ((i + 1) % 10 === 0 || i + 1 === acts.length) {
      console.log(`[${i + 1}/${acts.length}] ${written.length} ok, ${failed} failed`);
    }
  }

  // Step 4: Git commit
  if (written.length > 0) {
    console.log(`\nCommitting ${written.length} files...`);
    try {
      await commitBulkImport(written);
      console.log('Committed.');
    } catch (err) {
      console.error(
        `Git commit failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // Step 5: Report
  console.log(`\nBuild complete: ${written.length} written, ${failed} failed.`);
}

// ---------------------------------------------------------------------------
// Plain text to markdown formatting
// ---------------------------------------------------------------------------

const REPO_DIR = process.env.REPO_DIR || '.';

/**
 * Format plain text body from Suvestine `tekstas_lt` into markdown.
 * The text is plain (not HTML), so we add a title heading and
 * normalize paragraph breaks.
 */
function formatPlainTextBody(title: string, plainText: string): string {
  // Normalize line endings
  let text = plainText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Collapse 3+ consecutive newlines into double newlines (paragraph breaks)
  text = text.replace(/\n{3,}/g, '\n\n');

  // Trim leading/trailing whitespace
  text = text.trim();

  return `# ${title}\n\n${text}\n`;
}

/**
 * Convert SuvestineRaw records to ConsolidatedVersion objects.
 */
function toConsolidatedVersions(raw: SuvestineRaw[]): ConsolidatedVersion[] {
  return raw.map((r) => ({
    dokumentoId: r.dokumento_id,
    suvestinesId: r.suvestines_id,
    tekstas: r.tekstas_lt,
    galiojaNuo: r.galioja_nuo,
    galiojaIki: r.galioja_iki,
  }));
}

// ---------------------------------------------------------------------------
// build-history command
// ---------------------------------------------------------------------------

async function cmdBuildHistory(args: CliArgs): Promise<void> {
  const index = await loadIndex();
  const acts = filterIndex(index, args);

  // Sort by adoption date (oldest first)
  acts.sort((a, b) => (a.priemimoData || '').localeCompare(b.priemimoData || ''));

  // Skip already-processed acts (for resuming)
  const skip = Number(args['--skip']) || 0;
  if (skip > 0) {
    acts.splice(0, skip);
    console.log(`Skipping first ${skip} acts (resuming)...`);
  }

  console.log(`\nBuilding git history for ${acts.length} acts...\n`);

  await initRepo(REPO_DIR);

  let success = 0;
  let failed = 0;
  let skipped = 0;
  let totalCommits = 0;

  const delay = Number(args['--delay']) || 200; // ms between API calls

  for (let i = 0; i < acts.length; i++) {
    const act = acts[i]!;

    // Rate limit: wait between API calls
    if (i > 0) await new Promise((r) => setTimeout(r, delay));

    try {
      // Fetch consolidated versions
      const rawVersions = await fetchConsolidatedVersions(act.dokumentoId);

      if (rawVersions.length === 0) {
        console.log(
          `Processing act ${i + 1}/${acts.length}: ${act.pavadinimas} — no consolidated versions, skipping`,
        );
        skipped++;
        continue;
      }

      // Filter out versions without text
      const versionsWithText = rawVersions.filter((v) => v.tekstas_lt && v.tekstas_lt.trim().length > 0);

      if (versionsWithText.length === 0) {
        console.log(
          `Processing act ${i + 1}/${acts.length}: ${act.pavadinimas} — all versions empty, skipping`,
        );
        skipped++;
        continue;
      }

      console.log(
        `Processing act ${i + 1}/${acts.length}: ${act.pavadinimas} (${versionsWithText.length} versions)`,
      );

      const versions = toConsolidatedVersions(versionsWithText);

      const hashes = await processActHistory(
        act,
        versions,
        (text) => formatPlainTextBody(act.pavadinimas, text),
        { repoDir: REPO_DIR, baseDir: REPO_DIR },
      );

      totalCommits += hashes.length;
      success++;
    } catch (err) {
      failed++;
      console.error(
        `  Failed: ${act.tarId} (${act.pavadinimas}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log(`\n--- Build history summary ---`);
  console.log(`Acts processed: ${success}`);
  console.log(`Acts skipped (no versions): ${skipped}`);
  console.log(`Acts failed: ${failed}`);
  console.log(`Total commits created: ${totalCommits}`);
  console.log(`Output repo: ${REPO_DIR}/`);
}

// ---------------------------------------------------------------------------
// build-single command
// ---------------------------------------------------------------------------

async function cmdBuildSingle(args: CliArgs): Promise<void> {
  const tarId = args.tarId;
  if (!tarId) {
    console.error('Usage: build-single <tar-id or dokumento-id>');
    console.error('Example: build-single TAR.47BB952431DA');
    process.exit(1);
  }

  // Look up the act in the index
  const index = await loadIndex();
  const act = index.find((a) => a.tarId === tarId || a.dokumentoId === tarId);

  if (!act) {
    console.error(`Act not found in index: ${tarId}`);
    console.error('Run "fetch-index" first, or check the ID.');
    process.exit(1);
  }

  console.log(`Building history for: ${act.pavadinimas}`);
  console.log(`TAR ID: ${act.tarId}, dokumento_id: ${act.dokumentoId}\n`);

  // Fetch consolidated versions
  const rawVersions = await fetchConsolidatedVersions(act.dokumentoId);

  if (rawVersions.length === 0) {
    console.log('No consolidated versions found.');
    return;
  }

  // Filter out versions without text
  const versionsWithText = rawVersions.filter((v) => v.tekstas_lt && v.tekstas_lt.trim().length > 0);

  if (versionsWithText.length === 0) {
    console.log(`Found ${rawVersions.length} versions, but none contain text.`);
    return;
  }

  console.log(`Found ${versionsWithText.length} version(s) with text (${rawVersions.length} total)\n`);

  await initRepo(REPO_DIR);

  const versions = toConsolidatedVersions(versionsWithText);

  const hashes = await processActHistory(
    act,
    versions,
    (text) => formatPlainTextBody(act.pavadinimas, text),
    { repoDir: REPO_DIR, baseDir: REPO_DIR },
  );

  console.log(`\nCreated ${hashes.length} commits:`);
  for (let i = 0; i < hashes.length; i++) {
    const v = versions[i]!;
    console.log(`  ${v.galiojaNuo} — ${hashes[i]!.slice(0, 8)}`);
  }
  console.log(`\nOutput repo: ${REPO_DIR}/`);
}

// ---------------------------------------------------------------------------
// consolidate command
// ---------------------------------------------------------------------------

interface AmendmentMapEntry {
  parentTarId: string;
  parentDokNr: string;
  parentTitle: string;
  amendments: {
    tarId: string;
    dokumentoId: string;
    dokNr: string;
    date: string;
    title: string;
  }[];
}

async function cmdConsolidate(args: CliArgs): Promise<void> {
  const AMENDMENT_MAP_PATH = 'data/amendment-map.json';
  const delay = Number(args['--delay']) || 500;
  const limit = args.limit;

  // Step 1: Load amendment map
  const mapFile = Bun.file(AMENDMENT_MAP_PATH);
  if (!(await mapFile.exists())) {
    console.error(`Amendment map not found at ${AMENDMENT_MAP_PATH}.`);
    process.exit(1);
  }
  const amendmentMap: AmendmentMapEntry[] = await mapFile.json();

  // Step 2: Load index to look up parent act metadata
  const index = await loadIndex();
  const indexByTarId = new Map(index.map((a) => [a.tarId, a]));

  // Apply limit for testing
  let entries = amendmentMap;
  if (limit && limit > 0) {
    entries = entries.slice(0, limit);
  }

  console.log(`Consolidating ${entries.length} parent laws with pending amendments...`);
  console.log(`Rate limit delay: ${delay}ms\n`);

  await initRepo(REPO_DIR);

  let totalAmendments = 0;
  let appliedAmendments = 0;
  let failedAmendments = 0;
  let skippedParents = 0;

  for (let pi = 0; pi < entries.length; pi++) {
    const entry = entries[pi]!;
    const act = indexByTarId.get(entry.parentTarId);

    if (!act) {
      console.log(
        `[${pi + 1}/${entries.length}] ${entry.parentTitle} -- not in index, skipping`,
      );
      skippedParents++;
      continue;
    }

    const relativePath = getActFilePath(act);
    const fullPath = join(REPO_DIR, relativePath);

    // Read current markdown from disk
    const currentFile = Bun.file(fullPath);
    if (!(await currentFile.exists())) {
      console.log(
        `[${pi + 1}/${entries.length}] ${act.pavadinimas} -- file not found on disk, skipping`,
      );
      skippedParents++;
      continue;
    }

    let currentText = await currentFile.text();
    const amendmentCount = entry.amendments.length;
    totalAmendments += amendmentCount;

    console.log(
      `[${pi + 1}/${entries.length}] ${act.pavadinimas} (${amendmentCount} amendments)`,
    );

    // Sort amendments chronologically
    const sorted = [...entry.amendments].sort((a, b) => a.date.localeCompare(b.date));

    for (let ai = 0; ai < sorted.length; ai++) {
      const amendment = sorted[ai]!;

      // Rate limit between API calls
      if (pi > 0 || ai > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }

      try {
        // Fetch amendment act HTML from e-TAR
        const html = await fetchActHtml(amendment.dokumentoId);

        // Parse amendment operations
        const { operations } = parseAmendmentAct(html);

        if (operations.length === 0) {
          console.log(
            `  [${ai + 1}/${amendmentCount}] ${amendment.dokNr} (${amendment.date}) -- no operations found, skipping`,
          );
          failedAmendments++;
          continue;
        }

        // Apply amendment operations to current text
        const newText = applyAmendment(currentText, operations);
        currentText = newText;

        // Write updated file
        await mkdir(dirname(fullPath), { recursive: true });
        await Bun.write(fullPath, currentText);

        // Commit with proper date
        const version: ConsolidatedVersion = {
          dokumentoId: amendment.dokumentoId,
          suvestinesId: amendment.dokumentoId,
          tekstas: currentText,
          galiojaNuo: amendment.date,
          galiojaIki: null,
        };

        const hash = await commitAmendment(act, fullPath, version, { repoDir: REPO_DIR });

        appliedAmendments++;
        console.log(
          `  [${ai + 1}/${amendmentCount}] ${amendment.dokNr} (${amendment.date}) -- applied, ${hash.slice(0, 8)}`,
        );
      } catch (err) {
        failedAmendments++;
        console.error(
          `  [${ai + 1}/${amendmentCount}] ${amendment.dokNr} (${amendment.date}) -- FAILED: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  // Summary
  console.log(`\n--- Consolidation summary ---`);
  console.log(`Parent laws processed: ${entries.length - skippedParents}`);
  console.log(`Parent laws skipped: ${skippedParents}`);
  console.log(`Total amendments: ${totalAmendments}`);
  console.log(`Applied: ${appliedAmendments}`);
  console.log(`Failed/skipped: ${failedAmendments}`);
}

// ---------------------------------------------------------------------------
// stats command
// ---------------------------------------------------------------------------

async function cmdStats(): Promise<void> {
  const index = await loadIndex();

  console.log(`Total acts in index: ${index.length}\n`);

  // By type
  const byType = new Map<string, number>();
  for (const act of index) {
    byType.set(act.rusis, (byType.get(act.rusis) ?? 0) + 1);
  }
  console.log('By type:');
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  // By status
  const byStatus = new Map<string, number>();
  for (const act of index) {
    byStatus.set(act.statusas, (byStatus.get(act.statusas) ?? 0) + 1);
  }
  console.log('\nBy status:');
  for (const [status, count] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status}: ${count}`);
  }

  // By year (from priemimoData)
  const byYear = new Map<string, number>();
  for (const act of index) {
    const year = act.priemimoData?.slice(0, 4) || 'unknown';
    byYear.set(year, (byYear.get(year) ?? 0) + 1);
  }
  console.log('\nBy year (adoption):');
  const sortedYears = [...byYear.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [year, count] of sortedYears) {
    console.log(`  ${year}: ${count}`);
  }
}

function showHelp(): void {
  console.log(`lt-teises-aktai - Lithuanian legal acts fetcher

Usage:
  bun src/main.ts <command> [options]

Commands:
  fetch-index                        Fetch metadata index from data.gov.lt
  fetch-acts [options]               Fetch & convert acts from e-TAR
  fetch-history <tar-id>             Fetch amendment history for a specific act
  build [options]                    Full pipeline: fetch + convert + commit
  build-history [options]            Build full git history from consolidated versions
  build-single <tar-id>             Build git history for a single act
  consolidate [options]              Apply amendments from gap period (post-Suvestine)
  stats                              Show statistics about fetched data

Options:
  --type <type>                      Filter by act type (e.g., istatymas, kodeksas)
  --status <status>                  Filter by status (e.g., galioja, negalioja)
  --limit <n>                        Limit number of parent laws to process
  --delay <ms>                       Delay between API calls in ms (default: 500)
`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const args = parseArgs();

switch (args.command) {
  case 'fetch-index':
    await cmdFetchIndex();
    break;
  case 'fetch-acts':
    await cmdFetchActs(args);
    break;
  case 'fetch-history':
    await cmdFetchHistory(args);
    break;
  case 'build':
    await cmdBuild(args);
    break;
  case 'build-history':
    await cmdBuildHistory(args);
    break;
  case 'build-single':
    await cmdBuildSingle(args);
    break;
  case 'consolidate':
    await cmdConsolidate(args);
    break;
  case 'stats':
    await cmdStats();
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  default:
    console.error(`Unknown command: ${args.command}`);
    showHelp();
    process.exit(1);
}
