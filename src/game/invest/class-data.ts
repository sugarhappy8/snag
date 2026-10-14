// The share classes real companies had, by year. Data only: nothing here reads state or g.rng, and
// the module imports no runtime code (only the RealCo type), so the Stocks screen and the tests can
// ask it anything at any time.
//
// Each entry is keyed by the registry id of the company (data/brands-stocks.ts: 'stock-<home>-<slug>')
// and says what the line the player trades is (`main`) and what other classes the company had:
// letter, label, votes a share (1 is an ordinary vote), whether the class is listed too, who holds it,
// and the first and last year it existed. `from` is never before the company's listing year.
//
// Rules for the table:
// - A row is entered from a public source named in the comment above its entry (a filing, an annual
//   report, the company's own investor page). A row that no source could date is left out, not guessed.
// - `from` is the first year the class and its terms are documented, which can be later than the year
//   the class was created. A class that is not documented for a year simply isn't shown for it.
// - `votes` is votes for an equal slice of the company's equity, so a class with a different unit
//   (Berkshire's Class B is 1/1,500 of a Class A share) is put on the same footing.
// - `note`, when present, is shown in place of the generated sentence.
// - Left out on purpose: loyalty voting (LVMH, L'Oreal), dual-listed pairs (Shell, Unilever), A/H
//   shares (BYD), and companies whose structure is not confirmed here (Roche, Novo Nordisk, Maersk).
import type { RealCo } from './real'

export interface ClassRow {
  /** One capital letter. The line of this class is `<company id>~<letter>`. */
  letter: string
  label: string
  /** Votes a share against 1 for an ordinary vote. */
  votes: number
  listed: boolean
  holder?: string
  /** Replaces the generated sentence. */
  note?: string
  /** First year it exists. */
  from: number
  /** Last year it exists (it is still there in this year). */
  to?: number
}

export interface ClassEntry {
  /** Registry id, 'stock-us-alphabet'. */
  id: string
  main: { label: string; votes: number }
  rows: ClassRow[]
}

function row(letter: string, label: string, votes: number, listed: boolean, from: number, more: { holder?: string; note?: string; to?: number } = {}): ClassRow {
  return { letter, label, votes, listed, from, ...more }
}

export const CLASS_ENTRIES: readonly ClassEntry[] = [
  // Alphabet. Alphabet Form 10-K 2025 (risk factors; stockholders' equity note): Class A one vote, Class B ten votes, Class C no
  // voting rights; Larry Page and Sergey Brin hold about 89% of Class B. Class B has existed since the 2004 IPO (Google S-1, 2004). Class C was paid as a
  // stock dividend on 2 April 2014 and listed on Nasdaq on 3 April 2014 (Google Form 10-K 2014).
  { id: 'stock-us-alphabet', main: { label: 'Class A', votes: 1 }, rows: [row('B', 'Class B', 10, false, 2004, { holder: 'the founders' }), row('C', 'Class C', 0, true, 2014)] },
  // Meta Platforms. Meta Form 10-K 2025 (Class B ten votes, Class A one vote; Class B holders include the founder, chairman and CEO);
  // Facebook Form S-1, February 2012 (dual-class from the May 2012 IPO).
  { id: 'stock-us-meta-platforms', main: { label: 'Class A', votes: 1 }, rows: [row('B', 'Class B', 10, false, 2012, { holder: 'the founder and other holders' })] },
  // Berkshire Hathaway. Form 10-K 1996 (Class B sold in a public offering on 8 May 1996, listed on the NYSE; one-thirtieth of the
  // economic rights and one-two-hundredth of a vote of a Class A share) and Form 10-K 2025 (after the 50-for-1 split of 2010: 1/1,500
  // of the economics, 1/10,000 of the vote). Both ratios give 0.15 of a Class A vote for the same slice of the company.
  { id: 'stock-us-berkshire-hathaway', main: { label: 'Class A', votes: 1 }, rows: [row('B', 'Class B', 0.15, true, 1996, { note: 'Class B is listed too. For the same slice of the company it carries 0.15 of a Class A vote.' })] },
  // Ford. Form 10-K 2025, Note 8: Common Stock holds 60% of the general voting power and Class B Stock, held by the Ford family,
  // enough votes a share to make up the other 40%. That is about 37 a share on the 2025 counts (3,919m Common, 70.9m Class B), and
  // it changes with the counts, so the note carries the fact. The 40% dates from the 1956 public offering (The Henry Ford, "Ford
  // Motor Company Stockholders and Stock, 1903-1956").
  { id: 'stock-us-ford-motor-company', main: { label: 'Common', votes: 1 }, rows: [row('B', 'Class B', 37, false, 1956, { holder: 'the Ford family', note: 'Class B, held by the Ford family, carries 40% of the votes.' })] },
  // Rogers Communications. Notice of shareholder meeting and circular filed with the SEC in 2006: each Class A Voting share is
  // entitled to 50 votes, Class B Non-Voting shares cannot vote; Class B trades on the TSX and the NYSE, Class A on the TSX.
  // Documented from 2006.
  { id: 'stock-ca-rogers-communications', main: { label: 'Class B', votes: 0 }, rows: [row('A', 'Class A', 50, true, 2006)] },
  // Shopify. Form F-1, April 2015: Class A subordinate voting shares one vote, Class B multiple voting shares ten votes, Class B
  // held by the founder and other early holders (Form 13G, 2016).
  { id: 'stock-ca-shopify', main: { label: 'Class A', votes: 1 }, rows: [row('B', 'Class B', 10, false, 2015, { holder: 'the founder and other early holders' })] },
  // Volkswagen. Volkswagen Group investor FAQ: preference shares introduced in September 1986 in a DM 300 million capital increase;
  // preference shares have no vote and a priority dividend; both classes are listed.
  { id: 'stock-de-volkswagen', main: { label: 'Ordinary', votes: 1 }, rows: [row('P', 'Preference', 0, true, 1986)] },
  // BMW. BMW press release of 30 June 2026 (the preferred shares were converted into ordinary shares and stopped trading that day)
  // and BMW's FAQ on the conversion (non-voting preferred shares, with a dividend premium of 2 cents, issued in employee share
  // programs since 1989). 1989 is the first year documented there, not necessarily the year the class was created.
  { id: 'stock-de-bmw', main: { label: 'Ordinary', votes: 1 }, rows: [row('P', 'Preference', 0, true, 1989, { to: 2026 })] },
  // Porsche. Porsche AG IPO, September 2022: the listed shares are the non-voting preference shares; the ordinary shares are not
  // listed and stay with Porsche SE and the Volkswagen group.
  { id: 'stock-de-porsche', main: { label: 'Preference', votes: 0 }, rows: [row('O', 'Ordinary', 1, false, 2022, { holder: 'Porsche SE and the VW group' })] },
  // Henkel. Henkel annual report 2025 and investor pages: the preferred shares were listed on 2 October 1985 and the ordinary shares
  // were admitted to trading on 2 July 1996. Only ordinary shares vote. Shown from 1996, when the ordinary line exists to be traded.
  { id: 'stock-de-henkel', main: { label: 'Ordinary', votes: 1 }, rows: [row('P', 'Preference', 0, true, 1996)] },
  // Richemont. Richemont investor pages (capital structure; share history): the unlisted B shares, formerly twinned units, existed
  // beside the A units listed in 1988; B shares carry half the votes and about a tenth of the capital.
  { id: 'stock-ch-richemont', main: { label: 'Class A', votes: 1 }, rows: [row('B', 'Class B', 1, false, 1988, { holder: 'the Rupert family', note: 'Class B, held by the Rupert family, carries half the votes with a tenth of the capital.' })] },
  // Ericsson. Form 20-F 2004: since the extraordinary general meeting of 31 August 2004 each Class A share carries one vote and each
  // Class B share one tenth of a vote (before that, one thousandth); both trade on Nasdaq Stockholm.
  { id: 'stock-se-ericsson', main: { label: 'Class B', votes: 0.1 }, rows: [row('A', 'Class A', 1, true, 2004)] },
  // Volvo. Form 20-F 2002 (filed June 2003) and later: each A share one vote, each B share one tenth of a vote; A and B trade on
  // the Stockholm exchange.
  { id: 'stock-se-volvo', main: { label: 'Class B', votes: 0.1 }, rows: [row('A', 'Class A', 1, true, 2002)] },
  // H&M. H&M corporate governance report 2014 and 2025: A shares ten votes, B shares one vote, all A shares held by the Persson
  // family since the 1974 listing; only B shares are listed. Documented from 2014.
  { id: 'stock-se-handm', main: { label: 'Class B', votes: 1 }, rows: [row('A', 'Class A', 10, false, 2014, { holder: 'the Persson family' })] },
  // Electrolux. Electrolux annual report 2009, note 20 and the share capital report: an A share one vote, a B share one tenth of a
  // vote; A and B trade on Nasdaq Stockholm. Documented from 2009.
  { id: 'stock-se-electrolux', main: { label: 'Class B', votes: 0.1 }, rows: [row('A', 'Class A', 1, true, 2009)] },
  // Kone. Minutes of the 2012 annual general meeting: a Class A share one vote, ten Class B shares one vote; only Class B trades.
  { id: 'stock-fi-kone', main: { label: 'Class B', votes: 0.1 }, rows: [row('A', 'Class A', 1, false, 2012)] },
  // Samsung Electronics. Samsung's GDR prospectus of 10 February 2025: depositary receipts of the preferred shares have traded since
  // 21 May 1991; Articles of Incorporation: preferred shares are non-voting.
  { id: 'stock-kr-samsung-electronics', main: { label: 'Common', votes: 1 }, rows: [row('P', 'Preferred', 0, true, 1991)] },
  // Hyundai Motor. Korean press (MTN News, 6 March 2024): the first preferred share (005385) was issued in 1988, the later
  // 2nd and 3rd preferred shares in 1998-99; none vote.
  { id: 'stock-kr-hyundai-motor', main: { label: 'Common', votes: 1 }, rows: [row('P', 'Preferred', 0, true, 1988)] },
  // Tata Motors. Tata Motors disclosures: 'A' ordinary shares (DVR) issued from 2008 with one tenth of the voting rights of an
  // ordinary share; the scheme to cancel them for ordinary shares was approved in 2023-24 and the DVR shares were delisted on 30
  // August 2024.
  { id: 'stock-in-tata-motors', main: { label: 'Ordinary', votes: 1 }, rows: [row('D', 'DVR', 0.1, true, 2008, { to: 2024 })] },
  // Xiaomi. Listing documents, July 2018 (first Hong Kong listing with weighted voting rights): each Class A share ten votes, each
  // Class B share one vote; Class A held by Lei Jun and Lin Bin.
  { id: 'stock-hk-xiaomi', main: { label: 'Class B', votes: 1 }, rows: [row('A', 'Class A', 10, false, 2018, { holder: 'the founders' })] },
  // Meituan. Annual report 2019, HKEX: each Class A share ten votes, each Class B share one vote; the weighted-voting
  // beneficiaries are Wang Xing, Mu Rongjun and Wang Huiwen; the Class B shares listed in September 2018.
  { id: 'stock-hk-meituan', main: { label: 'Class B', votes: 1 }, rows: [row('A', 'Class A', 10, false, 2018, { holder: 'the founders' })] },
]

const BY_ID: ReadonlyMap<string, ClassEntry> = new Map(CLASS_ENTRIES.map((e) => [e.id, e]))

/** The entry of a registry company, or undefined when the company has no recorded classes. */
export function classEntryFor(co: Pick<RealCo, 'id'>): ClassEntry | undefined {
  return typeof co.id === 'string' ? BY_ID.get(co.id) : undefined
}

/** The rows open in `year`: `from <= year` and, when it has one, `year <= to`. A year that is not a number opens none. */
export function classRowsIn(co: Pick<RealCo, 'id'>, year: number): ClassRow[] {
  const entry = classEntryFor(co)
  if (!entry || !Number.isFinite(year)) return []
  return entry.rows.filter((r) => r.from <= year && (r.to === undefined || year <= r.to))
}

function amount(v: number): string {
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/** Votes a share in words. A value that is not a positive number reads as no vote. */
export function votesText(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return 'no vote'
  if (v === 1) return '1 vote a share'
  if (Math.abs(v - 0.1) < 1e-9) return 'a tenth of a vote a share'
  if (v < 1) return `${amount(v)} of a vote a share`
  return `${amount(v)} votes a share`
}

/** The "Share classes" line on a company's Stocks screen, or null when no extra class is open in `year`. */
export function classFacts(co: Pick<RealCo, 'id'>, year: number): string | null {
  const entry = classEntryFor(co)
  const rows = classRowsIn(co, year)
  if (!entry || !rows.length) return null
  let text = `Share classes: ${entry.main.label} (this line) has ${votesText(entry.main.votes)}.`
  for (const r of rows) text += ` ${r.note ?? `${r.label} has ${votesText(r.votes)}${r.holder ? `, held by ${r.holder}` : ''}${r.listed ? ' and is listed too' : ''}.`}`
  return text
}
