#!/usr/bin/env node
// voice-batch.mjs - the rewrite tool of the voice work. It never edits the game: it picks the strings of src/
// that break the voice guide (docs/VOICE.md) and writes them as a JSON batch, so that an agent can rewrite
// them without seeing the code. What a unit is, its fields and its roles are written in scripts/voice/units.mjs.
//
//   node scripts/voice-batch.mjs extract --out batch.json                  every unit that has a flag
//   node scripts/voice-batch.mjs extract --files a.ts,b.ts --flags nobody,punchline --max 300 --out batch.json
//   node scripts/voice-batch.mjs extract --ids src/game/x.ts:12:7 --out redo.json
//
// extract only READS the files under --root (src/**/*.ts(x) and test/**/*.ts) and writes only the file --out
// names. The output is deterministic: no clock, units in the order of file and position. Dependency-free
// Node ESM, like voice-report.mjs. Exit codes: 0 normally; 2 for bad usage (nothing is written); 1 on an
// unexpected error.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLAG_NAMES } from './voice/rules.mjs';
import { DEFAULT_MIN, UsageError, extractWithStats } from './voice/units.mjs';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `voice-batch.mjs - picks the strings of src/ that break the voice guide and writes them as a JSON batch

usage: node scripts/voice-batch.mjs extract [options] --out FILE

  --out FILE        the batch file to write; it is the only thing this command writes
  --root DIR        the repository to read (default: the repository this script is in)
  --files a,b       only these files: a path from the root, or the end of one (era-pack-1900-kids.ts)
  --flags x,y       only units with one of these flags (default: every unit that has a flag)
                    flags: ${FLAG_NAMES.join(', ')}
  --ids i,j         only these units, flag or not; an id is file:line:col (with --flags, both must hold)
  --after ID        only the units after this id, in the order of file and position
  --max N           write at most N units (a batch is up to 300); the others are counted, not written
  --min N           ignore texts shorter than N characters (default ${DEFAULT_MIN}), except for the chatbot and
                    disclaimer flags, which are found at any length; 0 takes every length
  --include-pinned  keep the units that a test pins or that the code looks up as a key (left out and counted by default)
  --help            this text
`;

/** The value of an option: the next argument, unless there is none or it is another option. */
function valueOf(argv, i, name) {
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new UsageError(`${name} needs a value`);
  return v;
}

const list = (v, name) => {
  const items = v.split(',').map((x) => x.trim()).filter(Boolean);
  if (!items.length) throw new UsageError(`${name} needs a value`);
  return items;
};

const whole = (v, name) => {
  if (!/^\d+$/.test(v)) throw new UsageError(`${name} needs a whole number, not ${v}`);
  return Number(v);
};

function parseExtract(argv) {
  const a = { root: null, out: null, help: false, includePinned: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    switch (x) {
      case '--help': case '-h': a.help = true; break;
      case '--include-pinned': a.includePinned = true; break;
      case '--out': a.out = valueOf(argv, i++, x); break;
      case '--root': a.root = valueOf(argv, i++, x); break;
      case '--files': a.files = list(valueOf(argv, i++, x), x); break;
      case '--flags': a.flags = list(valueOf(argv, i++, x), x); break;
      case '--ids': a.ids = list(valueOf(argv, i++, x), x); break;
      case '--after': a.after = valueOf(argv, i++, x); break;
      case '--max': a.max = whole(valueOf(argv, i++, x), x); break;
      case '--min': a.min = whole(valueOf(argv, i++, x), x); break;
      default:
        throw new UsageError(x.startsWith('--') ? `unknown option ${x}` : `unexpected argument ${x}`);
    }
  }
  return a;
}

const counted = (counts) => Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ');

function extract(argv) {
  const args = parseExtract(argv);
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.out === null) throw new UsageError('extract needs --out FILE');
  const root = path.resolve(args.root ?? DEFAULT_ROOT);
  if (!fs.existsSync(path.join(root, 'src'))) throw new UsageError(`${path.join(root, 'src')} not found`);

  const { batch, remaining, notFound, filesRead } = extractWithStats({
    root, files: args.files, flags: args.flags, ids: args.ids, after: args.after, max: args.max, min: args.min, includePinned: args.includePinned,
  });
  const out = path.resolve(args.out);
  try {
    fs.writeFileSync(out, JSON.stringify(batch, null, 2) + '\n');
  } catch (e) {
    process.stderr.write(`voice-batch.mjs: cannot write ${out}: ${e.message}\n`);
    return 1;
  }

  const { counts, units } = batch;
  const lines = [`voice-batch extract  root=${root}`];
  lines.push(`files: ${filesRead} read${counts.lexErrorFiles.length ? `, ${counts.lexErrorFiles.length} skipped because they do not lex: ${counts.lexErrorFiles.join(', ')}` : ''}`);
  lines.push(`units: ${counts.total} written to ${out}`);
  if (counts.total) {
    lines.push(`by role: ${counted(counts.byRole)}`);
    lines.push(`by flag: ${counted(counts.byFlag)}`);
  }
  lines.push(`pinned: ${counts.pinnedExcluded} texts left out because a test pins them or the code looks them up`);
  if (remaining) lines.push(`more: ${remaining} further units match; the next batch starts with --after ${units[units.length - 1].id}`);
  process.stdout.write(lines.join('\n') + '\n');
  for (const id of notFound) process.stderr.write(`voice-batch.mjs: no unit has the id ${id}\n`);
  return 0;
}

function main(argv) {
  const [command, ...rest] = argv;
  try {
    if (command === '--help' || command === '-h') {
      process.stdout.write(HELP);
      return 0;
    }
    if (command === undefined) throw new UsageError('no command (the command is extract)');
    if (command === 'extract') return extract(rest);
    throw new UsageError(`unknown command ${command} (the command is extract)`);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    process.stderr.write(`voice-batch.mjs: ${e.message}\n\n${HELP}`);
    return 2;
  }
}

// Run only when executed directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); throw e; }); // `| head` is fine
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`voice-batch.mjs: ${e && e.message ? e.message : e}\n`);
    process.exitCode = 1;
  }
}
