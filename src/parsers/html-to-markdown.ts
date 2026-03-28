import * as cheerio from 'cheerio';
import type { CheerioAPI, Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';

// Lithuanian ordinal/roman patterns used in structural headings
const ROMAN_NUMERAL = /^(I{1,3}|IV|VI{0,3}|IX|XI{0,3}|XIV|XV|XVI{0,3}|XIX|XX[IVX]*)$/;
const DALIS_WORDS = [
  'PIRMOJI', 'ANTROJI', 'TREČIOJI', 'KETVIRTOJI', 'PENKTOJI',
  'ŠEŠTOJI', 'SEPTINTOJI', 'AŠTUNTOJI', 'DEVINTOJI', 'DEŠIMTOJI',
];

interface DocumentStructure {
  hasParts: boolean;   // DALIS
  hasChapters: boolean; // SKYRIUS
  hasSections: boolean; // SKIRSNIS
  hasArticles: boolean; // straipsnis
}

/**
 * Convert e-TAR HTML to structured Markdown.
 *
 * Handles:
 * - Full structural hierarchy (constitution, codes): DALIS > SKYRIUS > SKIRSNIS > straipsnis
 * - Simple laws with only articles
 * - Short resolutions/orders with no articles
 * - Tables and formatted content
 * - Lithuanian characters (UTF-8)
 */
export function htmlToMarkdown(html: string): string {
  const $ = cheerio.load(html, { xml: false });

  // Remove style and script tags entirely
  $('style, script, meta, link').remove();

  const structure = detectStructure($);
  const lines: string[] = [];

  const body = $('body');
  if (body.length === 0) return '';

  // The root container is typically .WordSection1
  const root = body.find('.WordSection1').length > 0
    ? body.find('.WordSection1')
    : body;

  processChildren($, root, lines, structure, 0);

  return collapseWhitespace(lines.join('\n'));
}

/**
 * Detect what structural elements the document contains.
 */
export function detectStructure($: CheerioAPI): DocumentStructure {
  const text = $('body').text();
  return {
    hasParts: / DALIS\b/.test(text) && (
      DALIS_WORDS.some((w) => text.includes(w + ' DALIS')) ||
      /\bI+ DALIS\b/.test(text)
    ),
    hasChapters: / SKYRIUS\b/.test(text),
    hasSections: / SKIRSNIS\b/.test(text),
    hasArticles: / straipsnis/.test(text),
  };
}

/**
 * Process all children of a container element, appending markdown lines.
 */
function processChildren(
  $: CheerioAPI,
  container: Cheerio<AnyNode>,
  lines: string[],
  structure: DocumentStructure,
  depth: number,
): void {
  container.children().each((_, el) => {
    const $el = $(el);
    const tagName = (el as { tagName?: string }).tagName?.toLowerCase();

    if (!tagName) return;

    if (tagName === 'div') {
      // div with id="part_..." is a structural container -- recurse into it
      processChildren($, $el, lines, structure, depth);
      return;
    }

    if (tagName === 'table') {
      lines.push('');
      lines.push(convertTable($, $el));
      lines.push('');
      return;
    }

    if (tagName === 'p') {
      const md = convertParagraph($, $el, structure);
      if (md !== null) {
        lines.push(md);
      }
      return;
    }

    // For other block elements (h1-h6, ul, ol, etc.), convert inline
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      const text = cleanText(getTextContent($, $el));
      if (text) {
        const level = parseInt(tagName[1]!);
        lines.push('');
        lines.push('#'.repeat(level) + ' ' + text);
        lines.push('');
      }
      return;
    }

    // Recurse into other container elements
    processChildren($, $el, lines, structure, depth);
  });
}

/**
 * Convert a <p> element to a markdown line.
 * Returns null for empty/whitespace-only paragraphs.
 */
function convertParagraph(
  $: CheerioAPI,
  $el: Cheerio<AnyNode>,
  structure: DocumentStructure,
): string | null {
  const text = cleanText(getTextContent($, $el));

  // Skip empty paragraphs and anchor-only paragraphs
  if (!text) return null;
  // Skip standalone nbsp
  if (text === '\u00a0' || text === '&nbsp;') return null;

  // Check for structural headings (bold, centered text)
  const isBold = isElementBold($, $el);
  const isCentered = $el.attr('align') === 'center' ||
    ($el.attr('style') ?? '').includes('text-align:center');

  // Detect DALIS heading: "PIRMOJI DALIS" or "I DALIS", "II DALIS"
  const dalisMatch = text.match(
    /^((?:PIRMOJI|ANTROJI|TREČIOJI|KETVIRTOJI|PENKTOJI|ŠEŠTOJI|SEPTINTOJI|AŠTUNTOJI|DEVINTOJI|DEŠIMTOJI|I{1,3}|IV|VI{0,3}|IX|XI{0,3}|XIV|XV|XVI{0,3}|XIX|XX[IVX]*))\s+DALIS$/,
  );
  if (dalisMatch && isBold) {
    return '\n# ' + text;
  }

  // Detect SKYRIUS heading: "I SKYRIUS", "II SKYRIUS"
  const skyriusMatch = text.match(
    /^([IVXLCDM]+|[A-ZĄČĘĖĮŠŲŪŽ]+)\s+SKYRIUS$/,
  );
  if (skyriusMatch && isBold) {
    return '\n## ' + text;
  }

  // Detect SKIRSNIS heading: "I SKIRSNIS", "PIRMASIS SKIRSNIS"
  const skirsnisMatch = text.match(
    /^([IVXLCDM]+|[A-ZĄČĘĖĮŠŲŪŽ]+)\s+SKIRSNIS$/,
  );
  if (skirsnisMatch && isBold) {
    return '\n### ' + text;
  }

  // Detect article heading: "N straipsnis" or "N straipsnis. Title"
  // Articles in codes use dotted numbering: "1.1 straipsnis. Title"
  const articleMatch = text.match(
    /^(\d+(?:\.\d+)*)\s+straipsnis\.?\s*(.*)/,
  );
  if (articleMatch && isBold) {
    const title = articleMatch[2]?.trim();
    const heading = title
      ? `#### ${articleMatch[1]} straipsnis. ${title}`
      : `#### ${articleMatch[1]} straipsnis`;
    return '\n' + heading;
  }

  // Detect title line after structural heading (bold, centered, not a known pattern)
  if (isBold && isCentered && text === text.toUpperCase() && text.length > 3) {
    // This is likely a title for a preceding structural heading
    // (e.g., "BENDROSIOS NUOSTATOS" after "I SKYRIUS")
    // Don't add a heading prefix -- the previous heading line will get this appended
    return text;
  }

  // Detect numbered paragraphs within articles: "1. Text" or "1) text"
  const numberedMatch = text.match(/^(\d+)\.\s+(.+)/);
  if (numberedMatch) {
    return `${numberedMatch[1]}. ${numberedMatch[2]}`;
  }

  // Detect sub-points: "1) text"
  const subPointMatch = text.match(/^(\d+)\)\s+(.+)/);
  if (subPointMatch) {
    return `   ${subPointMatch[1]}) ${subPointMatch[2]}`;
  }

  // Convert inline formatting
  return convertInlineFormatting($, $el);
}

/**
 * Extract text content from an element, converting inline formatting to markdown.
 */
function convertInlineFormatting($: CheerioAPI, $el: Cheerio<AnyNode>): string {
  let result = '';

  $el.contents().each((_, node) => {
    if (node.type === 'text') {
      result += (node as { data?: string }).data ?? '';
      return;
    }

    const $node = $(node);
    const tag = (node as { tagName?: string }).tagName?.toLowerCase();

    if (!tag) return;

    if (tag === 'br') {
      result += '\n';
      return;
    }

    // Skip anchor tags that are just bookmark anchors (no text)
    if (tag === 'a' && !$node.text().trim()) {
      return;
    }

    const innerText = convertInlineFormatting($, $node);
    const trimmed = innerText.trim();

    if (!trimmed) return;

    if (tag === 'b' || tag === 'strong') {
      result += `**${trimmed}**`;
    } else if (tag === 'i' || tag === 'em') {
      result += `*${trimmed}*`;
    } else if (tag === 'a') {
      const href = $node.attr('href');
      if (href && !href.startsWith('#')) {
        result += `[${trimmed}](${href})`;
      } else {
        result += trimmed;
      }
    } else if (tag === 'sup') {
      result += `^${trimmed}`;
    } else if (tag === 'sub') {
      result += `~${trimmed}`;
    } else if (tag === 'span') {
      result += innerText;
    } else {
      result += innerText;
    }
  });

  return result;
}

/**
 * Get plain text content from an element (recursively),
 * handling the common e-TAR pattern of text split across multiple <span> elements.
 */
function getTextContent($: CheerioAPI, $el: Cheerio<AnyNode>): string {
  let text = '';
  $el.contents().each((_, node) => {
    if (node.type === 'text') {
      text += (node as { data?: string }).data ?? '';
    } else {
      const tag = (node as { tagName?: string }).tagName?.toLowerCase();
      if (tag === 'br') {
        text += ' ';
      } else {
        text += getTextContent($, $(node));
      }
    }
  });
  return text;
}

/**
 * Check if a paragraph element is bold (all content wrapped in <b> or <strong>).
 */
function isElementBold($: CheerioAPI, $el: Cheerio<AnyNode>): boolean {
  // Check if the element itself is b/strong
  const tag = ($el[0] as { tagName?: string })?.tagName?.toLowerCase();
  if (tag === 'b' || tag === 'strong') return true;

  // Check if all meaningful children are bold
  const children = $el.children();
  if (children.length === 0) return false;

  let hasBold = false;
  let hasNonBold = false;

  children.each((_, child) => {
    const childTag = (child as { tagName?: string }).tagName?.toLowerCase();
    const $child = $(child);
    const childText = cleanText($child.text());

    // Skip empty elements and anchors
    if (!childText) return;

    if (childTag === 'b' || childTag === 'strong') {
      hasBold = true;
    } else if (childTag === 'span') {
      // Check if span's parent is b, or if span contains b
      if ($child.find('b, strong').length > 0 || $child.closest('b, strong').length > 0) {
        hasBold = true;
      } else {
        // Check if the span has bold style
        const style = $child.attr('style') ?? '';
        if (style.includes('font-weight:bold') || style.includes('font-weight: bold')) {
          hasBold = true;
        } else {
          hasNonBold = true;
        }
      }
    } else if (childTag === 'a') {
      // Anchors that are just bookmarks don't count
      if (childText) hasNonBold = true;
    } else {
      hasNonBold = true;
    }
  });

  // Also check if the p element wraps <b><span>...</span></b> pattern
  if (!hasBold) {
    const bChildren = $el.find('b, strong');
    if (bChildren.length > 0) {
      const boldText = cleanText(bChildren.text());
      const totalText = cleanText($el.text());
      if (boldText && boldText === totalText) {
        hasBold = true;
        hasNonBold = false;
      }
    }
  }

  return hasBold && !hasNonBold;
}

/**
 * Convert an HTML table to a markdown table.
 */
export function convertTable($: CheerioAPI, $table: Cheerio<AnyNode>): string {
  const rows: string[][] = [];

  $table.find('tr').each((_, tr) => {
    const cells: string[] = [];
    $(tr).find('td, th').each((__, cell) => {
      const text = cleanText(getTextContent($, $(cell)));
      // Replace pipes in cell text to avoid breaking the table
      cells.push(text.replace(/\|/g, '\\|'));
    });
    if (cells.length > 0) {
      rows.push(cells);
    }
  });

  if (rows.length === 0) return '';

  // Determine the max column count
  const maxCols = Math.max(...rows.map((r) => r.length));

  // Normalize all rows to have the same number of columns
  for (const row of rows) {
    while (row.length < maxCols) {
      row.push('');
    }
  }

  const lines: string[] = [];

  // First row as header
  const headerRow = rows[0]!;
  lines.push('| ' + headerRow.join(' | ') + ' |');

  // Separator
  lines.push('| ' + headerRow.map(() => '---').join(' | ') + ' |');

  // Data rows
  for (let i = 1; i < rows.length; i++) {
    lines.push('| ' + rows[i]!.join(' | ') + ' |');
  }

  return lines.join('\n');
}

/**
 * Clean up text: remove Word artifacts, normalize whitespace, handle nbsp.
 */
export function cleanText(text: string): string {
  return text
    // Replace non-breaking spaces with regular spaces
    .replace(/\u00a0/g, ' ')
    // Remove zero-width spaces and other invisible chars
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Collapse multiple spaces into one
    .replace(/ {2,}/g, ' ')
    // Remove leading/trailing whitespace per line
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

/**
 * Post-process the full markdown output:
 * - Merge structural headings with their titles
 * - Collapse excessive blank lines
 */
function collapseWhitespace(md: string): string {
  let result = md
    // Collapse 3+ newlines to 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Merge structural heading with its title on the next line.
  // e.g., "# I DALIS\nCIVILINIAI ĮSTATYMAI" -> "# I DALIS. CIVILINIAI ĮSTATYMAI"
  result = result.replace(
    /^(#{1,3} .+(?:DALIS|SKYRIUS|SKIRSNIS))\n([A-ZĄČĘĖĮŠŲŪŽ][A-ZĄČĘĖĮŠŲŪŽ\s,.\-–()]+)$/gm,
    '$1. $2',
  );

  // Clean up any double periods from merging
  result = result.replace(/\.\./g, '.');

  return result + '\n';
}
