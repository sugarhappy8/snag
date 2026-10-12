// Banking 2.0 popups: the yearly report, bank runs, the regulator's ultimatum and a handful of
// banking events with real choices. They run after a year is booked (from the owner's report or
// the hired CEO's turn), use the game RNG only here (never in the settlement or menus), and move
// company cash only through b.cash + b.yearCosts / b.yearIncome so the next statement books it.
import { addHidden, addMoney, count, log, notice, scriptChoice, spend } from '../core'
import { arrestPlayer } from '../crime'
import { brandsFor } from '../data/brands'
import { marketOf } from '../data/markets'
import { chance, pick, rand } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent, talentHint } from '../talents'
import type { Asset, ChoiceOption, GameState, Json } from '../types'
import { getCountry, randomFirstName, randomLastName } from '../world'
import { managerName } from './career'
import { inGroup } from './conglomerate-state'
import { valuationOf } from './economy'
import { declareBankruptcy, sellBusiness } from './exit'
import { manageBlock } from './gate'
import { APPETITES, LEND_LINES, hasProduct, isBankIndustry, loanTotal, minCapitalRatio, readBank, saveBank, type Appetite, type BankBook } from './bank-state'
import { bankCapital, bankMarket, bankRank, bankTeamSkill, bestAppetite, capitalRatio, costScale, payWithdrawals, productGate, profitWords, ratioBar, riskWeighted, setupCost, techHere, type BankMarket } from './bank-model'
import { bizOf, diluteBusinessEquity, findBusiness, type BizState } from './state'
import { clampN, money, pct, rec, str } from './util'

const isAppetite = (x: string): x is Appetite => x === 'prime' || x === 'balanced' || x === 'highYield'

/** The owner is around and old enough to take a call about the bank. */
function ownerReachable(g: GameState, a: Asset): boolean {
  const c = g.character
  return c.alive && c.age >= 18 && !c.prison && !!findBusiness(g, a.id) && !manageBlock(g, a)
}

/** Company cash spent on something this year: moved now, booked in the next statement. */
function bookCost(b: BizState, amount: number): void {
  const x = Math.max(0, Math.round(amount))
  b.cash -= x; b.yearCosts += x
}
function bookIncome(b: BizState, amount: number): void {
  const x = Math.max(0, Math.round(amount))
  b.cash += x; b.yearIncome += x
}
/** Loans that turned out to be worthless leave the client book; shareholders refill the reserves. */
function removeLoans(book: BankBook, amount: number): number {
  const total = loanTotal(book), x = Math.min(total, Math.max(0, amount))
  if (x <= 0) return 0
  const k = x / total
  for (const line of LEND_LINES) book.loans[line] *= 1 - k
  book.reserves += x
  return x
}
function adjustTrust(book: BankBook, delta: number): void {
  book.trust = clampN(book.trust + delta, 0, 100)
}

// ---------------------------------------------------------------------------
// The yearly report (owner-CEO)

const REPORT = defineScript('bank.report', (g, choice, data) => {
  const a = findBusiness(g, str(rec(data)?.assetId))
  if (!a || !isAppetite(choice) || manageBlock(g, a)) return
  const b = bizOf(g, a)
  if (!isBankIndustry(b.industry) || b.ceo === 'manager') return
  const book = readBank(b)
  if (book.appetite === choice) return
  book.appetite = choice
  saveBank(b, book)
  log(g, `I switched ${a.name} to ${APPETITES[choice].label.toLowerCase()} lending.`)
})

function signed(n: number): string {
  return `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`
}

export function queueBankYearReport(g: GameState, a: Asset, b: BizState): void {
  const book = readBank(b), L = book.last
  if (!L) return
  const country = getCountry(b.countryId).name
  const capital = bankCapital(b, book), start = capital - L.profit
  const prev = book.hist.length >= 2 ? book.hist[book.hist.length - 2] : null
  const lines = [
    `${L.year}: ${L.profit >= 0 ? 'profit' : 'loss'} ${money(Math.abs(L.profit))}${start > 0 ? ` · ${pct(L.profit / start, 0)} on capital` : ''}${prev ? ` (${L.profit >= prev.profit ? '▲' : '▼'} from ${money(prev.profit)})` : ''}`,
    `Deposits ${money(L.deposits)} (${signed(L.depositFlow)}) · loans ${money(L.loans)} · bad loans ${pct(L.badRate, 1)}`,
    `Capital ${L.ratio >= 9.99 ? 'unused' : pct(L.ratio, 1)} vs ${pct(L.minRatio, 1)} minimum ${ratioBar(L.ratio, L.minRatio)} · trust ${L.trust}/100`,
    `Earned ${money(L.interest + L.bondIncome + L.fees)} · paid savers ${money(L.depositCost)} · losses ${money(L.creditLosses + L.liquidityLosses)} · costs ${money(L.costs)}`,
    `#${L.rank.toLocaleString()} of ~${L.rankOf.toLocaleString()} banks in ${country}.`,
  ]
  if (L.trading) lines.push(`Trading desk: ${signed(L.trading)}.`)
  if (L.crisis >= .5) lines.push(`💥 ${capFirst(L.crisisName || 'a banking crisis')} hit ${country}: borrowers defaulted in droves.`)
  if (L.regulator) lines.push(`⚖️ ${L.regulator}`)
  if (L.runWithdrawals > 0) lines.push(`🏃 Panicked savers pulled ${money(L.runWithdrawals)} out.`)
  lines.push(`How should ${a.name} lend next year?`)
  const choices: ChoiceOption[] = [{ id: book.appetite, label: `Keep ${APPETITES[book.appetite].label.toLowerCase()}`, emoji: '✅' }]
  for (const id of ['prime', 'balanced', 'highYield'] as const) if (id !== book.appetite) choices.push({ id, label: `${APPETITES[id].label}: ${APPETITES[id].blurb.charAt(0).toLowerCase()}${APPETITES[id].blurb.slice(1)}`, emoji: APPETITES[id].emoji })
  if (hasTalent(g, 'Business')) {
    const best = bestAppetite(g, b)
    const why = talentHint(g, 'Business', `Worth the most over the next few years in this economy (${profitWords(best.profit, money)} next year)${best.appetite === 'highYield' ? '. A downturn hits it hardest' : ''}`)
    for (const c of choices) if (c.id === best.appetite) c.hint = why
  }
  scriptChoice(g, REPORT, `${a.name}: Financial Institution Report`, lines.join('\n'), choices, { emoji: a.emoji, data: { assetId: a.id } })
}

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ---------------------------------------------------------------------------
// After the books close: runs, the regulator, dirty money and events

export function bankAfterYear(g: GameState, a: Asset, b: BizState, managed: boolean): void {
  const book = readBank(b)
  if (book.lastYear < 0 || book.dramaYear >= book.lastYear || !g.character.alive) return
  book.dramaYear = book.lastYear
  saveBank(b, book)
  const reachable = ownerReachable(g, a)
  const decides = reachable && !managed
  let popup = false
  if (book.run) {
    if (decides) { queueRun(g, a, b); popup = true } else autoRun(g, a, b)
  }
  if (readBank(b).seize) {
    if (reachable) { queueSeize(g, a, b); popup = true } else autoSeize(g, a, b)
    if (!findBusiness(g, a.id)) return
  }
  dirtyMoneyCheck(g, a, b)
  if (!findBusiness(g, a.id)) return
  if (managed) {
    const L = readBank(b).last
    if (L?.regulator) log(g, `${a.name}: ${L.regulator}`, 'bad')
    if (L && L.crisis >= .6 && L.crisisName) log(g, `${capFirst(L.crisisName)} battered ${a.name}'s loan book.`, 'bad')
  }
  if (!popup) maybeBankEvent(g, a, b, managed, reachable)
}

// --- Bank runs

/** Odds that going on TV calms the queue (the hint and the resolver share this). */
export function reassureOdds(g: GameState, b: BizState, book: BankBook): number {
  const c = g.character, m = bankMarket(g, b.countryId, g.year)
  const ratio = capitalRatio(b, book), min = minCapitalRatio(b.countryId, g.year)
  return clampN(.05 + c.stats.smarts / 400 + c.stats.looks / 500 + c.hidden.fame / 250 + book.trust / 300 + (ratio >= min ? .1 : -.15) + (m.insured > 0 ? .08 : 0) - m.crisis * .2, .05, .9)
}
function penaltyRate(m: BankMarket): number {
  return Math.max(.05, m.policy + .03)
}
/** A big bank in a crisis can ask the state for help, unless the help would have to buy nearly all of it. */
export function bailoutEligible(g: GameState, b: BizState, book: BankBook): boolean {
  const m = bankMarket(g, b.countryId, g.year), rank = bankRank(b.countryId, g.year, book.deposits)
  return m.crisis >= .4 && (rank.rank <= 10 || rank.share >= .015) && !inGroup(g, b) && b.share > .2 && bailoutTerms(g, b, book).fair <= BAILOUT_MAX_STAKE
}
const BAILOUT_MAX_STAKE = .9
/**
 * What the state puts in and the stake it takes. `fair` is the stake the money buys at the bank's
 * value; the state takes a quarter more (at least 10%), so a rescue never makes the owner richer.
 * A bank worth too little for that (fair above 90%) gets no rescue: its shareholders are wiped out.
 */
export function bailoutTerms(g: GameState, b: BizState, book: BankBook): { inject: number; stake: number; fair: number } {
  const min = minCapitalRatio(b.countryId, g.year), capital = bankCapital(b, book), rwa = riskWeighted(book, capital)
  const inject = Math.round(Math.max(0, (min + .03) * rwa - capital) + .02 * rwa)
  return { inject, ...rescueStake(b, inject, 0) }
}
/** The stake `inject` buys: fair at the lower of the booked and the live value, plus a quarter. */
function rescueStake(b: BizState, inject: number, offered: number): { stake: number; fair: number } {
  const value = Math.max(0, Math.min(b.valuation, valuationOf(b)))
  const fair = inject > 0 ? inject / Math.max(1, value + inject) : 0
  return { stake: clampN(Math.max(offered, fair * 1.25), .1, BAILOUT_MAX_STAKE), fair }
}

/** Where the owner faces the queue: on TV, on the radio, or (before either) on the bank's steps. */
function stageOf(countryId: string, year: number): { go: string; did: string; look: string } {
  if (techHere(countryId, 'tv', year)) return { go: 'Go on TV', did: 'went on TV', look: 'looked into the camera' }
  if (techHere(countryId, 'radio', year)) return { go: 'Go on the radio', did: 'went on the radio', look: 'spoke calmly into the microphone' }
  return { go: 'Stand on the bank steps', did: 'stood on the bank steps', look: 'looked the crowd in the eye' }
}

function queueRun(g: GameState, a: Asset, b: BizState): void {
  const book = readBank(b), run = book.run!, m = bankMarket(g, b.countryId, g.year)
  const wave = Math.min(run.wave, book.deposits)
  const odds = reassureOdds(g, b, book)
  const saleLoss = payWithdrawals(structuredClone(book), wave, m, true)
  const cbCost = wave * penaltyRate(m) * 1.5
  const choices: ChoiceOption[] = [{ id: 'tv', label: `${stageOf(b.countryId, g.year).go} and promise every saver is safe`, emoji: '🎤' }]
  if (m.lender) choices.push({ id: 'cb', label: `Borrow ${money(wave)} from the central bank at ${pct(penaltyRate(m), 1)}`, emoji: '💵' })
  choices.push({ id: 'sell', label: `Sell loans at a discount (about ${money(saleLoss)} lost)`, emoji: '🏷️' })
  if (bailoutEligible(g, b, book)) choices.push({ id: 'bailout', label: `Ask the government for a bailout (it takes ${pct(bailoutTerms(g, b, book).stake)} of the bank)`, emoji: '🙏' })
  if (hasTalent(g, 'Business')) {
    const cost: Record<string, number> = { tv: (1 - odds) * saleLoss, cb: m.lender ? cbCost : Infinity, sell: saleLoss }
    const best = (['cb', 'tv', 'sell'] as const).reduce((x, y) => (cost[y] < cost[x] ? y : x))
    for (const c of choices) {
      if (c.id === 'tv') c.hint = talentHint(g, 'Business', `About ${pct(odds)} to calm them; if it fails you sell loans anyway${best === 'tv' ? ' (still the cheapest bet)' : ''}`)
      else if (c.id === best) c.hint = talentHint(g, 'Business', `Cheapest way out: about ${money(cost[best])} all in`)
    }
  }
  scriptChoice(g, RUN, 'Bank Run!', `A line of worried savers stretches around the block at ${a.name}. Another ${money(wave)} could walk out the door this week.`, choices, { emoji: '🏃', data: { assetId: a.id } })
}

function fireSale(b: BizState, book: BankBook, wave: number, m: BankMarket): number {
  const loss = Math.round(payWithdrawals(book, wave, m, true))
  book.deposits -= wave
  bookCost(b, loss)
  return loss
}
function centralBankLoan(b: BizState, book: BankBook, wave: number, m: BankMarket): void {
  // The central bank lends against the loan book: company debt, and an advance into the client book.
  const rate = penaltyRate(m)
  b.debtRate = (Math.max(0, b.debt) * b.debtRate + wave * rate) / Math.max(1, b.debt + wave)
  b.debt += wave
  book.advance += wave; book.cbOwed += wave; book.deposits -= wave
}

const RUN = defineScript('bank.run', (g, choice, data) => {
  const a = findBusiness(g, str(rec(data)?.assetId))
  if (!a) return
  const b = bizOf(g, a)
  if (!isBankIndustry(b.industry)) return
  resolveRun(g, a, b, choice, false)
})

export function resolveRun(g: GameState, a: Asset, b: BizState, choice: string, auto: boolean): void {
  const book = readBank(b)
  if (!book.run) return
  const m = bankMarket(g, b.countryId, g.year), wave = Math.min(book.run.wave, book.deposits)
  book.run = null
  if (choice === 'tv' && !auto) {
    const stage = stageOf(b.countryId, g.year)
    if (chance(g, reassureOdds(g, b, book))) {
      adjustTrust(book, 10); addHidden(g, 'fame', 2)
      saveBank(b, book)
      log(g, `I ${stage.did} and talked down a run on ${a.name}.`, 'good')
      notice(g, 'Panic Over', `You ${stage.look} and promised every saver was safe. People believed you. The queue melted away by lunchtime.`, { emoji: '🎤', tone: 'good' })
      return
    }
    const loss = fireSale(b, book, wave, m)
    adjustTrust(book, -8)
    saveBank(b, book)
    log(g, `I ${stage.did}, but it didn't stop the run on ${a.name}.`, 'bad')
    notice(g, 'It Got Worse', `${techHere(b.countryId, 'internet', g.year) ? 'Your nervous blinking went viral.' : 'Your nervous stammer made every evening paper.'} Savers pulled ${money(wave)} and ${a.name} sold loans at a loss of ${money(loss)} to pay them.`, { emoji: '📉', tone: 'bad' })
    return
  }
  if (choice === 'bailout' && !auto && bailoutEligible(g, b, book)) {
    const t = bailoutTerms(g, b, book)
    b.share = clampN(b.share * (1 - t.stake), .01, 1)
    diluteBusinessEquity(b, 1 - t.stake)
    b.cash += t.inject
    if (m.lender) centralBankLoan(b, book, wave, m)
    else fireSale(b, book, wave, m)
    adjustTrust(book, 12); addHidden(g, 'karma', -4); addHidden(g, 'fame', 4)
    count(g, 'bankBailouts')
    saveBank(b, book)
    log(g, `The government bailed out ${a.name}.`, 'neutral')
    notice(g, 'Bailed Out', `The state put ${money(t.inject)} into ${a.name} for ${pct(t.stake)} of the bank. Savers calmed down; taxpayers did not.`, { emoji: '🏛️' })
    return
  }
  if ((choice === 'cb' || auto) && m.lender) {
    centralBankLoan(b, book, wave, m)
    adjustTrust(book, 5)
    saveBank(b, book)
    log(g, `${a.name} borrowed ${money(wave)} from the central bank to survive a run.`, 'neutral')
    if (!auto) notice(g, 'Lender of Last Resort', `The central bank lent ${money(wave)} at ${pct(penaltyRate(m), 1)}. Every saver was paid. The loan is company debt; it is repaid as cash returns.`, { emoji: '💵' })
    return
  }
  const loss = fireSale(b, book, wave, m)
  adjustTrust(book, 2)
  saveBank(b, book)
  log(g, `${a.name} sold loans at a ${money(loss)} loss to pay off panicked savers.`, 'bad')
  if (!auto) notice(g, 'Fire Sale', `${a.name} paid every saver who asked (${money(wave)}) and lost ${money(loss)} selling loans in a hurry.`, { emoji: '🏷️', tone: 'bad' })
}

function autoRun(g: GameState, a: Asset, b: BizState): void {
  resolveRun(g, a, b, 'auto', true)
}

// --- The regulator's ultimatum

export function seizeNeed(g: GameState, b: BizState, book: BankBook): number {
  const min = minCapitalRatio(b.countryId, g.year), capital = bankCapital(b, book)
  return Math.max(0, Math.round((min + .02) * riskWeighted(book, capital) - capital))
}

function queueSeize(g: GameState, a: Asset, b: BizState): void {
  const book = readBank(b), need = seizeNeed(g, b, book), min = minCapitalRatio(b.countryId, g.year)
  const choices: ChoiceOption[] = []
  if (g.character.money >= need) choices.push({ id: 'inject', label: `Put in ${money(need)} of my own money`, emoji: '💰' })
  if (b.valuation > need * .5 && b.share > .2) choices.push({ id: 'investors', label: `Sell a stake to investors for ${money(Math.round(need * 1.1))}`, emoji: '🤝' })
  choices.push({ id: 'seize', label: 'Let the regulators take it', emoji: '🏛️' })
  scriptChoice(g, SEIZE, 'The Regulators Are Here', `${a.name}'s capital is ${pct(Math.max(0, capitalRatio(b, book)), 1)} against a ${pct(min, 1)} minimum. Regulators will seize the bank unless ${money(need)} of fresh capital arrives.`, choices, { emoji: '⚖️', data: { assetId: a.id } })
}

const SEIZE = defineScript('bank.regulator', (g, choice, data) => {
  const a = findBusiness(g, str(rec(data)?.assetId))
  if (!a) return
  const b = bizOf(g, a)
  if (!isBankIndustry(b.industry)) return
  resolveSeize(g, a, b, choice)
})

function recapitalized(b: BizState, book: BankBook): void {
  book.seize = false; book.strikes = 0
  adjustTrust(book, 3)
  saveBank(b, book)
}

export function resolveSeize(g: GameState, a: Asset, b: BizState, choice: string): void {
  const book = readBank(b)
  if (!book.seize) return
  const need = seizeNeed(g, b, book)
  if (need <= 0) { recapitalized(b, book); return }
  if (choice === 'inject' && g.character.money >= need) {
    addMoney(g, -need)
    b.cash += need; b.invested += need
    recapitalized(b, book)
    log(g, `I put ${money(need)} into ${a.name} to keep the regulators away.`, 'neutral')
    notice(g, 'Recapitalized', `${money(need)} of your money went into ${a.name}. The examiners packed up their boxes.`, { emoji: '💰' })
    return
  }
  if (choice === 'investors' && b.valuation > need * .5 && b.share > .2) {
    const inject = Math.round(need * 1.1), stake = clampN(inject / (b.valuation + inject), .05, .75)
    b.share = clampN(b.share * (1 - stake), .01, 1)
    diluteBusinessEquity(b, 1 - stake)
    b.cash += inject
    recapitalized(b, book)
    log(g, `I sold ${pct(stake)} of ${a.name} to investors to satisfy the regulators.`, 'neutral')
    notice(g, 'Fresh Capital', `Investors put ${money(inject)} into ${a.name} for ${pct(stake)} of it. You now own ${pct(b.share)}.`, { emoji: '🤝' })
    return
  }
  count(g, 'banksSeized')
  declareBankruptcy(g, a, b, `Regulators seized ${a.name} and moved its savers to a healthier bank.`)
}

function autoSeize(g: GameState, a: Asset, b: BizState): void {
  const book = readBank(b)
  resolveSeize(g, a, b, b.valuation > seizeNeed(g, b, book) * .5 && b.share > .2 ? 'investors' : 'seize')
}

// --- Dirty money catches up

function dirtyMoneyCheck(g: GameState, a: Asset, b: BizState): void {
  const book = readBank(b)
  if (book.heat <= 0) return
  if (chance(g, book.heat / 250)) {
    const fine = Math.round(Math.max(200_000 * costScale(b.countryId), Math.max(0, bankCapital(b, book)) * .1))
    bookCost(b, fine)
    adjustTrust(book, -30); book.heat = 0
    saveBank(b, book)
    log(g, `Investigators traced dirty money through ${a.name}.`, 'bad')
    notice(g, 'Follow the Money', `Investigators traced criminal cash through ${a.name}. The bank was fined ${money(fine)} and you were arrested.`, { emoji: '🚔', tone: 'bad' })
    arrestPlayer(g, 'money laundering', 4)
    return
  }
  book.heat = Math.max(0, book.heat - 12)
  saveBank(b, book)
}

// ---------------------------------------------------------------------------
// Events with choices

interface Ctx { g: GameState; a: Asset; b: BizState; book: BankBook; m: BankMarket; managed: boolean; reachable: boolean; d: Record<string, Json> }
interface BankEvent {
  id: string
  weight: (x: Ctx) => number
  present: (x: Ctx) => void
  resolve: (x: Ctx, choice: string) => void
}

const BORROWERS = ['Northgate Shipping', 'Kessler Mills', 'Bright Harbor Hotels', 'Orion Freight', 'Pinecrest Homes', 'Atlas Foundry', 'Silverline Motors', 'Redwood Retail', 'Bluestone Mining', 'Copperfield Farms']
const FINTECHS = ['Zappo', 'Moneyleaf', 'Pocketly', 'Swoosh', 'Nimbl', 'Kwik Bank', 'Penny Rocket']
const GANGS = ['the Velvet Syndicate', 'Los Halcones Grises', 'the Grey Lotus', 'the Black Tulip crew', 'the Marlowe brothers']

function ask(x: Ctx, ev: string, title: string, text: string, choices: ChoiceOption[], emoji: string, extra: Record<string, Json> = {}): void {
  const intro = x.managed && x.b.manager ? `${managerName(x.b.manager)}, who runs ${x.a.name} for you, needs a decision. ` : ''
  scriptChoice(x.g, EVENT, title, intro + text, choices, { emoji, data: { assetId: x.a.id, ev, ...extra } })
}
/** Purple Business hint on the choice with the lowest expected cost. */
function hintBest(g: GameState, choices: ChoiceOption[], costs: Record<string, number>, why: (id: string) => string): ChoiceOption[] {
  if (!hasTalent(g, 'Business')) return choices
  const ids = choices.map(c => c.id).filter(id => id in costs)
  if (!ids.length) return choices
  const best = ids.reduce((x, y) => (costs[y] < costs[x] ? y : x))
  return choices.map(c => (c.id === best ? { ...c, hint: talentHint(g, 'Business', why(best)) } : c))
}
const n = (d: Record<string, Json>, k: string): number => (typeof d[k] === 'number' && Number.isFinite(d[k] as number) ? d[k] as number : 0)

const EVENTS: BankEvent[] = [
  {
    id: 'fraud',
    weight: (x) => loanTotal(x.book) > 0 ? .8 + (100 - bankTeamSkill(x.g, x.b)) / 100 : 0,
    present: (x) => {
      const name = `${randomFirstName(x.g, x.b.countryId, rand(x.g) < .5 ? 'male' : 'female')} ${randomLastName(x.g, x.b.countryId)}`
      const amount = Math.round(Math.min(loanTotal(x.book), Math.max(20_000 * costScale(x.b.countryId), loanTotal(x.book) * (.004 + .01 * rand(x.g)))))
      const capital = Math.max(0, bankCapital(x.b, x.book))
      const fine = Math.round(Math.max(50_000 * costScale(x.b.countryId), capital * .02))
      const choices = hintBest(x.g, [
        { id: 'confess', label: 'Come clean and call the police', emoji: '📢' },
        { id: 'hush', label: 'Quietly write it off', emoji: '🤫' },
      ], { confess: 4, hush: .35 * 15 + fine / Math.max(1, capital) * 10 }, () => 'Come clean: a cover-up that leaks costs far more trust')
      ask(x, 'fraud', 'Fake Loans', `${name}, a loan officer at ${x.a.name}, invented borrowers and pocketed ${money(amount)}. The money is gone.`, choices, '🕵️', { amount, fine, name })
    },
    resolve: (x, choice) => {
      const amount = n(x.d, 'amount'), fine = n(x.d, 'fine')
      removeLoans(x.book, amount); bookCost(x.b, amount)
      if (choice === 'hush') {
        if (chance(x.g, .35)) {
          bookCost(x.b, fine); adjustTrust(x.book, -15)
          notice(x.g, 'Whistleblower!', `A clerk leaked the cover-up. ${x.a.name} paid a ${money(fine)} fine and the papers had a field day.`, { emoji: '📰', tone: 'bad' })
        } else log(x.g, `${x.a.name} quietly wrote off ${money(amount)} of fake loans.`, 'neutral')
        addHidden(x.g, 'karma', -3)
      } else {
        adjustTrust(x.book, -4); addHidden(x.g, 'karma', 2)
        log(x.g, `${x.a.name} reported a fraudster on its staff and lost ${money(amount)}.`, 'neutral')
      }
    },
  },
  {
    id: 'bigDefault',
    weight: (x) => loanTotal(x.book) > 0 ? .7 * (1 + x.m.crisis * 2) : 0,
    present: (x) => {
      const company = pick(x.g, BORROWERS)
      const exposure = Math.round(loanTotal(x.book) * (.02 + .03 * rand(x.g)))
      const odds = clampN(.45 + bankTeamSkill(x.g, x.b) / 400 - x.m.crisis * .3, .15, .75)
      const choices = hintBest(x.g, [
        { id: 'writeoff', label: 'Write it off now (lose about 60%)', emoji: '✂️' },
        { id: 'extend', label: `Give them time (${pct(odds)} chance they recover)`, emoji: '🔄' },
        { id: 'seize', label: 'Seize the collateral (lose about 40%, bad press)', emoji: '🏗️' },
      ], { writeoff: .6 * exposure, extend: (1 - odds) * .9 * exposure, seize: .4 * exposure + exposure * .05 }, (id) => id === 'extend' ? 'Give them time: the odds beat a sure loss' : id === 'seize' ? 'Seize the collateral: the cheapest way out' : 'Write it off: waiting is likely to cost more')
      ask(x, 'bigDefault', 'A Big Borrower Wobbles', `${company}, one of ${x.a.name}'s biggest borrowers, can't make its payments on ${money(exposure)} of loans.`, choices, '💥', { exposure, odds })
    },
    resolve: (x, choice) => {
      const exposure = Math.min(n(x.d, 'exposure'), loanTotal(x.book))
      if (choice === 'extend') {
        if (chance(x.g, n(x.d, 'odds'))) { notice(x.g, 'They Pulled Through', `The borrower recovered and paid on time. Patience paid.`, { emoji: '🔄', tone: 'good' }); return }
        removeLoans(x.book, exposure); bookCost(x.b, exposure * .9)
        notice(x.g, 'They Went Under', `The borrower collapsed anyway. ${x.a.name} lost ${money(exposure * .9)}.`, { emoji: '📉', tone: 'bad' })
        return
      }
      removeLoans(x.book, exposure)
      if (choice === 'seize') { bookCost(x.b, exposure * .4); adjustTrust(x.book, -3); log(x.g, `${x.a.name} seized a struggling borrower's assets.`, 'neutral') }
      else { bookCost(x.b, exposure * .6); log(x.g, `${x.a.name} wrote off ${money(exposure * .6)} of bad loans.`, 'bad') }
    },
  },
  {
    id: 'audit',
    weight: (x) => .5 + x.book.heat / 50 + (x.book.strikes ? 1 : 0),
    present: (x) => {
      const capital = Math.max(0, bankCapital(x.b, x.book)), scale = costScale(x.b.countryId)
      const consult = Math.round(Math.max(30_000 * scale, capital * .003)), fine = Math.round(Math.max(100_000 * scale, capital * .03))
      const bribe = Math.round(Math.max(15_000 * scale, capital * .004))
      const list: ChoiceOption[] = [
        { id: 'comply', label: `Open the books (about ${money(consult)} of consultants)`, emoji: '✅' },
        { id: 'fight', label: 'Lawyer up and fight it', emoji: '⚖️' },
      ]
      if (!x.managed && x.reachable && x.g.character.money >= bribe) list.push({ id: 'bribe', label: `Slip the lead examiner ${money(bribe)} (a crime)`, emoji: '💰' })
      const dirty = x.book.heat >= 30
      const choices = hintBest(x.g, list, { comply: consult + (dirty ? fine : 0), fight: consult * .7 + .5 * fine * 1.5 }, (id) => id === 'comply' ? 'Open the books: fighting costs more on average' : 'Fight it: opening the books will cost you a fine')
      ask(x, 'audit', 'Surprise Inspection', `Bank examiners arrive at ${x.a.name} with boxes and a long list of questions.`, choices, '🔍', { consult, fine, bribe })
    },
    resolve: (x, choice) => {
      const consult = n(x.d, 'consult'), fine = n(x.d, 'fine'), bribe = n(x.d, 'bribe')
      if (choice === 'bribe' && !x.managed && spend(x.g, bribe)) {
        addHidden(x.g, 'karma', -8)
        const caught = clampN(.3 + (100 - marketOf(x.b.countryId).corruption) / 300, .15, .8)
        if (chance(x.g, caught)) {
          bookCost(x.b, fine); adjustTrust(x.book, -20)
          notice(x.g, 'Caught on Camera', `The examiner was wearing a wire. ${x.a.name} was fined ${money(fine)} and the police want a word with you.`, { emoji: '🚨', tone: 'bad' })
          saveBank(x.b, x.book)
          arrestPlayer(x.g, 'bribing a bank examiner', 3)
          return
        }
        x.book.heat = Math.max(0, x.book.heat - 20)
        notice(x.g, 'Nothing to See Here', 'The examiner found nothing. Funny, that.', { emoji: '🤐' })
        return
      }
      if (choice === 'fight') {
        bookCost(x.b, consult * .7)
        if (chance(x.g, .5)) { x.book.heat = Math.max(0, x.book.heat - 10); notice(x.g, 'They Backed Off', `Your lawyers buried the examiners in paperwork. They went home.`, { emoji: '⚖️', tone: 'good' }); return }
        bookCost(x.b, fine * 1.5); adjustTrust(x.book, -8)
        notice(x.g, 'Bad Move', `The examiners took the fight personally. ${x.a.name} was fined ${money(fine * 1.5)}.`, { emoji: '⚖️', tone: 'bad' })
        return
      }
      bookCost(x.b, consult)
      if (x.book.heat >= 30) {
        bookCost(x.b, fine); adjustTrust(x.book, -5); x.book.heat = 0
        notice(x.g, 'They Found Something', `The examiners followed a trail of odd deposits. ${x.a.name} was fined ${money(fine)}.`, { emoji: '🔍', tone: 'bad' })
      } else {
        adjustTrust(x.book, 2)
        notice(x.g, 'Clean Bill of Health', `The examiners found tidy books and left impressed.`, { emoji: '✅', tone: 'good' })
      }
    },
  },
  {
    id: 'merger',
    weight: (x) => (!x.b.public && !inGroup(x.g, x.b) && x.reachable && x.b.valuation > 0 && x.b.share >= .5 && bankRank(x.b.countryId, x.g.year, x.book.deposits).rank > 3 && buyers(x).length ? .35 : 0),
    present: (x) => {
      const list = buyers(x)
      const buyer = pick(x.g, list.slice(0, Math.min(5, list.length)))
      const price = Math.round(x.b.valuation * (1.3 + .3 * rand(x.g)))
      const choices = hintBest(x.g, [
        { id: 'accept', label: `Sell the bank for ${money(price)}`, emoji: '✍️' },
        { id: 'counter', label: 'Ask for 15% more (they may walk)', emoji: '📈' },
        { id: 'refuse', label: 'Not for sale', emoji: '🙅' },
      ], { accept: -price, counter: -price * .5 * 1.15, refuse: -x.b.valuation }, (id) => id === 'accept' ? 'Sell: the sure price beats a 50/50 bump and today\'s value' : 'Keep it: the offer is below what the bank is worth')
      ask(x, 'merger', 'Takeover Offer', `${buyer} wants to buy ${x.a.name} for ${money(price)}, ${pct(price / Math.max(1, x.b.valuation) - 1)} above its value. Your ${pct(x.b.share)} would bring ${money(price * x.b.share)} before tax.`, choices, '🤝', { price, buyer })
    },
    resolve: (x, choice) => {
      const price = n(x.d, 'price'), buyer = str(x.d.buyer, 'A larger bank')
      if (choice === 'accept') { saveBank(x.b, x.book); sellBusiness(x.g, x.a, x.b, price, buyer); return }
      if (choice === 'counter') {
        if (chance(x.g, .5)) { saveBank(x.b, x.book); sellBusiness(x.g, x.a, x.b, Math.round(price * 1.15), buyer); return }
        notice(x.g, 'They Walked', `${buyer} said no thanks and found another target.`, { emoji: '🚶' })
        return
      }
      log(x.g, `I turned down ${buyer}'s offer for ${x.a.name}.`, 'neutral')
    },
  },
  {
    id: 'fintech',
    weight: (x) => (x.g.year >= 2012 || (x.b.industry === 'onlineBank' && x.g.year >= 2000)) ? .6 : 0,
    present: (x) => {
      const rival = pick(x.g, FINTECHS)
      const appOk = !hasProduct(x.book, 'app') && productGate(x.b, x.book, 'app', x.g.year).ok
      const appCost = Math.round(setupCost(x.b, x.book, 'app') * .7)
      const list: ChoiceOption[] = []
      if (appOk && x.b.cash >= appCost) list.push({ id: 'app', label: `Build our own app (${money(appCost)})`, emoji: '📱' })
      list.push({ id: 'match', label: 'Pay savers 0.5% more', emoji: '💸' }, { id: 'ignore', label: 'Ignore them', emoji: '🙄' })
      ask(x, 'fintech', 'A Shiny New Rival', `${rival}, a${techHere(x.b.countryId, 'smartphone', x.g.year) ? 'n app-only' : ' slick web-only'} bank with a cartoon mascot, is poaching ${x.a.name}'s younger customers with zero fees.`, list, '📲', { appCost })
    },
    resolve: (x, choice) => {
      if (choice === 'app' && !hasProduct(x.book, 'app') && productGate(x.b, x.book, 'app', x.g.year).ok && x.b.cash >= n(x.d, 'appCost')) {
        bookCost(x.b, n(x.d, 'appCost')); x.book.products.app = x.g.year
        log(x.g, `${x.a.name} launched its own banking app.`, 'good')
        return
      }
      if (choice === 'match') { x.book.savingsGap = clampN(x.book.savingsGap + .005, -.03, .03); log(x.g, `${x.a.name} raised its savings rate to fight off a fintech.`, 'neutral'); return }
      x.book.shock = .88
      log(x.g, `${x.a.name} shrugged off a new fintech rival.`, 'neutral')
    },
  },
  {
    id: 'cyber',
    weight: (x) => ((x.b.industry === 'onlineBank' || hasProduct(x.book, 'app')) && x.g.year >= 1998 && techHere(x.b.countryId, 'internet', x.g.year) ? .5 + (x.b.industry === 'onlineBank' ? .3 : 0) : 0),
    present: (x) => {
      const ransom = Math.round(Math.max(50_000 * costScale(x.b.countryId), x.book.deposits * .0015)), restore = Math.round(ransom * .6)
      const choices = hintBest(x.g, [
        { id: 'pay', label: `Pay the ransom (${money(ransom)})`, emoji: '💰' },
        { id: 'restore', label: `Restore from backups (${money(restore)}, a week offline)`, emoji: '🛠️' },
      ], { pay: ransom + .25 * x.book.deposits * .002, restore: restore + x.book.deposits * .002 }, (id) => id === 'pay' ? 'Pay: a week offline would cost more' : 'Restore: paying crooks is the pricier bet')
      ask(x, 'cyber', techHere(x.b.countryId, 'crypto', x.g.year) ? 'Ransomware!' : 'Hackers!', `Hackers locked ${x.a.name}'s systems and want ${money(ransom)} ${techHere(x.b.countryId, 'crypto', x.g.year) ? 'in crypto' : 'wired to an offshore account'} by Friday.`, choices, '💻', { ransom, restore })
    },
    resolve: (x, choice) => {
      if (choice === 'pay') {
        bookCost(x.b, n(x.d, 'ransom'))
        if (chance(x.g, .25)) { adjustTrust(x.book, -8); notice(x.g, 'They Leaked It Anyway', 'The hackers took the money and dumped customer data online.', { emoji: '💻', tone: 'bad' }) }
        else adjustTrust(x.book, -1)
        return
      }
      bookCost(x.b, n(x.d, 'restore')); adjustTrust(x.book, -4); x.book.shock = .93
      log(x.g, `${x.a.name} spent a week offline after a hack.`, 'bad')
    },
  },
  {
    id: 'launder',
    weight: (x) => (!x.managed && x.reachable ? .25 * clampN(marketOf(x.b.countryId).corruption / 50, .3, 2) : 0),
    present: (x) => {
      const gang = pick(x.g, GANGS)
      const amount = Math.round(Math.max(1_000_000 * costScale(x.b.countryId), x.book.deposits * .02)), fee = Math.round(amount * .05)
      const list: ChoiceOption[] = [
        { id: 'report', label: 'Call the police', emoji: '📞' },
        { id: 'take', label: `Take it and the ${money(fee)} fee (a crime)`, emoji: '💼' },
        { id: 'decline', label: 'Show him the door', emoji: '🚪' },
      ]
      const hint = talentHint(x.g, 'Business', `Dirty money: about ${pct(45 / 250)} a year that investigators trace it, for years`)
      ask(x, 'launder', 'A Suitcase of Questions', `A smiling man from ${gang} wants to deposit ${money(amount)} in cash, no questions asked. He'll pay ${money(fee)} for the favor.`, hint ? list.map(c => (c.id === 'take' ? { ...c, hint } : c)) : list, '🧳', { amount, fee })
    },
    resolve: (x, choice) => {
      if (choice === 'take') {
        const amount = n(x.d, 'amount')
        x.book.deposits += amount; x.book.reserves += amount
        bookIncome(x.b, n(x.d, 'fee'))
        x.book.heat = clampN(x.book.heat + 45, 0, 100)
        addHidden(x.g, 'karma', -12); addHidden(x.g, 'notoriety', 5)
        notice(x.g, 'Deposited', 'The money is in. So is a new kind of fear every time someone knocks.', { emoji: '🧳' })
        return
      }
      if (choice === 'report') {
        addHidden(x.g, 'karma', 5); adjustTrust(x.book, 2)
        if (chance(x.g, .15)) {
          const cost = Math.round(20_000 * costScale(x.b.countryId))
          bookCost(x.b, cost)
          notice(x.g, 'A Message', `Someone smashed every window at ${x.a.name}'s main branch. Repairs: ${money(cost)}.`, { emoji: '🧱', tone: 'bad' })
        } else log(x.g, `I reported a money launderer to the police.`, 'good')
        return
      }
      log(x.g, `I turned away a suspicious deposit at ${x.a.name}.`, 'neutral')
    },
  },
  {
    id: 'tbtf',
    weight: (x) => (x.m.crisis >= .5 && x.reachable && !inGroup(x.g, x.b) && x.b.share > .2 && bankRank(x.b.countryId, x.g.year, x.book.deposits).rank <= 10
      && capitalRatio(x.b, x.book) < minCapitalRatio(x.b.countryId, x.g.year) + .03 && bailoutTerms(x.g, x.b, x.book).fair <= BAILOUT_MAX_STAKE ? 4 : 0),
    present: (x) => {
      const t = bailoutTerms(x.g, x.b, x.book)
      const choices = hintBest(x.g, [
        { id: 'accept', label: `Take ${money(t.inject)} for ${pct(t.stake)} of the bank`, emoji: '🤝' },
        { id: 'refuse', label: "We'll manage on our own", emoji: '🙅' },
      ], { accept: 0, refuse: capitalRatio(x.b, x.book) < minCapitalRatio(x.b.countryId, x.g.year) ? 1 : -1 }, (id) => id === 'accept' ? 'Take it: below the minimum, the regulator is the alternative' : 'Refuse: the bank is above the minimum without help')
      ask(x, 'tbtf', 'Too Big to Fail', `The finance minister calls: ${x.a.name} is too big to fail. The state offers ${money(t.inject)} of capital for ${pct(t.stake)} of the bank, and limits on bonuses.`, choices, '🏛️', { inject: t.inject, stake: t.stake })
    },
    resolve: (x, choice) => {
      if (choice !== 'accept') { adjustTrust(x.book, -4); log(x.g, `I turned down a government rescue for ${x.a.name}.`, 'neutral'); return }
      // The offer holds only while it is still at least fair to the state (the popup's numbers may be stale).
      const inject = Math.max(0, n(x.d, 'inject')), terms = rescueStake(x.b, inject, n(x.d, 'stake'))
      if (inject <= 0 || terms.fair > BAILOUT_MAX_STAKE) { notice(x.g, 'Offer Withdrawn', `The minister ran the numbers again and hung up. ${x.a.name} is on its own.`, { emoji: '🏛️', tone: 'bad' }); return }
      const stake = terms.stake
      x.b.share = clampN(x.b.share * (1 - stake), .01, 1)
      diluteBusinessEquity(x.b, 1 - stake)
      x.b.cash += inject
      adjustTrust(x.book, 10); addHidden(x.g, 'karma', -3); addHidden(x.g, 'fame', 3)
      count(x.g, 'bankBailouts')
      log(x.g, `The state took ${pct(stake)} of ${x.a.name} in a rescue.`, 'neutral')
    },
  },
]

function buyers(x: Ctx): string[] {
  return brandsFor(x.g, 'bank', { countryId: x.b.countryId, year: x.g.year }).map(br => br.name)
}

const EVENT = defineScript('bank.event', (g, choice, data) => {
  const d = rec(data)
  const a = findBusiness(g, str(d?.assetId))
  if (!a || !d) return
  const ev = EVENTS.find(e => e.id === str(d.ev))
  const b = bizOf(g, a)
  if (!ev || !isBankIndustry(b.industry)) return
  const book = readBank(b)
  const x: Ctx = { g, a, b, book, m: bankMarket(g, b.countryId, g.year), managed: b.ceo === 'manager', reachable: ownerReachable(g, a), d }
  ev.resolve(x, choice)
  if (findBusiness(g, a.id)) saveBank(b, x.book)
})

/** At most one banking event a year, each with a long cooldown. */
function maybeBankEvent(g: GameState, a: Asset, b: BizState, managed: boolean, reachable: boolean): void {
  if (!reachable || !chance(g, managed ? .18 : .32)) return
  const book = readBank(b)
  const x: Ctx = { g, a, b, book, m: bankMarket(g, b.countryId, g.year), managed, reachable, d: {} }
  const options = EVENTS.filter(e => (book.cool[e.id] ?? -99) <= g.year - 6 && e.weight(x) > 0)
  if (!options.length) return
  const total = options.reduce((s, e) => s + e.weight(x), 0)
  let roll = rand(g) * total
  const ev = options.find(e => (roll -= e.weight(x)) < 0) ?? options[options.length - 1]
  book.cool[ev.id] = g.year
  saveBank(b, book)
  b.lastEvent = Math.max(b.lastEvent, g.year - 1)
  ev.present({ ...x, book })
}

/** Present one event now (tests and debugging; the yearly roll uses maybeBankEvent). */
export function forceBankEvent(g: GameState, a: Asset, b: BizState, id: string, managed = false): boolean {
  const ev = EVENTS.find(e => e.id === id)
  if (!ev) return false
  const book = readBank(b)
  const x: Ctx = { g, a, b, book, m: bankMarket(g, b.countryId, g.year), managed, reachable: ownerReachable(g, a), d: {} }
  if (ev.weight(x) <= 0) return false
  ev.present(x)
  return true
}

/** Script ids, exported for tests. */
export const BANK_SCRIPTS = { REPORT, RUN, SEIZE, EVENT }
export const BANK_EVENT_IDS = EVENTS.map(e => e.id)
