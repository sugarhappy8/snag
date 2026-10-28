// The lazy gate of the person profile (R4-U4, X48): the only file that starts the chunk of PersonProfile.tsx, with FactRow.tsx, the facts builder
// (hubs/people-facts.ts) and, from R4-U9 and R4-U10, the connections and memory helpers. The profile is planned work for the bundle budget and not
// a fallback: the first download carries the gate and usesProfile (people-fog.ts), and prefetchLazyViews() (App.tsx) fetches the chunk while the
// browser is idle. PersonSheet draws the hero alone while it loads (never the old bars, which print the true stats in Realistic), and keeps the hero
// if a load fails, with Try again under it (lazyView).
import type { PersonProfileProps } from '../components/PersonProfile'
import { lazyView, type LazyView } from '../lazy/lazyView'

export const PersonProfileLazy: LazyView<PersonProfileProps> = lazyView('person-profile', () => import('../components/PersonProfile').then((m) => ({ default: m.PersonProfile })))
