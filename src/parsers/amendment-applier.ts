import Anthropic from '@anthropic-ai/sdk';
import type { AmendmentOperation } from './amendment-parser.ts';

// --- Anthropic client (lazy singleton) ---

let _client: Anthropic | null = null;

async function getClient(): Promise<Anthropic> {
  if (_client) return _client;
  const apiKey = (await Bun.$`get-token ANTHROPIC_API_KEY`.text()).trim();
  _client = new Anthropic({ apiKey });
  return _client;
}

// --- Section extraction ---

/**
 * Find the start and end indices of an article section in the markdown text.
 * An article starts at `#### N straipsnis` and extends to the next heading.
 */
function findArticleSection(
  text: string,
  articleNum: string,
): { start: number; end: number } | null {
  const escaped = articleNum
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/-/g, '[-\\\\^]?');  // 13-1 matches 13-1, 13^1, 131

  // Try markdown heading format first: #### N straipsnis
  const mdRe = new RegExp(
    `^####\\s+${escaped}\\s+straipsnis(?:\\.\\s*.*)?$`,
    'm',
  );
  let match = mdRe.exec(text);

  // Try plain text format: N straipsnis. (at line start, no heading markers)
  if (!match) {
    const plainRe = new RegExp(
      `^${escaped}\\s+straipsnis\\.\\s*.*$`,
      'm',
    );
    match = plainRe.exec(text);
  }

  if (!match) return null;

  const start = match.index;
  const afterHeading = start + match[0].length;

  // Find the next article heading (either format)
  const nextRe = /^(?:#{1,4}\s+\d|(?:\d+(?:[-^]\d+)?)\s+straipsnis\.)/m;
  const rest = text.slice(afterHeading);
  const nextMatch = nextRe.exec(rest);
  const end = nextMatch ? afterHeading + nextMatch.index : text.length;

  return { start, end };
}

/**
 * Find the start and end indices of a chapter section in the markdown text.
 */
function findChapterSection(
  text: string,
  chapter: string,
): { start: number; end: number } | null {
  const escaped = chapter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingRe = new RegExp(
    `^##\\s+${escaped}\\s+SKYRIUS(?:\\.\\s*.*)?$`,
    'm',
  );
  const match = headingRe.exec(text);
  if (!match) return null;

  const start = match.index;
  const afterHeading = start + match[0].length;

  const rest = text.slice(afterHeading);
  const nextRe = /^#{1,2}\s+/m;
  const nextMatch = nextRe.exec(rest);
  const end = nextMatch ? afterHeading + nextMatch.index : text.length;

  return { start, end };
}

/**
 * Extract the relevant section of the law text for a given operation,
 * including some surrounding context.
 * Returns the section text and the start/end positions in the full text.
 */
function extractSection(
  text: string,
  op: AmendmentOperation,
): { section: string; start: number; end: number } | null {
  // For chapter-level operations without a specific article
  if (op.target.chapter && !op.target.article) {
    const range = findChapterSection(text, op.target.chapter);
    if (!range) return null;
    return { section: text.slice(range.start, range.end), ...range };
  }

  // For article-level (and below) operations
  if (op.target.article) {
    const range = findArticleSection(text, op.target.article);
    if (!range) return null;
    return { section: text.slice(range.start, range.end), ...range };
  }

  // For annex operations, find the annex section
  if (op.target.annex) {
    const annexRe = /^#+\s+.*[Pp]riedas/m;
    const match = annexRe.exec(text);
    if (!match) return null;
    const start = match.index;
    return { section: text.slice(start), start, end: text.length };
  }

  return null;
}

/**
 * Parse an article number string into a comparable numeric value.
 * "13" -> 13.0, "13-1" -> 13.001
 */
function parseArticleNum(num: string): number {
  const parts = num.split('-');
  const base = parseInt(parts[0]!, 10);
  const sub = parts[1] ? parseInt(parts[1], 10) : 0;
  return base + sub * 0.001;
}

// --- Deterministic handlers (no AI needed) ---

function applyRepeal(text: string, op: AmendmentOperation): string {
  if (op.target.chapter && !op.target.article) {
    const range = findChapterSection(text, op.target.chapter);
    if (!range) return text;
    const before = text.slice(0, range.start).trimEnd();
    const after = text.slice(range.end).trimStart();
    return before + '\n\n' + after;
  }

  if (!op.target.article) return text;

  const range = findArticleSection(text, op.target.article);
  if (!range) return text;

  const before = text.slice(0, range.start).trimEnd();
  const after = text.slice(range.end).trimStart();
  return before + '\n\n' + after;
}

function applyAddArticle(text: string, op: AmendmentOperation): string {
  if (!op.newText || !op.target.article) return text;

  const baseNum = parseArticleNum(op.target.article);

  // Find all article headings (markdown or plain text format)
  const headingRe = /^(?:####\s+)?(\d+(?:[-^]\d+)?)\s+straipsnis[.\s]/gm;
  let lastBefore: { end: number } | null = null;
  let insertMatch: RegExpExecArray | null;

  while ((insertMatch = headingRe.exec(text)) !== null) {
    const existingNum = parseArticleNum(insertMatch[1]!);
    if (existingNum < baseNum) {
      const section = findArticleSection(text, insertMatch[1]!);
      if (section) {
        lastBefore = { end: section.end };
      }
    }
  }

  if (lastBefore) {
    const before = text.slice(0, lastBefore.end).trimEnd();
    const after = text.slice(lastBefore.end);
    return before + '\n\n' + op.newText + '\n' + after;
  }

  // No article found before this one — insert before the first article heading
  const firstArticle = /^(?:####\s+)?\d+\s+straipsnis[.\s]/m.exec(text);
  if (firstArticle) {
    return (
      text.slice(0, firstArticle.index) +
      op.newText +
      '\n\n' +
      text.slice(firstArticle.index)
    );
  }

  // No articles at all — append
  return text.trimEnd() + '\n\n' + op.newText + '\n';
}

function applyAddChapter(text: string, op: AmendmentOperation): string {
  if (!op.newText) return text;
  return text.trimEnd() + '\n\n' + op.newText + '\n';
}

function applyAddAnnex(text: string, op: AmendmentOperation): string {
  if (!op.newText) return text;
  return text.trimEnd() + '\n\n' + op.newText + '\n';
}

// --- AI-powered handler ---

function describeTarget(op: AmendmentOperation): string {
  const parts: string[] = [];
  if (op.target.chapter) parts.push(`Chapter ${op.target.chapter}`);
  if (op.target.section) parts.push(`Section ${op.target.section}`);
  if (op.target.article) parts.push(`Article ${op.target.article}`);
  if (op.target.paragraph) parts.push(`paragraph ${op.target.paragraph}`);
  if (op.target.point) parts.push(`point ${op.target.point}`);
  if (op.target.annex) parts.push(`annex (priedas)`);
  if (op.target.title) parts.push(`(title/heading)`);
  return parts.join(', ');
}

async function applyWithAI(
  fullText: string,
  op: AmendmentOperation,
): Promise<string> {
  const extracted = extractSection(fullText, op);
  if (!extracted) {
    console.warn(
      `  [ai-applier] Could not find target section for: ${describeTarget(op)}, skipping`,
    );
    return fullText;
  }

  const { section, start, end } = extracted;

  const client = await getClient();

  const prompt = `You are applying a legal amendment to Lithuanian legislation formatted as markdown.

Here is the current text of the relevant section:

<section>
${section}
</section>

Apply this amendment operation:
- Type: ${op.type}
- Target: ${describeTarget(op)}
${op.newText ? `- New text: "${op.newText}"` : '- (no replacement text — this is a repeal/removal)'}

Rules:
1. Return ONLY the updated section text with the amendment applied.
2. Preserve ALL markdown formatting exactly (headings, numbering, indentation).
3. Change ONLY what the amendment specifies — nothing else.
4. For "replace" operations on a paragraph/point: replace the content of that specific paragraph/point with the new text, keeping the numbering prefix (e.g., "2. " or "   3) ").
5. For "replace" operations on an entire article: replace the full article section with the new text.
6. For "add" operations: insert the new text at the appropriate position within the section.
7. For "rename" operations: change only the heading/title text.
8. For "restate" operations: treat as a full replace of the targeted element.
9. Do NOT add any explanation, commentary, or markdown code fences. Return raw section text only.`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text',
  );
  if (!textBlock) {
    console.warn(
      `  [ai-applier] No text response for: ${describeTarget(op)}, skipping`,
    );
    return fullText;
  }

  const updatedSection = textBlock.text;

  // Splice the updated section back into the full text
  return fullText.slice(0, start) + updatedSection + fullText.slice(end);
}

// --- Main entry point ---

/**
 * Apply amendment operations to the current markdown text of a law.
 * Returns the new full text after all amendments are applied in order.
 *
 * Uses AI (Claude Haiku) for text replacement/addition operations,
 * and deterministic logic for repeals and simple structural changes.
 */
export async function applyAmendment(
  currentText: string,
  operations: AmendmentOperation[],
): Promise<string> {
  let text = currentText;

  for (const op of operations) {
    text = await applySingleOperation(text, op);
  }

  return text;
}

async function applySingleOperation(
  text: string,
  op: AmendmentOperation,
): Promise<string> {
  // Repeal: deterministic — just remove the section
  if (op.type === 'repeal') {
    return applyRepeal(text, op);
  }

  // Add new article (no existing section to modify): deterministic insertion
  if (op.type === 'add' && op.target.article && !op.target.paragraph && !op.target.point) {
    // Check if this article already exists — if not, it's a new article insert
    const existing = findArticleSection(text, op.target.article);
    if (!existing) {
      return applyAddArticle(text, op);
    }
    // If article exists, we're adding a paragraph/point to it — use AI
  }

  // Add new chapter (no article target): deterministic
  if (op.type === 'add' && op.target.chapter && !op.target.article) {
    return applyAddChapter(text, op);
  }

  // Add annex: deterministic
  if (op.type === 'add' && op.target.annex && !op.target.article) {
    return applyAddAnnex(text, op);
  }

  // Everything else (replace, restate, rename, add-to-existing): use AI
  if (!op.newText) {
    console.warn(
      `  [ai-applier] Operation ${op.type} on ${describeTarget(op)} has no newText, skipping`,
    );
    return text;
  }

  return applyWithAI(text, op);
}
