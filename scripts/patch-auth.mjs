#!/usr/bin/env node
/**
 * patch-auth.mjs — adds `await requireOperator()` to every server action
 * in the codebase. Idempotent: skips files that already do the import.
 *
 * Strategy:
 *  - Named actions:  insert `await requireOperator();` on the line after
 *    `'use server';` directive. Skip when the next non-blank line already
 *    calls requireOperator.
 *  - Inline arrows:  rewrite `'use server'; <expr>` to
 *    `'use server'; await requireOperator(); <expr>`.
 *  - Insert the import once near the top of each touched file.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

// Files we explicitly do NOT touch.
const SKIP = new Set([
  path.join(SRC, 'app/login/page.tsx'),  // login can't require auth
  path.join(SRC, 'lib/auth.ts'),         // defines requireOperator
  path.join(SRC, 'auth.ts'),             // next-auth config
  path.join(SRC, 'middleware.ts'),
]);

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(p));
    else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function patchInline(src) {
  // Match `'use server'; <something>` inline forms.  Only insert the call
  // once; if it's already there, leave it alone.
  return src.replace(
    /'use server';(?!\s*await requireOperator)/g,
    "'use server'; await requireOperator();"
  );
}

function patchNamed(src) {
  // For named server actions:
  //   async function foo(...) {
  //     'use server';
  //     <body>
  //   }
  // Insert after the directive.
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    const trimmed = lines[i].trim();
    if (trimmed === "'use server';") {
      // Look ahead a couple lines for an existing requireOperator call.
      let already = false;
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (/requireOperator/.test(lines[j])) { already = true; break; }
      }
      if (!already) {
        // Match the indent of the directive.
        const indent = lines[i].match(/^\s*/)?.[0] ?? '';
        out.push(`${indent}await requireOperator();`);
      }
    }
  }
  return out.join('\n');
}

function ensureImport(src) {
  if (/from ['"]@\/lib\/auth['"]/.test(src)) return src;
  // Add the import after the last existing import line.
  const lines = src.split('\n');
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s/.test(lines[i])) lastImport = i;
  }
  const importLine = "import { requireOperator } from '@/lib/auth';";
  if (lastImport === -1) {
    return importLine + '\n' + src;
  }
  lines.splice(lastImport + 1, 0, importLine);
  return lines.join('\n');
}

let changed = 0;
let skipped = 0;
for (const file of await walk(SRC)) {
  if (SKIP.has(file)) { skipped++; continue; }
  const src = await fs.readFile(file, 'utf8');
  if (!src.includes("'use server'")) continue;
  let next = src;
  next = patchNamed(next);
  next = patchInline(next);
  if (next !== src) {
    next = ensureImport(next);
    await fs.writeFile(file, next);
    changed++;
    console.log('patched', path.relative(ROOT, file));
  }
}

console.log(`\nSummary: ${changed} files patched, ${skipped} explicitly skipped.`);
