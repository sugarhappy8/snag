// R3-M10 (J.8): the one exception to parity. The oracle rows (test/fixtures/effort-parity.json, recorded on v5.0.0) of a hired manager
// rated 90 or more may sit above the oracle by up to TOL.topCeoSlack odds points, because a top hired CEO now keeps the company's
// research steady (business/ceo-edge.ts). The parity tests of Product, Heavy and Operations R&D pass this as the `slack` of
// expectParity; every other row, and every row below the oracle, is still held to a point.
import { TOL, type ParityRow } from './effort-parity-kit'

/** The odds slack of an oracle row: the whole topCeoSlack for a hired manager rated 90 or more (a `skill` axis), nothing for the rest. */
export const ceoSlack = (row: ParityRow): number => {
  const skill = row.input.skill
  return typeof skill === 'number' && skill >= 90 ? TOL.topCeoSlack : 0
}
