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
])

/** The milestone text of a promotion: what the saved history keeps, and the first of the log's words for it. */
export const PROMOTED = 'earned a promotion and higher pay'
/** The log's words for a promotion (R2-P10, E.T3 d): a person is promoted several times in a life and the log said it the same way each time. The saved history keeps PROMOTED whatever the log says. */
export const PROMO_LINES = defineLines('npc.promotion', [PROMOTED, 'moved up at work and got a raise', 'was promoted and paid more', 'got a step up at work and better pay', 'landed a better role and a raise'])
