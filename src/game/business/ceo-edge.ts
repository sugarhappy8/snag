// The steady CEO (R3-M10, J.8): what a top hired CEO gives a company's research. R0-3 took away the skill-100 "strategic trading income"
// (it minted money out of nothing); this is the bounded replacement, and it moves no money at all. A hired CEO rated 90 to 100 (or a
// division under an autonomous group CEO of that rating) keeps the lab steady: the company's own research works up to TOP_CEO_MAX_PTS
// odds points more often, as one labelled line of the odds ("steady CEO +3"), through the Effort engine (research-effort.ts).
//
//   topCeoSteady   how steady a CEO of this skill keeps the lab, 0 to 1: nothing at 90 and below, half at 95, all of it at 100
//   topCeoPts      the odds points a steadiness is worth: TOP_CEO_MAX_PTS times it, at most TOP_CEO_MAX_PTS
//
// The cap is a growth term's ceiling (test/ceiling-list.json `top-ceo-edge`): no rating, wealth or headcount takes it past 3 points.
// A leaf: numbers in, numbers out, nothing imported. A module-level const here is a literal (rule (d) of the layer ratchet).

/** The most odds points a top hired CEO adds to the research of a company, whatever the rating, the cash or the head count. */
export const TOP_CEO_MAX_PTS = 3

/** The rating where the steadiness starts to grow (the CEO's letter calls 90 "elite")... */
const FROM_SKILL = 90
/** ...and the rating span over which it grows to its whole (90 to 100). */
const SPAN = 10

/** How steady a CEO of this skill keeps the lab, 0 to 1. A skill that is not a number is nothing; one past 100 is the whole. */
export function topCeoSteady(skill: number): number {
  return typeof skill === 'number' && skill > FROM_SKILL ? Math.min(1, (skill - FROM_SKILL) / SPAN) : 0
}

/** The odds points a steadiness is worth: 0 to TOP_CEO_MAX_PTS. A value that is not a number, or is below 0, is 0. */
export function topCeoPts(steady: number): number {
  return typeof steady === 'number' && steady > 0 ? TOP_CEO_MAX_PTS * Math.min(1, steady) : 0
}
