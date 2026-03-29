import * as cheerio from 'cheerio';
import type { CheerioAPI, Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';

// --- Types ---

export interface AmendmentOperation {
  type: 'replace' | 'add' | 'repeal' | 'rename' | 'restate';
  target: {
    article?: string;
    paragraph?: string;
    point?: string;
    chapter?: string;
    section?: string;
    annex?: string;
    title?: boolean;
  };
  newText?: string;
}

export interface ParsedAmendment {
  parentLawRef: string;
  operations: AmendmentOperation[];
}

// --- Quote handling ---

/** Opening Lithuanian quote */
const OPEN_QUOTE = '\u201E'; // „
/** Closing Lithuanian quote */
const CLOSE_QUOTE = '\u201C'; // "

/**
 * Extract text between Lithuanian quotes „...".
 * Returns the content without the quotes, or null if no quoted block found.
 */
function extractQuotedText(text: string): string | null {
  const openIdx = text.indexOf(OPEN_QUOTE);
  if (openIdx === -1) return null;

  // Find the last closing quote — replacement text can be multi-paragraph
  const closeIdx = text.lastIndexOf(CLOSE_QUOTE);
  if (closeIdx === -1 || closeIdx <= openIdx) return null;

  return text.slice(openIdx + 1, closeIdx).trim();
}

// --- Article number normalization ---

/**
 * Normalize article numbers:
 * - "13^1" -> "13-1" (superscript notation from html-to-markdown)
 * - "13<sup>1</sup>" -> "13-1" (raw HTML)
 * - "13 1" with superscript context -> "13-1"
 * - Plain "13" stays "13"
 */
function normalizeArticleNumber(raw: string): string {
  return raw
    .replace(/\^(\d+)/g, '-$1')
    .replace(/<sup>(\d+)<\/sup>/gi, '-$1')
    .replace(/\s+/g, '')
    .trim();
}

// --- Regex patterns for amendment instructions ---

// Replace entire article
const RE_REPLACE_ARTICLE =
  /Pakeisti\s+(\d+(?:[\s^-]\d+)?)\s+straipsn[iyį]\s+ir\s+j[iyį]\s+i[sš]d[eė]styti\s+taip\s*:/i;

// Replace paragraph of article
const RE_REPLACE_PARAGRAPH =
  /Pakeisti\s+(\d+(?:[\s^-]\d+)?)\s+straipsnio\s+(\d+)\s+dal[iyį]\s+ir\s+j[aąiy]\s+i[sš]d[eė]styti\s+taip\s*:/i;

// Replace point of paragraph
const RE_REPLACE_POINT =
  /Pakeisti\s+(\d+(?:[\s^-]\d+)?)\s+straipsnio\s+(\d+)\s+dalies\s+(\d+)\s+punkt[aąiy]\s+ir\s+j[iyį]\s+i[sš]d[eė]styti\s+taip\s*:/i;

// Replace annex
const RE_REPLACE_ANNEX =
  /Pakeisti\s+(?:Kodekso|[IĮ]statymo)\s+pried[aąiy]\s+ir\s+j[iyį]\s+i[sš]d[eė]styti\s+taip\s*:/i;

// Replace chapter
const RE_REPLACE_CHAPTER =
  /Pakeisti\s+([IVXLCDM]+(?:[\s^-]\d+)?)\s+skyri[uyų]\s+ir\s+j[iyį]\s+i[sš]d[eė]styti\s+taip\s*:/i;

// Replace section
const RE_REPLACE_SECTION =
  /Pakeisti\s+([IVXLCDM]+)\s+skyriaus\s+(.+?)\s+skirsn[iyį]\s+ir\s+j[iyį]\s+i[sš]d[eė]styti\s+taip\s*:/i;

// Replace title/name
const RE_REPLACE_TITLE =
  /Pakeisti\s+(.+?)\s+pavadinim[aąiy]\s+ir\s+j[iyį]\s+i[sš]d[eė]styti\s+taip\s*:/i;

// Add paragraph to article
const RE_ADD_PARAGRAPH =
  /Papildyti\s+(\d+(?:[\s^-]\d+)?)\s+straipsn[iyį]\s+(\d+)\s+dalimi\s*:/i;

// Add new point to paragraph
const RE_ADD_POINT =
  /Papildyti\s+(\d+(?:[\s^-]\d+)?)\s+straipsnio\s+(\d+)\s+dal[iyį]\s+nauju\s+(\d+)\s+punktu\s*:/i;

// Add new article to law
const RE_ADD_ARTICLE =
  /Papildyti\s+(?:Kodeks[aą]|[IĮ]statym[aą])\s+(\d+(?:[\s^-]\d+)?)\s+straipsniu\s*:/i;

// Add new chapter to law
const RE_ADD_CHAPTER =
  /Papildyti\s+(?:Kodeks[aą]|[IĮ]statym[aą])\s+([\w\s^-]+?)\s+skyriumi\s*:/i;

// Add annex to law
const RE_ADD_ANNEX =
  /Papildyti\s+(?:Kodeks[aą]|[IĮ]statym[aą])\s+priedu\s*:/i;

// Add item to annex
const RE_ADD_ANNEX_ITEM =
  /Papildyti\s+(?:Kodekso|[IĮ]statymo)\s+pried[aą]\s+(\d+)\s+punktu\s*:/i;

// Add multiple new paragraphs
const RE_ADD_PARAGRAPHS =
  /Papildyti\s+(\d+(?:[\s^-]\d+)?)\s+straipsn[iyį]\s+naujomis\s+(.+?)\s+dalimis\s*:/i;

// Repeal article (singular)
const RE_REPEAL_ARTICLE =
  /Pripažinti\s+netekusi[uyų]\s+galios\s+(\d+(?:[\s^-]\d+)?)\s+straipsn[iyį]\s*\./i;

// Repeal articles (plural)
const RE_REPEAL_ARTICLES =
  /Pripažinti\s+netekusiais\s+galios\s+([\d,\s]+(?:ir\s+\d+(?:[\s^-]\d+)?)?)\s+straipsnius\s*\./i;

// --- Parent law reference extraction ---

/**
 * Extract the parent law document number from the amendment act title.
 * Looks for "Nr. {DOK_NR}" pattern in the title text.
 */
function extractParentLawRef(titleText: string): string {
  // Match "Nr. XIV-1234" or "Nr. IX-884" etc.
  const match = titleText.match(/Nr\.\s+([A-Z]+-\d+)/i);
  if (match) return `Nr. ${match[1]}`;

  // Fallback: look for any document number pattern
  const fallback = titleText.match(/Nr\.\s+(\S+)/i);
  if (fallback) return `Nr. ${fallback[1]}`;

  return '';
}

// --- HTML parsing ---

/**
 * Get plain text from a cheerio element, converting superscripts to ^N notation.
 */
function getPlainText($: CheerioAPI, el: Cheerio<AnyNode>): string {
  let text = '';
  el.contents().each((_, node) => {
    if (node.type === 'text') {
      text += (node as unknown as { data: string }).data ?? '';
    } else {
      const tag = (node as unknown as { tagName?: string }).tagName?.toLowerCase();
      const $node = $(node);
      if (tag === 'sup') {
        text += '^' + $node.text();
      } else if (tag === 'br') {
        text += '\n';
      } else {
        text += getPlainText($, $node);
      }
    }
  });
  return text;
}

/**
 * Extract all text content from a part div (replacement text block),
 * including nested paragraphs joined with newlines.
 */
function extractPartText($: CheerioAPI, el: Cheerio<AnyNode>): string {
  const lines: string[] = [];

  el.find('p').each((_, p) => {
    const text = getPlainText($, $(p)).replace(/\u00a0/g, ' ').trim();
    if (text) lines.push(text);
  });

  return lines.join('\n');
}

/**
 * Parse an amendment act from its HTML source.
 */
export function parseAmendmentAct(html: string): ParsedAmendment {
  const $ = cheerio.load(html, { xml: false });

  // Extract the title (centered bold paragraphs at the top)
  const titleParts: string[] = [];
  $('p[align="center"], p').each((_, el) => {
    const $el = $(el);
    const style = $el.attr('style') ?? '';
    const align = $el.attr('align');
    if (align === 'center' || style.includes('text-align:center')) {
      const text = getPlainText($, $el).replace(/\u00a0/g, ' ').trim();
      if (text) titleParts.push(text);
    }
  });
  const fullTitle = titleParts.join(' ');
  const parentLawRef = extractParentLawRef(fullTitle);

  // Find all article sections (top-level structural divs containing "straipsnis")
  const operations: AmendmentOperation[] = [];

  // Collect text from each part_* div that represents an amendment article
  const rootParts = $('div[id^="part_"]');

  // Walk through the HTML extracting amendment instruction blocks
  // Each article of the amendment act is a div containing:
  // 1. A bold heading paragraph ("N straipsnis. ...")
  // 2. One or more instruction paragraphs with optional replacement text

  rootParts.each((_, partEl) => {
    const $part = $(partEl);

    // Check if this div directly contains an article heading
    const headingP = $part.children('p').first();
    const headingText = getPlainText($, headingP).replace(/\u00a0/g, ' ').trim();

    // Skip if this is not an amendment article heading
    if (!headingText.match(/^\d+(?:\^\d+)?\s+straipsnis/)) return;

    // Skip final provisions article
    if (/[IĮį]statymo\s+[ių]sigaliojim/i.test(headingText) ||
        /[IĮį]statymo\s+[ių]gyvendinim/i.test(headingText) ||
        /[Įį]sigaliojimas/i.test(headingText) ||
        /taikymas$/i.test(headingText)) return;

    // Get all text content of this article section
    const articleText = extractPartText($, $part);

    // Parse operations from the article text
    const ops = parseInstructionBlock(articleText);
    operations.push(...ops);
  });

  // If structured parsing found nothing, fall back to full-text parsing
  if (operations.length === 0) {
    const fullText = getPlainText($, $('body')).replace(/\u00a0/g, ' ');
    const ops = parseInstructionBlock(fullText);
    operations.push(...ops);
  }

  return { parentLawRef, operations };
}

/**
 * Parse an amendment act from plain text (e.g., data.gov.lt `tekstas_lt` field).
 */
export function parseAmendmentText(text: string): ParsedAmendment {
  const parentLawRef = extractParentLawRef(text);
  const operations = parseInstructionBlock(text);
  return { parentLawRef, operations };
}

// --- Instruction block parsing ---

/**
 * Parse a block of text containing one or more amendment instructions.
 * Handles numbered sub-instructions (1. Pakeisti..., 2. Pakeisti...) within a single block.
 */
function parseInstructionBlock(text: string): AmendmentOperation[] {
  const operations: AmendmentOperation[] = [];

  // Split on numbered sub-instructions: lines starting with "N. Pakeisti" or "N. Papildyti" or "N. Pripažinti"
  // But also handle un-numbered single instructions
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current = '';

  for (const line of lines) {
    // Detect start of a new instruction (numbered or top-level)
    if (/^\d+\.\s+(?:Pakeisti|Papildyti|Pripažinti)/i.test(line) ||
        /^(?:Pakeisti|Papildyti|Pripažinti)/i.test(line)) {
      if (current.trim()) blocks.push(current.trim());
      current = line;
    } else {
      current += '\n' + line;
    }
  }
  if (current.trim()) blocks.push(current.trim());

  for (const block of blocks) {
    const op = parseSingleInstruction(block);
    if (op) operations.push(...op);
  }

  return operations;
}

/**
 * Parse a single amendment instruction and its replacement text.
 * May return multiple operations (e.g., repeal of multiple articles).
 */
function parseSingleInstruction(text: string): AmendmentOperation[] | null {
  // Strip leading number prefix: "1. Pakeisti..." -> "Pakeisti..."
  const stripped = text.replace(/^\d+\.\s+/, '');

  // --- REPEAL patterns (no replacement text) ---

  // Repeal multiple articles
  let match = stripped.match(RE_REPEAL_ARTICLES);
  if (match) {
    const articlesStr = match[1]!;
    const articles = articlesStr
      .replace(/\s+ir\s+/g, ',')
      .split(',')
      .map(s => normalizeArticleNumber(s.trim()))
      .filter(Boolean);
    return articles.map(art => ({
      type: 'repeal' as const,
      target: { article: art },
    }));
  }

  // Repeal single article
  match = stripped.match(RE_REPEAL_ARTICLE);
  if (match) {
    return [{
      type: 'repeal',
      target: { article: normalizeArticleNumber(match[1]!) },
    }];
  }

  // --- REPLACE patterns ---

  // Replace annex
  match = stripped.match(RE_REPLACE_ANNEX);
  if (match) {
    const newText = extractQuotedText(stripped);
    return [{
      type: 'replace',
      target: { annex: 'priedas' },
      ...(newText ? { newText } : {}),
    }];
  }

  // Replace point of paragraph
  match = stripped.match(RE_REPLACE_POINT);
  if (match) {
    const newText = extractQuotedText(stripped);
    return [{
      type: 'replace',
      target: {
        article: normalizeArticleNumber(match[1]!),
        paragraph: match[2]!,
        point: match[3]!,
      },
      ...(newText ? { newText } : {}),
    }];
  }

  // Replace paragraph
  match = stripped.match(RE_REPLACE_PARAGRAPH);
  if (match) {
    const newText = extractQuotedText(stripped);
    return [{
      type: 'replace',
      target: {
        article: normalizeArticleNumber(match[1]!),
        paragraph: match[2]!,
      },
      ...(newText ? { newText } : {}),
    }];
  }

  // Replace article
  match = stripped.match(RE_REPLACE_ARTICLE);
  if (match) {
    const newText = extractQuotedText(stripped);
    return [{
      type: 'replace',
      target: { article: normalizeArticleNumber(match[1]!) },
      ...(newText ? { newText } : {}),
    }];
  }

  // Replace chapter
  match = stripped.match(RE_REPLACE_CHAPTER);
  if (match) {
    const newText = extractQuotedText(stripped);
    return [{
      type: 'replace',
      target: { chapter: match[1]!.trim() },
      ...(newText ? { newText } : {}),
    }];
  }

  // Replace section
  match = stripped.match(RE_REPLACE_SECTION);
  if (match) {
    const newText = extractQuotedText(stripped);
    return [{
      type: 'replace',
      target: { chapter: match[1]!, section: match[2]!.trim() },
      ...(newText ? { newText } : {}),
    }];
  }

  // Replace title/name (pavadinimą)
  match = stripped.match(RE_REPLACE_TITLE);
  if (match) {
    const newText = extractQuotedText(stripped);
    return [{
      type: 'rename',
      target: { title: true },
      ...(newText ? { newText } : {}),
    }];
  }

  // --- ADD patterns ---

  // Add annex item
  match = stripped.match(RE_ADD_ANNEX_ITEM);
  if (match) {
    const newText = extractQuotedText(stripped);
    return [{
      type: 'add',
      target: { annex: 'priedas', point: match[1]! },
      ...(newText ? { newText } : {}),
    }];
  }

  // Add annex
  match = stripped.match(RE_ADD_ANNEX);
  if (match) {
    const newText = extractQuotedText(stripped);
    return [{
      type: 'add',
      target: { annex: 'priedas' },
      ...(newText ? { newText } : {}),
    }];
  }

  // Add point to paragraph
  match = stripped.match(RE_ADD_POINT);
  if (match) {
    const newText = extractQuotedText(stripped);
    return [{
      type: 'add',
      target: {
        article: normalizeArticleNumber(match[1]!),
        paragraph: match[2]!,
        point: match[3]!,
      },
      ...(newText ? { newText } : {}),
    }];
  }

  // Add paragraph to article
  match = stripped.match(RE_ADD_PARAGRAPH);
  if (match) {
    const newText = extractQuotedText(stripped);
    return [{
      type: 'add',
      target: {
        article: normalizeArticleNumber(match[1]!),
        paragraph: match[2]!,
      },
      ...(newText ? { newText } : {}),
    }];
  }

  // Add multiple paragraphs to article
  match = stripped.match(RE_ADD_PARAGRAPHS);
  if (match) {
    const newText = extractQuotedText(stripped);
    return [{
      type: 'add',
      target: {
        article: normalizeArticleNumber(match[1]!),
        // Store the range description (e.g., "1 ir 2") in paragraph field
        paragraph: match[2]!.trim(),
      },
      ...(newText ? { newText } : {}),
    }];
  }

  // Add article to law
  match = stripped.match(RE_ADD_ARTICLE);
  if (match) {
    const newText = extractQuotedText(stripped);
    return [{
      type: 'add',
      target: { article: normalizeArticleNumber(match[1]!) },
      ...(newText ? { newText } : {}),
    }];
  }

  // Add chapter to law
  match = stripped.match(RE_ADD_CHAPTER);
  if (match) {
    const newText = extractQuotedText(stripped);
    return [{
      type: 'add',
      target: { chapter: normalizeArticleNumber(match[1]!.trim()) },
      ...(newText ? { newText } : {}),
    }];
  }

  return null;
}
