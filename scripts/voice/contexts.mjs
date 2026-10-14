// contexts.mjs - what is each string literal FOR? Annotates the string and template tokens of lexer.mjs
// with a `ctx`. Ported unchanged from the validated prototype (only the imports are new).
//
import { EXPR_KEYWORDS, K_ID, K_PUNCT, K_STR, K_TMPL } from './lexer.mjs';

// ---------------------------------------------------------------------------------------------
// PART 2  Context classification (what is this string FOR?)
// ---------------------------------------------------------------------------------------------
// Every string/template token gets a `ctx`:
//   jsxattr  value of a JSX attribute (className="x", title="Close")
//   type     inside a `type X = ...` alias or an `interface` body, or next to a `|` (a string
//            literal type in a union; `|` between two strings is never bitwise-or)
//   import   module specifier: `from '...'`, `import '...'`, `require('...')`, `import('...')`
//   key      object-literal / property key: `{ 'a': 1 }`, `, 'b': 2` (followed by ':' after '{' or ',')
//   case     `case 'x':` label
//   compare  operand of ==, ===, !=, !==  (`kind === 'fire'`)
//   index    `obj['prop']`
//   other    everything else: this is the "real text" population (values, arguments, array items)
// The type heuristics are token-level (no parser); checking them against the real TypeScript parser
// showed the residual error (see the header of this file and REPORT.md).

const isP = (t, v) => t !== undefined && t.k === K_PUNCT && t.v === v;
const isI = (t, v) => t !== undefined && t.k === K_ID && t.v === v;

const TYPE_CONT_PREV_P = new Set(['|', '&', '=', '=>', ':', '?', '.', ',', '<', '(', '{', '[']);
const TYPE_CONT_PREV_I = new Set(['extends', 'keyof', 'typeof', 'infer', 'readonly', 'unique', 'is', 'asserts', 'in', 'as']);
const TYPE_CONT_NEXT_P = new Set(['|', '&', '=>', '.', '?', ':']);

/** End (exclusive token index) of a `type X = ...` declaration whose '=' or '<' is toks[from]. */
function typeEnd(toks, from) {
  let depth = 0;
  let angle = 0;
  for (let b = from; b < toks.length; b++) {
    const t = toks[b];
    if (t.k === K_PUNCT) {
      const v = t.v;
      if (v === '(' || v === '[' || v === '{') depth++;
      else if (v === ')' || v === ']' || v === '}') depth--;
      else if (v === '<') angle++;
      else if (v === '>') angle--;
      else if (v === '>>') angle -= 2;
      else if (v === '>>>') angle -= 3;
      if (depth < 0) return b;
      if (v === ';' && depth === 0 && angle <= 0) return b + 1;
    }
    if (depth === 0 && angle <= 0 && t.nl && b > from) {
      const prev = toks[b - 1];
      const prevCont = prev.k === K_PUNCT ? TYPE_CONT_PREV_P.has(prev.v) : prev.k === K_ID && TYPE_CONT_PREV_I.has(prev.v);
      const curCont = t.k === K_PUNCT ? TYPE_CONT_NEXT_P.has(t.v) : t.k === K_ID && t.v === 'extends';
      if (!prevCont && !curCont) return b;
    }
  }
  return toks.length;
}

/** Flag tokens that sit inside `type` aliases and `interface` bodies. */
function markTypeRegions(toks) {
  const inType = new Uint8Array(toks.length);
  for (let a = 0; a < toks.length; a++) {
    const t = toks[a];
    if (t.k !== K_ID) continue;
    const prev = toks[a - 1];
    if (isP(prev, '.')) continue;
    if (t.v === 'type') {
      const nx = toks[a + 1];
      const nx2 = toks[a + 2];
      if (!(nx && nx.k === K_ID && nx2 && nx2.k === K_PUNCT && (nx2.v === '=' || nx2.v === '<'))) continue;
      if (!(prev === undefined || t.nl || isP(prev, ';') || isP(prev, '{') || isP(prev, '}') || isI(prev, 'export') || isI(prev, 'declare'))) continue;
      const end = typeEnd(toks, a + 2);
      for (let b = a; b < end; b++) inType[b] = 1;
      a = end - 1;
    } else if (t.v === 'interface') {
      const nx = toks[a + 1];
      if (!(nx && nx.k === K_ID)) continue;
      let b = a + 2;
      let angle = 0;
      for (; b < toks.length; b++) { // find the '{' that opens the body
        const x = toks[b];
        if (x.k !== K_PUNCT) continue;
        if (x.v === '<') angle++;
        else if (x.v === '>') angle--;
        else if (x.v === '>>') angle -= 2;
        else if (x.v === '{' && angle <= 0) break;
      }
      if (b >= toks.length) continue;
      let depth = 0;
      let c = b;
      for (; c < toks.length; c++) {
        const x = toks[c];
        if (x.k !== K_PUNCT) continue;
        if (x.v === '{') depth++;
        else if (x.v === '}' && --depth === 0) break;
      }
      for (let d = a; d <= Math.min(c, toks.length - 1); d++) inType[d] = 1;
      a = c;
    }
  }
  return inType;
}

const COMPARE_OPS = new Set(['===', '!==', '==', '!=']);

// Structural neighbours: tokens nested deeper inside a template's ${ } are skipped so that the
// "next" token of a template is the one after its closing backtick.
function prevIdx(toks, a) {
  const d = toks[a].td;
  let j = a - 1;
  while (j >= 0 && toks[j].td > d) j--;
  return j;
}
function nextIdx(toks, a) {
  const d = toks[a].td;
  let j = a + 1;
  while (j < toks.length && toks[j].td > d) j++;
  return j;
}

// JSX attributes whose value is shown to the player (everything else - className, id, type... - is
// markup plumbing and gets ctx 'jsxattr').
const TEXT_ATTRS = new Set(['title', 'aria-label', 'aria-description', 'aria-placeholder', 'placeholder', 'alt', 'label', 'children', 'text', 'message', 'caption', 'description', 'subtitle', 'heading', 'hint', 'tooltip']);

function ctxOf(toks, a, inType) {
  const t = toks[a];
  if (t.attr) return TEXT_ATTRS.has(t.attr) ? 'other' : 'jsxattr';
  if (inType) return 'type';
  const pi = prevIdx(toks, a);
  const prev = toks[pi];
  const next = toks[nextIdx(toks, a)];
  if (prev !== undefined && prev.k === K_ID) {
    if (prev.v === 'from' || prev.v === 'import') return 'import';
    if (prev.v === 'case') return 'case';
  }
  if (isP(prev, '(')) {
    const b = toks[prevIdx(toks, pi)];
    if (isI(b, 'require') || isI(b, 'import')) return 'import';
  }
  if (isP(prev, '|') || isP(next, '|')) return 'type';
  // Pick<T, 'a'> / Omit<T, 'a'> / Foo<'a'>: a lone literal type argument
  if (isP(next, '>') && (isP(prev, ',') || isP(prev, '<'))) return 'type';
  if (isP(next, ':') && (isP(prev, '{') || isP(prev, ','))) return 'key';
  if ((prev !== undefined && prev.k === K_PUNCT && COMPARE_OPS.has(prev.v)) || (next !== undefined && next.k === K_PUNCT && COMPARE_OPS.has(next.v))) return 'compare';
  if (isP(prev, '[') && isP(next, ']')) {
    const b = toks[prevIdx(toks, pi)];
    if (b !== undefined && ((b.k === K_ID && !EXPR_KEYWORDS.has(b.v)) || isP(b, ')') || isP(b, ']'))) return 'index';
  }
  return 'other';
}

/** Annotate every string / template token of `toks` with `.ctx`. */
export function classify(toks) {
  const inType = markTypeRegions(toks);
  for (let a = 0; a < toks.length; a++) {
    const t = toks[a];
    if (t.k === K_STR || t.k === K_TMPL) t.ctx = ctxOf(toks, a, inType[a] === 1);
  }
}
