// The event pools of R2-P10 (E.T3 d): the lines that read the same on every telling, now with variants. They live in the text
// kit because two guards meet here: test/text-pick.test.ts keeps `defineLines` out of every src file outside src/game/text/,
// and test/text-lines.test.ts lints each pool as a registered one (its id is the memory key, so a pool keeps its history when
// the code around it moves). The sites import a pool and re-export it, so a test can still take it from the module it speaks
// through. A leaf: it imports only the registry. Every line is judged by the voice guide in test/text-lines.test.ts.
import { defineLines } from './registry'

/**
 * The Games and the World Cup keep their rhythm after the calendar runs out, and a life reads one line a year, so each edition
 * reads its own words: the lines go round by edition (a pure function of the year, no draw), so two editions in a row never
 * read the same and a line is back only after the other seven. Eight lines, not three: the headline of a year is the top of
 * the year's news, so a life sees about half the editions, and with three lines the 13-life probe repeated them 27 times
 * (12 with eight). Every line names the Olympics or the World Cup, which is how test/history.test.ts tells the rhythm lines
 * from the pool of one-off futures.
 */
export const GAMES_HEADLINES = defineLines('news.games', [
  'The Summer Olympics open',
  'The Olympics open and the world tunes in',
  'Athletes arrive for the Summer Olympics',
  'The Olympics light their flame in a new host city',
  'A new host city welcomes the Summer Olympics',
  'Crowds pack the stands as the Olympics begin',
  'The Summer Olympics start with a full stadium',
  'The Olympics return and every medal is up for grabs',
])
export const WORLD_CUP_HEADLINES = defineLines('news.worldCup', [
  'The World Cup kicks off',
  'The World Cup returns and fans pack the streets',
  'Fans fill the stadiums as the World Cup starts',
  'The World Cup begins and the world picks a side',
  'Flags go up in the streets as the World Cup begins',
  'Another World Cup opens with the stands full',
  'The World Cup starts and the bars fill up',
  'Teams take the field as the World Cup gets going',
])

/** The log line for setting boundaries with someone who keeps asking: {who} is "my sister Marit". R2-P10 (E.T3 d). */
export const BOUNDARY_LINES = defineLines('wealth.boundary', [
  'I set money boundaries with {who}.',
  'I told {who} I was done talking about money.',
  'I said no to {who} and meant it.',
  'I drew a line with {who} about money.',
  'Money was off the table with {who} for a while.',
  "I told {who} that money wasn't up for discussion.",
  "I made it clear to {who} that I wouldn't talk money.",
  'I stood my ground with {who} about money.',
  "I turned down {who} and didn't budge.",
])

/** The log line for money sent to a stranger's "opportunity". R2-P10 (E.T3 d): one template read the same on every loss. */
export const SCAM_LINES = defineLines('wealth.scam', [
  'I lost {money} to a scam.',
  'The {money} I sent was gone for good.',
  'I got scammed out of {money}.',
  'A scam cost me {money} and I never saw it again.',
])
/** The log line for the gifts an admirer took before leaving. */
export const ADMIRER_LINES = defineLines('wealth.admirer', [
  'I spent {money} on an admirer who left when the gifts stopped.',
  'An admirer took {money} in gifts and then vanished.',
  'I paid {money} for an admirer who was never serious.',
  'My admirer cost me {money} and then stopped calling.',
])

/**
 * The yearly pro season line. Four frames, every one true in a first season and after a trade (nothing says "still" or "again"),
 * so a career reads in different words; {stats} is the sport's own sentence (seasonStats). R2-P10, E.T3 d.
 */
export const PRO_SEASON_LINES = defineLines('athlete.proSeason', [
  'I played my {nth} pro season with the {team}. {stats}',
  'That was my {nth} pro season, this one with the {team}. {stats}',
  'My {nth} year as a pro was with the {team}. {stats}',
  'My {nth} pro season is in the books, with the {team}. {stats}',
  'I got through my {nth} year as a pro with the {team}. {stats}',
  'The {team} had me for my {nth} pro season. {stats}',
  'I spent my {nth} pro season in the {team} colors. {stats}',
  'I closed out my {nth} season as a pro with the {team}. {stats}',
])

/** The milestone text of a promotion: what the saved history keeps, and the first of the log's words for it. */
export const PROMOTED = 'earned a promotion and higher pay'
/** The milestone text of a home bought on a mortgage: what the saved history keeps, and the first of the log's words for it. */
export const HOME_BOUGHT = 'bought a home with savings and a mortgage; repayments now compete with other spending'
/** The log's words for it (R3-Q13): a person can buy a second home within a few years, and the log said it the same way; the history keeps HOME_BOUGHT. */
export const HOME_BOUGHT_LINES = defineLines('npc.homeBought', [
  'bought a home and took on a mortgage',
  'moved into a home of their own, with a mortgage to carry',
  'bought a place and took on the payments',
  'got a mortgage and a front door of their own',
  'put savings and a loan into a home',
])

/** The log's words for a promotion (R2-P10, E.T3 d): a person is promoted several times in a life and the log said it the same way each time. The saved history keeps PROMOTED whatever the log says. */
export const PROMO_LINES = defineLines('npc.promotion', [
  PROMOTED,
  'moved up at work and got a raise',
  'was promoted and paid more',
  'got a step up at work and better pay',
  'landed a better role and a raise',
  'was given more to do and more to take home',
  'won a bigger job at the same company',
  'got the title they had been chasing',
  'was moved up and paid for it',
  'stepped into a better position at work',
  'earned the raise that came with a new title',
  'was picked for a senior role',
])

/**
 * Lines that used to be one sentence every time the thing happened (R3-Q13: the same line never twice within 10 years). A pool has as
 * many wordings as a life is likely to need, and every wording is true whoever it is about, so the bag deals them all before it starts
 * again. The slots are what the call site fills; the lint in test/text-lines.test.ts holds each pool to them.
 */

/** A contract renewed, for an athlete, an esports pro or a musician: {who} is "the Lions" or a label. */
export const RESIGN_LINES = defineLines('career.resign', [
  'I re-signed with {who}.',
  'I put my name on a new contract with {who}.',
  '{who} kept me on and I signed again.',
  'I signed another deal with {who}.',
  'I stayed with {who} on a fresh contract.',
  'The contract with {who} was renewed, and I signed it.',
])

/** A sponsor that kept an endorsement going: {brand}. */
export const ENDORSE_RENEWED_LINES = defineLines('sports.endorseRenewed', [
  '{brand} renewed my endorsement deal.',
  '{brand} kept me on as their face for another stretch.',
  'I signed on with {brand} for another round of endorsements.',
  '{brand} liked the numbers and extended my deal.',
  'My endorsement deal with {brand} was extended.',
  '{brand} wasn\'t ready to let me go and renewed the deal.',
])

/** An idea the notebook had no room for (a genius child with a full notebook). */
export const NOTEBOOK_FULL_LINES = defineLines('workshop.notebookFull', [
  'A brilliant idea struck, but my notebook was full.',
  'I had a great idea and nowhere to write it down.',
  'An idea came to me and slipped off before I found a page.',
  'My notebook had no room, so a good idea went unwritten.',
  'I thought of something clever, but the notebook was full.',
  'A fine idea turned up and found no page to land on.',
])

/** A friend or relative who lent money got cold: {who} is "my brother Juan". */
export const AVOIDING_LINES = defineLines('wealth.avoiding', [
  '{who} has been avoiding me ever since I lent the money.',
  '{who} stopped picking up the phone once the loan was made.',
  'Ever since the loan, {who} has found reasons not to see me.',
  '{who} crosses the street now that I lent the money.',
  'The money I lent has put a chill between {who} and me.',
  '{who} has kept away since the loan.',
])

/** A request turned down: {who} is "my sister Malak", {what} is what was asked for. */
export const REFUSED_LINES = defineLines('wealth.refused', [
  'I said no when {who} asked me for {what}.',
  'I turned {who} down when they asked for {what}.',
  '{who} asked me for {what}, and I said no.',
  'I told {who} no about {what}.',
  'I wouldn\'t give {who} {what}, and I said so.',
  'When {who} asked for {what}, I declined.',
  'I held my wallet shut when {who} asked me for {what}.',
  'I wasn\'t willing to pay for {what}, and I told {who}.',
])

/** Money handed over: {who} is "my friend Rolando", {money}, {what} is the reason ("dinner"). */
export const GAVE_LINES = defineLines('wealth.gave', [
  'I gave {who} {money} for {what}.',
  'I handed {who} {money} for {what}.',
  'I sent {who} {money} for {what}.',
  'I came through for {who} with {money} for {what}.',
  'I gave {who} {money} to help with {what}.',
  'I wrote {who} a check for {money} for {what}.',
  'I covered {what} for {who} with {money}.',
  'I paid {who} {money} toward {what}.',
  '{who} got {money} from me for {what}.',
  'I helped {who} out with {money} for {what}.',
])

/** A venture or tip that lost it all: {what} is "a chain of drive-in theaters", {money}. */
export const VENTURE_LOST_LINES = defineLines('wealth.ventureLost', [
  '{what} went under. The {money} I put in went with it.',
  '{what} folded, and the {money} I put in was gone.',
  'I lost the {money} I put into {what}.',
  '{what} failed, and I never saw the {money} again.',
  'The {money} I put into {what} went down with it.',
])

/** A night of bombs the player came through. */
export const AIR_RAID_LINES = defineLines('history.airRaid', [
  'I survived an air raid.',
  'The sirens went off and I came through the raid.',
  'I sat out an air raid and walked away from it.',
  'Bombs fell near us, and I made it through the night.',
  'I got through another raid with my life.',
])

/** A child the doctor could not cure this year: {who} is "mother", {label} the condition. */
export const CHILD_UNCURED_LINES = defineLines('health.childUncured', [
  'My {who} took me in for {label}, but the treatment failed.',
  'My {who} took me to the doctor for {label} again, in vain.',
  'My {who} kept taking me to the doctor for {label}.',
  'The treatment for {label} did nothing, and my {who} worried.',
  'My {who} tried a new doctor for {label}, to no avail.',
  'The medicine for {label} failed, and my {who} sat up with me.',
])

/** A year on the street. More than 12 lines on purpose: a bigger pool is not a bag but a window, and never repeats one of its last 6 lines, which at one line every 3 years is 18 years. */
export const HOMELESS_LINES = defineLines('finance.homeless', [
  'I spent another year sleeping on park benches.',
  'I lived on the streets this year.',
  'I couch-surfed all year and slept in a friend\'s car.',
  'I was homeless all year.',
  'I knew every shelter in town by name.',
  'I spent the year carrying everything I owned in two bags.',
  'I learned which doorways stayed dry when it rained.',
  'I counted the nights until a bed turned up, and lost count.',
  'I washed up in public restrooms and kept moving.',
  'I got by on soup lines and the kindness of a few strangers.',
  'I slept in the cold with my coat for a blanket.',
  'I stayed one step ahead of the next move-along order.',
  'I found a bench the police ignored and called it home.',
  'I kept my few things in a locker and my head down.',
  'I asked strangers for the time just to hear a voice.',
])

/** Money lent: {who} is "my sister Fatima", {money}, {what} is the reason ("help with rent"). */
export const LENT_LINES = defineLines('wealth.lent', [
  'I lent {who} {money} for {what}.',
  'I loaned {who} {money} for {what}.',
  'I let {who} borrow {money} for {what}.',
  'I fronted {who} {money} for {what}.',
  '{who} borrowed {money} from me for {what}.',
  'I put {money} in {who}\'s hands as a loan for {what}.',
])

/** A gift to a cause: {money}, {charity} is its name. */
export const DONATED_LINES = defineLines('charity.donated', [
  'I donated {money} to {charity}.',
  'I gave {money} to {charity}.',
  'I sent {money} to {charity}.',
  '{charity} got {money} from me.',
  'I put {money} into the work of {charity}.',
  'I backed {charity} with {money}.',
  'I wrote {charity} a check for {money}.',
  'I pledged {money} to {charity} and paid it.',
])

// R4-E10a (D.4): the log lines of the favor acts (society/favor.ts). Each names the person, so a favor reads as someone's. {who} is
// "my friend Kay" (the one who was asked), {third} the person the word was put in with, {whom} the relative the peace is made with.
// A line never opens on a slot, because {who} starts with "my". The acts pick a line with their own roll (their plan is pure).
/** A favor done: {who}. */
export const FAVOR_DONE_LINES = defineLines('social.favorDone', [
  'I asked {who} for a favor and got it.',
  'I called in a favor with {who}, and it was done.',
  'When I asked, {who} came through.',
  'I turned to {who} for a favor and got what I needed.',
])
/** A favor refused: {who}. */
export const FAVOR_REFUSED_LINES = defineLines('social.favorRefused', [
  'I asked {who} for a favor. The answer was no.',
  'When I asked for help, {who} said no.',
  "I asked {who} for a hand and didn't get one.",
  "This time {who} couldn't help me.",
])
/** A word put in for the player: {who} spoke up with {third}. */
export const VOUCH_LINES = defineLines('social.vouch', [
  'I had {who} put in a word for me with {third}.',
  'I asked {who} to speak up for me with {third}.',
  'With {third}, {who} vouched for me.',
  'I got {who} to vouch for me to {third}.',
])
/** A peace brokered: {who} went between the player and {whom}. */
export const BROKER_LINES = defineLines('social.broker', [
  'I asked {who} to speak for me to {whom}.',
  'I sent word to {whom} through {who}.',
  'Through {who}, I put out a hand to {whom}.',
  'I had {who} talk to {whom} on my behalf.',
])

// R4-E10b (D.4, X24): the log lines of a loan between people (society/loan.ts, society/debt.ts). Each names the person. {who} is "my friend Kay"
// (the lender), {money} the sum. A line never opens on a slot, because {who} starts with "my".
/** A loan taken: {money}, {who}. */
export const DEBT_BORROW_LINES = defineLines('social.borrow', [
  'I borrowed {money} from {who}.',
  'I took a loan of {money} from {who}.',
  'I asked {who} for {money} and got it.',
  'I left with {money} that {who} lent me.',
])
/** A payment on a loan, or the last of it: {money}, {who}. */
export const DEBT_REPAY_LINES = defineLines('social.repay', [
  'I paid {who} back {money}.',
  'I sent {money} to {who} for the loan.',
  'I put {money} toward the loan from {who}.',
  'I counted out {money} for {who}, as agreed.',
])
/** A year with nothing paid: {who}. */
export const DEBT_DEFAULT_LINES = defineLines('social.default', [
  'I had nothing to pay {who} this year.',
  'I missed my payment to {who}.',
  'The loan from {who} went unpaid this year.',
  'A year went by and I paid {who} nothing.',
])

// R4-E11 (D.4, X27): the line of a secret that gets out (society/secret.ts). {who} is "my sister Fatima" (the holder who told) and {whom} the
// first person told ("my friend Kay"), so a leak names two people. A line never opens on a slot, because both start with "my". Said in the life
// log for each leak, and as the notice `Word Got Around` once in a few years (the kin family `leak`).
/** A secret gets out: {who} told {whom}. */
export const LEAK_LINES = defineLines('social.leak', [
  'Word got around. {who} told {whom}, and it went on from there.',
  'It got out. {who} had told {whom} what I kept quiet.',
  'I heard that {who} let it slip to {whom}.',
  'What I kept quiet is out now. {who} told {whom}.',
])

/** A close relative loses a spouse: {who} is "my sister Fatima", {spouse} is the first name of the one who died. Said once, on a stamped life (R4-L4). */
export const KIN_WIDOWED = defineLines('life.kinWidowed', [
  '{spouse} died this year, and {who} is on their own now.',
  'This year {who} lost their spouse, {spouse}.',
  '{spouse}, {who}\'s spouse, died this year.',
  'This year {who} buried {spouse}.',
  'This year {who} was widowed when {spouse} died.',
  'I got word that {spouse} died, leaving {who} widowed.',
])

// R4-E13 (D.4): a key person lured away by a rival at the year's end (business/staff-loyalty.ts). {who} is the full name, {role} the
// title and {company} the company's name, so a loss reads as someone's. Each line holds all three slots.
/** A key person poached: {who}, {role}, {company}. Said once for each person, on a stamped life. */
export const STAFF_POACHED_LINES = defineLines('business.staffPoached', [
  'A rival lured {who}, our {role}, away from {company}.',
  "{who} took a rival's offer. {company} lost its {role}.",
  'A competitor hired {who} away, and {company} lost its {role}.',
  '{who} left {company} for a rival, and our {role} went with them.',
])
