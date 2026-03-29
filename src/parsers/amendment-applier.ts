import type { AmendmentOperation } from './amendment-parser.ts';

/**
 * Apply amendment operations to the current markdown text of a law.
 * Returns the new full text after all amendments are applied in order.
 *
 * Expects markdown produced by html-to-markdown.ts:
 * - `#### N straipsnis. Title` for articles
 * - `1. text` for numbered paragraphs
 * - `   1) text` for sub-points
 * - `## ROMAN SKYRIUS. TITLE` for chapters
 * - `### ROMAN SKIRSNIS. TITLE` for sections
 */
export function applyAmendment(
  currentText: string,
  operations: AmendmentOperation[],
): string {
  let text = currentText;

  for (const op of operations) {
    text = applySingleOperation(text, op);
  }

  return text;
}

function applySingleOperation(text: string, op: AmendmentOperation): string {
  switch (op.type) {
    case 'replace':
      return applyReplace(text, op);
    case 'add':
      return applyAdd(text, op);
    case 'repeal':
      return applyRepeal(text, op);
    case 'rename':
      return applyRename(text, op);
    case 'restate':
      // Restate is effectively a full replace
      return applyReplace(text, op);
    default:
      return text;
  }
}

// --- Article heading patterns ---

/**
 * Build a regex that matches an article heading line.
 * Article numbers may contain dashes for inserted articles (e.g., "13-1").
 * The heading format is: `#### N straipsnis. Title` or `#### N straipsnis`
 */
function articleHeadingRegex(articleNum: string): RegExp {
  // Escape the article number for regex (handle dashes)
  const escaped = articleNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match with optional superscript notation (^1 or -1)
  return new RegExp(`^####\\s+${escaped}\\s+straipsnis(?:\\.\\s*.*)?$`, 'm');
}

/**
 * Find the start and end indices of an article section in the markdown text.
 * The section spans from the heading line to just before the next article heading
 * (or the next structural heading like ## or ###, or end of text).
 */
function findArticleSection(text: string, articleNum: string): { start: number; end: number } | null {
  const headingRe = articleHeadingRegex(articleNum);
  const match = headingRe.exec(text);
  if (!match) return null;

  const start = match.index;

  // Find the next heading of equal or higher level (####, ###, ##, #)
  const afterHeading = start + match[0].length;
  const nextHeadingRe = /^#{1,4}\s+/m;
  const rest = text.slice(afterHeading);
  const nextMatch = nextHeadingRe.exec(rest);

  const end = nextMatch ? afterHeading + nextMatch.index : text.length;

  return { start, end };
}

/**
 * Find the start and end of a numbered paragraph within a text section.
 * Paragraphs are formatted as `N. text` at the start of a line.
 */
function findParagraphInSection(
  sectionText: string,
  paragraphNum: string,
): { start: number; end: number } | null {
  const paraRe = new RegExp(`^${paragraphNum}\\.\\s+`, 'm');
  const match = paraRe.exec(sectionText);
  if (!match) return null;

  const start = match.index;

  // Find the next paragraph number or end of section
  // Next paragraph: a line starting with N. where N > paragraphNum
  const afterPara = start + match[0].length;
  const rest = sectionText.slice(afterPara);

  // Match next numbered paragraph, article heading, or structural heading
  const nextRe = /^(?:\d+\.\s+|#{1,4}\s+)/m;
  const nextMatch = nextRe.exec(rest);

  const end = nextMatch ? afterPara + nextMatch.index : sectionText.length;

  return { start, end };
}

/**
 * Find the start and end of a numbered point within a paragraph section.
 * Points are formatted as `   N) text` (indented with parenthesis).
 */
function findPointInSection(
  sectionText: string,
  pointNum: string,
): { start: number; end: number } | null {
  const pointRe = new RegExp(`^\\s*${pointNum}\\)\\s+`, 'm');
  const match = pointRe.exec(sectionText);
  if (!match) return null;

  const start = match.index;
  const afterPoint = start + match[0].length;
  const rest = sectionText.slice(afterPoint);

  // Match next point, paragraph, or heading
  const nextRe = /^(?:\s*\d+\)\s+|\d+\.\s+|#{1,4}\s+)/m;
  const nextMatch = nextRe.exec(rest);

  const end = nextMatch ? afterPoint + nextMatch.index : sectionText.length;

  return { start, end };
}

// --- Chapter / section heading patterns ---

function chapterHeadingRegex(chapter: string): RegExp {
  const escaped = chapter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^##\\s+${escaped}\\s+SKYRIUS(?:\\.\\s*.*)?$`, 'm');
}

function findChapterSection(text: string, chapter: string): { start: number; end: number } | null {
  const headingRe = chapterHeadingRegex(chapter);
  const match = headingRe.exec(text);
  if (!match) return null;

  const start = match.index;
  const afterHeading = start + match[0].length;

  // Next chapter heading (##) or part heading (#)
  const rest = text.slice(afterHeading);
  const nextRe = /^#{1,2}\s+/m;
  const nextMatch = nextRe.exec(rest);

  const end = nextMatch ? afterHeading + nextMatch.index : text.length;

  return { start, end };
}

// --- Apply operations ---

function applyReplace(text: string, op: AmendmentOperation): string {
  const { target, newText } = op;
  if (!newText) return text;

  // Replace annex
  if (target.annex) {
    return replaceAnnex(text, newText);
  }

  // Replace chapter
  if (target.chapter && !target.article) {
    const section = findChapterSection(text, target.chapter);
    if (!section) return text;
    return text.slice(0, section.start) + newText + '\n\n' + text.slice(section.end);
  }

  // Must have an article target for the rest
  if (!target.article) return text;

  // Replace point within paragraph within article
  if (target.point && target.paragraph) {
    const articleSection = findArticleSection(text, target.article);
    if (!articleSection) return text;

    const articleText = text.slice(articleSection.start, articleSection.end);
    const paraSection = findParagraphInSection(articleText, target.paragraph);
    if (!paraSection) return text;

    const paraText = articleText.slice(paraSection.start, paraSection.end);
    const pointSection = findPointInSection(paraText, target.point);
    if (!pointSection) return text;

    const newParaText =
      paraText.slice(0, pointSection.start) +
      `   ${newText}\n` +
      paraText.slice(pointSection.end);

    const newArticleText =
      articleText.slice(0, paraSection.start) +
      newParaText +
      articleText.slice(paraSection.end);

    return text.slice(0, articleSection.start) + newArticleText + text.slice(articleSection.end);
  }

  // Replace paragraph within article
  if (target.paragraph) {
    const articleSection = findArticleSection(text, target.article);
    if (!articleSection) return text;

    const articleText = text.slice(articleSection.start, articleSection.end);
    const paraSection = findParagraphInSection(articleText, target.paragraph);
    if (!paraSection) return text;

    const newArticleText =
      articleText.slice(0, paraSection.start) +
      newText + '\n' +
      articleText.slice(paraSection.end);

    return text.slice(0, articleSection.start) + newArticleText + text.slice(articleSection.end);
  }

  // Replace entire article
  const section = findArticleSection(text, target.article);
  if (!section) return text;

  // Format the replacement as a proper article section
  return text.slice(0, section.start) + newText + '\n\n' + text.slice(section.end);
}

function applyAdd(text: string, op: AmendmentOperation): string {
  const { target, newText } = op;
  if (!newText) return text;

  // Add annex
  if (target.annex && !target.point) {
    // Append annex at the end of the document
    return text.trimEnd() + '\n\n' + newText + '\n';
  }

  // Add annex item
  if (target.annex && target.point) {
    // Find the annex section and append the item
    // Annex is typically at the end, after a heading containing "priedas"
    const annexRe = /^#+\s+.*priedas/im;
    const match = annexRe.exec(text);
    if (match) {
      // Insert before the end of the document
      return text.trimEnd() + '\n' + newText + '\n';
    }
    // Fallback: append at end
    return text.trimEnd() + '\n' + newText + '\n';
  }

  // Add chapter
  if (target.chapter && !target.article) {
    // Insert before the next chapter or at the end
    return text.trimEnd() + '\n\n' + newText + '\n';
  }

  // Must have article target for the rest
  if (!target.article) return text;

  // Add point to paragraph in article
  if (target.point && target.paragraph) {
    const articleSection = findArticleSection(text, target.article);
    if (!articleSection) return text;

    const articleText = text.slice(articleSection.start, articleSection.end);
    const paraSection = findParagraphInSection(articleText, target.paragraph);
    if (!paraSection) return text;

    const paraText = articleText.slice(paraSection.start, paraSection.end);

    // Insert the new point at the end of the paragraph (before trailing whitespace)
    const trimmedPara = paraText.trimEnd();
    const newParaText = trimmedPara + '\n   ' + newText + '\n';

    const newArticleText =
      articleText.slice(0, paraSection.start) +
      newParaText +
      articleText.slice(paraSection.end);

    return text.slice(0, articleSection.start) + newArticleText + text.slice(articleSection.end);
  }

  // Add paragraph to article
  if (target.paragraph) {
    const articleSection = findArticleSection(text, target.article);
    if (!articleSection) return text;

    const articleText = text.slice(articleSection.start, articleSection.end);

    // Append the new paragraph at the end of the article section
    const trimmed = articleText.trimEnd();
    const newArticleText = trimmed + '\n' + newText + '\n';

    return text.slice(0, articleSection.start) + newArticleText + text.slice(articleSection.end);
  }

  // Add new article — insert at the right position
  return insertArticle(text, target.article, newText);
}

function applyRepeal(text: string, op: AmendmentOperation): string {
  const { target } = op;

  if (!target.article) return text;

  const section = findArticleSection(text, target.article);
  if (!section) return text;

  // Remove the article section, collapsing extra blank lines
  const before = text.slice(0, section.start).trimEnd();
  const after = text.slice(section.end).trimStart();

  return before + '\n\n' + after;
}

function applyRename(text: string, _op: AmendmentOperation): string {
  // Rename is used for chapter/section title changes.
  // The newText typically contains the full new heading.
  // This is a simplified implementation — rename needs more context about
  // which specific heading to target, which varies by amendment.
  return text;
}

// --- Helpers ---

/**
 * Replace the annex section in the text.
 * The annex is typically at the very end of the document,
 * after a heading containing "priedas" or "Priedas".
 */
function replaceAnnex(text: string, newText: string): string {
  const annexRe = /^#+\s+.*[Pp]riedas/m;
  const match = annexRe.exec(text);
  if (!match) {
    // No existing annex found, append
    return text.trimEnd() + '\n\n' + newText + '\n';
  }

  // Replace from annex heading to end of document
  return text.slice(0, match.index) + newText + '\n';
}

/**
 * Insert a new article at the correct position in the text.
 * Finds the right spot based on article numbering.
 */
function insertArticle(text: string, articleNum: string, newText: string): string {
  // Parse the base number for ordering
  const baseNum = parseArticleNum(articleNum);

  // Find all article headings and their positions
  const headingRe = /^####\s+(\d+(?:-\d+)?)\s+straipsnis/gm;
  let lastBefore: { end: number } | null = null;
  let insertMatch: RegExpExecArray | null;

  while ((insertMatch = headingRe.exec(text)) !== null) {
    const existingNum = parseArticleNum(insertMatch[1]!);
    if (existingNum < baseNum) {
      // Find the end of this article's section
      const section = findArticleSection(text, insertMatch[1]!);
      if (section) {
        lastBefore = { end: section.end };
      }
    }
  }

  if (lastBefore) {
    // Insert after the last article that comes before our new one
    const insertPos = lastBefore.end;
    const before = text.slice(0, insertPos).trimEnd();
    const after = text.slice(insertPos);
    return before + '\n\n' + newText + '\n' + after;
  }

  // No article found before this one — insert at the beginning
  // (before the first article heading)
  const firstArticle = /^####\s+/m.exec(text);
  if (firstArticle) {
    return text.slice(0, firstArticle.index) + newText + '\n\n' + text.slice(firstArticle.index);
  }

  // No articles at all — append
  return text.trimEnd() + '\n\n' + newText + '\n';
}

/**
 * Parse an article number string into a comparable numeric value.
 * "13" -> 13.0, "13-1" -> 13.001, "13-2" -> 13.002
 */
function parseArticleNum(num: string): number {
  const parts = num.split('-');
  const base = parseInt(parts[0]!, 10);
  const sub = parts[1] ? parseInt(parts[1], 10) : 0;
  return base + sub * 0.001;
}
