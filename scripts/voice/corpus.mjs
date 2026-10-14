// corpus.mjs - which files are read, and the flat list of string records they hold.
//
// Ported from the validated prototype. The records are the same; each gains `col`, `start` and `end`
// (see buildCorpus), which the rewrite tools use to find a literal again and to splice it.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { K_REGEX, K_STR, K_TMPL, K_JSXTEXT, lex } from './lexer.mjs';
import { classify } from './contexts.mjs';

// ---------------------------------------------------------------------------------------------
// PART 3  File discovery and the string corpus
// ---------------------------------------------------------------------------------------------
const SKIP_DIRS = new Set(['node_modules', 'test', 'tests', '__tests__', 'dist', '.git']);
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Sorted repo-relative paths of src/**.ts and src/**.tsx, minus tests, .d.ts and node_modules. */
export function listSourceFiles(root) {
  const out = [];
  const walk = (dir, rel) => {
    const ents = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => byName(a.name, b.name));
    for (const e of ents) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), r);
      } else if (e.isFile() && /\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) {
        out.push(r);
      }
    }
  };
  walk(path.join(root, 'src'), 'src');
  return out;
}

/**
 * Lex every source file and return the flat list of string records.
 * record: { file, line, col, start, end, kind: 'str'|'tmpl'|'jsx', ctx, text, raw, nExpr, parts?, partLines? }; also
 * returns the list of files, lexer errors, a regex-literal count and a SHA-256 of all measured source text.
 *   text  = cooked value (templates: static parts joined with the literal text "${...}")
 *   raw   = source text between the delimiters (escapes NOT decoded)
 *   line  = 1-based line of the literal's first character
 *   col   = 1-based column of that character (UTF-16 code units, like TypeScript's own columns)
 *   start = offset of the opening delimiter and end = offset just after the closing one, so that
 *           src.slice(start, end) is the literal as written (for kind 'jsx': the text run, which has no
 *           delimiters). Offsets count UTF-16 code units, like string indexes.
 */
export function buildCorpus(root) {
  const files = listSourceFiles(root);
  const records = [];
  const lexErrors = [];
  let regexCount = 0;
  let bytes = 0;
  const hash = crypto.createHash('sha256'); // fingerprint of the measured text, to tell whether two runs saw the same source
  for (const file of files) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    bytes += Buffer.byteLength(src);
    hash.update(file + '\0' + src + '\0');
    const { toks, errors } = lex(src, file.endsWith('.tsx'));
    for (const e of errors) lexErrors.push(`${file}: ${e}`);
    classify(toks);
    // offset -> line (binary search over line start offsets)
    const starts = [0];
    for (let p = src.indexOf('\n'); p >= 0; p = src.indexOf('\n', p + 1)) starts.push(p + 1);
    const lineOf = (off) => {
      let lo = 0, hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= off) lo = mid; else hi = mid - 1;
      }
      return lo + 1;
    };
    const colOf = (off) => off - starts[lineOf(off) - 1] + 1;
    for (const t of toks) {
      if (t.k === K_STR) {
        records.push({ file, line: lineOf(t.p), col: colOf(t.p), start: t.p, end: t.e, kind: 'str', ctx: t.ctx, text: t.v, raw: t.raw, nExpr: 0, attr: t.attr });
      } else if (t.k === K_TMPL) {
        records.push({
          file, line: lineOf(t.p), col: colOf(t.p), start: t.p, end: t.e, kind: 'tmpl', ctx: t.ctx, text: t.v, raw: t.raw, nExpr: t.nExpr,
          parts: t.parts, partLines: t.partAt.map(lineOf),
        });
      } else if (t.k === K_JSXTEXT) {
        records.push({ file, line: lineOf(t.p), col: colOf(t.p), start: t.p, end: t.e, kind: 'jsx', ctx: 'jsxtext', text: t.v, raw: t.raw, nExpr: 0 });
      } else if (t.k === K_REGEX) regexCount++;
    }
  }
  return { files, records, lexErrors, regexCount, bytes, sourceSha256: hash.digest('hex') };
}
