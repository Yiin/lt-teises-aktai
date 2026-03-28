import type { DokumentasRaw, SuvestineRaw } from '../types.ts';

const BASE_URL = 'https://get.data.gov.lt/datasets/gov/lrsk/teises_aktai';
const DOCUMENTS_DATASET = 'Dokumentas';
const CONSOLIDATED_DATASET = 'Suvestine';

function log(msg: string) {
  console.log(`[data-gov] ${msg}`);
}

/**
 * Build a Spinta RQL query URL.
 *
 * Spinta uses a functional query syntax appended to the dataset path:
 *   /Dataset/:format?select(a,b)&condition(field,"value")&limit(n)&sort(field)
 */
export function buildQueryUrl(
  dataset: string,
  params: {
    format?: 'json' | 'jsonl';
    limit?: number;
    select?: string[];
    filters?: Record<string, string>;
    containsFilters?: Record<string, string>;
    rangeFilters?: { field: string; op: 'ge' | 'le' | 'gt' | 'lt'; value: string }[];
    sort?: string[];
    page?: string;
  },
): string {
  const format = params.format ?? 'json';
  const path = `${BASE_URL}/${dataset}`;

  const queryParts: string[] = [`format(${format})`];

  if (params.select && params.select.length > 0) {
    queryParts.push(`select(${params.select.join(',')})`);
  }

  if (params.filters) {
    for (const [field, value] of Object.entries(params.filters)) {
      queryParts.push(`${field}="${value}"`);
    }
  }

  if (params.containsFilters) {
    for (const [field, value] of Object.entries(params.containsFilters)) {
      queryParts.push(`contains(${field},"${value}")`);
    }
  }

  if (params.rangeFilters) {
    for (const rf of params.rangeFilters) {
      queryParts.push(`${rf.op}(${rf.field},"${rf.value}")`);
    }
  }

  if (params.sort && params.sort.length > 0) {
    queryParts.push(`sort(${params.sort.join(',')})`);
  }

  if (params.limit != null) {
    queryParts.push(`limit(${params.limit})`);
  }

  if (params.page) {
    queryParts.push(`page("${params.page}")`);
  }

  if (queryParts.length === 0) return path;
  return `${path}?${queryParts.join('&')}`;
}

/**
 * Stream JSONL from the Spinta API, following cursor pagination automatically.
 * Each line is one JSON object. The last object on each page contains `_page.next`.
 */
export async function* streamJsonl<T extends { _page?: { next: string } | null }>(
  url: string,
): AsyncGenerator<T> {
  let currentUrl: string | null = url;

  while (currentUrl) {
    log(`Fetching ${currentUrl.length > 120 ? currentUrl.slice(0, 120) + '...' : currentUrl}`);
    const response = await fetch(currentUrl);

    if (!response.ok) {
      throw new Error(`Spinta API error ${response.status}: ${await response.text()}`);
    }

    const body = response.body;
    if (!body) throw new Error('Empty response body');

    let nextPageToken: string | null = null;
    const decoder = new TextDecoder();
    let buffer = '';
    const reader = body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);

        if (!line) continue;

        const record = JSON.parse(line) as T;

        if (record._page?.next) {
          nextPageToken = record._page.next;
        }

        yield record;
      }
    }

    // Flush remaining buffer
    const remaining = buffer.trim();
    if (remaining) {
      const record = JSON.parse(remaining) as T;
      if (record._page?.next) {
        nextPageToken = record._page.next;
      }
      yield record;
    }

    if (nextPageToken) {
      // Build next page URL by replacing/adding the page() parameter
      const [basePath, existingQuery] = currentUrl.split('?') as [string, string | undefined];
      const parts: string[] = existingQuery
        ? existingQuery.split('&').filter((p: string) => !p.startsWith('page('))
        : [];
      parts.push(`page("${nextPageToken}")`);
      currentUrl = `${basePath}?${parts.join('&')}`;
    } else {
      currentUrl = null;
    }
  }
}

const DEFAULT_FIELDS = [
  '_id',
  '_type',
  'dokumento_id',
  'pavadinimas',
  'tar_kodas',
  'rusis',
  'galioj_busena',
  'priemusi_inst',
  'atv_dok_nr',
  'registracija',
  'priimtas',
  'paskelbta_tar',
  'isigalioja',
  'negalioja',
  'nuoroda',
  '_page',
];

/**
 * Fetch all documents matching the given filters via JSONL streaming.
 */
export async function fetchDocuments(options: {
  types?: string[];
  status?: string;
  limit?: number;
  fields?: string[];
  includeText?: boolean;
} = {}): Promise<DokumentasRaw[]> {
  const fields = options.fields ?? [
    ...DEFAULT_FIELDS,
    ...(options.includeText ? ['tekstas_lt'] : []),
  ];

  const filters: Record<string, string> = {};
  if (options.status) {
    filters['galioj_busena'] = options.status;
  }

  // Spinta doesn't support OR filters natively, so if multiple types are given
  // we fetch without a type filter and post-filter in memory.
  const filterByTypeLocally = options.types && options.types.length > 1;
  if (options.types && options.types.length === 1) {
    filters['rusis'] = options.types[0]!;
  }

  const url = buildQueryUrl(DOCUMENTS_DATASET, {
    format: 'jsonl',
    limit: options.limit ?? 500_000,
    select: fields,
    filters,
    sort: ['tar_kodas'],
  });

  const results: DokumentasRaw[] = [];
  let count = 0;

  for await (const record of streamJsonl<DokumentasRaw>(url)) {
    if (filterByTypeLocally && !options.types!.includes(record.rusis)) {
      continue;
    }
    results.push(record);
    count++;
    if (count % 1000 === 0) {
      log(`Fetched ${count} documents...`);
    }
  }

  log(`Fetched ${count} documents total.`);
  return results;
}

/**
 * Fetch consolidated (amendment) versions for a specific document.
 */
export async function fetchConsolidatedVersions(
  dokumentoId: string,
): Promise<SuvestineRaw[]> {
  const url = buildQueryUrl(CONSOLIDATED_DATASET, {
    format: 'jsonl',
    select: [
      '_id',
      'dokumento_id',
      'suvestines_id',
      'tekstas_lt',
      'galioja_nuo',
      'galioja_iki',
      'nuoroda',
      '_page',
    ],
    filters: { dokumento_id: dokumentoId },
    sort: ['galioja_nuo'],
  });

  const results: SuvestineRaw[] = [];

  for await (const record of streamJsonl<SuvestineRaw>(url)) {
    results.push(record);
  }

  log(`Fetched ${results.length} consolidated versions for ${dokumentoId}.`);
  return results;
}
