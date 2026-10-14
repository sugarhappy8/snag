#!/usr/bin/env node
// voice-report.mjs - how far is the game's text from the voice guide? Counts the ten measurable targets of
// Part A of the v2.5 improvement prompt (A7) over every string literal in src/, against the numbers of the
// v2.4.0 audit. The guide is docs/VOICE.md; the word lists are scripts/voice/rules.mjs.
//
//   node scripts/voice-report.mjs                 the table: metric, audit, now, target, status
//   node scripts/voice-report.mjs --json          one deterministic JSON document
//   node scripts/voice-report.mjs --per-file      + every metric for every file
//   node scripts/voice-report.mjs --summary       the table as markdown (what the CI job summary shows)
//   node scripts/voice-report.mjs --ci            the table, then one ::warning line when a target is missed,
//                                                 and the markdown appended to $GITHUB_STEP_SUMMARY when set
//   node scripts/voice-report.mjs --strict        exit 1 when a target is missed (the default exit is 0)
//   node scripts/voice-report.mjs --root DIR      measure another tree (the tests point it at fixtures)
//   node scripts/voice-report.mjs --help          all flags
//
// Dependency-free Node ESM (Node >= 18, tested on 22). The script only READS the repo (src/**/*.ts and
// src/**/*.tsx; test directories, *.test.ts, *.d.ts and node_modules are skipped); the one thing it ever writes
// is the file named by $GITHUB_STEP_SUMMARY, and only under --ci. stdout is deterministic. TypeScript 7 ships no
// JavaScript compiler API, so scripts/voice/lexer.mjs is a hand-written lexer, validated against the real parser.
//
// WHAT IT DOES
//   1. Lexes every source file (scripts/voice/lexer.mjs) and records every string literal with file, line
//      and column (corpus.mjs).
//   2. Gives each literal a context (contexts.mjs): import specifier, type-level literal, object key, case
//      label, comparison operand, index key, JSX attribute, or plain text.
//   3. Measures the numbers (metrics.mjs, with the definitions written next to the code and printed in the
//      report) and compares them with the audit's and with the PDF's targets.
//
// Exit codes: 0 normally; 1 under --strict when a target is missed, or on an unexpected error; 2 for bad usage.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCorpus } from './voice/corpus.mjs';
import { computeMetrics, evaluateTargets, flatten, makeEnv, perFileTable, rowSpecs } from './voice/metrics.mjs';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOP = 8; // files listed per metric

const HELP = `voice-report.mjs - the voice report: the ten A7 targets of Part A, counted over the string literals in src/

usage: node scripts/voice-report.mjs [options]

  --json         print one deterministic JSON document instead of the text report
  --per-file     add a per-file breakdown of every metric (all files with a hit)
  --summary      print the table as markdown instead of the text report
  --ci           print the text report, then one ::warning line when a target is missed, and append the
                 markdown table to the file named by $GITHUB_STEP_SUMMARY when that variable is set
  --strict       exit 1 when a target is missed (the default exit code is 0)
  --root DIR     the repository to measure (default: the repository this script is in)
  --help         this text

--json cannot be combined with --ci or --summary.
`;

function parseArgs(argv) {
  const a = { root: null, json: false, perFile: false, summary: false, ci: false, strict: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--json') a.json = true;
    else if (x === '--per-file') a.perFile = true;
    else if (x === '--summary') a.summary = true;
    else if (x === '--ci') a.ci = true;
    else if (x === '--strict') a.strict = true;
    else if (x === '--root') {
      if (i + 1 >= argv.length) throw new Error('--root needs a value');
      a.root = argv[++i];
    } else if (x === '--help' || x === '-h') a.help = true;
    else if (x.startsWith('--')) throw new Error(`unknown option ${x}`);
    else throw new Error(`unexpected argument ${x}`);
  }
  if (a.json && a.ci) throw new Error('--json and --ci cannot be combined (the warning line would end up inside the JSON)');
  if (a.json && a.summary) throw new Error('--json and --summary cannot be combined');
  return a;
}

const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const topOf = (map, n) => [...map].sort((a, b) => b[1] - a[1] || byName(a[0], b[0])).slice(0, n);
const pct = (v, a) => (a ? Math.round(((v / a - 1) * 1000)) / 10 : null);
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtList = (list) => list.map(fmt).join(' / ');

/** The table as aligned text: two spaces or more between cells, numbers right-aligned. */
function textTable(rows) {
  const head = ['#', 'Metric', 'Audit', 'Now', 'Target', 'Status'];
  const cells = rows.map((r) => [r.id, r.name, fmtList(r.audit), fmtList(r.now), r.target, r.status]);
  const right = [false, false, true, true, false, false];
  const width = head.map((h, c) => Math.max(h.length, ...cells.map((row) => row[c].length)));
  const line = (row) => row.map((cell, c) => (right[c] ? cell.padStart(width[c]) : cell.padEnd(width[c]))).join('  ').trimEnd();
  return [line(head), ...cells.map(line)];
}

/** The table as markdown, the way the CI job summary shows it. */
function markdownTable(targets, meta) {
  return [
    '### Voice report',
    '',
    '| # | Metric | Audit | Now | Target | Status |',
    '| --- | --- | ---: | ---: | --- | --- |',
    ...targets.rows.map((r) => `| ${r.id} | ${r.name} | ${fmtList(r.audit)} | ${fmtList(r.now)} | ${r.target} | ${r.status} |`),
    '',
    `${targets.missed} of ${targets.count} targets missed. ${fmt(meta.files)} files, ${fmt(meta.textStrings)} text strings.`,
    '',
  ].join('\n');
}

export function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`voice-report.mjs: ${e.message}\n\n${HELP}`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const root = path.resolve(args.root ?? DEFAULT_ROOT);
  if (!fs.existsSync(path.join(root, 'src'))) {
    process.stderr.write(`voice-report.mjs: ${root}/src not found\n`);
    return 2;
  }

  const corpus = buildCorpus(root);
  const env = makeEnv(corpus);
  const M = computeMetrics(env);
  const { values, groups } = flatten(M);
  const targets = evaluateTargets(values);
  const rows = rowSpecs(env.o).map((r) => ({
    id: r.id, key: r.key, name: r.name.trim(), audit: r.audit, value: values[r.key], deltaPct: pct(values[r.key], r.audit),
    definition: r.def, topFiles: r.noList ? [] : topOf(groups[r.group] || new Map(), TOP), listName: r.listName || r.name.trim(),
  }));
  const meta = {
    tool: 'voice-report.mjs', repo: root, files: corpus.files.length, literalsExtracted: corpus.records.length,
    literalsInScope: env.all.length, textStrings: env.text.length, regexLiteralsSkipped: corpus.regexCount, lexerErrors: corpus.lexErrors.length,
    sourceBytes: corpus.bytes, sourceSha256: corpus.sourceSha256, options: env.o,
  };
  const markdown = markdownTable(targets, meta);

  if (args.json) {
    const doc = { meta, metrics: rows, targets };
    if (args.perFile) doc.perFile = perFileTable(env, M);
    process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
  } else if (args.summary) {
    process.stdout.write(markdown);
  } else {
    const out = [];
    out.push(`voice-report  repo=${root}  source-sha256=${corpus.sourceSha256.slice(0, 16)}`);
    out.push(`${fmt(corpus.files.length)} files, ${fmt(corpus.bytes)} bytes, ${fmt(corpus.records.length)} literals extracted (${fmt(env.all.length)} in scope, ${fmt(env.text.length)} text strings), ${fmt(corpus.regexCount)} regex literals skipped, ${corpus.lexErrors.length} lexer errors`);
    out.push('');
    out.push(...textTable(targets.rows));
    out.push('');
    out.push(`${targets.missed} of ${targets.count} targets missed.`);
    out.push('');
    out.push('Also measured, with no target (audit and now)');
    const shown = new Set(targets.rows.flatMap((r) => r.keys));
    for (const r of rows.filter((x) => !shown.has(x.key))) {
      out.push(`  ${r.id.padEnd(3)} ${r.name.padEnd(44).slice(0, 44)} ${fmt(r.audit).padStart(8)} ${fmt(r.value).padStart(8)}`);
    }
    out.push('');
    out.push('Definitions');
    for (const r of rows) out.push(`  ${r.id.padEnd(3)} ${r.definition}`);
    out.push('');
    out.push(`Top ${TOP} files per metric (file: count)`);
    for (const r of rows) {
      if (!r.topFiles.length) continue;
      out.push(`  #${r.id} ${r.listName}`);
      for (const [f, n] of r.topFiles) out.push(`      ${f}: ${fmt(n)}`);
    }
    if (args.perFile) {
      const t = perFileTable(env, M);
      out.push('');
      out.push('Per-file breakdown (files with at least one hit; text = text strings in the file)');
      const cols = ['text', 'long', 'fragments', 'qualifiers', 'negatives', 'colonJoins', 'nobody', 'everyone', 'disclaimers', 'banRaw', 'emDash'];
      out.push(`  ${'file'.padEnd(52)}${cols.map((c) => c.slice(0, 7).padStart(8)).join('')}  era med/p90`);
      for (const f of Object.keys(t)) out.push(`  ${f.padEnd(52)}${cols.map((c) => String(t[f][c]).padStart(8)).join('')}  ${t[f].eraMedian !== undefined ? `${t[f].eraMedian}/${t[f].eraP90}` : ''}`);
    }
    if (corpus.lexErrors.length) {
      out.push('');
      out.push('Lexer errors:');
      for (const e of corpus.lexErrors.slice(0, 20)) out.push('  ' + e);
    }
    process.stdout.write(out.join('\n') + '\n');
  }
  // --ci: one GitHub Actions warning annotation, only when there is something to warn about.
  if (args.ci && targets.missed > 0) process.stdout.write(`::warning title=Voice report::${targets.missed} of ${targets.count} targets missed\n`);
  // The job summary: appended (the step may not be the only writer), and only when asked for with --ci.
  if (args.ci && process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  return args.strict && targets.missed > 0 ? 1 : 0;
}

// Run only when executed directly (so the file can also be imported as a module).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); throw e; }); // `| head` is fine
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`voice-report.mjs: ${e && e.message ? e.message : e}\n`);
    process.exitCode = 1;
  }
}
