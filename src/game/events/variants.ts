// Scene variants for the events that fire most (R3-Q12, E.T6). The 60 popups a life meets again and again get two or more
// extra opening scenes each (variants-data-a.ts, variants-data-b.ts), so the same event reads differently the second time.
//
// A variant is only the text of the popup. The choices, the data, the people, the title and every resolver are the
// original's, so nothing an event does changes, and the new scene has to say the same facts (the amount, the name, the thing
// found) that the outcome texts will repeat. The scene is picked with one draw of the text stream and the text kit's
// shuffle-bag memory, keyed by the event and not by the text (the original holds a name or an amount, so a pool keyed by its
// lines would be a new pool every time). g.rng is never drawn from: a seeded life plays the same events the same way.
//
// Scenes are templates. Tokens: {p} {q} (first names of the event's person and second person), {rel} (their relation to you,
// "sister"), {he} {his} {him} {He} {His} (the person's pronouns), {amt} (money, from the data key the event names), {title}
// (the popup title) and {key} or {key|lc} for the data keys an event lists in `facts`. A scene may start with an era gate
// ("@internet ...", events/era.ts). A scene whose token cannot be filled, whose gate fails, or that names something before
// it existed is not used; when no scene fits, the original text stands and nothing is drawn.
import { formatMoney, pronouns, relationLabel } from '../core'
import { fnv1a } from '../text/hash'
import { pickSite } from '../text/pick'
import type { GameState } from '../types'
import { anachronistic, eraOk, eraStrip } from './era'
import type { EventDef, Setup } from './helpers'
import { VARIANTS_A, type EventScenes } from './variants-data-a'
import { VARIANTS_B } from './variants-data-b'

export type { EventScenes } from './variants-data-a'

let table: Readonly<Record<string, EventScenes>> | null = null

/** Every event that has scenes, by event id. Built on first use, not when the module loads (the data files are imports). */
export function variantTable(): Readonly<Record<string, EventScenes>> {
  table ??= Object.freeze({ ...VARIANTS_A, ...VARIANTS_B })
  return table
}

/** The scenes of one event, or undefined when it has none. */
export function variantsOf(id: string): EventScenes | undefined {
  return Object.hasOwn(variantTable(), id) ? variantTable()[id] : undefined
}

/** The tokens every scene may use; any other token must be a data key the event lists in `facts`. */
export const FIXED_TOKENS: readonly string[] = Object.freeze(['p', 'q', 'rel', 'he', 'his', 'him', 'He', 'His', 'amt', 'title'])

const TOKEN = /\{([A-Za-z]\w*)(?:\|(lc))?\}/g

/** The value of one token for this setup, or null when the setup cannot give it. */
function tokenValue(name: string, s: Setup, spec: Pick<EventScenes, 'amt'>, title: string): string | null {
  const person = s.person
  switch (name) {
    case 'p':
      return person ? person.firstName : null
    case 'q':
      return s.other ? s.other.firstName : null
    case 'rel':
      return person ? relationLabel(person).toLowerCase() : null
    case 'he':
    case 'his':
    case 'him':
    case 'He':
    case 'His':
      return person ? pronouns(person.gender)[name] : null
    case 'title':
      return s.title ?? title
    case 'amt': {
      const n = s.data?.[spec.amt ?? 'amt']
      return typeof n === 'number' && Number.isFinite(n) ? formatMoney(n) : null
    }
    default: {
      const v = s.data?.[name]
      if (typeof v === 'string') return v.length > 0 ? v : null
      return typeof v === 'number' && Number.isFinite(v) ? String(v) : null
    }
  }
}

/** A scene template with its tokens filled, or null when one of them cannot be (the scene is then not used). */
export function fillScene(template: string, s: Setup, spec: Pick<EventScenes, 'amt'>, title: string): string | null {
  let whole = true
  const text = template.replace(TOKEN, (_all, name: string, mod: string | undefined) => {
    const v = tokenValue(name, s, spec, title)
    if (v === null) {
      whole = false
      return ''
    }
    return mod === 'lc' ? v.toLowerCase() : v
  })
  return whole ? text : null
}

/** The scenes that can stand in for this setup's text right now: gate holds, tokens fill, nothing out of its time. Pure. */
export function sceneCandidates(g: GameState, ev: EventDef, s: Setup): string[] {
  const spec = variantsOf(ev.id)
  if (!spec) return []
  const out: string[] = []
  for (const raw of spec.scenes) {
    if (!eraOk(g, raw)) continue
    const text = fillScene(eraStrip(raw), s, spec, ev.title)
    if (text === null || text === s.text || out.includes(text) || anachronistic(g, text)) continue
    out.push(text)
  }
  return out
}

/** The memory key of an event's pool: a site number the text kit turns into 's' and eight hex digits. It never notes a family. */
function siteOf(id: string): number {
  return fnv1a('variants|' + id)
}

const BASE = new WeakMap<EventDef, EventDef>()

/** The event as it was before its scenes were added (the same object for an event without scenes). */
export function unvaried(ev: EventDef): EventDef {
  return BASE.get(ev) ?? ev
}

/**
 * Gives every event of the list that has scenes a setup that sometimes opens with one of them. Order, ids and resolvers stay.
 * One text draw per setup that has at least one usable scene; none otherwise.
 */
export function withVariants(list: EventDef[]): EventDef[] {
  return list.map((ev) => {
    if (!variantsOf(ev.id)) return ev
    const setup = ev.setup
    const wrapped: EventDef = {
      ...ev,
      setup: (g) => {
        const s = setup(g)
        if (!s) return s
        const found = sceneCandidates(g, ev, s)
        if (found.length === 0) return s
        // The pool is the original and the scenes; the key is the event's, so the bag remembers across names and amounts.
        const text = pickSite(g, [s.text, ...found], siteOf(ev.id))
        return text === s.text ? s : { ...s, text }
      },
    }
    BASE.set(wrapped, ev)
    return wrapped
  })
}
