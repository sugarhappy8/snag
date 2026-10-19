// Music 2.0 sim: the yearly entry the kit runs after the legacy hook has booked its year. The kit's
// settleYear owns the marker, the ranking, the report row and the popup budget; `run` is the year itself.
// This file is imported only by kit/careers.ts and never imports music.ts.
import { money } from './common'
import type { CareerSim } from './kit/careers'
import type { CrisisSet } from './kit/crisis'
import { careerSay, settleYear, type CareerCtx } from './kit/year'
import { musicCrises, stepDispute } from './music-events'
import { musicJob } from './music-job'
import { endDeal, stepDeal } from './music-label'
import { MUSIC_SPEC, stepCatalogue } from './music-market'
import { adoptMusic, musicScore, musicStore, type MusicState } from './music-state'

/** The contexts of an adoption tick: the legacy year in full, so no event is offered on it and no g.rng is drawn. */
const adopting = new WeakSet<object>()
const events: Pick<CrisisSet<MusicState>, 'offer'> = { offer: (c) => !adopting.has(c) && musicCrises.offer(c) }

function run(c: CareerCtx<MusicState>, live: boolean): string | void {
  const { g, s } = c
  // The legacy hook already settled this year for a life the sim has not taken over: adopt it and stop,
  // even with the job gone, so a term is never settled twice.
  if (!s.migrated) {
    adoptMusic(g, s)
    adopting.add(c)
    return
  }
  // The deal year comes first: the advance, trust, the renewal. Then a claim, which waits when the renewal took the
  // one choice slot. A lost job closes the deal; nothing ticks in prison.
  if (live) {
    if (!g.character.prison) {
      stepDeal(c)
      stepDispute(c)
    }
  } else if (s.deal) endDeal(c, 'expired')
  // Rows keep paying whatever the job is doing: exact arithmetic, no luck.
  const t = stepCatalogue(c)
  s.standing = musicScore(g, s)
  if (t.paid <= 0) return
  careerSay(c, 'Royalty Statement', `${money(t.paid)} royalties. Your label or distributor kept ${money(t.kept)}.${t.recoup > 0 ? ` ${money(t.recoup)} went to recoup.` : ''}`, '\u{1F4C4}')
  return `${t.rows} ${t.rows === 1 ? 'release' : 'releases'} paid royalties.`
}

const hook = settleYear({
  career: 'music',
  store: musicStore,
  incomeLabel: 'Royalties',
  active: (g) => !!musicJob(g),
  run,
  peers: { spec: MUSIC_SPEC, score: musicScore },
  crises: events,
  prison: 'run',
})

export const musicSim: CareerSim = {
  id: 'music',
  key: 'music.sim',
  yearly: hook,
}
