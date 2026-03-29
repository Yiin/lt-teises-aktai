import Anthropic from '@anthropic-ai/sdk';
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

// --- Anthropic client (lazy singleton) ---

let _client: Anthropic | null = null;

async function getClient(): Promise<Anthropic> {
  if (_client) return _client;
  const apiKey = (await Bun.$`get-token ANTHROPIC_API_KEY`.text()).trim();
  _client = new Anthropic({ apiKey });
  return _client;
}

// --- HTML to plain text ---

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
 * Convert HTML to plain text suitable for LLM parsing.
 * Preserves paragraph breaks and converts superscripts.
 */
function htmlToPlainText(html: string): string {
  const $ = cheerio.load(html, { xml: false });

  const lines: string[] = [];
  $('p').each((_, p) => {
    const text = getPlainText($, $(p)).replace(/\u00a0/g, ' ').trim();
    if (text) lines.push(text);
  });

  return lines.join('\n');
}

// --- LLM-based parsing ---

const SYSTEM_PROMPT = `You are a parser for Lithuanian legal amendment acts (pakeitimo įstatymai). Your task is to extract structured amendment operations from amendment act text.

An amendment act modifies a parent law. Each article of the amendment act describes one or more operations on the parent law. The final article(s) about "įsigaliojimas" (entry into force) should be IGNORED — they are not amendment operations.

## Operation Types

1. **replace** — Replace existing content (article, paragraph, point, chapter, section, annex, or title/name)
   - Lithuanian keywords: "Pakeisti ... ir jį/ją išdėstyti taip:"
2. **add** — Add new content (article, paragraph, point, chapter, section, annex)
   - Lithuanian keywords: "Papildyti ... straipsniu/dalimi/punktu/skyriumi:"
3. **repeal** — Remove content entirely
   - Lithuanian keywords: "Pripažinti netekusiu/netekusiais galios"
4. **rename** — Change a title/name of a chapter or section
   - Lithuanian keywords: "Pakeisti ... pavadinimą ir jį išdėstyti taip:"

## Target Structure

Each operation targets a specific part of the parent law:
- **article** — Article number (e.g., "112", "13-1" for superscript numbers like 13^1)
- **paragraph** — Paragraph number within an article (dalis)
- **point** — Point number within a paragraph (punktas)
- **chapter** — Chapter identifier (skyrius), usually Roman numerals
- **section** — Section identifier (skirsnis) within a chapter
- **annex** — Set to "priedas" when targeting the annex
- **title** — Set to true when renaming a heading/title

## Article Number Convention

Superscript numbers like 13^1 or 113^1 represent inserted articles and should be normalized to "13-1" or "113-1" (dash notation).

## Replacement Text

For replace and add operations, the replacement text appears between Lithuanian quotes „..." (U+201E opening, U+201C closing). Extract the FULL text between these quotes as newText. For repeal operations, there is no replacement text.

## Renumbering

"Buvusias ... dalis laikyti atitinkamai ... dalimis" instructions are renumbering directives. You can skip these — they are handled separately.`;

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'extract_amendments',
  description: 'Extract all amendment operations from a Lithuanian amendment act',
  input_schema: {
    type: 'object' as const,
    properties: {
      parentLawRef: {
        type: 'string',
        description: 'The parent law document number, e.g., "Nr. XIV-1234". Extract from the title of the amendment act.',
      },
      operations: {
        type: 'array',
        description: 'List of all amendment operations found in the act',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['replace', 'add', 'repeal', 'rename'],
              description: 'The type of amendment operation',
            },
            target: {
              type: 'object',
              description: 'What part of the parent law is being modified',
              properties: {
                article: {
                  type: 'string',
                  description: 'Article number (e.g., "112", "13-1"). Normalize superscript ^N to dash notation.',
                },
                paragraph: {
                  type: 'string',
                  description: 'Paragraph number (dalis) within the article',
                },
                point: {
                  type: 'string',
                  description: 'Point number (punktas) within the paragraph',
                },
                chapter: {
                  type: 'string',
                  description: 'Chapter identifier (skyrius), usually Roman numerals',
                },
                section: {
                  type: 'string',
                  description: 'Section identifier (skirsnis) within a chapter',
                },
                annex: {
                  type: 'string',
                  description: 'Set to "priedas" when targeting the annex',
                },
                title: {
                  type: 'boolean',
                  description: 'Set to true when this is a rename of a heading/title',
                },
              },
              additionalProperties: false,
            },
            newText: {
              type: 'string',
              description: 'The full replacement text (content between Lithuanian quotes „..."). Omit for repeal operations.',
            },
          },
          required: ['type', 'target'],
          additionalProperties: false,
        },
      },
    },
    required: ['parentLawRef', 'operations'],
    additionalProperties: false,
  },
};

/**
 * Call Claude to extract amendment operations from text.
 */
async function extractWithLLM(text: string): Promise<ParsedAmendment> {
  const client = await getClient();

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: 'extract_amendments' },
    messages: [
      {
        role: 'user',
        content: `Extract ALL amendment operations from this Lithuanian amendment act text. Normalize article numbers with superscripts (^1, ^2) to dash notation (e.g., 13^1 → "13-1"). Include the full replacement text between „..." quotes as newText.\n\n---\n\n${text}`,
      },
    ],
  });

  // Extract the tool use result
  const toolUseBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );

  if (!toolUseBlock) {
    console.warn('[amendment-parser] No tool_use block in response, returning empty result');
    return { parentLawRef: '', operations: [] };
  }

  const input = toolUseBlock.input as {
    parentLawRef: string;
    operations: Array<{
      type: 'replace' | 'add' | 'repeal' | 'rename';
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
    }>;
  };

  // Map to our types (add 'restate' compatibility)
  const operations: AmendmentOperation[] = input.operations.map((op) => ({
    type: op.type,
    target: op.target,
    ...(op.newText ? { newText: op.newText } : {}),
  }));

  return {
    parentLawRef: input.parentLawRef || '',
    operations,
  };
}

// --- Public API ---

/**
 * Parse an amendment act from its HTML source.
 */
export async function parseAmendmentAct(html: string): Promise<ParsedAmendment> {
  const text = htmlToPlainText(html);
  return extractWithLLM(text);
}

/**
 * Parse an amendment act from plain text.
 */
export async function parseAmendmentText(text: string): Promise<ParsedAmendment> {
  return extractWithLLM(text);
}
