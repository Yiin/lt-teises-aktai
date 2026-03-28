import { $ } from 'bun';
import { join, relative, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { LegalAct, ConsolidatedVersion } from '../types';
import { generateMarkdownFile, getActFilePath } from './markdown';

// --- Helpers ---

/** Run a git command in the given directory, returning trimmed stdout */
async function git(args: string[], opts: {
  cwd: string;
  env?: Record<string, string>;
}): Promise<string> {
  const env = { ...process.env, ...opts.env };
  const result = await $`git ${args}`.cwd(opts.cwd).env(env).quiet();
  return result.text().trim();
}

/** Commit staged changes and return the commit hash */
async function commitAndGetHash(message: string, opts: {
  cwd: string;
  env?: Record<string, string>;
}): Promise<string> {
  await git(['commit', '-m', message], opts);
  return git(['rev-parse', 'HEAD'], { cwd: opts.cwd });
}

/** Convert a YYYY-MM-DD date string to ISO 8601 datetime (noon UTC) */
function toAuthorDate(date: string): string {
  // Use noon UTC to avoid timezone-related date shifts
  return `${date}T12:00:00+00:00`;
}

// --- Public API ---

/** Initialize a git repo for the output directory (if not already a git repo) */
export async function initRepo(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  try {
    await git(['rev-parse', '--git-dir'], { cwd: dir });
  } catch {
    await git(['init'], { cwd: dir });
  }
}

/** Create a commit for the initial publication of a legal act */
export async function commitInitialAct(act: LegalAct, filePath: string, options?: {
  repoDir?: string;
}): Promise<string> {
  const cwd = options?.repoDir ?? dirname(filePath);
  const rel = relative(cwd, filePath);

  const subject = `Paskelbtas: ${act.pavadinimas} (${act.dokNr})`;
  const body = [
    `Šaltinis: ${act.etarUrl}`,
    `Priėmimo data: ${act.priemimoData}`,
    `Įsigaliojimo data: ${act.isigaliojimoData}`,
  ].join('\n');
  const message = `${subject}\n\n${body}`;

  const authorDate = act.paskelbimoData
    ? toAuthorDate(act.paskelbimoData)
    : undefined;

  await git(['add', rel], { cwd });
  return commitAndGetHash(message, {
    cwd,
    env: authorDate ? { GIT_AUTHOR_DATE: authorDate } : {},
  });
}

/** Create a commit for an amendment (consolidated version change) */
export async function commitAmendment(act: LegalAct, filePath: string, version: ConsolidatedVersion, options?: {
  repoDir?: string;
}): Promise<string> {
  const cwd = options?.repoDir ?? dirname(filePath);
  const rel = relative(cwd, filePath);

  const subject = `Pakeistas: ${act.pavadinimas} (${act.dokNr})`;
  const body = [
    `Keičianti redakcija nuo: ${version.galiojaNuo}`,
    `Šaltinis: ${act.etarUrl}`,
  ].join('\n');
  const message = `${subject}\n\n${body}`;

  const authorDate = toAuthorDate(version.galiojaNuo);

  await git(['add', rel], { cwd });
  return commitAndGetHash(message, {
    cwd,
    env: { GIT_AUTHOR_DATE: authorDate },
  });
}

/** Create a commit marking an act as repealed */
export async function commitRepeal(act: LegalAct, filePath: string, options?: {
  repoDir?: string;
  repealingActId?: string;
}): Promise<string> {
  const cwd = options?.repoDir ?? dirname(filePath);
  const rel = relative(cwd, filePath);

  const subject = `Panaikintas: ${act.pavadinimas} (${act.dokNr})`;
  const body = options?.repealingActId
    ? `Panaikinantis aktas: ${options.repealingActId}`
    : undefined;
  const message = body ? `${subject}\n\n${body}` : subject;

  await git(['add', rel], { cwd });
  return commitAndGetHash(message, { cwd });
}

/** Create a bulk import commit (for batch importing many acts at once) */
export async function commitBulkImport(filePaths: string[], options?: {
  repoDir?: string;
  message?: string;
}): Promise<string> {
  if (filePaths.length === 0) throw new Error('No files to commit');

  const cwd = options?.repoDir ?? dirname(filePaths[0]!);

  for (const fp of filePaths) {
    const rel = relative(cwd, fp);
    await git(['add', rel], { cwd });
  }

  const message = options?.message
    ?? `Pradinis importas: ${filePaths.length} teisės aktų iš e-TAR`;

  return commitAndGetHash(message, { cwd });
}

/**
 * Process an act with all its consolidated versions, creating proper git history.
 *
 * 1. Write the first version, commit with publication date
 * 2. For each subsequent version, overwrite the file, commit with version date
 *
 * Returns an array of commit output strings.
 */
export async function processActHistory(
  act: LegalAct,
  versions: ConsolidatedVersion[],
  generateBody: (text: string) => string,
  options?: { repoDir?: string; baseDir?: string },
): Promise<string[]> {
  if (versions.length === 0) return [];

  const sorted = [...versions].sort(
    (a, b) => a.galiojaNuo.localeCompare(b.galiojaNuo),
  );

  const baseDir = options?.baseDir ?? options?.repoDir ?? '.';
  const repoDir = options?.repoDir ?? baseDir;
  const relativePath = getActFilePath(act);
  const fullPath = join(baseDir, relativePath);

  await mkdir(dirname(fullPath), { recursive: true });

  const hashes: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const version = sorted[i]!;
    const body = generateBody(version.tekstas);
    const content = generateMarkdownFile(act, body);
    await Bun.write(fullPath, content);

    if (i === 0) {
      hashes.push(await commitInitialAct(act, fullPath, { repoDir }));
    } else {
      hashes.push(await commitAmendment(act, fullPath, version, { repoDir }));
    }
  }

  return hashes;
}
