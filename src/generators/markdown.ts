import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { LegalAct, DokumentasRaw, ActType, ActStatus } from '../types';
import { ACT_TYPE_DIRS } from '../types';

// --- Type normalization ---

const ACT_TYPE_MAP: Record<string, ActType> = {
  'konstitucija': 'konstitucija',
  'lietuvos respublikos konstitucija': 'konstitucija',
  'konstitucinis įstatymas': 'konstitucinis_istatymas',
  'konstitucinis aktas': 'konstitucinis_istatymas',
  'įstatymas': 'istatymas',
  'kodeksas': 'kodeksas',
  'seimo nutarimas': 'seimo_nutarimas',
  'lietuvos respublikos seimo nutarimas': 'seimo_nutarimas',
  'vyriausybės nutarimas': 'vyriausybes_nutarimas',
  'lietuvos respublikos vyriausybės nutarimas': 'vyriausybes_nutarimas',
  'nutarimas': 'vyriausybes_nutarimas',
  'prezidento dekretas': 'prezidento_dekretas',
  'lietuvos respublikos prezidento dekretas': 'prezidento_dekretas',
  'dekretas': 'prezidento_dekretas',
  'ministro įsakymas': 'ministro_isakymas',
  'įsakymas': 'ministro_isakymas',
  'institucijos įsakymas': 'institucijos_isakymas',
  'tarptautinė sutartis': 'tarptautine_sutartis',
};

const STATUS_MAP: Record<string, ActStatus> = {
  'galioja': 'galioja',
  'galiojantis': 'galioja',
  'negalioja': 'negalioja',
  'negaliojantis': 'negalioja',
  'neteko galios': 'negalioja',
  'dar neįsigaliojo': 'dar_neisigaliojo',
  'neįsigaliojęs': 'dar_neisigaliojo',
  'galioja iš dalies': 'galioja_is_dalies',
};

export function normalizeActType(rusis: string): ActType {
  const key = rusis.trim().toLowerCase();
  return ACT_TYPE_MAP[key] ?? 'kitas';
}

export function normalizeStatus(galiojBusena: string): ActStatus {
  const key = galiojBusena.trim().toLowerCase();
  return STATUS_MAP[key] ?? 'galioja';
}

// --- Directory mapping ---

export function getActDirectory(type: ActType): string {
  return ACT_TYPE_DIRS[type];
}

// --- TAR ID handling ---

function extractTarId(raw: DokumentasRaw): string {
  // If tar_kodas looks like a proper TAR ID, use it
  if (raw.tar_kodas && /^TAR\.[A-Fa-f0-9]{12}$/.test(raw.tar_kodas)) {
    return raw.tar_kodas;
  }
  // If dokumento_id starts with TAR., use it
  if (raw.dokumento_id.startsWith('TAR.')) {
    return raw.dokumento_id;
  }
  // Construct from dokumento_id (some records use UUIDs or other formats)
  return `TAR.${raw.dokumento_id.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

function buildEtarUrl(raw: DokumentasRaw): string {
  // The nuoroda field from the API is the canonical URL
  if (raw.nuoroda) return raw.nuoroda;
  // Fallback: construct from dokumento_id (works for both TAR.xxx and UUID formats)
  const id = raw.dokumento_id.startsWith('TAR.')
    ? raw.dokumento_id
    : raw.dokumento_id;
  return `https://www.e-tar.lt/portal/lt/legalAct/${id}`;
}

// --- Raw to LegalAct conversion ---

export function rawToLegalAct(raw: DokumentasRaw): LegalAct {
  const tarId = extractTarId(raw);

  return {
    tarId,
    dokumentoId: raw.dokumento_id,
    dokNr: raw.atv_dok_nr ?? '',
    pavadinimas: raw.pavadinimas,
    rusis: normalizeActType(raw.rusis),
    leidziantisOrganas: raw.priemusi_inst ?? '',
    priemimoData: formatDate(raw.priimtas),
    isigaliojimoData: formatDate(raw.isigalioja),
    paskelbimoData: formatDate(raw.paskelbta_tar),
    statusas: normalizeStatus(raw.galioj_busena),
    etarUrl: buildEtarUrl(raw),
    tekstas: raw.tekstas_lt ?? undefined,
  };
}

// --- Date formatting ---

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  // API may return ISO 8601 datetime — extract YYYY-MM-DD
  const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1]! : dateStr;
}

// --- YAML frontmatter generation ---

/** Quote a YAML string value if it contains special characters */
function yamlValue(value: string): string {
  if (value === '') return '""';
  // Quote if it contains characters that could break YAML parsing
  if (/[:{}\[\],&*?|>!%@`#'"\n]/.test(value) || value.startsWith('-') || value.startsWith(' ')) {
    // Use double quotes, escaping internal double quotes and backslashes
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
}

function yamlArray(values: string[]): string {
  if (values.length === 0) return '[]';
  return `\n${values.map(v => `  - ${yamlValue(v)}`).join('\n')}`;
}

export function generateFrontmatter(act: LegalAct): string {
  const lines: string[] = [];

  const field = (key: string, value: string | undefined) => {
    if (value === undefined || value === null) return;
    lines.push(`${key}: ${yamlValue(value)}`);
  };

  const arrayField = (key: string, values: string[] | undefined) => {
    if (values === undefined || values === null) return;
    lines.push(`${key}: ${yamlArray(values)}`);
  };

  // Identity
  field('tar_id', act.tarId);
  field('dok_nr', act.dokNr);
  field('pavadinimas', act.pavadinimas);

  // Classification
  field('rusis', act.rusis);
  field('leidziantis_organas', act.leidziantisOrganas);

  // Dates
  field('priemimo_data', act.priemimoData);
  field('isigaliojimo_data', act.isigaliojimoData);
  field('paskelbimo_data', act.paskelbimoData);
  if (act.paskutinioPakeitimoData) {
    field('paskutinio_pakeitimo_data', act.paskutinioPakeitimoData);
  }

  // Status
  field('statusas', act.statusas);

  // Links
  field('etar_url', act.etarUrl);

  return lines.join('\n');
}

// --- File content generation ---

export function generateMarkdownFile(act: LegalAct, markdownBody: string): string {
  const frontmatter = generateFrontmatter(act);
  return `---\n${frontmatter}\n---\n\n${markdownBody}\n`;
}

// --- File paths ---

export function getActFilePath(act: LegalAct): string {
  const dir = getActDirectory(act.rusis);
  return `${dir}/${act.tarId}.md`;
}

// --- File I/O ---

export async function writeActFile(
  act: LegalAct,
  markdownBody: string,
  baseDir?: string,
): Promise<string> {
  const relativePath = getActFilePath(act);
  const fullPath = baseDir ? join(baseDir, relativePath) : relativePath;

  await mkdir(dirname(fullPath), { recursive: true });

  const content = generateMarkdownFile(act, markdownBody);
  await Bun.write(fullPath, content);

  return fullPath;
}

export async function writeActFiles(
  acts: Array<{ act: LegalAct; body: string }>,
  options?: {
    baseDir?: string;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<string[]> {
  const total = acts.length;
  const paths: string[] = [];

  for (let i = 0; i < total; i++) {
    const { act, body } = acts[i]!;
    const path = await writeActFile(act, body, options?.baseDir);
    paths.push(path);
    options?.onProgress?.(i + 1, total);
  }

  return paths;
}
