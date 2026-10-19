// Music 2.0 sim: the yearly entry the kit runs after the legacy hook has booked its year. The kit's
// settleYear owns the marker, the ranking, the report row and the popup budget; `run` is the year itself.
// This file is imported only by kit/careers.ts and never imports music.ts.
import { money } from './common'
import type { CareerSim } from './kit/careers'
import { careerSay, settleYear, type CareerCtx } from './kit/year'
import { musicJob } from './music-job'
import { MUSIC_SPEC, stepCatalogue } from './music-market'
import { adoptMusic, musicScore, musicStore, type MusicState } from './music-state'

function run(c: CareerCtx<MusicState>, _live: boolean): string | void {
  const { g, s } = c
  // The legacy hook already settled this year for a life the sim has not taken over: adopt it and stop,
  // even with the job gone, so a term is never settled twice.
  if (!s.migrated) {
    adoptMusic(g, s)
    return
  }
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
  prison: 'run',
})

export const musicSim: CareerSim = {
  id: 'music',
  key: 'music.sim',
  yearly: hook,
}
