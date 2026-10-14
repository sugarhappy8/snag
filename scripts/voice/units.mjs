// units.mjs - the units of the rewrite tool: one text literal of src/ with the role it plays in the game, the
// text an agent edits, the rules it breaks and the code around it. voice-batch.mjs writes them as a batch; a
// rewriting agent never sees the code, and `apply` splices the new text back by the id and the sha.
//
// WHAT A UNIT IS
//   Every string and template literal of src/**/*.ts(x) (JSX text is not a literal: the report does not count it
//   and `apply` has no quoting for it) except the ones that are code: import specifiers, type literals, case
//   labels, comparison operands, obj['..'] keys, quoted object keys, JSX attributes that are not shown to the
//   player, the values of the properties id, key, type, kind, flag, slot, icon, emoji and tone, and the
//   arguments of a call that are never text (the id of ch(), the key of pool(), the tone of say()). A literal
//   with no letter in it (an emoji, a number) is not text either. What is left is a "candidate".
//   Of the candidates that a selection (flags, ids, files, after) picks, the ones that something holds in place
//   are left out and counted in pinnedExcluded, because a rewrite would break it: a text that a test pins (12
//   characters or more, no hole, found as a whole inside a string of any .ts file under the test folder of the
//   root), and a text that the code itself looks up (the same text is a quoted key, a comparison operand, a
//   case label or an index somewhere in src/: a table keyed by a sentence is only found again by that sentence).
//
// FIELDS (the batch format is a contract with `apply`)
//   id       "file:line:col": the file relative to the root with "/", the line from 1, the column from 1 in
//            UTF-16 code units (the way the TypeScript compiler counts), both of the opening quote or backtick.
//   sha      the first 8 hex digits of the SHA-256 of the literal as written in the file, delimiters included.
//   role     log, scene, outcome, title, label, tooltip, digest or text (see "ROLES").
//   text     the decoded text with the leading era gate taken off, each ${..} hole shown as {{0}}, {{1}} ...
//   holes    the source of each hole expression, exactly: "${" + holes[n] + "}" is what stood in the file.
//   tag      the era gate and the white space after it ("@1998,own:mobilePhone "), or "".
//   limit    the longest the rewrite may be, in characters of static text (a hole counts 0).
//   maxWords 5 for a label.
//   flags    the rules the text breaks (rules.mjs unitFlags), see "FLAGS".
//   siblings the other candidates directly inside the same pair of brackets, at most 6, the nearest in the
//            source; { role, text } with the tag taken off.
//   code     the source line of the literal, trimmed, cut at 200 characters.
//
// ROLES  (the role of a literal comes from the call or the property it sits in)
//   * Calls that show text, by argument position: say(g, x, title, text, log, ..) of the event helpers is
//     title, outcome, log; notice(g, title, text, ..) is title, outcome; ch(id, label, emoji) is a label;
//     pool(key, weight, gates, lines) holds log lines. A popup that is only a notice() under another name
//     (say() and tell() of the careers, result() of the activities) is title, outcome. There are several
//     functions called say(): which one a call is comes from the import (SHAPES). A literal inside an
//     argument is classified by itself, so each branch of a conditional and each variant of a list has the
//     role of its argument, and a call that is not listed makes what is inside it plain text.
//   * Properties: title is title; label is label; hint, desc, description, header, tip, sub and note are
//     tooltip; text is scene when the object has a choices or opts key or is the object a text() function
//     returns, tooltip inside hint: { .. }, and outcome otherwise; in an outcome object (one with t and x) the
//     short keys are t title, x outcome, l log; in a pool object (one with weight) lines holds log lines.
//   * history/digest-early.ts and digest-late.ts: every literal is a digest line.
//   * Anything else is text.
//
// FLAGS  A text gets the flags of rules.unitFlags(text, role), judged without the era tag. The length floor
//   (extract --min, 14) applies to every flag but two: chatbot and disclaimer are found in a literal of any
//   length, because the report's metrics 8 and 9 scan every literal and many of the chatbot phrases are short
//   ("Good call", "Let's go!"). SettingsScreen.tsx never gets disclaimer: its About text must stay.
//
// Everything here only reads the files under the root; the CLI is the one that writes.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { EXPR_KEYWORDS, K_ID, K_NUM, K_PUNCT, K_STR, K_TMPL, lex } from './lexer.mjs';
import { classify } from './contexts.mjs';
import { listSourceFiles } from './corpus.mjs';
import { FLAG_NAMES, LIMITS, gateOf, staticLength, unitFlags } from './rules.mjs';

export const BATCH_VERSION = 1;
/** Static characters under which a literal is too short to judge (extract --min), except for two flags. */
export const DEFAULT_MIN = 14;
const MAX_SIBLINGS = 6;
const MAX_CODE = 200;
const LABEL_WORDS = 5;
const TEXT_CAP = 180;
/** A text must be this long (and have no hole) for a test to pin it. */
const PIN_MIN = 12;
const FLAGS_AT_ANY_LENGTH = new Set(['chatbot', 'disclaimer']);
const ROLE_ORDER = ['log', 'scene', 'outcome', 'title', 'label', 'tooltip', 'digest', 'text'];
const SETTINGS_FILE = 'src/ui/screens/SettingsScreen.tsx';
const DIGEST_FILES = new Set(['src/game/history/digest-early.ts', 'src/game/history/digest-late.ts']);
const EXCLUDED_CTX = new Set(['import', 'type', 'case', 'compare', 'index', 'jsxattr', 'key']);
/** Of those, the literals that code looks up or compares: a text equal to one of them is not free to change. */
const LOOKUP_CTX = new Set(['key', 'compare', 'case', 'index']);
const EXCLUDED_KEYS = new Set(['id', 'key', 'type', 'kind', 'flag', 'slot', 'icon', 'emoji', 'tone']);
const TOOLTIP_KEYS = new Set(['hint', 'desc', 'description', 'header', 'tip', 'sub', 'note']);
/** Calls that pick one of their list or arguments: the text inside belongs to the argument they sit in. */
const PICKERS = new Set(['pick', 'v']);
/** Words before a "(" that do not make it a call. */
const NOT_A_CALLEE = new Set([...EXPR_KEYWORDS, 'if', 'while', 'for', 'switch', 'catch', 'function', 'async', 'with', 'export', 'default']);

/** Raised for a command line or option the caller got wrong (the CLI exits 2 on it). */
export class UsageError extends Error {}

const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------------------------

/** "file:line:col" to { file, line, col }, or null when it is not an id. */
export function parseId(id) {
  const m = /^(.+):(\d+):(\d+)$/.exec(id);
  return m ? { file: m[1], line: Number(m[2]), col: Number(m[3]) } : null;
}

/** Order of two ids: the file as a plain string, then the line, then the column. */
export function compareIds(a, b) {
  const x = parseId(a);
  const y = parseId(b);
  return byName(x.file, y.file) || x.line - y.line || x.col - y.col;
}

/** The first 8 hex digits of the SHA-256 of a literal as it stands in the source, delimiters included. */
export function literalSha(source) {
  return crypto.createHash('sha256').update(source, 'utf8').digest('hex').slice(0, 8);
}

// ---------------------------------------------------------------------------------------------
// Which function is a call to? The game has several say(): the event helpers' say(g, x, title, text, log),
// the careers' say(g, title, text, emoji, tone) and the activities' say(g, templates, vars). The import says
// which one. A positional shape says what an argument is: its role, or (skip) that it is an id or a tone,
// which is never text. An emoji needs no entry: a literal with no letter in it is not text.
// ---------------------------------------------------------------------------------------------

const EVENT_SAY = { roles: [null, null, 'title', 'outcome', 'log'], skip: [6] }; // say(g, x, t, text, logLine, fx, tone, emoji): tone is never text
const POPUP = { roles: [null, 'title', 'outcome'], skip: [4] }; // notice(g, title, text, opts); say(g, title, text, emoji, tone)
const CHOICE = { roles: [null, 'label'], skip: [0] }; // ch(id, label, emoji)
const POOL = { roles: [null, null, null, 'log'], skip: [0] }; // pool(key, weight, gates, lines)

/** Where a function is defined (module path without extension), and the shape of the ones that carry text. */
const SHAPES = new Map([
  ['src/game/events/helpers', new Map([['say', EVENT_SAY], ['ch', CHOICE]])],
  ['src/game/core', new Map([['notice', POPUP]])],
  ['src/game/special/common', new Map([['say', POPUP], ['tell', POPUP]])],
  ['src/game/activities/common', new Map([['result', POPUP]])],
  ['src/game/events/era-pack-where', new Map([['pool', POOL]])],
]);
/** A file that neither imports nor defines the function (a test tree, say) gets the shape of its name. */
const DEFAULT_SHAPES = new Map([['say', EVENT_SAY], ['notice', POPUP], ['ch', CHOICE], ['pool', POOL]]);

/** import { a, b as c } from './x' to Map(local name -> { module, imported }); the module is a path without extension. */
function parseImports(toks, file) {
  const out = new Map();
  for (let i = 2; i < toks.length; i++) {
    const spec = toks[i];
    if (spec.k !== K_STR || spec.ctx !== 'import' || toks[i - 1].k !== K_ID || toks[i - 1].v !== 'from') continue;
    let j = i - 2;
    for (; j >= 0; j--) {
      const x = toks[j];
      if (x.k === K_ID && x.v === 'import') break;
      if ((x.k === K_ID && x.v === 'export') || (x.k === K_PUNCT && x.v === ';')) { j = -1; break; } // export { a } from '..'
    }
    if (j < 0) continue;
    const module = spec.v.startsWith('.') ? path.posix.join(path.posix.dirname(file), spec.v).replace(/\.(?:tsx?|mjs|js)$/, '') : null;
    for (let q = j + 1; q < i - 1; q++) {
      const x = toks[q];
      if (x.k !== K_ID || x.v === 'as') continue;
      const [next, after] = [toks[q + 1], toks[q + 2]];
      if (next && next.k === K_ID && next.v === 'as' && after && after.k === K_ID) {
        out.set(after.v, { module, imported: x.v });
        q += 2;
      } else if (x.v !== 'type' || !next || next.k !== K_ID) {
        out.set(x.v, { module, imported: x.v });
      }
    }
  }
  return out;
}

/** Names that this file declares itself (function x, const x, let x, var x, class x). */
function localNames(toks) {
  const out = new Set();
  for (let i = 0; i + 1 < toks.length; i++) {
    const t = toks[i];
    if (t.k === K_ID && (t.v === 'function' || t.v === 'const' || t.v === 'let' || t.v === 'var' || t.v === 'class') && toks[i + 1].k === K_ID) out.add(toks[i + 1].v);
  }
  return out;
}

/** The positional shape of a call to `name`, or null when nothing is known about its arguments. */
function shapeOf(name, info) {
  // A function this file defines is only known in the module that defines it (helpers.ts has its own say()).
  if (info.locals.has(name)) return SHAPES.get(info.module)?.get(name) ?? null;
  const imported = info.imports.get(name);
  if (imported) return (imported.module !== null && SHAPES.get(imported.module)?.get(imported.imported)) || null;
  return DEFAULT_SHAPES.get(name) ?? null;
}

// ---------------------------------------------------------------------------------------------
// The brackets around each literal
// ---------------------------------------------------------------------------------------------
// One pass over the tokens keeps a stack of open brackets. A frame is a "(" (with the function it calls and
// the index of the argument being read), a "[", a "{" (with the key of the property being read, and every key
// it has), a template literal's ${ } (a hole) or the file itself. A literal remembers its innermost frame, and
// each frame its parent and what the parent was reading when it opened, which is all the role needs.

/** The resolved role of a literal: AS.log, AS.title ... (one frozen object per role), or EXCLUDED when it is code. */
const AS = Object.freeze(Object.fromEntries(ROLE_ORDER.map((role) => [role, Object.freeze({ role })])));
const TEXT = AS.text;
const EXCLUDED = Object.freeze({ excluded: true });

/** Literal records of one file, each with the frame it sits in. */
function walk(toks, info) {
  const root = { type: 'root', parent: null, parentKey: null, parentArg: null, lits: [] };
  let top = root;
  const lits = [];
  const open = (frame) => {
    if (top.type === '{') top.expectKey = false;
    frame.parent = top;
    frame.parentKey = top.type === '{' ? top.key : null;
    frame.parentArg = top.type === '(' ? top.argIndex : null;
    frame.lits = [];
    top = frame;
  };
  const close = (type) => {
    for (let f = top; f.type !== 'root' && f.type !== 'tmpl'; f = f.parent) {
      if (f.type === type) { top = f.parent; return; }
    }
  };
  /** In an object, at the start of a property: is this token its key, a shorthand, or something else? */
  const readKey = (i, t) => {
    const next = toks[i + 1];
    const name = t.v;
    if (next && next.k === K_PUNCT && next.v === ':') {
      top.key = name;
      top.keys.add(name);
    } else if (t.k === K_ID && next && next.k === K_PUNCT && (next.v === ',' || next.v === '}')) {
      top.keys.add(name); // { text, choices }: a shorthand property is a key too
      top.key = null;
    }
    top.expectKey = false;
  };

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    while (top.type === 'tmpl' && t.p >= top.end) top = top.parent;
    if (t.k === K_PUNCT) {
      switch (t.v) {
        case '(': {
          const prev = toks[i - 1];
          const before = toks[i - 2];
          let callee = null;
          let member = false;
          if (prev && prev.k === K_ID && !NOT_A_CALLEE.has(prev.v) && !(before && before.k === K_ID && before.v === 'function')) {
            callee = prev.v;
            member = !!before && before.k === K_PUNCT && (before.v === '.' || before.v === '?.');
          }
          const shape = callee !== null && !member ? shapeOf(callee, info) : null;
          open({ type: '(', callee, argIndex: 0, shape, transparent: callee === null || (!member && PICKERS.has(callee)) });
          break;
        }
        case '[': open({ type: '[' }); break;
        case '{': open({ type: '{', key: null, keys: new Set(), expectKey: true }); break;
        case ')': close('('); break;
        case ']': close('['); break;
        case '}': close('{'); break;
        case ',':
          if (top.type === '(') top.argIndex++;
          else if (top.type === '{') { top.key = null; top.expectKey = true; }
          break;
        default:
          if (top.type === '{') top.expectKey = false;
      }
    } else if (t.k === K_ID || t.k === K_NUM) {
      if (top.type === '{' && top.expectKey) readKey(i, t);
    } else if (t.k === K_STR || t.k === K_TMPL) {
      if (top.type === '{' && top.expectKey) {
        if (t.k === K_STR) readKey(i, t);
        else top.expectKey = false;
      }
      const lit = { tok: t, frame: top, key: top.type === '{' ? top.key : null, arg: top.type === '(' ? top.argIndex : null, cand: null };
      top.lits.push(lit);
      lits.push(lit);
      if (t.k === K_TMPL) open({ type: 'tmpl', end: t.e });
    }
  }
  return lits;
}

/** The key of the property whose value holds the object `f` (through parentheses, lists and blocks), or null. */
function ownerKey(f) {
  let key = f.parentKey;
  for (let g = f.parent; g; g = g.parent) {
    if (g.type === '{') return key;
    if (g.type === 'root' || g.type === 'tmpl' || (g.type === '(' && !g.transparent)) return null;
    key = g.parentKey;
  }
  return null;
}

/** The role of a text under the property `key` of the object `f`. */
function roleOfKey(key, f) {
  if (EXCLUDED_KEYS.has(key)) return EXCLUDED;
  if (key === 'title') return AS.title;
  if (key === 'label') return AS.label;
  if (TOOLTIP_KEYS.has(key)) return AS.tooltip;
  if (key === 'text') {
    if (f.keys.has('choices') || f.keys.has('opts')) return AS.scene;
    const owner = ownerKey(f); // the object a text() function returns, or hint: { text }
    if (owner === 'text') return AS.scene;
    return owner !== null && TOOLTIP_KEYS.has(owner) ? AS.tooltip : AS.outcome;
  }
  if (key === 'lines') return f.keys.has('weight') ? AS.log : TEXT; // a pool object; other tables also have lines
  if ((key === 't' || key === 'x' || key === 'l') && f.keys.has('t') && f.keys.has('x')) return key === 't' ? AS.title : key === 'x' ? AS.outcome : AS.log;
  return TEXT;
}

/** { role } or EXCLUDED for a literal, from the frames around it. */
function resolve(lit) {
  const attr = lit.tok.attr;
  if (attr) return attr === 'title' ? AS.title : attr === 'label' ? AS.label : attr === 'hint' || attr === 'tooltip' || attr === 'description' ? AS.tooltip : TEXT;
  let { frame: f, key, arg } = lit;
  for (; f; key = f.parentKey, arg = f.parentArg, f = f.parent) {
    if (f.type === 'tmpl') return TEXT; // inside a ${ } hole: a piece of a longer text
    if (f.type === '(') {
      if (f.shape) {
        if (f.shape.skip.includes(arg)) return EXCLUDED;
        const role = f.shape.roles[arg];
        return role ? AS[role] : TEXT;
      }
      if (!f.transparent) return TEXT; // a call that is not known: what is inside it is a piece of something
    } else if (f.type === '{' && key !== null) {
      return roleOfKey(key, f);
    }
  }
  return TEXT;
}

// ---------------------------------------------------------------------------------------------
// One file
// ---------------------------------------------------------------------------------------------

function lineStarts(src) {
  const starts = [0];
  for (let p = src.indexOf('\n'); p >= 0; p = src.indexOf('\n', p + 1)) starts.push(p + 1);
  return starts;
}

/** Index of the line that holds `off`, from 0, in the sorted list of line starts. */
function lineIndexOf(starts, off) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= off) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const HOLE_RE = /\{\{\d+\}\}/;

/** The decoded text of every literal of a file that code looks up or compares (a template with a hole cannot be one). */
function lookupTexts(toks) {
  const out = new Set();
  for (const t of toks) {
    if (!LOOKUP_CTX.has(t.ctx)) continue;
    if (t.k === K_STR) out.add(t.v);
    else if (t.k === K_TMPL && t.nExpr === 0) out.add(t.parts[0]);
  }
  return out;
}

/** Lex one file and turn its literals into candidates, or report that it does not lex. */
function analyzeFile(root, file, min) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const { toks, errors } = lex(src, file.endsWith('.tsx'));
  if (errors.length) return { file, failed: true, cands: [] };
  classify(toks);
  const lookups = lookupTexts(toks);
  const info = { module: file.replace(/\.tsx?$/, ''), imports: parseImports(toks, file), locals: localNames(toks) };
  const digest = DIGEST_FILES.has(file);
  const starts = lineStarts(src);
  const cands = [];
  for (const lit of walk(toks, info)) {
    const t = lit.tok;
    if (EXCLUDED_CTX.has(t.ctx)) continue;
    const resolved = resolve(lit);
    if (resolved.excluded) continue;
    let decoded = t.k === K_TMPL ? t.parts[0] : t.v;
    if (t.k === K_TMPL) for (let n = 1; n < t.parts.length; n++) decoded += `{{${n - 1}}}${t.parts[n]}`;
    const { tag, rest } = gateOf(decoded);
    if (!/\p{L}/u.test(rest)) continue;
    const role = digest ? 'digest' : resolved.role;
    const length = staticLength(rest);
    let flags = unitFlags(rest, role);
    if (length < min) flags = flags.filter((f) => FLAGS_AT_ANY_LENGTH.has(f));
    if (file === SETTINGS_FILE) flags = flags.filter((f) => f !== 'disclaimer');
    const line = lineIndexOf(starts, t.p);
    lit.cand = { lit, file, id: `${file}:${line + 1}:${t.p - starts[line] + 1}`, role, tag, text: rest, length, flags, line, pinned: false };
    cands.push(lit.cand);
  }
  return { file, failed: false, src, starts, cands, lookups };
}

// ---------------------------------------------------------------------------------------------
// Texts that a test pins
// ---------------------------------------------------------------------------------------------

/** The decoded strings of 12 characters or more in every .ts file under the test folder of the root. */
function testStrings(root) {
  const out = [];
  const walkDir = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // no test folder: nothing is pinned
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walkDir(p);
      else if (e.isFile() && e.name.endsWith('.ts')) {
        const src = fs.readFileSync(p, 'utf8');
        const { toks, errors } = lex(src, false);
        // A test file that does not lex is searched as plain text rather than ignored.
        if (errors.length) out.push(src);
        else for (const t of toks) {
          if (t.k === K_STR) out.push(t.v);
          else if (t.k === K_TMPL) out.push(...t.parts);
        }
      }
    }
  };
  walkDir(path.join(root, 'test'));
  return out.filter((s) => s.length >= PIN_MIN);
}

/** Marks the candidates whose whole text is inside a string of a test, and returns how many. */
function markPinned(root, cands) {
  const byPrefix = new Map();
  for (const c of cands) {
    if (c.text.length < PIN_MIN || HOLE_RE.test(c.text)) continue;
    const prefix = c.text.slice(0, PIN_MIN);
    const list = byPrefix.get(prefix);
    if (list) list.push(c);
    else byPrefix.set(prefix, [c]);
  }
  if (!byPrefix.size) return 0;
  const pinned = new Set();
  for (const s of testStrings(root)) {
    for (let i = 0; i + PIN_MIN <= s.length; i++) {
      const list = byPrefix.get(s.slice(i, i + PIN_MIN));
      if (list) for (const c of list) if (s.startsWith(c.text, i)) pinned.add(c.text);
    }
  }
  let n = 0;
  for (const c of cands) {
    if (c.text.length >= PIN_MIN && pinned.has(c.text)) { c.pinned = true; n++; }
  }
  return n;
}

/**
 * Marks the candidates whose text is a key, an operand, a case label or an index somewhere in src/, and returns how
 * many it marked. `files` are the files already read; the others are read here, because a text can be the key of
 * a table in one file and a line of a list in another.
 */
function markLookedUp(root, names, files, cands) {
  const texts = new Set(files.flatMap((f) => [...f.lookups]));
  const read = new Set(files.map((f) => f.file));
  for (const name of names) {
    if (read.has(name)) continue;
    const { toks, errors } = lex(fs.readFileSync(path.join(root, name), 'utf8'), name.endsWith('.tsx'));
    if (errors.length) continue;
    classify(toks);
    for (const text of lookupTexts(toks)) texts.add(text);
  }
  let n = 0;
  for (const c of cands) {
    if (!c.pinned && texts.has(c.text)) { c.pinned = true; n++; }
  }
  return n;
}

// ---------------------------------------------------------------------------------------------
// The batch
// ---------------------------------------------------------------------------------------------

const limitOf = (role, length) => (Object.hasOwn(LIMITS, role) ? LIMITS[role] : Math.min(length, TEXT_CAP));

/** The source expression of each ${ } hole of a template token. */
function holeSources(src, t) {
  const out = [];
  for (let n = 0; n < t.nExpr; n++) {
    let j = t.partAt[n];
    while (j < t.e && !(src.charCodeAt(j) === 36 && src.charCodeAt(j + 1) === 123)) j += src.charCodeAt(j) === 92 ? 2 : 1;
    out.push(src.slice(j + 2, t.partAt[n + 1] - 1));
  }
  return out;
}

/** The line of the literal, trimmed, cut at MAX_CODE characters without splitting a surrogate pair. */
function codeLine(src, starts, line) {
  const end = line + 1 < starts.length ? starts[line + 1] - 1 : src.length;
  const text = src.slice(starts[line], end).trim();
  if (text.length <= MAX_CODE) return text;
  const high = text.charCodeAt(MAX_CODE - 1);
  return text.slice(0, high >= 0xd800 && high <= 0xdbff ? MAX_CODE - 1 : MAX_CODE);
}

/** The nearest MAX_SIBLINGS other candidates of the frame, in source order. */
function siblingsOf(c) {
  const frame = c.lit.frame;
  if (frame.type === 'root') return [];
  const all = frame.lits.filter((l) => l.cand).map((l) => l.cand);
  const at = all.indexOf(c);
  const near = all
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s !== c)
    .sort((a, b) => Math.abs(a.i - at) - Math.abs(b.i - at) || a.i - b.i)
    .slice(0, MAX_SIBLINGS)
    .sort((a, b) => a.i - b.i);
  return near.map(({ s }) => ({ role: s.role, text: s.text }));
}

function toUnit(c, file) {
  const t = c.lit.tok;
  const unit = {
    id: c.id,
    sha: literalSha(file.src.slice(t.p, t.e)),
    role: c.role,
    text: c.text,
    holes: t.k === K_TMPL ? holeSources(file.src, t) : [],
    tag: c.tag,
    limit: limitOf(c.role, c.length),
  };
  if (c.role === 'label') unit.maxWords = LABEL_WORDS;
  unit.flags = c.flags;
  unit.siblings = siblingsOf(c);
  unit.code = codeLine(file.src, file.starts, c.line);
  return unit;
}

/** Repo-relative paths that the names in `wanted` stand for: the path itself, or the tail of a path. */
function matchFiles(all, wanted) {
  const out = new Set();
  for (const name of wanted) {
    const w = name.replace(/^\.\//, '');
    const hits = all.filter((f) => f === w || f.endsWith(`/${w}`));
    if (!hits.length) throw new UsageError(`--files: no source file under src/ matches ${name}`);
    for (const h of hits) out.add(h);
  }
  return out;
}

function checkOptions(opts) {
  const { max, min, flags, ids, after } = opts;
  if (max !== undefined && !(Number.isInteger(max) && max >= 1)) throw new UsageError('--max needs a whole number of 1 or more');
  if (min !== undefined && !(Number.isInteger(min) && min >= 0)) throw new UsageError('--min needs a whole number of 0 or more');
  for (const f of flags ?? []) if (!FLAG_NAMES.includes(f)) throw new UsageError(`--flags: unknown flag ${f} (flags: ${FLAG_NAMES.join(', ')})`);
  for (const id of ids ?? []) if (!parseId(id)) throw new UsageError(`--ids: ${id} is not an id (file:line:col)`);
  if (after !== undefined && !parseId(after)) throw new UsageError(`--after: ${after} is not an id (file:line:col)`);
}

/**
 * Select units from the source under `root` and describe them as a batch.
 *   files          only these files (a repo-relative path, or the tail of one); default: every file of src/
 *   flags          only units with one of these flags; default: units with any flag
 *   ids            only these units, whatever their flags; together with flags, both must hold
 *   after          only units strictly after this id, in file and position order
 *   max            at most this many units (the first ones)
 *   min            the length floor for every flag but chatbot and disclaimer (default DEFAULT_MIN)
 *   includePinned  keep the units that a test pins or that the code looks up (they are left out and counted)
 * Returns { batch, remaining, notFound, filesRead }: how many matching units did not fit under `max`, the ids
 * that are no unit, and how many files were read.
 */
export function extractWithStats(opts) {
  checkOptions(opts);
  const root = path.resolve(opts.root);
  const min = opts.min ?? DEFAULT_MIN;
  const flagSet = opts.flags ? new Set(opts.flags) : null;
  const idSet = opts.ids ? new Set(opts.ids) : null;

  const every = listSourceFiles(root).sort(byName);
  let names = every;
  if (opts.files) {
    const keep = matchFiles(names, opts.files);
    names = names.filter((f) => keep.has(f));
  }
  if (idSet) {
    const named = new Set([...idSet].map((id) => parseId(id).file));
    names = names.filter((f) => named.has(f));
  }

  const files = [];
  const lexErrorFiles = [];
  for (const name of names) {
    const analysis = analyzeFile(root, name, min);
    if (analysis.failed) lexErrorFiles.push(name);
    else files.push(analysis);
  }

  const all = files.flatMap((f) => f.cands);
  // Flags pick units that have one of them (any flag when none are named); ids pick those units whatever their
  // flags; both together must both hold.
  const flagged = flagSet ? (c) => c.flags.some((f) => flagSet.has(f)) : idSet ? () => true : (c) => c.flags.length > 0;
  const matches = all.filter((c) => (!idSet || idSet.has(c.id)) && flagged(c));
  const after = opts.after === undefined ? matches : matches.filter((c) => compareIds(c.id, opts.after) > 0);
  const pinnedExcluded = opts.includePinned || !after.length ? 0 : markPinned(root, after) + markLookedUp(root, every, files, after);
  const kept = after.filter((c) => !c.pinned);
  const chosen = opts.max === undefined ? kept : kept.slice(0, opts.max);
  const fileOf = new Map(files.map((f) => [f.file, f]));
  const units = chosen.map((c) => toUnit(c, fileOf.get(c.file)));
  const remaining = kept.length - chosen.length;
  const existing = idSet ? new Set(all.filter((c) => idSet.has(c.id)).map((c) => c.id)) : null;

  const byRole = {};
  const byFlag = {};
  for (const u of units) {
    byRole[u.role] = (byRole[u.role] ?? 0) + 1;
    for (const f of u.flags) byFlag[f] = (byFlag[f] ?? 0) + 1;
  }
  const ordered = (counts, order) => Object.fromEntries(order.filter((k) => counts[k]).map((k) => [k, counts[k]]));
  return {
    batch: {
      version: BATCH_VERSION,
      root,
      units,
      counts: {
        total: units.length,
        byRole: ordered(byRole, ROLE_ORDER),
        byFlag: ordered(byFlag, FLAG_NAMES),
        pinnedExcluded,
        lexErrorFiles,
      },
    },
    remaining,
    notFound: idSet ? [...idSet].filter((id) => !existing.has(id)) : [],
    filesRead: files.length,
  };
}

/** The batch alone (see extractWithStats for the options). */
export function extractUnits(opts) {
  return extractWithStats(opts).batch;
}
