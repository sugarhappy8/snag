// metrics.mjs - the A7 numbers (Part A of the v2.5 improvement prompt): what is counted, the audit's values
// and the targets, and the counting itself. The rules (patterns and word lists) are in rules.mjs.
//
// DEFINITIONS IN ONE PARAGRAPH
//   "text strings" are the string and template literals that are not import specifiers, type-level
//   literals, className-style JSX attributes, case labels, comparison operands or obj[..] keys, and whose
//   static text (escapes decoded; each ${..} hole counts 0 characters) is at least 14 characters long.
//   #0-#7 and #10 are measured over text strings; the disclaimer words (#8) and the ban-list (#9) scan
//   every literal, because short UI strings such as "Let's go!" or " (simulated)" matter there and the
//   audit's ban-list count only reproduces when they are scanned.
//
// CALIBRATION NOTES (snag v2.4.0, src tree d039b076; audit values are in the AUDIT constant)
//   * Volume: 196,890 string-like tokens, 178,938 in scope, 152,853 with >= 3 characters. The audit's #0
//     (59,172) is reproduced by a floor of 14 static characters (13: +7.6%, 15: -6.3%). The same floor makes #10
//     exact (24; 38 with no floor) and the #2 median exact (75). Holes must count 0: counted as written ("${...}")
//     #10 would be 34. #9 does not fit a floor (10 hits at >= 14, 22 over all literals), so #8 and #9 scan all.
//   * Fitted or guessed: the floor (14); #4's lead words (the 3 named words give 22, + Mostly/Probably 74, a 14-word
//     list 91); #6's 3+3 word thresholds (several pairs land in 700-750).
//   * #7: only "the word anywhere, any case" reproduces 453/448 (445/421 here); strictly sentence-initial gives 205/96.
//   * #5 is 590 vs 544; without "cannot" it is 542. #2b p90 is 131 with the two digest files, 122 without them.
//     #1 is 436, or 467 if a hole counts 3 characters. #9: 22 hits in 17 files, so "sites" = distinct files.
//   * Not reproducible: the extra 'Ouch.' (30 in the audit, 21 in string literals, 22 anywhere in src incl. comments)
//     and the literal sentence "your wallet needs a nap" (once in source; 11 only as the "needs a nap/rest/break" shape).
//   * Template literals are one literal each ('whole'). The brief's "static parts as strings" would move #0 +5%,
//     #1 -25%, #6 -37%, #9 -23%, #10 -25%. The prototype measured 42 such alternative definitions (its
//     --sensitivity run); this port keeps only the default definition of each metric.
//   * Not measurable here: the PDF asks that the strings over 180 characters that remain are "none narrative".
//     A script cannot judge that; the count (#1) is the number the report checks.
//
// The A7 table of the PDF has ten rows. TARGETS lists them; the other numbers (#0, the kids pack, Nobody and
// Everyone on their own, the raw ban-list hits, the stock tics) are measured as well and listed without a target.

import { norm, countNegatives, countColonJoins, fragmentLead, QUALIFIER_LEADS, NEG_PHRASES, DISCLAIMER_WORDS, countNobody, countEveryone, countDisclaimers, startsWithChatbotPhrase, countEmDashes } from './rules.mjs';

// ---------------------------------------------------------------------------------------------
// PART 4  Metric definitions
// ---------------------------------------------------------------------------------------------
// Vocabulary
//   literal   one record of the corpus (a '..' / ".." string, a template literal, optionally JSX text)
//   scope     literals that are runtime text candidates: kind str/tmpl and ctx not in `excludeCtx`
//             (default: import specifiers, type-level literals, markup JSX attributes, case labels,
//             comparison operands, obj[..] index keys)
//   length    "measured length" of a literal = static characters (escapes decoded, `${..}` holes count 0)
//   text      scope literals whose measured length >= minLen ("text strings"): the population for
//             #0-#7 and #10
//   all       every scope literal regardless of length: used for the ban-list scan (#9) and the
//             disclaimer words (#8), and for the extras
// Text matching always runs on `n`: the cooked text with curly quotes straightened and `${..}` holes
// written literally as the 6 characters "${...}".

/** The "Now" column of the PDF's A7 table (and the numbers around it) for the v2.4.0 tree the audit measured. */
export const AUDIT = {
  total: 59172, long: 464, eraMedian: 75, eraP90: 124, fragments: 988, qualifiers: 77,
  negatives: 544, negativesKids1900: 26, colonJoins: 722, nobody: 453, everyone: 448,
  disclaimers: 37, banRaw: 22, banSites: 17, emDash: 24,
  ouch: 30, forNow: 25, mostly: 19, fair: 13, at3am: 22, walletNap: 11,
};

/**
 * The PDF's A7 targets: ten rows. `show` is the metric (or the two metrics) the row displays, `checks` what has to
 * hold (`below`: strictly less than, `max`: at most) and `text` the target as the PDF writes it. Row 9 shows and
 * checks the files with a chatbot phrasing, as the PDF does (17); the raw hits (22) are 0 exactly when the files are.
 */
export const TARGETS = Object.freeze([
  { id: '1', name: 'Strings longer than 180 characters', show: ['long'], checks: [{ key: 'long', below: 60 }], text: '< 60' },
  { id: '2', name: 'Era-pack string length, median / p90', show: ['eraMedian', 'eraP90'], checks: [{ key: 'eraMedian', max: 50 }, { key: 'eraP90', max: 100 }], text: '<= 50 / <= 100' },
  { id: '3', name: 'Fragment punchlines', show: ['fragments'], checks: [{ key: 'fragments', below: 300 }], text: '< 300' },
  { id: '4', name: "'. Especially/Including/Twice... X.' shape", show: ['qualifiers'], checks: [{ key: 'qualifiers', below: 15 }], text: '< 15' },
  { id: '5', name: 'Contraction-free negatives', show: ['negatives'], checks: [{ key: 'negatives', below: 100 }], text: '< 100' },
  { id: '6', name: 'Mid-sentence colon joins', show: ['colonJoins'], checks: [{ key: 'colonJoins', below: 250 }], text: '< 250' },
  { id: '7', name: "'Nobody' / 'Everyone' as subject", show: ['both'], checks: [{ key: 'both', below: 400 }], text: '< 400' },
  { id: '8', name: 'Disclaimer words in UI text', show: ['disclaimers'], checks: [{ key: 'disclaimers', max: 3 }], text: '<= 3' },
  { id: '9', name: 'Chatbot phrasings (files with one)', show: ['banSites'], checks: [{ key: 'banSites', max: 0 }], text: '0' },
  { id: '10', name: 'Em dashes inside strings', show: ['emDash'], checks: [{ key: 'emDash', max: 24 }], text: '<= 24' },
]);

/** The few numbers that define the "text strings" population and the "long" threshold. */
export const DEFAULT_OPTS = {
  minLen: 14,                      // text universe: measured length >= minLen
  excludeCtx: ['import', 'type', 'jsxattr', 'case', 'compare', 'index'],
  longThreshold: 180,              // #1: strictly longer than this
};

// The audit's pattern for an era gate ("@-1925 ", "@tv,1950 "), exactly as the prototype had it. It has no ':', so
// it does not recognise the 256 "@2016,own:smartphone " lines that gateOf() in rules.mjs does. It is kept here on
// purpose: the metrics stay comparable with the PDF's audit. It is used where the prototype used it, to leave the
// gate out of the words before a colon (#6) and to see past it to a ban-list phrase (#9). On the v2.4.0 tree and
// on this one, both patterns give the same value for every metric, so nothing is lost.
const GATE_RE_AUDIT = /^@[\w!+,-]+\s+/;
const auditText = (t) => t.replace(GATE_RE_AUDIT, '');

/** Attach derived fields (static length, normalised text) to every record. */
export function prepare(records) {
  for (const r of records) {
    r.sl = r.kind === 'tmpl' ? r.parts.reduce((s, p) => s + p.length, 0) : r.text.length;
    r.n = norm(r.text);
  }
  return records;
}

/** Build the universes: `all` (every literal in scope) and `text` (the text strings among them). */
export function makeEnv(corpus, optsIn) {
  const o = { ...DEFAULT_OPTS, ...optsIn };
  prepare(corpus.records);
  const exclude = new Set(o.excludeCtx);
  const recs = corpus.records.filter((r) => r.kind !== 'jsx' && !exclude.has(r.ctx));
  const text = recs.filter((r) => r.sl >= o.minLen);
  return { o, files: corpus.files, all: recs, text };
}

// ---- helpers ----------------------------------------------------------------------------------

/** Collector: counts per file and a running total. */
function collector() {
  const perFile = new Map();
  const c = { total: 0, perFile };
  c.add = (r, n = 1) => {
    if (n <= 0) return;
    c.total += n;
    perFile.set(r.file, (perFile.get(r.file) || 0) + n);
  };
  return c;
}

const count = (s, re) => {
  const m = s.match(re);
  return m ? m.length : 0;
};

// ---- #2 helpers -------------------------------------------------------------------------------
const ERA_GLOB = /^src\/game\/events\/era-pack-(1900|1946|1980|2000)-[^/]*\.ts$/;
const ERA_DIGEST = /^src\/game\/history\/digest-(early|late)\.ts$/;
const isEraFile = (f) => ERA_GLOB.test(f) || ERA_DIGEST.test(f);

/** Nearest-rank quantile of an ascending list. */
function quantile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

/** Compute every metric for an environment. Returns collectors ({ total, perFile }) keyed by metric. */
export function computeMetrics(env) {
  const o = env.o;
  const M = {};

  // ---- #0 total, #1 long -----------------------------------------------------------------------
  {
    const c0 = collector(), c1 = collector();
    for (const r of env.text) {
      c0.add(r, 1);
      if (r.sl > o.longThreshold) c1.add(r, 1);
    }
    M.total = c0; M.long = c1;
  }
  // ---- #2 era-pack lengths -------------------------------------------------------------------------
  {
    const lens = []; const perFile = new Map();
    for (const r of env.text) {
      if (!isEraFile(r.file)) continue;
      lens.push(r.sl);
      (perFile.get(r.file) || perFile.set(r.file, []).get(r.file)).push(r.sl);
    }
    lens.sort((a, b) => a - b);
    const per = new Map();
    for (const [f, arr] of perFile) {
      arr.sort((a, b) => a - b);
      per.set(f, arr.length);
    }
    M.era = {
      n: lens.length, median: quantile(lens, 0.5), p90: quantile(lens, 0.9),
      perFile: per,
      perFileStats: new Map([...perFile].map(([f, arr]) => [f, { n: arr.length, median: quantile(arr, 0.5), p90: quantile(arr, 0.9) }])),
    };
  }
  // ---- #3 / #4 fragments -------------------------------------------------------------------------
  {
    const lead = new Set(QUALIFIER_LEADS);
    const c3 = collector(), c4 = collector();
    for (const r of env.text) {
      const w = fragmentLead(r.n);
      if (w === null) continue;
      c3.add(r, 1);
      if (lead.has(w)) c4.add(r, 1);
    }
    M.fragments = c3; M.qualifiers = c4;
  }
  // ---- #5 contraction-free negatives -------------------------------------------------------------
  {
    const c = collector();
    for (const r of env.text) c.add(r, countNegatives(r.n));
    M.negatives = c;
  }
  // ---- #6 colon joins ------------------------------------------------------------------------------
  {
    const c = collector();
    for (const r of env.text) {
      if (r.n.indexOf(':') < 0) continue;
      c.add(r, countColonJoins(auditText(r.n)));
    }
    M.colonJoins = c;
  }
  // ---- #7 Nobody / Everyone -------------------------------------------------------------------------
  {
    const cN = collector(), cE = collector();
    for (const r of env.text) {
      cN.add(r, countNobody(r.n));
      cE.add(r, countEveryone(r.n));
    }
    M.nobody = cN; M.everyone = cE;
  }
  // ---- #8 disclaimers -----------------------------------------------------------------------------
  {
    const c = collector();
    for (const r of env.all) c.add(r, countDisclaimers(r.n));
    M.disclaimers = c;
  }
  // ---- #9 chatbot ban-list -------------------------------------------------------------------------
  {
    const c = collector();
    const files = new Set();
    for (const r of env.all) {
      if (!startsWithChatbotPhrase(auditText(r.n))) continue;
      c.add(r, 1);
      files.add(r.file);
    }
    c.sites = files.size;
    M.ban = c;
  }
  // ---- #10 em dashes --------------------------------------------------------------------------------
  {
    const c = collector();
    for (const r of env.text) c.add(r, countEmDashes(r.n));
    M.emDash = c;
  }
  // ---- extras ---------------------------------------------------------------------------------------
  {
    const specs = {
      ouch: /\bOuch\b/gi, forNow: /\bfor now\./gi, mostly: /\bMostly\./g, fair: /\bFair\./gi,
      at3am: /\bat 3(?::00)?\s?a\.?m\.?/gi, walletNap: /\bneeds a (?:nap|rest|break)\b/gi,
    };
    for (const [k, re] of Object.entries(specs)) {
      const c = collector();
      for (const r of env.all) c.add(r, count(r.n, re));
      M[k] = c;
    }
  }
  return M;
}

// ---------------------------------------------------------------------------------------------
// PART 5  Rows and targets
// ---------------------------------------------------------------------------------------------

/** One row per number. `group` says which top-files list the row shares. */
export function rowSpecs(o = DEFAULT_OPTS) {
  const lenDef = 'measured length = decoded characters of static text, each ${..} hole counting 0';
  const textDef = `"text strings" = string/template literals with measured length >= ${o.minLen} (${lenDef})`;
  const excl = o.excludeCtx.length ? `; excluded contexts: ${o.excludeCtx.join(', ')}` : '; no context excluded';
  return [
    { id: '0', key: 'total', name: 'Total string literals', audit: AUDIT.total, group: 'total', listName: 'Total string literals (text strings per file)',
      def: `${textDef}${excl}.` },
    { id: '1', key: 'long', name: 'Strings longer than 180 characters', audit: AUDIT.long, group: 'long',
      def: `text strings with measured length > ${o.longThreshold}. (The PDF also asks that none of those left be narrative; a script cannot judge that.)` },
    { id: '2a', key: 'eraMedian', name: 'Era-pack string length, median', audit: AUDIT.eraMedian, group: 'era', listName: 'Era-pack string length (files ranked by number of text strings in them)',
      def: 'text strings in era-pack-{1900,1946,1980,2000}-*.ts + history/digest-early.ts + digest-late.ts; nearest-rank median of measured length.' },
    { id: '2b', key: 'eraP90', name: 'Era-pack string length, p90', audit: AUDIT.eraP90, group: 'era', noList: true, def: 'same population, 90th percentile.' },
    { id: '3', key: 'fragments', name: 'Fragment punchlines', audit: AUDIT.fragments, group: 'fragments',
      def: 'text strings that END with: sentence end [.!?], whitespace, then 1-3 words (first Capitalised, the rest lower case) closed by a period, e.g. "... five days. Mostly." (curly quotes straightened, one count per string).' },
    { id: '4', key: 'qualifiers', name: "'. Especially/Including/Twice... X.' shape", audit: AUDIT.qualifiers, group: 'qualifiers',
      def: `fragment punchlines (#3) whose first word is one of ${QUALIFIER_LEADS.join(', ')}.` },
    { id: '5', key: 'negatives', name: 'Contraction-free negatives', audit: AUDIT.negatives, group: 'negatives',
      def: `occurrences in text strings of: ${NEG_PHRASES.join(', ')} (whole words, case-insensitive).` },
    { id: '5b', key: 'negKids', name: '  ...of which in era-pack-1900-kids.ts', audit: AUDIT.negativesKids1900, group: 'negatives', noList: true, def: 'same definition restricted to src/game/events/era-pack-1900-kids.ts.' },
    { id: '6', key: 'colonJoins', name: 'Mid-sentence colon joins', audit: AUDIT.colonJoins, group: 'colonJoins',
      def: 'occurrences of ": " in text strings where the sentence-local text before it has >= 3 words, the text after it (to the next sentence end) has >= 3 words, and it is not followed by a digit/currency symbol (prices, times). Short labels ("Note:", "Cost: $40") fall out.' },
    { id: '7a', key: 'nobody', name: "'Nobody' as sentence subject", audit: AUDIT.nobody, group: 'nobody',
      def: 'occurrences of the whole word "nobody" (case-insensitive, includes "nobody\'s") in text strings.' },
    { id: '7b', key: 'everyone', name: "'Everyone' as sentence subject", audit: AUDIT.everyone, group: 'everyone',
      def: 'occurrences of the whole word "everyone" (case-insensitive) in text strings.' },
    { id: '7c', key: 'both', name: "'Nobody' + 'Everyone' combined (~900)", audit: AUDIT.nobody + AUDIT.everyone, group: 'nobodyEveryone', def: 'sum of 7a and 7b.' },
    { id: '8', key: 'disclaimers', name: 'Disclaimer words in UI text', audit: AUDIT.disclaimers, group: 'disclaimers',
      def: `occurrences of ${DISCLAIMER_WORDS.join(' / ')} (case-insensitive) in every literal (no length floor) under src/ (the game has no separate UI-string table, so "in-game UI strings" = all strings).` },
    { id: '9a', key: 'banRaw', name: 'Chatbot ban-list, raw hits', audit: AUDIT.banRaw, group: 'ban', listName: 'Chatbot ban-list (raw hits per file; sites = files with a hit)',
      def: "ALL literals that START with one of: Dear <x>, here's what | Good call | Look at you | You matter | honestly? | Note that | Consider | You might want to | Feel free | Let's | Welcome to ...! (case-sensitive, after an optional era @tag and opening quote)." },
    { id: '9b', key: 'banSites', name: 'Chatbot ban-list, sites', audit: AUDIT.banSites, group: 'ban', noList: true, def: 'distinct files containing at least one raw hit.' },
    { id: '10', key: 'emDash', name: 'Em dashes inside strings', audit: AUDIT.emDash, group: 'emDash',
      def: 'U+2014 characters inside text strings.' },
    { id: 'x1', key: 'ouch', name: "extra: 'Ouch'", audit: AUDIT.ouch, group: 'ouch', def: 'whole word "ouch" (case-insensitive) in any literal.' },
    { id: 'x2', key: 'forNow', name: "extra: 'For now.'", audit: AUDIT.forNow, group: 'forNow', def: '"for now." (case-insensitive) in any literal.' },
    { id: 'x3', key: 'mostly', name: "extra: 'Mostly.'", audit: AUDIT.mostly, group: 'mostly', def: '"Mostly." (case-sensitive) in any literal.' },
    { id: 'x4', key: 'fair', name: "extra: 'Fair.'", audit: AUDIT.fair, group: 'fair', def: '"Fair." (case-insensitive) in any literal.' },
    { id: 'x5', key: 'at3am', name: "extra: 'at 3 AM'", audit: AUDIT.at3am, group: 'at3am', def: '"at 3 AM" in any spelling (3 am, 3 a.m., 3:00 AM) in any literal.' },
    { id: 'x6', key: 'walletNap', name: "extra: 'your wallet needs a nap' shape", audit: AUDIT.walletNap, group: 'walletNap',
      def: 'the joke shape "needs a nap|rest|break" in any literal (the literal sentence "Your wallet needs a nap." occurs once).' },
  ];
}

const merge = (...maps) => { const m = new Map(); for (const x of maps) for (const [k, v] of x) m.set(k, (m.get(k) || 0) + v); return m; };

/** Flatten computeMetrics() output into { key: value } plus { group: perFile Map }. */
export function flatten(M) {
  const kids = 'src/game/events/era-pack-1900-kids.ts';
  const values = {
    total: M.total.total, long: M.long.total, eraMedian: M.era.median, eraP90: M.era.p90,
    fragments: M.fragments.total, qualifiers: M.qualifiers.total, negatives: M.negatives.total,
    negKids: M.negatives.perFile.get(kids) || 0, colonJoins: M.colonJoins.total,
    nobody: M.nobody.total, everyone: M.everyone.total, both: M.nobody.total + M.everyone.total,
    disclaimers: M.disclaimers.total, banRaw: M.ban.total, banSites: M.ban.sites, emDash: M.emDash.total,
    ouch: M.ouch.total, forNow: M.forNow.total, mostly: M.mostly.total, fair: M.fair.total, at3am: M.at3am.total, walletNap: M.walletNap.total,
  };
  const groups = {
    total: M.total.perFile, long: M.long.perFile, era: M.era.perFile, fragments: M.fragments.perFile, qualifiers: M.qualifiers.perFile,
    negatives: M.negatives.perFile, colonJoins: M.colonJoins.perFile, nobody: M.nobody.perFile, everyone: M.everyone.perFile, nobodyEveryone: merge(M.nobody.perFile, M.everyone.perFile),
    disclaimers: M.disclaimers.perFile, ban: M.ban.perFile, emDash: M.emDash.perFile,
    ouch: M.ouch.perFile, forNow: M.forNow.perFile, mostly: M.mostly.perFile, fair: M.fair.perFile, at3am: M.at3am.perFile, walletNap: M.walletNap.perFile,
  };
  return { values, groups };
}

/**
 * The ten rows of the PDF's A7 table against a set of values: { count, missed, rows }, each row
 * { id, name, keys, audit, now, target, status } with audit and now as lists (the era row has two numbers).
 */
export function evaluateTargets(values) {
  const auditOf = Object.fromEntries(rowSpecs().map((r) => [r.key, r.audit]));
  const rows = TARGETS.map((t) => {
    const met = t.checks.every((c) => (c.below !== undefined ? values[c.key] < c.below : values[c.key] <= c.max));
    return {
      id: t.id, name: t.name, keys: [...t.show], audit: t.show.map((k) => auditOf[k]), now: t.show.map((k) => values[k]),
      target: t.text, status: met ? 'met' : 'missed',
    };
  });
  return { count: rows.length, missed: rows.filter((r) => r.status === 'missed').length, rows };
}

/** Per-file table: { file: { text, long, fragments, ... } } for files with any non-zero cell. */
export function perFileTable(env, M) {
  const cols = {
    text: new Map(), long: M.long.perFile, fragments: M.fragments.perFile, qualifiers: M.qualifiers.perFile, negatives: M.negatives.perFile,
    colonJoins: M.colonJoins.perFile, nobody: M.nobody.perFile, everyone: M.everyone.perFile, disclaimers: M.disclaimers.perFile,
    banRaw: M.ban.perFile, emDash: M.emDash.perFile,
  };
  for (const r of env.text) cols.text.set(r.file, (cols.text.get(r.file) || 0) + 1);
  const table = {};
  for (const f of env.files) {
    const row = {}; let any = false;
    for (const [k, m] of Object.entries(cols)) { row[k] = m.get(f) || 0; if (row[k]) any = true; }
    if (any) table[f] = row;
  }
  if (M.era.perFile.size) for (const [f, st] of M.era.perFileStats) if (table[f]) { table[f].eraMedian = st.median; table[f].eraP90 = st.p90; }
  return table;
}
