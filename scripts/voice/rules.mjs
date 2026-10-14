// rules.mjs - the voice rules of docs/VOICE.md as pure functions over one piece of text.
//
// Three things live here: the word lists and length limits of the guide, the predicates that say whether a
// text breaks a rule, and unitFlags(), which runs all of them on one text. The A7 report (metrics.mjs)
// counts with the same predicates, so a flag and a metric can never disagree about what counts, and the
// rewrite tools (voice-batch) use the flags to pick texts and the lists to refuse a rewrite.
//
// Conventions
//   * Editable text is a string with its leading era gate split off: gateOf() does that, and unitFlags()
//     does it for you. The predicates below do not look for a gate.
//   * A hole is written "${...}" (the corpus) or "{{0}}" (a batch unit). Every function treats both alike.
//   * Patterns that mention a quote or an apostrophe run on norm(text): curly quotes straightened and no-break
//     spaces made plain. The others (words, \s, \b) see the same text either way.
//   * Everything is pure: no I/O, no state.

// ---------------------------------------------------------------------------------------------
// Word lists and limits (docs/VOICE.md lists the same words; a test keeps the two in step)
// ---------------------------------------------------------------------------------------------

/**
 * Phrases banned anywhere in new text: the A3 chatbot phrasings and the eulogy stock. Three entries end in
 * a space on purpose, so that "Consider " and "Let's " and "Welcome to " do not match "Considerable",
 * "Let's." and "Welcome tomorrow". Matching is case-sensitive.
 */
export const BANNED_ANYWHERE = Object.freeze([
  "here's what", 'Good call', 'Look at you', 'You matter', 'honestly?', 'Note that', 'Consider ',
  'You might want to', 'Feel free', "Let's ", 'Welcome to ', 'remarkable years', 'taken far too soon',
  'well-earned retirement', 'ripe old age', 'dearly missed', 'lived it his own way',
  'lived it her own way', 'lived it their own way',
]);

/** The A2 stock words: banned as a one-word verdict or tail ("... Mostly."), fine as ordinary words. */
export const STOCK_VERDICTS = Object.freeze([
  'Ouch', 'Classic', 'Mostly', 'Worth it', 'Barely', 'Fair', 'Still', 'Yet', 'For now', 'Nice', 'Honestly',
  'Apparently', 'Allegedly', 'Yes really', 'needs a nap', 'at 3 AM', 'Nobody noticed', 'What could possibly go wrong',
]);

/** Words that tend to arrive with a replacement (the tool warns about them, it does not refuse them). */
export const TELLS = Object.freeze(['quietly', 'somehow', 'suddenly', 'a sense of']);

/** The words a line must not end on: if a line ends on a feeling, cut that sentence. */
export const FEELING_WORDS = Object.freeze([
  'proud', 'happy', 'sad', 'relieved', 'magical', 'wonderful', 'special', 'lonely', 'safe', 'free', 'alive',
  'loved', 'grateful', 'sorry', 'scared', 'nervous', 'excited', 'hopeful', 'homesick', 'perfect', 'complete', 'whole',
]);

/** Hard caps, in characters of static text (a hole counts 0). Roles without a number are capped by the tool at the original's length. */
export const LIMITS = Object.freeze({ log: 90, scene: 140, outcome: 120, tooltip: 120, digest: 110 });

/** Where rewrites aim: lower than the caps. */
export const AIMS = Object.freeze({ log: 60, scene: 110, outcome: 100, tooltip: 100, digest: 100 });

/** Every flag unitFlags can raise, in the order it reports them. */
export const FLAG_NAMES = Object.freeze([
  'over-cap', 'over-aim', 'long', 'no-contraction', 'colon-join', 'punchline', 'qualifier', 'nobody', 'everyone',
  'disclaimer', 'chatbot', 'stock', 'tell', 'list-of-three', 'feeling-end', 'em-dash',
]);

/** The A7 definition of a "long" string: strictly more static characters than this. */
const LONG_LENGTH = 180;

/** The first words of a fragment punchline that make it the ". Especially/Including/Twice... X." shape (A7 #4). */
export const QUALIFIER_LEADS = Object.freeze(['Especially', 'Including', 'Twice', 'Mostly', 'Probably']);

/** The contraction-free negatives of A7 #5. */
export const NEG_PHRASES = Object.freeze([
  'did not', 'was not', 'is not', 'cannot', 'were not', 'do not', 'does not', 'had not', 'would not', 'could not', 'have not', 'has not',
]);

/** The disclaimer words of A7 #8. */
export const DISCLAIMER_WORDS = Object.freeze(['fictional', 'simulated', 'abstract', 'not guaranteed']);

// ---------------------------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------------------------

/** Curly quotes straightened and no-break spaces made plain: the text every pattern below runs on. */
export function norm(text) {
  if (!/[\u2018\u2019\u201b\u201c\u201d\u201f\u00a0]/.test(text)) return text;
  return text.replace(/[\u2018\u2019\u201b]/g, "'").replace(/[\u201c\u201d\u201f]/g, '"').replace(/\u00a0/g, ' ');
}

const count = (s, re) => {
  const m = s.match(re);
  return m ? m.length : 0;
};
const words = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);
/** A regex alternation of phrases: special characters escaped, a space matching any run of white space. */
const alternation = (list) => list.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|');

// Era gates. Two patterns on purpose:
//   GATE_RE is the real grammar. A gate is "@" and then word characters and ! + , - : up to white space:
//   "@-1925 ", "@tv,1950 ", "@!smartphone ", "@+internet ", "@1998,own:mobilePhone ". The colon is in the
//   "own:" gates (256 lines in src/ today); era-late-kit.ts reads them with the same character class.
//   gateOf() uses it, so the rewrite tools never put an editable character into a gate or the other way round.
//   The A7 metrics use the audit's own pattern instead (GATE_RE_AUDIT in metrics.mjs, the prototype's, with no
//   colon), so that every number stays comparable with the PDF's audit.
const GATE_RE = /^@[\w!+,:-]+\s+/;

/** Splits a leading era gate (the tag and the white space after it) off a text; tag is '' when there is none. */
export function gateOf(text) {
  const m = GATE_RE.exec(text);
  return m ? { tag: m[0], rest: text.slice(m[0].length) } : { tag: '', rest: text };
}

/** Static characters: every character except the holes, "${...}" and "{{0}}", which count 0. A gate counts (split it off first). */
export function staticLength(text) {
  return text.replace(/\$\{\.\.\.\}|\{\{\d+\}\}/g, '').length;
}

// ---------------------------------------------------------------------------------------------
// Predicates. The definitions are the A7 audit's, written out in metrics.mjs.
// ---------------------------------------------------------------------------------------------

// Contraction-free negatives (A7 #5): the twelve phrases as whole words, any case, any white space between.
const NEG_RE = new RegExp(`\\b(?:${alternation(NEG_PHRASES)})\\b`, 'gi');

/** How many contraction-free negatives the text holds ("did not", "cannot", ...). */
export function countNegatives(text) {
  return count(text, NEG_RE);
}

export function hasUncontractedNegative(text) {
  return countNegatives(text) > 0;
}

// Mid-sentence colon joins (A7 #6). For every ': ' (colon and white space) in the text:
//   before = the words since the previous sentence boundary (". ", "! ", "? ", a line break, or the start)
//   after  = the words up to the next sentence boundary
// it is a join when before has 3 or more words, after has 3 or more words, and what follows the colon does
// not start with a digit or a currency sign (prices, times, scores). Short labels ("Cost: $40") fall out.
const COLON_MIN_BEFORE = 3;
const COLON_MIN_AFTER = 3;

/** How many colon joins the text holds. Expects text without its era gate. */
export function countColonJoins(text) {
  const s = norm(text);
  let n = 0;
  const re = /:\s/g;
  let m;
  while ((m = re.exec(s))) {
    const before = s.slice(0, m.index);
    const cut = Math.max(before.lastIndexOf('. '), before.lastIndexOf('! '), before.lastIndexOf('? '), before.lastIndexOf('\n'));
    if (words(before.slice(cut + 1)) < COLON_MIN_BEFORE) continue;
    const after = s.slice(m.index + 2);
    if (/^[$\u00a3\u20ac\u00a5]?\s?\d/.test(after)) continue;
    const end = after.search(/[.!?]\s|\n/);
    if (words(end < 0 ? after : after.slice(0, end)) < COLON_MIN_AFTER) continue;
    n++;
  }
  return n;
}

export function hasColonJoin(text) {
  return countColonJoins(text) > 0;
}

// Fragment punchlines (A7 #3): "... five days. Mostly." A sentence end, white space, then 1 to 3 words (the first
// Capitalised, the rest lower case) closed by a period, and then the end of the text (optionally a closing
// quote or bracket). One count per text.
const FRAGMENT_WORDS = 3;
const FRAGMENT_RE = new RegExp(`[.!?]["')]?\\s+([A-Z][a-z'-]*)((?:\\s+[a-z'-]+){0,${FRAGMENT_WORDS - 1}})\\.["')]?\\s*$`);

/** The first word of the fragment punchline that closes the text ("Mostly" for "It works. Mostly."), or null. */
export function fragmentLead(text) {
  const m = norm(text).match(FRAGMENT_RE);
  return m ? m[1] : null;
}

export function isPunchlineFragment(text) {
  return fragmentLead(text) !== null;
}

// "Nobody" and "Everyone" (A7 #7): the whole word anywhere in the text, any case ("Nobody's" counts).
const NOBODY_RE = /\bNobody\b/gi;
const EVERYONE_RE = /\bEveryone\b/gi;

export function countNobody(text) {
  return count(text, NOBODY_RE);
}

export function countEveryone(text) {
  return count(text, EVERYONE_RE);
}

// Disclaimer words (A7 #8): fictional, simulated, abstract, "not guaranteed", any case.
const DISCLAIMER_RE = new RegExp(alternation(DISCLAIMER_WORDS), 'gi');

export function countDisclaimers(text) {
  return count(text, DISCLAIMER_RE);
}

// The chatbot ban list (A7 #9, the A3 phrasings): the text STARTS with one of these, after an optional opening
// quote or bracket, case-sensitive. ("Consider" has no word boundary here, as in the audit.)
const CHATBOT_PHRASES = [
  "Dear [^,]{1,60}, here's what", 'Good call', 'Look at you', 'You matter', 'honestly\\?', 'Note that', 'Consider',
  'You might want to', 'Feel free', "Let's", 'Welcome to (?:\\$\\{\\.\\.\\.\\}|[^!.\\n])*!',
];
const CHATBOT_START_RE = new RegExp(`^["'(]?(?:${CHATBOT_PHRASES.join('|')})`);

/** Does the text open with a chatbot phrasing? Expects text without its era gate. */
export function startsWithChatbotPhrase(text) {
  return CHATBOT_START_RE.test(norm(text));
}

/** How many em-dashes (U+2014) the text holds. */
export function countEmDashes(text) {
  return count(text, /\u2014/g);
}

// ---- predicates that only the flags use (the report has no metric for them) -------------------------------

// Tells (VOICE.md): words that a replacement tends to bring in.
const TELL_RE = new RegExp(`\\b(?:${alternation(TELLS)})\\b`, 'i');

export function hasTell(text) {
  return TELL_RE.test(text);
}

// A list of three: three short items (1 to 4 words each) joined by commas and a last "and" or "or":
// "smoke, soap and wet wool", "read one line, and fell asleep". Lists with no conjunction ("red, green, blue")
// and lists of more than three that end in a different shape are out of reach of a pattern: this is a warning, not a gate.
const LIST_ITEM = "[\\w'%$-]+(?:\\s+[\\w'%$-]+){0,3}";
const LIST_OF_THREE_RE = new RegExp(`${LIST_ITEM},\\s+${LIST_ITEM},?\\s+(?:and|or)\\s+${LIST_ITEM}`, 'i');

export function hasListOfThree(text) {
  // Holes and {tokens} stand for one word each.
  return LIST_OF_THREE_RE.test(norm(text).replace(/\$\{[^}]*\}|\{\{\d+\}\}|\{\w+\}/g, 'X'));
}

// A line must not end on a feeling: the last word (through closing punctuation, quotes and brackets) is one of
// FEELING_WORDS, as a word of its own ("unhappy" and "freedom" do not count).
const FEELING_END_RE = new RegExp(`(?:^|[^\\w-])(?:${FEELING_WORDS.join('|')})[\\s.!?\\u2026"')\\]]*$`, 'i');

export function endsWithFeeling(text) {
  return FEELING_END_RE.test(norm(text));
}

// Stock verdicts (A2). A stock word is banned as a one-word verdict or tail, not as an ordinary word, so a
// sentence has to BE the word: "Mostly." "Worth it." "For now." "Ouch!" -- anywhere in the text, so that
// "Ouch. That hurt." and "It works. Mostly." both count while "Still life" and "Not yet." do not. The joke
// phrases are banned wherever they appear: "needs a nap", "at 3 AM" (3 am, 3:00 a.m., ...), "Nobody noticed",
// "What could possibly go wrong", "Yes really".
const VERDICT_SET = new Set(STOCK_VERDICTS.map((v) => v.toLowerCase()));
const STOCK_PHRASE_RE = /\b(?:needs a nap|nobody noticed|what could possibly go wrong|yes really)\b|\bat 3(?::00)?\s?a\.?m\b/i;
const SENTENCE_SPLIT_RE = /(?<=[.!?\u2026]["')\]]*)\s+|\n+/;

export function isStockVerdict(text) {
  const t = norm(text);
  if (STOCK_PHRASE_RE.test(t)) return true;
  for (const sentence of t.split(SENTENCE_SPLIT_RE)) {
    const bare = sentence.replace(/^[\s"'(\[]+/, '').replace(/[\s.!?\u2026"')\]]+$/, '').toLowerCase();
    if (VERDICT_SET.has(bare)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// unitFlags
// ---------------------------------------------------------------------------------------------

/**
 * Which rules a text breaks, as flag names in FLAG_NAMES order. `role` is the kind of text (log, scene,
 * outcome, tooltip, digest, title, label or text): over-cap and over-aim apply to the roles that have a
 * number in LIMITS and AIMS, the other flags to every role. The text may start with an era gate: the flags
 * judge what is left of it.
 */
export function unitFlags(text, role) {
  const t = gateOf(text).rest;
  const length = staticLength(t);
  const hit = new Set();
  if (Object.hasOwn(LIMITS, role) && length > LIMITS[role]) hit.add('over-cap');
  if (Object.hasOwn(AIMS, role) && length > AIMS[role]) hit.add('over-aim');
  if (length > LONG_LENGTH) hit.add('long');
  if (hasUncontractedNegative(t)) hit.add('no-contraction');
  if (hasColonJoin(t)) hit.add('colon-join');
  const lead = fragmentLead(t);
  if (lead !== null) {
    hit.add('punchline');
    if (QUALIFIER_LEADS.includes(lead)) hit.add('qualifier');
  }
  if (countNobody(t) > 0) hit.add('nobody');
  if (countEveryone(t) > 0) hit.add('everyone');
  if (countDisclaimers(t) > 0) hit.add('disclaimer');
  if (startsWithChatbotPhrase(t)) hit.add('chatbot');
  if (isStockVerdict(t)) hit.add('stock');
  if (hasTell(t)) hit.add('tell');
  if (hasListOfThree(t)) hit.add('list-of-three');
  if (endsWithFeeling(t)) hit.add('feeling-end');
  if (countEmDashes(t) > 0) hit.add('em-dash');
  return FLAG_NAMES.filter((flag) => hit.has(flag));
}
