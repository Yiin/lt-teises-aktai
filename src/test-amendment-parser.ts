/**
 * Test the LLM-based amendment parser against 3 real amendment acts from e-TAR.
 */

import { fetchActHtml } from './clients/e-tar.ts';
import { parseAmendmentAct } from './parsers/amendment-parser.ts';

const TEST_IDS = [
  { id: 'bb00a3c2358111f08fdabd4950271e2c', label: 'ANK amendment #1' },
  { id: '64956ba0358211f08fdabd4950271e2c', label: 'ANK amendment #2' },
  { id: '1ddecf524ab611f0b070ee7f1ceefc75', label: 'ANK amendment #3' },
];

async function main() {
  for (const { id, label } of TEST_IDS) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Testing: ${label} (${id})`);
    console.log('='.repeat(80));

    try {
      // Fetch HTML
      console.log('Fetching HTML from e-TAR...');
      const html = await fetchActHtml(id);
      console.log(`HTML size: ${(html.length / 1024).toFixed(1)} KB`);

      // Parse
      console.log('Parsing with LLM...');
      const start = performance.now();
      const result = await parseAmendmentAct(html);
      const elapsed = ((performance.now() - start) / 1000).toFixed(2);
      console.log(`Parsed in ${elapsed}s`);

      // Display results
      console.log(`\nParent law ref: ${result.parentLawRef}`);
      console.log(`Operations found: ${result.operations.length}\n`);

      for (let i = 0; i < result.operations.length; i++) {
        const op = result.operations[i]!;
        const targetParts: string[] = [];
        if (op.target.chapter) targetParts.push(`chapter=${op.target.chapter}`);
        if (op.target.section) targetParts.push(`section=${op.target.section}`);
        if (op.target.article) targetParts.push(`article=${op.target.article}`);
        if (op.target.paragraph) targetParts.push(`paragraph=${op.target.paragraph}`);
        if (op.target.point) targetParts.push(`point=${op.target.point}`);
        if (op.target.annex) targetParts.push(`annex=${op.target.annex}`);
        if (op.target.title) targetParts.push('title=true');

        const targetStr = targetParts.join(', ');
        const textPreview = op.newText
          ? ` | text: "${op.newText.slice(0, 80)}${op.newText.length > 80 ? '...' : ''}"`
          : '';

        console.log(`  ${i + 1}. [${op.type}] ${targetStr}${textPreview}`);
      }
    } catch (err) {
      console.error(`FAILED: ${err instanceof Error ? err.message : err}`);
    }

    // Brief pause between requests
    await new Promise((r) => setTimeout(r, 1000));
  }
}

main();
