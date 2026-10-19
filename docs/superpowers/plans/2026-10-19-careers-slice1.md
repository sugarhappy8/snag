# Careers 2.0 Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Actor, Astronaut and Model the layers Business has (owner-stamped record, named rivals, era and country, crises, exits) on one shared career kit, lifting each from 2 to 4 on the audit rubric.

**Architecture:** `src/game/special/kit/*` owns the plumbing: a bounded owner-stamped record per career at `special.<id>.sim`, derived rivals, an idempotent yearly wrapper with a popup budget and money ledger, a crisis helper whose `odds()` is the only probability source for roll and hint, and gated menu helpers. Each career is a `<id>-sim.ts` entry (`CareerSim`) plus helper files, registered in `kit/careers.ts` and run by one `YEARLY` tuple in `special.ts` after the legacy hooks. Legacy hooks keep their behaviour for a life with no sim record.

**Tech Stack:** TypeScript (strict), Vitest (`npx vitest run <file>`), no new dependencies, no `src/ui` change.

**Spec:** `docs/superpowers/specs/2026-10-19-careers-slice1-design.md` ("S4.1" = its section 4.1; it wins over the digests). Digests, for tuning numbers only: `/tmp/claude-0/-home-user-snag/91204518-72c3-5880-a3f8-357fc9b44d53/scratchpad/careers-research/{kit,actor,astronaut,model}.md`. Music 2.0 and sector families are out of this plan. Task numbers differ from the brief because the kit, the actor events and menus, the astronaut flight and events, and the model board and events each split in two or three.

**Order and models:** Tasks 4 to 8 (actor), 9 to 11 (astronaut) and 12 to 14 (model) depend only on Tasks 1 to 3, so this numbering and the spec's S12 order (model first: smallest legacy overlap, proves the kit) are both valid. Run one task at a time, never in parallel: they share `kit/careers.ts`, `test/career-kit.ts` and the safety key list. Per `CLAUDE.md`, implement and review every task with Sonnet; use Opus only for Task 5 or Task 10 after Sonnet has failed on it, one Opus run at a time.

## Global Constraints

- Saves: `SAVE_SCHEMA` stays 2; no `STEPS` entry; no new `MinigameKind`; no `src/ui` change; every record is an optional flag normalized by its reader.
- Text: no new em-dash literals (`voice-guards` caps all of `src` at 24 and it is exactly 24 today); never paste U+2014.
- VOICE caps: log 90, outcome 120, scene 140 (ends "What will you do?"), tooltip 120, digest 110; choice labels 5 words or fewer, imperative; contractions; hints say "about NN%", never "will". Log lines are first person past tense, popups second person (engine contract 4).
- Purity: no `g.rng`, `store.mut` or `useYearAction` in menus, hints, subtitles, `peek`, `view`, rosters, `standingOf`, `formOf`; `g.rng` is drawn only in action `run()` bodies and in settle bodies after `claimSettle`.
- State: optional, owner-stamped (`ownerKey`), versioned, bounded, finite; store keys only `actor.sim`, `astronaut.sim`, `model.sim`; legacy flags (`special.actor`, `special.astronaut`, `special.model`) are never written by new code.
- Money: every cash move in `actor-*.ts`, `astronaut-*.ts`, `model-*.ts` goes through `c.earn` / `c.pay`; no `earnIncome`, `spend`, `addMoney`, `payForAction` there (Task 3's scan test enforces it); amounts shown through `money()`, never at module load (`test/currency-static.test.ts` imports every `src/game` module), so text tables are functions.
- Talents for every hint: Acting (actor), Academics (astronaut), Modeling (model).
- Legacy ids stay registered: scripts `special.actor.audition|pick|agent|speech`, `special.model.scout` and the legacy model booking, Fashion Week and gift scripts, the seven legacy `special.astro.*` scripts (offer, train, dest, asteroid, spacewalk, words, planet); menu ids `actor.audition`, `actor.practice`, `actor.agent.hire|fire`, `actor.stunt`, `actor.quit`, `astro.academy`, `astro.mission`, `astro.train`, `astro.research`, `model.agency|headshot|freelance|practice|sabotage|quit`. New script ids are `career.<id>.<name>`.
- Legacy hooks: `yearlyModel` is untouched; `yearlyActor` gains one top guard (Task 5); `astronaut.ts` gains only the edits listed in Tasks 10 and 11; nothing else in `actor.ts`, `astronaut.ts`, `model.ts` changes behaviour for a life with no sim record.
- Other track: do not touch `business/economy.ts`, `dynamics.ts`, `state.ts`, `yearly.ts`, `heavy-rd.ts`, `deeptech-*.ts`, `life.ts`, `history/market-events.ts`; no new `INDUSTRY_IDS`, no business trade; careers read business, nation and economy state and never write it.
- Shared edits allowed, only: `special.ts` (one import, one `YEARLY` tuple), `menus.ts` (one chained `??`), `politics.ts` (astronaut poll edge, two lines, droppable), `docs/ARCHITECTURE.md`, `test/special.test.ts` (astronaut block), `test/special-common-safety.test.ts` (key list).
- Imports: `kit/*` imports no career file; `<id>.ts` never imports `<id>-sim.ts`; imports between `<id>.ts` and `<id>-*.ts` are used inside function bodies only, types via `import type`. The legacy files export what the new files need (named per task); an `export` keyword is the only change to those declarations.
- Names: `kit/rivals` `remember(rows, st, year)` is not `core.ts` `remember(g, text)`. A file that needs both imports the kit one as `rememberRivals`.
- Tests: fixed seeds; `makeTestGame(seed, { age })` from `./helpers`; `createNewLife` and `ageUp` only inside `newCareerGame` / `playCareer`; year steps go through `nextYear` (Task 3).
- Checks: per task `npm run typecheck` plus the named `npx vitest run` files, never the full suite; no release notes, no version bump. Regression set, exported once per shell: `export LEGACY="test/special.test.ts test/special-common-safety.test.ts test/talent-perks.test.ts test/talent-perks-review.test.ts test/fuzz-regressions.test.ts test/voice-guards.test.ts"`.
- Commits: explicit pathspecs (never `git add -A`); every message ends with the trailers `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13`.

## Review Focus

Each line is pinned by a test tagged `[RFn]` in the owning task.

1. **RF1 Garbage or hostile saved record** (null, arrays, NaN, 500-row lists, 10,000-character strings, another owner, a legacy profile with `credits: 'bad'` / `planets: 'bad'` / `rejectedBy: 'bad'`): menus render, `yearlySpecial` never throws, every number stays finite and capped. Tasks 1, 4, 5, 7, 8, 9, 10, 12, 13, 14.
2. **RF2 An heir inherits no career state**: after `continueAsChild` the heir reads an empty record and meets the same rival names; only the actor likeness Asset travels (and pays the heir), nothing of the astronaut or model. Tasks 1, 8, 9, 11, 12, 14.
3. **RF3 Replaying the yearly hook or a choice twice**: a second call in the same (year, age) leaves JSON and `g.rng` identical, a stale or replayed modal changes nothing, income pays once. Tasks 2, 5, 6, 7, 8, 10, 11, 13, 14.
4. **RF4 An old save migrating with the legacy flag left intact**: `view` of a legacy life is byte-identical JSON, the first `mut` writes v1 once, the legacy flag never changes, a queued legacy modal (`special.actor.pick`, `special.astro.dest`, `special.model.scout`) still resolves after adoption, `test/fixtures/save-v1.json.gz` still loads at schema 2 (pinned by `test/save-schema.test.ts`, which Tasks 5, 10, 13 and 14 run). Tasks 4, 5, 9, 10, 12, 13.
5. **RF5 Menu purity under `deepFreeze`**: every menu, hint, subtitle and report card reads `view` / `peek`; a `mut` or a `g.rng` draw would throw; a double render leaves JSON and `g.rng` unchanged. Tasks 3, 6, 8, 9, 10, 11, 12, 13, 14.

---

## Task 1: Kit state and rivals (S4.1, S4.2)

**Files:**
- Create: `src/game/special/kit/state.ts`, `src/game/special/kit/rivals.ts`
- Test: `test/career-state.test.ts`, `test/career-rivals.test.ts`

**Interfaces:**
- Consumes: `special/common.ts` `ownerKey(g)`, `ownerMatches(g, v)`, `peek<T>(g, key)`, `prof<T>(g, key, init)` (flag `special.<key>`); `assets.ts` `seeded(key): SRng`; `timeMachine.ts` `outcomeTag(g, year): string`; `world.ts` `namePoolOf(countryId)`; `history/events-people.ts` `nameFitsYear(name, born)`; `rng.ts` `randInt(g, lo, hi)`; `data/brands.ts` `allBrands()` (tests); `test/fuzz-kit.ts` `deepFreeze` (tests).
- Produces (exact):
```ts
// kit/state.ts
export type Raw = Record<string, unknown>
export const KIT_LIMITS = { rows: 12, memory: 16, cool: 24, done: 24, line: 90 } as const
export interface YearRow { y: number; income: number; spent: number; rank: number; of: number; standing: number; note: string }   // rank 0 of 0 = no peers
export interface MemoryRow { id: string; name: string; met: number; won: number; lost: number; grudge: number; last: number }      // grudge 0-100, step size is the career's own
export interface Stamped { v: number; owner: string; settledYear: number; settledAge: number; seq: number }
export interface CareerBase extends Stamped { standing: number; peak: number; years: number; appt: string; rows: YearRow[]; memory: MemoryRow[]; cool: Record<string, number>; done: string[] }
export interface StateSpec<X extends object> { key: string; version: number; migrate: readonly ((raw: Raw, g: GameState) => Raw)[]; extra: (raw: Raw, g: GameState) => X; start?: number }
export interface CareerStore<S extends CareerBase> { readonly key: string; readonly version: number; has(g: GameState): boolean; peek(g: GameState): S | null; view(g: GameState): S; mut(g: GameState): S; read(raw: unknown, g: GameState): S }
export function defineCareerState<X extends object>(spec: StateSpec<X>): CareerStore<CareerBase & X>
export function claimSettle(s: Stamped, g: GameState): boolean    // false when (year, age) is already settled; else writes the marker first, then true
export function nextId(s: Stamped, prefix: string): string       // `${prefix}${++s.seq}`, seq capped 1e9
export function appointmentId(job: Job | null): string           // job.data.appointmentId or ''
export function cap<T>(list: readonly T[], max: number): T[]     // keeps the newest
export function rec(v: unknown): Raw; export function arr(v: unknown): unknown[]
export function int(v: unknown, d: number, lo: number, hi: number): number; export function flt(v: unknown, d: number, lo: number, hi: number): number
export function txt(v: unknown, max: number, d?: string): string  // control chars stripped, trimmed, sliced
export function readRows(v: unknown): YearRow[]; export function readMemory(v: unknown): MemoryRow[]
// kit/rivals.ts
export type RivalArc = 'rising' | 'steady' | 'comet' | 'late'     // .30 .30 .20 .20
export interface RivalSpec { career: string; edges: readonly string[]; field: (year: number, country: string) => number; debutAge?: readonly [number, number]; length?: readonly [number, number]; peak?: readonly [number, number]; foreignShare?: number; depth?: (g: GameState, year: number, country: string) => number }
export interface CareerRival { id: string; name: string; gender: Gender; country: string; born: number; debut: number; exit: number; peak: number; arc: RivalArc; edge: string }
export interface Standing { rank: number; of: number; me: number; top: { id: string; name: string; score: number }[]; beat: string[]; lostTo: string | null }
export function familySeed(g: GameState): string                  // (lifeId || 'life').replace(/-g\d+$/, '')
export function rosterAt(g: GameState, spec: RivalSpec, year?: number, country?: string): CareerRival[]
export function strengthAt(r: CareerRival, year: number): number
export function formOf(g: GameState, spec: RivalSpec, r: CareerRival, year?: number): number    // integer -8..8
export function activeField(g: GameState, spec: RivalSpec, memory?: readonly MemoryRow[], year?: number): { rival: CareerRival; score: number }[]
export function standingOf(g: GameState, spec: RivalSpec, me: number, memory?: readonly MemoryRow[]): Standing
export function beatOdds(me: number, rival: number, spread?: number): number    // clamp((me - rival + spread) / (2 * spread), 0, 1), spread 10
export function rollScore(g: GameState, base: number): number                    // base + randInt(g, -10, 10); actions and settle bodies only
export function remember(rows: readonly MemoryRow[], st: Standing, year: number): MemoryRow[]
export function cool(rows: readonly MemoryRow[], year: number): MemoryRow[]
export function grudgeBonus(row: MemoryRow | undefined): number                  // min(9, 3 * grudge)
export function noteRival(rows: readonly MemoryRow[], rival: { id: string; name: string }, year: number, d: { met?: number; won?: number; lost?: number; grudge?: number }): MemoryRow[]   // pure; one named contest, which Standing-based remember cannot express
```

- [ ] **Step 1: Write the failing tests**
`test/career-state.test.ts` (synthetic store `{ key: 'synth.sim', version: 2, start: 20, migrate: [r => ({ ...r, score: r.points ?? 0 }), r => ({ ...r, tier: Number(r.score) > 50 ? 2 : 1 })], extra: r => ({ score: int(r.score, 0, 0, 100), tier: int(r.tier, 1, 1, 3) }) }`):
```ts
it('lifts v0, v1 and v2 shapes to one record, idempotently', () => {
  const a = store.read({ points: 60 }, g)
  expect([a.score, a.tier, a.v]).toEqual([60, 2, 2])
  expect(store.read({ v: 1, score: 60 }, g)).toEqual(a); expect(store.read({ v: 2, score: 60, tier: 2 }, g)).toEqual(a); expect(store.read(a, g)).toEqual(a)
})
it('keeps junk finite, capped and small [RF1]', () => { // JUNK = null, [], 'x', { rows: 'bad', memory: [1, {}], standing: NaN, cool: { a: 'x' }, done: [1] }, a 500-row record, 10,000-character strings; nonFinite, nodes, longest are local deep-scan helpers
  for (const junk of JUNK) { const r = store.read(junk, g); expect(nonFinite(r)).toEqual([]); expect(r.rows.length).toBeLessThanOrEqual(12); expect(r.memory.length).toBeLessThanOrEqual(16); expect(Object.keys(r.cool).length).toBeLessThanOrEqual(24); expect(r.done.length).toBeLessThanOrEqual(24); expect(nodes(r)).toBeLessThan(3000); expect(longest(r)).toBeLessThanOrEqual(90) }
})
it('reads another owner as fresh and keeps the legacy owner match [RF2]', () => { /* flag owner 'other': has false, peek null, view standing 20; the legacy owner string `${id}:${first}:${last}:${birthYear}` still matches after a rename */ })
it('view never writes and survives a frozen state [RF5]', () => { const f = deepFreeze(structuredClone(g)); expect(() => store.view(f)).not.toThrow(); expect(JSON.stringify(f)).toBe(JSON.stringify(g)) })
it('mut creates, stamps, migrates in place and prunes stale keys', () => { /* flag { owner, v: 1, score: 60, stale: 1 } -> v 2, no 'stale' key, writes through g.flags */ })
it('claimSettle is false the second time for one (year, age) [RF3]', () => { /* true then false; marker set before returning; year + 1 -> true */ })
it('nextId increments and caps at 1e9; cap keeps the newest; appointmentId(null) is empty', () => { /* three one-line asserts */ })
```
`test/career-rivals.test.ts` (spec `{ career: 'probe', edges: ['a', 'b'], field: y => (y < 1950 ? 0 : 16) }`):
```ts
it('gives heirs the same roster and other countries a different one [RF2]', () => { /* lifeId 'x' vs 'x-g2' deep equal; 'us' vs 'fr' differ */ })
it('is empty before the field exists and shows at most 24', () => { /* rosterAt(g, spec, 1949) = []; field 40 -> activeField(...).length <= 24 */ })
it('names are unique, fictional and era-fitting', () => { /* unique; none equals an allBrands() name; nameFitsYear(first, born) true */ })
it('keeps strength within 0..peak and 0 outside [debut, exit)', () => { /* sweep every rival and year */ })
it('never touches g.rng or JSON, also on a frozen state [RF5]', () => { /* rosterAt, activeField, standingOf, formOf on a clone: JSON and rng equal */ })
it('ranks by score; an empty field is rank 1 of 1; beatOdds is clamp((me - rival + 10) / 20)', () => { expect([beatOdds(50, 50), beatOdds(80, 50), beatOdds(10, 50)]).toEqual([0.5, 1, 0]) })
it('remembers at most 16 and fades grudge', () => { /* 40 distinct rivals -> 16, lowest met + 2*grudge evicted first; cool takes 1 when last < year - 1; grudgeBonus({ grudge: 5 }) = 9 */ })
it('noteRival creates then updates one named row, clamps grudge to 0-100 and evicts like remember', () => { /* +10 twice = 20, +200 = 100, -500 = 0; last = year; 40 distinct ids -> 16 rows */ })
```

- [ ] **Step 2: Run to see it fail** Run: `npx vitest run test/career-state.test.ts test/career-rivals.test.ts` Expected: FAIL, "Failed to resolve import '../src/game/special/kit/state'" (and `kit/rivals`).

- [ ] **Step 3: Implement `kit/state.ts`**
`defineCareerState`: flag `special.<key>` through `peek` / `prof`; `read` migrates `migrate[v..version-1]` on shallow copies (no `v` is v0; each step gets `g` so it may read a legacy profile and never writes one), then normalizes the base fields with `int`/`flt`/`txt` (standing default `start ?? 20`, peak at least standing) and calls `extra`. `peek` = `read` of an owner-matching flag, else null; `view` = `peek ?? read({}, g)` (so migration `[0]` can lift a legacy profile for a life with no record); `mut` = `prof(g, key, init)`, then `Object.assign` of the normalized record and deletion of every key the normalized record lacks. All readers tolerate junk and never throw.

- [ ] **Step 4: Implement `kit/rivals.ts`**
Roster algorithm (the signature does not determine it):
```
rosterAt: [] when spec.field(year, country) <= 0. Cohorts d = 5-year starts that can still be active at `year`.
  size(d) = stochastic-round(5 * field(d + 2, country) / meanLength), seeded; rival i of d: r = seeded(`${familySeed}|rival|${career}|${country}|${d}|${i}`)
  debut = d + r.int(0, 4); born = debut - r.int(debutAge); exit = debut + r.int(length); peak = r.int(peakRange); arc by .30/.30/.20/.20;
  edge = r.pick(edges); country = foreignShare chance ? another country : country; name from namePoolOf, retry <= 8 times until nameFitsYear and unique in the roster; id `${career}.${country}.${d}.${i}`.
  Result is the rivals with debut <= year < exit, cached by key (200 entries, evict oldest).
strengthAt = peak * (0.35 + 0.65 * (1 - ((t - tp) / max(tp, 1 - tp))^2)), t = (year - debut) / (exit - debut), tp = .85 rising, .50 steady, .20 comet, .70 late; 0 outside [debut, exit).
formOf = seeded(`${familySeed}|form|${career}|${r.id}|${year}${outcomeTag(g, year)}`).int(-8, 8).
activeField score = clamp(strengthAt * clamp(depth ?? 1, .5, 1.3) + formOf + grudgeBonus(memory row), 0, 100), top 24, ties by id.
standingOf: rank = 1 + count(score > me), of = field + 1, top = best 5, beat = ids of the 5 nearest below me, lostTo = top[0].id when it is above me else null.
remember: top[] rivals met +1 and last = year; a rival above me lost +1 when it is lostTo; beat[] won +1; cap 16 evicting lowest met + 2*grudge, then oldest last. cool: grudge -1 when last < year - 1.
noteRival: find the row by id or create it (name cut to 40), add the deltas (grudge clamped 0-100, counts 0-1e6), last = year, same cap and eviction as remember.
```

- [ ] **Step 5: Run to see it pass** Run: `npx vitest run test/career-state.test.ts test/career-rivals.test.ts` Expected: PASS.

- [ ] **Step 6: Regression and typecheck** Run: `npx vitest run test/voice-guards.test.ts test/special-common-safety.test.ts` (no legacy file changed, so only the em-dash guard and shared-state safety matter), then `npm run typecheck`. Expected: PASS, no errors.

- [ ] **Step 7: Commit**
```bash
git add src/game/special/kit/state.ts src/game/special/kit/rivals.ts test/career-state.test.ts test/career-rivals.test.ts && git commit -m "feat(kit): career state and derived rivals" -m $'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13'
```

---

## Task 2: Kit year wrapper and crisis helper (S4.3, S4.4)

**Files:**
- Create: `src/game/special/kit/year.ts`, `src/game/special/kit/crisis.ts`, `test/career-kit.ts` (first half), `test/career-probe.ts`
- Test: `test/career-year.test.ts`, `test/career-crisis.test.ts`

**Interfaces:**
- Consumes: Task 1 exports; `core.ts` `earnIncome(g, n)`, `spend(g, n): boolean`, `log`, `notice(g, title, text, { emoji, tone })`, `scriptChoice(g, id, title, text, choices, { emoji, data })`, `addStat`; `scripts.ts` `defineScript`; `rng.ts` `chance`, `weightedPick`; `nation/state.ts` `policyOf`; `events/wealth-core.ts` `typicalIncome(g)`; `talents.ts` `hasTalent`, `talentHint`; `special/common.ts` `withHint`, `stableChoice`, `addFame`, `ownerKey`.
- Produces (exact; two additions beyond the digest are marked NEW):
```ts
// kit/year.ts
export type AuditEvent = { t: 'earn' | 'pay'; career: string; label: string; amount: number } | { t: 'text'; career: string; role: 'log' | 'outcome' | 'scene' | 'title'; text: string } | { t: 'books'; career: string; where: string; delta: number; booked: number; moves: number } | { t: 'crisis'; career: string; id: string; stances: string[] }
export function setCareerAudit(sink: ((e: AuditEvent) => void) | null): void
export interface Budget { choices: number; notices: number }
export const YEARLY_BUDGET: Budget  // { choices: 1, notices: 2 } (copy per use)
export const ACTION_BUDGET: Budget  // { choices: 3, notices: 6 }
export interface CareerCtx<S extends CareerBase = CareerBase> { readonly g: GameState; readonly career: string; readonly s: S; readonly year: number; readonly budget: Budget; readonly field: Standing | null; earn(source: string, amount: number): number; pay(sink: string, amount: number): boolean }
export function careerCtx<S extends CareerBase>(g: GameState, career: string, s: S, budget?: Budget): CareerCtx<S>
export function careerSay(c: CareerCtx, title: string, text: string, emoji?: string, tone?: Tone): boolean   // notice within budget, else a log line
export function careerLog(c: CareerCtx, text: string, tone?: Tone): void                                      // fit to 90
export interface SettleOpts<S extends CareerBase> { career: string; store: CareerStore<S>; incomeLabel: string; active: (g: GameState) => boolean; run: (c: CareerCtx<S>, live: boolean) => string | void; peers?: { spec: RivalSpec; score: (g: GameState, s: S) => number }; crises?: CrisisSet<S>; prison?: 'skip' | 'run' }
export function settleYear<S extends CareerBase>(o: SettleOpts<S>): (g: GameState) => void   // `run` may return the YearRow note (NEW)
export function pendingCareerChoices(g: GameState): number
export function offerChoice(c: CareerCtx, script: string, title: string, text: string, choices: ChoiceOption[], data: Record<string, Json>, emoji?: string): boolean   // NEW: budget + pending cap, stamps data.owner and data.year
export function claimChoice<S extends CareerBase>(g: GameState, s: S, data: Json | undefined, key: string): boolean   // NEW: owner, year and one-shot guard in s.done; true only the first time
export function fit(text: string, max: number): string
export function budgetLevel(g: GameState, line: BudgetLine, country?: string): number
// kit/crisis.ts
export type Stance = 'safe' | 'bold' | 'cash'
export interface Effects { money?: number; standing?: number; fame?: number; happiness?: number; health?: number; grudge?: { id: string; name: string; by: number } }   // grudge carries the name: action and script contexts have no c.field (NEW)
export interface Result { paid: number; earned: number }
export interface Branch<S extends CareerBase = CareerBase> { text: (r: Result) => string; fx: Effects; then?: (s: S, g: GameState) => void }   // then: record mutation plus non-money state on g (addHidden for karma or notoriety, setFlagSkill, addRelationship); no money, no rng (NEW)
export interface Option<S extends CareerBase, D> { label: string; emoji: string; odds?: (g: GameState, s: S, d: D) => number; good: (g: GameState, s: S, d: D) => Branch<S>; bad?: (g: GameState, s: S, d: D) => Branch<S> }   // no odds = fixed outcome: no roll, no rng, no percentage in the hint (NEW)
export interface CrisisDef<S extends CareerBase, D extends Record<string, Json>> { id: string; title: string; emoji: string; cool?: number; weight: (g: GameState, s: S) => number; make: (g: GameState, s: S, r: SRng) => D; scene: (g: GameState, s: S, d: D) => string; options: Partial<Record<Stance, Option<S, D>>> }
export interface CrisisSet<S extends CareerBase> { offer(c: CareerCtx<S>): boolean }
export const CRISIS_ODDS = 0.35
export function defineCrises<S extends CareerBase>(o: { career: string; store: CareerStore<S>; talent: TalentId; defs: readonly CrisisDef<S, any>[] }): CrisisSet<S>
export function applyEffects<S extends CareerBase>(c: CareerCtx<S>, fx: Effects, label: string): Result
export function fxValue(g: GameState, fx: Effects): number
export function oddsText(p: number): string                       // `about ${Math.round(p * 20) * 5}%`
export function bestStance<S extends CareerBase, D>(g: GameState, s: S, d: D, def: CrisisDef<S, any>): Stance | null
export function hot<T>(g: GameState, career: string, items: readonly T[]): T
export function honest(g: GameState, talent: TalentId, text: string): { hint?: string }
```

- [ ] **Step 1: Write the failing tests**
`test/career-probe.ts` (no vitest import): `probeStore` (`key 'probe.sim'`, version 1, extra `{ stock: int }`), `probeSpec` (RivalSpec, field 12), `probeDef` (one def `rush`: `safe` fixed, `bold` rolled at odds 0.6, `cash` rolled at 0.3; scene ends "What will you do?") and `probeCrises = defineCrises({ career: 'probe', store: probeStore, talent: 'Acting', defs: [probeDef] })`, `probeYear = settleYear({ career: 'probe', store: probeStore, incomeLabel: 'Fees', active: g => g.character.job?.defId === 'probe', run, peers, crises })`, `newProbeGame(seed): GameState` (`makeTestGame`, age 30, money 100,000, job `probe`).
`test/career-kit.ts` first half (no vitest import): `BAD_TEXT`, `finiteJson(g): string[]`, `voiceProblems(text, role): string[]` (`unitFlags` from `scripts/voice/rules.mjs`, typed by `rules.d.mts`, over-cap with 30 slack, em-dash, chatbot, stock, no-contraction, nobody, everyone, disclaimer, plus `BANNED_ANYWHERE`), `checkLedger(events): string[]` (every `books` event `|delta - booked| <= 1 + 0.5 * moves`; a single earn over 400 x `typicalIncome` gives a `note-windfall` line; empty source or non-finite amount is a failure), `assertHonestOdds(def, mk, n = 1500)` (resolve each rolled stance on `structuredClone`s with seeds 1..n; |good rate - `odds()`| < 0.045; fixed options skipped).
`test/career-year.test.ts`:
```ts
it('is a pure no-op without a job and a record', () => { const before = JSON.stringify(g), rng = JSON.stringify(g.rng); probeYear(g); expect(JSON.stringify(g)).toBe(before); expect(JSON.stringify(g.rng)).toBe(rng) })
it('settles once per (year, age) [RF3]', () => { probeYear(g); const once = JSON.stringify(g), rng = JSON.stringify(g.rng); probeYear(g); expect(JSON.stringify(g)).toBe(once); expect(JSON.stringify(g.rng)).toBe(rng) /* then year+1, age+1 settles again */ })
it('skips prison; with the job gone it settles with live false and pays nothing new')
it('holds the popup budget [1 choice, 2 notices]', () => { /* run body: careerSay x5, offerChoice x3 -> queue: 2 notices + 1 choice, 3 log lines; second offerChoice returns false */ })
it('caps pending career choices at 2 across careers', () => { /* two queued 'career.x.y' choices -> offerChoice false; pendingCareerChoices = 2 */ })
it('guards the ledger', () => { expect(c.earn('', 5)).toBe(0); for (const bad of [NaN, -5, 0, 0.4, Infinity]) expect(c.earn('Fee', bad)).toBe(0); expect(c.pay('Rent', 1e9)).toBe(false) /* money unchanged */; expect(c.earn('Fee', 1000.4)).toBe(1000) })
it('books matches the cash delta', () => { /* setCareerAudit(sink); earn 1000, pay 200 -> books { delta: 800, booked: 800, moves: 2 }; checkLedger(sink) = [] */ })
it('claimChoice accepts the first matching owner and year only [RF3]', () => { /* second call, wrong owner, wrong year -> false */ })
it('fit cuts at the last space under the cap, with no ellipsis')
```
`test/career-crisis.test.ts`:
```ts
it('registers career.probe.rush with 2 to 3 stances and distinct labels')
it('offers about 35% of years, after the marker, weighted, and honours the cool-down', () => { /* seeds 1..2000 offered rate in [.30, .40]; cool 4 -> not at +3 years, possible at +4 */ })
it('replays, wrong owner and wrong year change nothing [RF3]', () => { /* runScript twice; modal.data.owner changed; year + 1 -> JSON equal after the first */ })
it('marks bestStance only with the talent, and prints no percentage for a fixed option', () => { /* hint on exactly one choice == bestStance(...); no talent -> no hint */ })
it('rolls the same odds() it hints', () => assertHonestOdds(probeDef, mk))
it('applyEffects clamps', () => { /* money -1e9 with 300 cash pays 300, cash 0 (no debt); standing +500 -> 100, peak follows; grudge { id, name, by: 10 } creates a row, a second makes 20, by 500 clamps to 100 */ })
it('then() never moves cash or draws g.rng; text, scene (<= 140, ends What will you do?) and labels (<= 5 words) pass voiceProblems', () => { /* cash and g.rng equal around a branch whose then() sets karma through addHidden */ })
```

- [ ] **Step 2: Run to see it fail** Run: `npx vitest run test/career-year.test.ts test/career-crisis.test.ts` Expected: FAIL, "Failed to resolve import '../src/game/special/kit/year'".

- [ ] **Step 3: Implement `kit/year.ts`**
`settleYear` order (the signature does not determine it): (1) return when neither `active(g)` nor `store.has(g)`, when dead, or when in prison and `prison !== 'run'`; no write, no rng. (2) `s = store.mut(g)`, `claimSettle(s, g)` else return. (3) budget `{ ...YEARLY_BUDGET }`, `field = peers ? standingOf(...) : null`. (4) `note = run(c, active(g))`. (5) `crises?.offer(c)` only while the job is held. (6) re-rank, push one `YearRow` (cap 12, `note` fit to 90), `memory = cool(memory, year)`, `peak = max`, `years += 1`, `appt = appointmentId(job)`. (7) emit a `books` audit with the cash delta across steps 4 to 5. `earn` rounds, refuses empty source, non-finite and sub-1 amounts, calls `earnIncome`; `pay` calls `spend`; both audit. `CareerCtx.field` is filled by `settleYear` only (the peers it ranks); `careerCtx` leaves it null in action and script contexts. `careerSay` / `careerLog` emit `text` audits. `offerChoice` refuses at `budget.choices < 1` or `pendingCareerChoices(g) >= 2`, else queues `scriptChoice` and decrements the budget.

- [ ] **Step 4: Implement `kit/crisis.ts`**
`defineCrises` registers `defineScript('career.<career>.<id>')` per def. `offer(c)`: refuse on budget or pending cap; eligible = `weight > 0` and `cool['crisis.<id>'] < year`; then `chance(g, CRISIS_ODDS)`, `weightedPick`, `make` with `seeded(`${familySeed(g)}|crisis|${career}.${id}|${year}${outcomeTag(g, year)}`)`, `offerChoice` with `data { id, d }`, set `cool['crisis.<id>'] = year + (def.cool ?? 4) - 1`, emit a `crisis` audit. The script: `claimChoice`, pick the option by choice id, `p = clamp(odds, .05, .95)`, `chance(g, p)` unless fixed, `applyEffects`, `branch.then?.(s)`, `careerSay` with `branch.text(result)` on an `ACTION_BUDGET` ctx. The hint (`honest(g, talent, ...)`) goes on the `bestStance` choice only: "Looks best: about 65% to go well." (rolled) or "Looks best on average." (fixed). `applyEffects` writes a grudge through `noteRival` from the effect's own `id` and `name` (it never reads `c.field`); a `Branch.then(s, g)` runs after the effects.

- [ ] **Step 5: Run to see it pass** Run: `npx vitest run test/career-year.test.ts test/career-crisis.test.ts` Expected: PASS.

- [ ] **Step 6: Regression and typecheck** Run: `npx vitest run test/career-state.test.ts test/career-rivals.test.ts test/voice-guards.test.ts test/special-common-safety.test.ts`, then `npm run typecheck`. Expected: PASS, no errors.

- [ ] **Step 7: Commit**
```bash
git add src/game/special/kit/year.ts src/game/special/kit/crisis.ts test/career-kit.ts test/career-probe.ts test/career-year.test.ts test/career-crisis.test.ts && git commit -m "feat(kit): yearly wrapper, ledger and crisis helper" -m $'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13'
```

---

## Task 3: Kit menu helpers, registry, wiring and the playthrough test kit (S4.5 to S4.7)

**Files:**
- Create: `src/game/special/kit/menu.ts`, `src/game/special/kit/careers.ts`, `test/career-menu.test.ts`, `test/careers-balance.test.ts`, `test/career-money-scan.test.ts`, `test/fuzz-careers.test.ts`
- Modify: `src/game/special.ts` (one import after the `./special/astronaut` import; `['careers2', yearlyCareerSims],` between `['astronaut', yearlyAstronaut],` and `['hustler', yearlyHustler],`), `test/career-kit.ts` (second half)
- Test: as listed under Create

**Interfaces:**
- Consumes: Tasks 1 and 2; `core.ts` `useYearAction`; `special/common.ts` `blocked(g, minAge)`, `money`; `test/fuzz-kit.ts` `renderAll`, `probeActions`, `deepFreeze`, `driver`, `FailureLog`, `installStorageShim`, `diffSummary`, `POLITICS_PLACES`; `life.ts` `createNewLife`; `aging.ts` `ageUp`; `core.ts` `bindMoneyContext`; `save.ts` `saveGame(g): boolean` and `loadGame(): GameState | null` (after `installStorageShim()`, as `fuzz-kit.ts` does).
- Produces:
```ts
// kit/menu.ts
export function gatedAction<S extends CareerBase>(o: { id: string; label: string; emoji: string; career: string; store: CareerStore<S>; subtitle?: string | ((g: GameState) => string); gate: (g: GameState, s: S) => string | null; hint?: (g: GameState, s: S) => string | null; confirm?: (g: GameState) => string | null; input?: MenuInput; once?: string; run: (c: CareerCtx<S>, input?: string) => void }): MenuAction
export function reportLines(row: YearRow, incomeLabel: string): string[]   // 3 lines at most, each <= 90: money, rank (none when rank 0 of 0), note
export function standingMenu<S extends CareerBase>(o: { id: string; label: string; emoji: string; store: CareerStore<S>; standingLabel: string; incomeLabel: string; peers?: { spec: RivalSpec; score: (g: GameState, s: S) => number } }): MenuGroup
// kit/careers.ts
export interface CareerSim { id: string; key: string; yearly: (g: GameState) => void }
export const CAREER_SIMS: readonly CareerSim[]   // [] in this task; each career task adds one import and one entry, alphabetical
export function yearlyCareerSims(g: GameState, sims: readonly CareerSim[] = CAREER_SIMS): void   // stops when !g.character.alive
// test/career-kit.ts (appended)
export type CareerId = 'actor' | 'astronaut' | 'model'
export type CareerStrategy = 'steady' | 'greedy' | 'reckless' | 'idle'
export interface CareerSetup { defId: string; stateKey: string; hire: (g: GameState) => void; roots: (g: GameState) => MenuNode[]; prefer: Record<'steady' | 'greedy' | 'reckless', RegExp> }
export const CAREER_SETUPS: Partial<Record<CareerId, CareerSetup>>   // {} here; each career task adds its entry
export interface CareerStats { careerId: CareerId; strategy: CareerStrategy; seed: number; country: string; year0: number; years: number; actions: number; popups: number; crises: number; income: number; spent: number; standingEnd: number; peak: number; rankEnd: number; worthDelta: number; ended: 'active' | 'retired' | 'fired' | 'dead' | 'prison'; checks: { purity: number; ledger: number; saves: number; voice: number }; text: string[] }
export function newCareerGame(id: CareerId, seed: number, country = 'us', year = 1995): GameState   // age 24, money 200_000, queue empty, hired
export function nextYear(g: GameState, hook: (g: GameState) => void = yearlySpecial): void          // year + 1, age + 1, yearActions = {}, then hook
export function careerRoots(id: CareerId): (g: GameState) => MenuNode[]
export function collectActions(g: GameState, nodes: MenuNode[], depth = 4): MenuAction[]
export function pickStance(strategy: CareerStrategy, m: ChoiceModal): string   // safe | cash | bold | first option; falls back to the first option
export function drainCareer(g: GameState, strategy: CareerStrategy, sink: string[], audit: AuditEvent[]): number   // `career.*` choices take the stance; other choices the first id; minigames 'done'
export function roundTrip(g: GameState): string | null
export function assertMenuPure(g: GameState, roots: (g: GameState) => MenuNode[]): void   // frozen clone, render twice: no throw, JSON and rng unchanged
export function playCareer(id: CareerId, strategy: CareerStrategy, years: number, seed: number, country = 'us', year = 1995, opts: { saveEvery?: number; voice?: boolean } = {}): CareerStats
export function summarizeCareers(rows: CareerStats[]): string
export function assertCareersClean(rows: CareerStats[]): void
```

- [ ] **Step 1: Write the failing tests**
`test/career-menu.test.ts` (probe from Task 2):
```ts
it('enforces the gate inside run, not only in the menu', () => { const a = gatedAction({ ..., gate: () => 'Not yet.' }); const before = JSON.stringify(g); a.run(g); expect(JSON.stringify(g)).toBe(before) /* a notice or log says why is allowed: compare ignoring log/queue */ ; expect(a.disabledReason?.(g)).toBe('Not yet.') })
it('applies once through useYearAction and emits a books audit', () => { /* run twice: second no-op; sink has books {delta: 1000, booked: 1000, moves: 1} */ })
it('reads view only: render on a frozen state [RF5]', () => assertMenuPure(g, () => [a, standingMenu({...})]))
it('reportLines gives at most 3 lines of 90, no rank line for rank 0 of 0', () => { expect(reportLines({ y: 2001, income: 158000, spent: 2000, rank: 14, of: 40, standing: 61, note: 'Kept a clean book.' }, 'Bookings')).toEqual([`2001 Bookings ${money(158000)}, spent ${money(2000)}.`, 'Rank 14 of 40.', 'Kept a clean book.']) })
it('standingMenu shows the label, the last 5 years, top peers and rivals who remember you')
it('yearlyCareerSims runs in order and stops when the character dies', () => { /* two fake sims; the first kills the character: second not called */ })
```
`test/careers-balance.test.ts`: one coverage test `it('has a setup for every registered sim', () => expect(Object.keys(CAREER_SETUPS).sort()).toEqual(CAREER_SIMS.map(s => s.id).sort()))`; then for each id in `Object.keys(CAREER_SETUPS)` a `describe` over `['steady', 'reckless'] x seeds [11, 12] x 10 years` (timeout 180 s per career) asserting `assertCareersClean`, steady `standingEnd > 5` and never `fired` before year 3, reckless `income / years < 60 * typicalIncome`, and `idle` leaves the sim record JSON equal except `rows` and `years`.
`test/career-money-scan.test.ts`: read every `src/game/special/{actor,astronaut,model}-*.ts`; fail on `/\b(earnIncome|spend|addMoney|payForAction)\s*\(/` outside comments (legacy `actor.ts`, `astronaut.ts`, `model.ts` and `kit/year.ts` are not scanned).
`test/fuzz-careers.test.ts`: `describe.skipIf(!process.env.FUZZ)`; `FUZZ_SEEDS` default 30, `FUZZ_YEARS` default 16; seed picks career (`ids[seed % n]`), place (`POLITICS_PLACES`), strategy; `note-` lines print and do not fail.

- [ ] **Step 2: Run to see it fail** Run: `npx vitest run test/career-menu.test.ts test/careers-balance.test.ts test/career-money-scan.test.ts` Expected: FAIL, "Failed to resolve import '../src/game/special/kit/menu'".

- [ ] **Step 3: Implement `kit/menu.ts` and `kit/careers.ts`, wire `special.ts`**
`gatedAction`: `disabledReason = (g) => blocked(g) ?? gate(g, store.view(g))`; `run(g, input)` re-checks both and tells why on refusal, applies `once` through `useYearAction(g, once, 1)`, then `store.mut(g)`, `careerCtx(g, career, s, { ...ACTION_BUDGET })`, `o.run(c, input)` and emits a `books` audit with where `o.id`. `standingMenu` builds info rows from `store.view` and `standingOf` only. Registry and the two `special.ts` lines exactly as in the Files list.

- [ ] **Step 4: Implement the test kit second half**
`playCareer` loop (each year): (1) `bindMoneyContext(g)`, `setCareerAudit(sink)`; (2) purity: `renderAll(g, log, 7)`, failures become `text` lines; (3) up to 4 actions from `collectActions(g, setup.roots(g))` matching `setup.prefer[strategy]` (none for `idle`), each run on a `structuredClone` first (its `books` events must pass `checkLedger`), then on `g`, `deepFreeze`d copies between steps; (4) every third year `probeActions(g, log, seed * 31 + y, { roots, depth: 1, max: 12 })`; (5) `ageUp` on a clone, `drainCareer`, the clone becomes `g`; (6) `checkLedger`, `finiteJson`, `voiceProblems` over `text` audits, `roundTrip` every `saveEvery` (5) years. `newCareerGame` follows `politics-kit` `newLeader`: `createNewLife({ countryId, year: year - 24, seed })`, then `character.age = 24`, `g.year = year`, `g.log.push({ age: 24, year, entries: [] })`, money 200,000, `prison = null`, `queue = []`, then `CAREER_SETUPS[id].hire(g)`.

- [ ] **Step 5: Run to see it pass** Run: `npx vitest run test/career-menu.test.ts test/careers-balance.test.ts test/career-money-scan.test.ts test/fuzz-careers.test.ts` Expected: PASS (fuzz file skipped).

- [ ] **Step 6: Regression and typecheck** Run: `npx vitest run $LEGACY test/hedge-year.test.ts test/advisors-year.test.ts test/dividend-wiring.test.ts test/career-year.test.ts test/career-crisis.test.ts` (the three year suites compare JSON of an aged plain life: the new tuple must be a no-op), then `npm run typecheck`. Expected: PASS, no errors.

- [ ] **Step 7: Commit**
```bash
git add src/game/special/kit/menu.ts src/game/special/kit/careers.ts src/game/special.ts test/career-kit.ts test/career-menu.test.ts test/careers-balance.test.ts test/career-money-scan.test.ts test/fuzz-careers.test.ts && git commit -m "feat(kit): menu helpers, sim registry and playthrough test kit" -m $'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13'
```

---

## Task 4: Actor data, state and world (S5 State, Migration, Rivals and market, Era and country)

**Files:**
- Create: `src/game/special/actor-data.ts`, `src/game/special/actor-state.ts`, `src/game/special/actor-world.ts`
- Modify: `src/game/special/actor.ts` (`Role` moves to `actor-state.ts` and is re-exported as a type; `export` added to `viewActor`, `Listing`, `genListings`, `auditionBase`, `bestListing`, `masterActing`, `project`; nothing else)
- Test: `test/actor-state.test.ts`, `test/actor-world.test.ts`

**Interfaces:**
- Consumes: Task 1 `defineCareerState`, `int`, `flt`, `txt`, `arr`, `rec`, `RivalSpec`, `standingOf`, `Standing`; `actor.ts` legacy profile reader `viewActor(g)`, `Listing` (type), genre list; `economy/model.ts` `economyOf`; `history/timeline.ts` `hasTech`, `techOdds`; `shops/everyday-brands.ts` `brandPool`; `world.ts` `getCountry`.
- Produces:
```ts
// actor-data.ts
export type IndustryId = 'hollywood' | 'bollywood' | 'nollywood' | 'kdrama' | 'hongkong' | 'domestic'
export type TypeId = 'action' | 'comedy' | 'drama' | 'genre' | 'romance'
export type BudgetId = 'indie' | 'studio' | 'blockbuster' | 'cable' | 'network' | 'streaming'
export interface IndustryDef { id: IndustryId; scale: number; filmStart: number; studio: [number, number] | null; field: number; heat: [number, number][]; countries: readonly string[] }
export const INDUSTRIES: Record<IndustryId, IndustryDef>   // S5 Era and country values; domestic scale is 0.25 x wealth, min 0.05, computed in scaleOf
export const TYPE_OF: Record<string, TypeId>               // action: Action, Superhero, Martial Arts; comedy: Comedy, Sitcom, Animated; drama: Drama, Crime Drama, Medical Drama, Teen Drama, Thriller, Nollywood Drama; genre: Horror, Sci-Fi, Sci-Fi Series, Fantasy Series; romance: Romance, Musical, Soap Opera, Telenovela, Bollywood, K-Drama
export const BUDGETS: Record<BudgetId, { kind: 'film' | 'tv'; cost: number; gross: number; qBase: number; from?: number }>   // indie 2M 4M -5; studio 40M 70M +5; blockbuster 180M 420M +15 (from 1975); cable 3M 6M -5 (1980); network 4M 8M +5; streaming 8M 14M +5
export const AWARD_DEFS: { id: string; name: string; industry: IndustryId | 'any'; kind: 'film' | 'tv'; from: number }[]   // Golden Reel 1929, Primetime Glow 1949, Silver Lotus 1954, Jade Crane 1963, Lantern 1982, Palm Screen 2005, National Film or Television Prize 1946, Viewers Choice 2013
// actor-state.ts
export type Role = 'Extra' | 'Supporting' | 'Lead'
export interface Terms { fee: number; points: number; exclusive: boolean }
export interface Rep { personId: string; name: string; firm: string; quality: number; cut: number; loyalty: number; since: number }
export interface Press { firm: string; quality: number; since: number }
export interface Proj { id: string; title: string; kind: 'film' | 'tv'; genre: string; type: TypeId; role: Role; studio: string; studioId: string; industry: IndustryId; budget: BudgetId; terms: Terms; stage: 'offer' | 'shoot' | 'post'; developed: number; buzz: number; campaign: number; season: number; director: number; costars: string[]; window: 'normal' | 'awards' | 'dodge'; quality: number; since: number; lastYear: number }
export interface Credit { id: string; title: string; kind: 'film' | 'tv'; role: Role; genre: string; type: TypeId; industry: IndustryId; studio: string; year: number; age: number; pay: number; quality: number; popularity: number; gross: number; backend: number; seasons: number; verdict: string; residual: number; trust: boolean }
export interface ActorExtra { migrated: boolean; rep: number; noms: number; dry: number; scandal: number; layLow: number; studioFrom: number; type: Record<TypeId, number>; team: { agent: Rep | null; manager: Rep | null; press: Press | null }; pipeline: Proj[]; credits: Credit[]; awards: string[]; totals: { gross: number; net: number; cuts: number; spent: number } }   // caps 4, 64, 40; rep starts 50
export type ActorState = CareerBase & ActorExtra
export const actorStore: CareerStore<ActorState>    // key 'actor.sim', version 1, start 20
export function adoptLegacy(g: GameState, s: ActorState): void   // first mut only: migrated = true, Job.data.project = null (the project already sits in pipeline[0] from migrate[0])
// actor-world.ts
export const ACTOR_SPEC: RivalSpec   // career 'actor', edges = five types, peak [38, 98], debutAge [19, 26], length [20, 40], foreignShare .05, field = 0 before filmStart else round(base x (0.7 + 0.3 x min(1.3, heat))), base 20 hollywood, 16 bollywood|kdrama|hongkong|domestic, 14 nollywood
export function industryOf(g: GameState, year?: number): IndustryId       // named industry before its filmStart plays domestic
export function scaleOf(g: GameState, industry?: IndustryId): number
export function heat(industry: IndustryId, year: number): number          // linear keyframes, 0 before filmStart, ends 2026
export function studioYear(industry: IndustryId, year: number): boolean   // hollywood 1928-1955, bollywood 1935-1955, domestic 1930-1960
export function hotTypes(g: GameState, year?: number): TypeId[]           // top two of exp(0.22 x normal), seeded, current year only
export function starPower(g: GameState, s: ActorState): number            // .40 fame + .25 rep + .20 mean popularity of the last 3 credits + .15 acting skill
export function rankOf(g: GameState, s: ActorState): Standing             // standingOf(g, ACTOR_SPEC, starPower, s.memory)
export function pressure(g: GameState, s: ActorState, type: TypeId, role: Role): number   // clamp((mean top-3 active of the type - star) / 8, 0, 8) x (Lead 1, Supporting .5, Extra 0), +1 per rival who beat you twice, Supporting cap 4
export function clashOf(g: GameState, industry: IndustryId, type: TypeId, year: number): boolean   // seeded fact
export function grossOf(g: GameState, p: Proj, o: { luck: number; year?: number; leisure?: number; trend?: number }): number   // S5 step 5 formula, one formula for hints and rolls
export function breakEvenOf(p: Proj, scale: number): number               // 2.2 x cost x scale (TV 1.5)
export function awardOdds(g: GameState, s: ActorState, c: { quality: number; popularity: number; campaign: number; window: Proj['window']; studioFame: number }): number   // clamp(0.2 + (q-60)/60 + (pop-55)/150 + campaign/100 + window + studioFame/60 - fieldPressure, .03, .75)
```

- [ ] **Step 1: Write the failing tests**
`test/actor-state.test.ts` (legacy fixture built from the `ActorProfile` fields in `actor.ts`: reputation 62, 3 credits, 1 award, nominations 2, an agent, `dryYears` 1, plus `Job.data.project`):
```ts
it('migrates a legacy life in memory: view is byte-identical, first mut writes v1 once, the legacy flag is untouched [RF4]', () => {
  const before = JSON.stringify(g); const v = actorStore.view(g); expect(JSON.stringify(g)).toBe(before)
  expect([v.rep, v.credits.length, v.pipeline[0].stage, v.team.agent?.loyalty, v.migrated]).toEqual([62, 3, 'shoot', 60, false])
  const legacy = JSON.stringify(g.flags['special.actor']); actorStore.mut(g); actorStore.mut(g)
  expect((g.flags['special.actor.sim'] as { v: number }).v).toBe(1); expect(JSON.stringify(g.flags['special.actor'])).toBe(legacy)
})
it('adoptLegacy clears Job.data.project once and sets migrated', () => { adoptLegacy(g, s); expect(job.data.project).toBeNull(); expect(s.migrated).toBe(true) })
it('normalizes junk legacy and sim records with caps 64 / 40 / 4 and no NaN [RF1]', () => { /* credits 'bad'; 500 credits; 9 pipeline; 100 awards; type: { action: NaN }; team: 'x' */ })
it('reads another owner and the old owner key correctly [RF2]')
```
`test/actor-world.test.ts`:
```ts
it('resolves industry by country and year', () => { /* us 1995 hollywood; in 1950 bollywood; ng 1980 domestic, ng 1995 nollywood; kr 1960 kdrama; hk 1955 hongkong; fr domestic scale 0.25 x wealth, min 0.05 */ })
it('follows the heat keyframes', () => { expect(heat('hollywood', 1946)).toBeCloseTo(1.2); expect(heat('hollywood', 2020)).toBeCloseTo(0.5); expect(heat('hollywood', 1960)).toBeCloseTo(0.7); expect(heat('nollywood', 1991)).toBe(0) })
it('has 10 to 25 active rivals from 30 years after film start and none before', () => { /* every 5th year, one country per industry; before filmStart rosterAt = [] */ })
it('ranks monotonically in star power; pressure is 0-8, half for supporting (cap 4), zero for extras')
it('is pure, also on a frozen state [RF5]', () => { /* roster, rankOf, pressure, hotTypes, clashOf, grossOf: JSON and rng unchanged */ })
it('pins the gross curve', () => { /* studio film, hollywood 2000 (heat 1.2), leisure 1, trend 1, luck 1, buzz 0: r(q) = grossOf / breakEvenOf; expect r(55) < .85, r(70) in [.95, 1.15], r(85) in [1.3, 1.5] */ })
it('keeps studio-system years, the sound shift and clash facts deterministic')
```

- [ ] **Step 2: Run to see it fail** Run: `npx vitest run test/actor-state.test.ts test/actor-world.test.ts` Expected: FAIL, "Failed to resolve import '../src/game/special/actor-state'".

- [ ] **Step 3: Implement `actor-data.ts` and `actor-state.ts`**
`actor-data.ts` is data only, copying every number from S5 (Era and country, budgets, awards). `actor-state.ts`: `normalizeExtra(raw, g)` clamps every field and whitelists enums; `migrate[0]` reads the legacy profile through `viewActor(g)` and the Job (S5 Migration: rep from `reputation`; credits copied with `type` from `TYPE_OF[genre]`, `industry` from `industryOf`, gross 0, backend 0, `trust` false; agent becomes `team.agent { personId: '', loyalty: 60, since: g.year }`; `Job.data.project` becomes `pipeline[0]` with stage `shoot`, fee = pay, points 0, director 65). It is pure and never writes a legacy flag.

- [ ] **Step 4: Implement `actor-world.ts`**
Pure functions over `(g, industry, year)` as signed above; `ACTOR_SPEC` per S5 Rivals and market; `grossOf` is the S5 step 5 formula with `leisure = economyOf(g).sectors.leisure.demand` clamped 0.7-1.3 and the Nollywood x0.3 (before 2010) and Korean TV export multipliers applied where S5 says; no function draws `g.rng`.

- [ ] **Step 5: Run to see it pass** Run: `npx vitest run test/actor-state.test.ts test/actor-world.test.ts` Expected: PASS.

- [ ] **Step 6: Regression and typecheck** Run: `npx vitest run $LEGACY test/career-rivals.test.ts test/career-state.test.ts test/currency-static.test.ts` (legacy `actor.ts` only lost the `Role` declaration and gained exports; `currency-static` proves the data file formats no money at load), then `npm run typecheck`. Expected: PASS, no errors.

- [ ] **Step 7: Commit**
```bash
git add src/game/special/actor-data.ts src/game/special/actor-state.ts src/game/special/actor-world.ts src/game/special/actor.ts test/actor-state.test.ts test/actor-world.test.ts && git commit -m "feat(actor): industry data, sim state and world model" -m $'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13'
```

---

## Task 5: Actor pipeline and the yearly sim (S5 Yearly sim steps 1, 2, 4 to 10; Levers; Money)

**Files:**
- Create: `src/game/special/actor-pipeline.ts`, `src/game/special/actor-sim.ts`
- Modify: `src/game/special/actor.ts` (top guard in `yearlyActor`; `genListings` x industry scale, TV gating, 40% signature genres; `FIT` rows K-Drama and Nollywood Drama heartfelt, Martial Arts intense; `auditionBase` and the miss branch of `auditionScript` as in Step 4; the legacy `openAuditions(g)` and `landRole(g, l)` keep their names and delegate to the pipeline's `auditionBlock` and `landProject`), `src/game/special/kit/careers.ts` (import `actorSim`, first entry), `test/career-kit.ts` (`CAREER_SETUPS.actor`), `test/special-common-safety.test.ts` (append `'actor.sim'` to the key list at line 168)
- Test: `test/actor-pipeline.test.ts`

**Interfaces:**
- Consumes: Task 4 (`actorStore`, `adoptLegacy`, `ACTOR_SPEC`, `grossOf`, `breakEvenOf`, `awardOdds`, `pressure`, `rankOf`, `heat`, `industryOf`, `scaleOf`, `studioYear`); kit (`settleYear`, `CareerCtx`, `offerChoice`, `claimChoice`, `careerSay`, `gatedAction`); `actor.ts` `Listing`, `actorJob`, `masterActing`, `auditionBase`; `special/common.ts` `hire`, `syncTenure`, `addFame`.
- Produces:
```ts
// actor-pipeline.ts
export type ContractChoice = 'sign' | 'points' | 'exclusive' | 'push'
export function auditionBlock(g: GameState, s: ActorState): string | null           // reason or null: exclusive deal, lay-low year
export function slotBlock(s: ActorState, p: Pick<Proj, 'kind' | 'role'>): string | null   // one film and one series shoot, 4 projects counting post, Extras exempt, exclusive, same-kind second shoot
export function feeMult(s: ActorState, year: number, p: Pick<Proj, 'kind' | 'type'>): number   // (1 - scandal/250) x 1.2 for a type at typecast 50+ x the fee.* cool keys of Task 7 (all 1 until then)
export function landProject(c: CareerCtx<ActorState>, l: Listing, role: Role): Proj | null   // re-checks auditionBlock and slotBlock; adoptLegacy first; hires; Extras skip offers; else queues career.actor.contract
export function pushOdds(s: ActorState, l: Listing, others: number): number         // clamp(0.30 + star/250 + agentQ/300 + managerQ/500 + 0.06 x min(3, others), .10, .85)
export function contractEV(g: GameState, s: ActorState, l: Listing, option: ContractChoice): number   // net fee + points x max(0, projectedGross - breakEven) - 0.25 fee for exclusive, median luck
export function payActor(c: CareerCtx<ActorState>, gross: number, label: string): number   // cuts = round(gross x min(.30, agentCut + managerCut)); net via c.earn; totals; returns net
export function backEnd(p: Proj, gross: number, scale: number): number              // min(8M x scale, points x max(0, gross - breakEven))
export function wrapShoot(c: CareerCtx<ActorState>, p: Proj): void
export function releaseFilm(c: CareerCtx<ActorState>, p: Proj): void                // the one g.rng draw: luck 0.6-1.5
export function seasonTv(c: CareerCtx<ActorState>, p: Proj): void
export function developProject(c: CareerCtx<ActorState>, id: string): void          // once a year, +8-15 (+ manager q/12 free)
export function hireCostars(c, id: string): void; export function pressTour(c, id: string): void   // 4% of fee, buzz +6, twice a year
export function setWindow(c, id: string, w: 'awards' | 'dodge'): void; export function awardsCampaign(c, id: string): void; export function walkAway(c, id: string): void
export function stepResiduals(c): void; export function stepWrap(c): void; export function stepDry(c): void; export function stepAwards(c): void; export function closeYear(c): void
// actor-sim.ts
export const actorSim: CareerSim   // { id: 'actor', key: 'actor.sim', yearly }, yearly = settleYear({ career: 'actor', store: actorStore, incomeLabel: 'Residuals', active: g => !!actorJob(g), run, peers: { spec: ACTOR_SPEC, score: starPower } })
```

- [ ] **Step 1: Write the failing tests** (`test/actor-pipeline.test.ts`, `makeTestGame` 1995 us, job `actor`, `actorStore.mut` then `adoptLegacy`)
```ts
it('landing hires at once and queues one contract choice with four options [RF3]', () => { /* career.actor.contract: sign, points, exclusive, push; replaying the resolved modal changes nothing */ })
it('runs a film and a series together and blocks two films', () => { expect(slotBlock(s, { kind: 'film', role: 'Lead' })).toMatch(/film/); /* Extras exempt */ })
it('blocks an exclusive deal inside pickRoleScript with the menu bypassed', () => { /* runScript('special.actor.pick', ...) with an exclusive pipeline item: JSON unchanged */ })
it('names the top rival on a lost audition and adds grudge 10', () => { /* runScript('special.actor.audition', 'heartfelt', listing) with a score forced under 30: memory row for the top active rival of the listing's type has grudge 10, the notice names that rival; the same run on a no-record life leaves JSON as today */ })
it('resolves a legacy special.actor.pick modal queued before the first sim tick [RF4]', () => { /* legacy life, no record, queue the modal, then resolve: the role lands in pipeline and the legacy flag is untouched */ })
it('offers no streaming role in 1960 and no cable before 1980', () => { /* genListings over 30 seeds */ })
it('keeps gross curve points through the wrap', () => { /* the Task 4 three-point test again through releaseFilm with luck stubbed to 1 */ })
it('pays back-end only above break-even', () => { expect(backEnd(p, be * 0.9, 1)).toBe(0); expect(backEnd(p, be * 2, 1)).toBeCloseTo(p.terms.points * be) })
it('settles once per (year, age) [RF3]', () => { /* hook twice: JSON and rng equal after the second */ })
it('conserves money', () => { /* money delta over 5 years == sum(c.earn) from the audit == totals.net; totals.gross - totals.cuts === totals.net; checkLedger = [] */ })
it('lets the sim own a migrated life: yearlyActor returns at once [RF4]', () => { /* migrated: yearlyActor(g) leaves JSON and rng unchanged; not migrated + legacy profile: first sim tick adopts and returns, second settles */ })
it('leaves a life with no actor job and no record byte-identical through yearlySpecial [RF4]')
it('keeps junk sim records harmless [RF1]', () => { /* flag 'special.actor.sim' junk, and a legacy 'special.actor' profile with credits 'bad' under a hand-built actor job: yearlySpecial and renderAll do not throw */ })
it('stays under 6,000 JSON nodes and 40 KB after 40 simulated years')
```
Also add the `CAREER_SETUPS.actor` entry (hire via the legacy `hire(g, { defId: 'actor', ... })` fixture, then `actorStore.mut(g)`; `roots = [actorCareerMenu, ...actorJobNodes(g)]`; `prefer` over `actor.*` ids) and append `'actor.sim'` to the safety key list.

- [ ] **Step 2: Run to see it fail** Run: `npx vitest run test/actor-pipeline.test.ts` Expected: FAIL, "Failed to resolve import '../src/game/special/actor-pipeline'".

- [ ] **Step 3: Implement the pipeline**
Per S5 steps 4 to 10 and Levers, with these decisions: `landProject` is the only place a role becomes a `Proj` (it and every project action call `adoptLegacy` first, so the legacy hook never also holds a project) (director seeded at landing, `terms` from the listing with the standard points of S5 Levers, studio-system years force points 0, exclusive, fee x0.7; agents add fee x (1 + q/400) and `feeMult` applies, once each, here and not in the listing); contract options per S5 (Sign, Points fee x0.8 points x2.5 max 12%, Exclusive fee x1.2, Push fee x1.3 at `pushOdds` else 35% the offer lapses); every cost is `c.pay` re-checked inside `run`; wrap and release only for projects with `lastYear < year`, in id order; studio and blockbuster films go to `post` for a year, indie films and TV seasons release in the same tick. `closeYear` rewrites `standing = starPower`, `job.salary` = sum of shoot fees, enforces caps and returns the `YearRow` note (one "Year in Film" notice under 120).

- [ ] **Step 4: Implement `actor-sim.ts` and the `actor.ts` edits**
`run(c, live)`: if `!c.s.migrated` call `adoptLegacy` and return (the legacy hook already settled this year); if `!live` (the job is gone) run `stepResiduals` only, as the legacy hook did for a retired actor; else legacy duties (`syncTenure`, `masterActing`, `count('movies')`, own-flags `special.actor.bollywood|telenovela|dropped`), `stepResiduals`, (Task 6 adds `stepTeam` here), `stepWrap`, `stepDry`, `stepAwards`, `closeYear`. `yearlyActor` gains `if (actorStore.peek(g)?.migrated) return` as its first line; `genListings` multiplies fees by `scaleOf`, gates TV kinds (`hasTech tv`, cable 1980, streaming `hasTech streaming`) and gives a signature genre 40% of an industry's listings. Register `actorSim` in `kit/careers.ts`.
Audition edits in `actor.ts`, all no-ops without a record (`actorStore.peek(g)`): `auditionBase` subtracts `pressure(g, s, type, role)` and scandal / 10 and applies typecast (`type[t] >= 50`: +10 for that type, -10 for every other), with `type = TYPE_OF[l.genre]`, so the purple hint and the roll share one function; the miss branch of `auditionScript` (score < 30) names the top active rival of that type (the highest score in `activeField(g, ACTOR_SPEC, s.memory)` with `rival.edge === type`) in its notice and calls `applyEffects(c, { grudge: { id, name, by: 10 } }, 'Lost part')`; the hit branch calls `landProject`; the legacy `openAuditions(g)` and `pickRoleScript` refuse with the reason from `auditionBlock`. `pickRoleScript`'s limit and the `genListings` count stay as they are until Task 6 adds the manager. Both audition scripts build `careerCtx(g, 'actor', actorStore.mut(g), { ...ACTION_BUDGET })` for these calls.

- [ ] **Step 5: Run to see it pass** Run: `npx vitest run test/actor-pipeline.test.ts` and `npx vitest run test/careers-balance.test.ts -t actor` Expected: PASS.

- [ ] **Step 6: Regression and typecheck** Run: `npx vitest run $LEGACY test/actor-state.test.ts test/actor-world.test.ts test/career-money-scan.test.ts test/hedge-year.test.ts test/gameplay-creative-society.test.ts test/save-schema.test.ts`, then `npm run typecheck`. Expected: PASS, no errors (talent-perks pins the audition scripts and the gifted-versus-plain pay test).

- [ ] **Step 7: Commit**
```bash
git add src/game/special/actor-pipeline.ts src/game/special/actor-sim.ts src/game/special/actor.ts src/game/special/kit/careers.ts test/career-kit.ts test/special-common-safety.test.ts test/actor-pipeline.test.ts && git commit -m "feat(actor): pipeline, contracts, releases and the yearly sim" -m $'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13'
```

---

## Task 6: Actor team (S5 Levers: Team menu, Yearly sim step 3)

**Files:**
- Create: `src/game/special/actor-team.ts`
- Modify: `src/game/special/actor-sim.ts` (call `stepTeam` after `stepResiduals`), `src/game/special/actor.ts` (`actor.agent.hire` / `.fire` rows route to `hireRep` / `fireRep`; the legacy `special.actor.agent` script stays registered)
- Test: `test/actor-team.test.ts`

**Interfaces:**
- Consumes: Task 5 (`payActor`, `actorSim`), Task 4 (`Rep`, `actorStore`, `starPower`, `industryOf`); `people.ts` `createPerson(g, opts)`; `activities/common.ts` `stableName`; kit `CareerCtx`, `gatedAction`.
- Produces:
```ts
export type RepRole = 'agent' | 'manager'
export function candidates(g: GameState, role: RepRole): Rep[]                  // 3, cached by yearlyList; agent cut 8-14%, manager 11-17%, plus 0.02 while rankOf(g, s).rank <= 3 (A-list); searches 2 a year per role
export function pull(g: GameState, s: ActorState): number                       // 0.6 star + 0.2 rep + 3 x min(6, credits)
export function canSign(g: GameState, s: ActorState, rep: Rep, roll: number): boolean   // pull + roll (0-30) >= 0.8 x rep.quality
export function cutOf(s: ActorState): number                                    // min(0.30, agent.cut + manager.cut)
export function agencyHeat(g: GameState, industry: IndustryId, year: number): number   // seeded 0-1
export function poachRisk(s: ActorState, rep: Rep, heat: number): number        // clamp(0.03 + max(0, q-55)/250 + max(0, 55-loyalty)/250 + 0.05 x heat, 0, 0.35)
export function hireRep(c: CareerCtx<ActorState>, role: RepRole, index: number): void   // createPerson, loyalty 55; refuses without pull
export function fireRep(c: CareerCtx<ActorState>, role: RepRole): void          // removes the Person unless relationship >= 60
export function stepTeam(c: CareerCtx<ActorState>): void                        // loyalty +3 net pay, +2 hit, -5 dry; quality drifts 2 toward star; poach draw per rep; agent leaves at loyalty < 30 and dry >= 2; dead Person frees the slot
export function teamRows(g: GameState): MenuNode[]                              // actor.team, actor.agent.hire, actor.agent.fire, actor.manager.hire, actor.manager.fire
```

- [ ] **Step 1: Write the failing tests** (`test/actor-team.test.ts`)
```ts
it('signs only when pull plus the roll reaches 0.8 quality', () => { expect(canSign(g, s, rep, 30)).toBe(pull(g, s) + 30 >= 0.8 * rep.quality) /* and a direct hireRep run refuses below it */ })
it('keeps the combined cut at or under 30%', () => { s.team.agent!.cut = .14; s.team.manager!.cut = .17; expect(cutOf(s)).toBe(0.30) })
it('moves loyalty by +3 net pay, +2 hit, -5 dry and drifts quality 2 toward star')
it('keeps poach risk within 0.03 to 0.35', () => { /* sweep quality 20-95, loyalty 0-100, heat 0-1 */ })
it('frees the slot when the Person dies, with a notice, and removes a fired rep unless relationship >= 60')
it('draws one poach roll per rep and never twice for one (year, age) [RF3]', () => { /* hook twice: JSON and rng equal */ })
it('renders the team rows on a frozen state and refuses hireRep below pull by direct run [RF5]', () => assertMenuPure(g, careerRoots('actor')))
```

- [ ] **Step 2: Run to see it fail** Run: `npx vitest run test/actor-team.test.ts` Expected: FAIL, "Failed to resolve import '../src/game/special/actor-team'".

- [ ] **Step 3: Implement `actor-team.ts`**
Formulas as in the Interfaces comments and S5 step 3. A poach draw that hits sets `s.cool['poach.' + role] = year` (Task 7's `poach` def reads it as its weight gate); below loyalty 40 the rep leaves at once with a `careerSay` notice. Cuts are paid only inside `payActor`; hiring has no fee.

- [ ] **Step 4: Wire the sim and the legacy rows**
Add `stepTeam(c)` to `actor-sim.ts` `run` after `stepResiduals`; point the kept `actor.agent.hire` / `actor.agent.fire` ids at `teamRows` (ids unchanged). In `actor.ts`, `genListings` adds one listing and `pickRoleScript`'s audition limit adds one when `team.manager.quality >= 60` (the legacy 4 + 1 talent + 2 agent listings and 3 + 2 agent auditions already match S5), both no-ops without a record.

- [ ] **Step 5: Run to see it pass** Run: `npx vitest run test/actor-team.test.ts test/actor-pipeline.test.ts` Expected: PASS.

- [ ] **Step 6: Regression and typecheck** Run: `npx vitest run $LEGACY test/career-money-scan.test.ts`, then `npm run typecheck`. Expected: PASS, no errors.

- [ ] **Step 7: Commit**
```bash
git add src/game/special/actor-team.ts src/game/special/actor-sim.ts src/game/special/actor.ts test/actor-team.test.ts && git commit -m "feat(actor): agent, manager and poaching" -m $'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13'
```

---

## Task 7: Actor events and the scandal, range and press levers (S5 Events, Hints)

**Files:**
- Create: `src/game/special/actor-events.ts`
- Modify: `src/game/special/actor-sim.ts` (pass `crises: actorCrises`)
- Test: `test/actor-events.test.ts`

**Interfaces:**
- Consumes: Tasks 4 to 6; kit `defineCrises`, `CrisisDef`, `Effects`, `honest`, `hot`, `gatedAction`, `careerSay`; `nation/data.ts` `institutionStrength(country, year)`; `nation/state.ts` `policyOf`.
- Produces:
```ts
export const ACTOR_DEFS: readonly CrisisDef<ActorState, any>[]   // redScare, soundShift, guildStrike, techShift, scandalLeak, poach, franchise, shelved, censor, injury, rivalFeud (weight = the digest probability, cool 3-10 years, labels abridged from S5)
export const actorCrises: CrisisSet<ActorState>                   // defineCrises({ career: 'actor', store: actorStore, talent: 'Acting', defs: ACTOR_DEFS })
export function censorRisk(g: GameState): number                  // (100 - institutionStrength)/200 + mediaControl x 0.3 + 0.15 if authoritarian
export function apologize(c: CareerCtx<ActorState>): void         // free, once, scandal -25, fame -1
export function crisisPr(c: CareerCtx<ActorState>): void          // 10% of last year's net, scandal -40
export function layLow(c: CareerCtx<ActorState>): void            // no auditions this year, scandal -30
export function rangeWork(c: CareerCtx<ActorState>, type: TypeId): void   // manager only, 8% of last year's net (min 1,500 x scale), typecast -15, once a year
export function hirePress(c: CareerCtx<ActorState>): void; export function firePress(c: CareerCtx<ActorState>): void   // retainer max(1,000, 5% of last net) x scale; unpaid means they leave, no debt
```

- [ ] **Step 1: Write the failing tests** (`test/actor-events.test.ts`)
```ts
it('gates every def by era, industry and state', () => { /* redScare weight > 0 only for hollywood-type 1947-1957 with a credit; soundShift 1927-1931 once; guildStrike 1960/1980/2007/2023 with an active shoot; techShift first year techOdds passes .10; scandalLeak fame >= 25; franchise lead and star >= 40; shelved a film in post; censor risk > .25; injury action or genre; rivalFeud grudge >= 30 or lost >= 2 */ })
it('marks the bestStance option from the resolver odds and only with Acting', () => { /* for every def: hinted choice === bestStance; no Acting -> no hint */ })
it('rolls the odds it hints', () => { for (const def of ACTOR_DEFS) assertHonestOdds(def, mkFor(def)) })
it('keeps all text in voice and dated no later than 2026', () => { /* scene <= 140 ends What will you do?, outcomes <= 120, labels <= 5 words, no em-dash, voiceProblems = [] */ })
it('offers one choice per year and replays change nothing [RF3]')
it('scandal levers re-check cost inside run and refuse when short or out of order', () => { /* direct run: crisisPr with 0 cash -> no change; apologize twice -> once */ })
it('keeps fame, scandal and standing within 0-100 across every branch, started from 0 and from 99 [RF1]')
```

- [ ] **Step 2: Run to see it fail** Run: `npx vitest run test/actor-events.test.ts` Expected: FAIL, "Failed to resolve import '../src/game/special/actor-events'".

- [ ] **Step 3: Implement `actor-events.ts`**
Eleven defs from S5 Events: effects through `Effects` and `Branch.then(s, g)` (typecast, loyalty, `team` changes, buzz on a project, karma and notoriety through `addHidden`, acting skill through `setFlagSkill`). Fee modifiers live in `cool`: `fee.up` (x1.10), `fee.down` (x0.70), `fee.wait` (x0.75) and `fee.film` (x1.10, films only) hold the last year they apply, and `franchise.<type>` holds the projects left (a count, not a year); `feeMult` (Task 5) multiplies the ones in force for the landing year. Fixed outcomes (Stall on `redScare` is rolled, `Stage` on `soundShift` is fixed) follow S5. `make` captures the named rival from `standingOf` (`top[0]`) for `guildStrike`, `rivalFeud`. Every probability lives in one `odds()` per option.

- [ ] **Step 4: Wire the sim, run to see it pass**
Pass `crises: actorCrises` to `settleYear` in `actor-sim.ts`. Run: `npx vitest run test/actor-events.test.ts test/actor-pipeline.test.ts test/actor-team.test.ts` Expected: PASS.

- [ ] **Step 5: Regression and typecheck** Run: `npx vitest run $LEGACY test/career-crisis.test.ts test/career-money-scan.test.ts`, then `npm run typecheck`. Expected: PASS, no errors.

- [ ] **Step 6: Commit**
```bash
git add src/game/special/actor-events.ts src/game/special/actor-sim.ts test/actor-events.test.ts && git commit -m "feat(actor): eleven career events and scandal levers" -m $'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13'
```

---

## Task 8: Actor likeness trust, menus and wiring (S5 Legacy and exits, Levers)

**Files:**
- Create: `src/game/special/actor-legacy.ts`, `src/game/special/actor-menu.ts`
- Modify: `src/game/menus.ts` (line 42: `developmentNodes(g, a) ?? musicMasterNodes(g, a) ?? actorLikenessNodes(g, a) ?? ...`; one import), `src/game/special/actor.ts` (`actorCareerMenu.children` and `actorJobNodes` spread `actorMenus(g)` and `actorStanding`; ids kept), `src/game/special/actor-sim.ts` (`yearly = g => { yearlyLikeness(g); hook(g) }`)
- Test: `test/actor-legacy.test.ts`, `test/actor-menu.test.ts`

**Interfaces:**
- Consumes: Tasks 4 to 7; kit `standingMenu`, `gatedAction`, `careerCtx`, `ACTION_BUDGET`; `assets.ts` `Asset` (`kind 'other'`, `details`); `economy/model.ts` `economyOf`; `life.ts` `continueAsChild` (tests only).
- Produces:
```ts
// actor-legacy.ts
export interface Likeness { v: 1; author: string; actor: string; country: string; industry: IndustryId; streams: number; likeness: number; classics: number; licenseUntil: number; advance: number; unrecouped: number; receipts: number; lastPaid: number; lastYear: number }
export function likenessOf(a: Asset): Likeness | null                       // Asset.details.actorLikeness, junk-tolerant
export function likenessAtCreation(s: ActorState): number                   // min(100, 0.45 peak star + 3 awards + 4 classics + 0.5 credits); classics = credits with q >= 85 or an award
export function trustValue(m: Likeness, scale: number): number              // streams x 6 + likeness x 400 x scale
export function createTrust(c: CareerCtx<ActorState>): Asset | null         // c.pay 25,000 x scale (waived once on Retire); credits move in: trust = true
export function yearlyLikeness(g: GameState): void                          // any holder; per-asset lastYear; streams x (0.88 + 0.015 min(4, classics)); licensing = likeness x 150 x scale x leisure demand when likeness >= 20, c.earn to the holder; heirs lose 5 likeness a year
export function licenseFive(c: CareerCtx<ActorState>, id: string): void     // advance 3 x annual licensing, 35% recoups, rest expires
export function promoteEstate(c, id: string): void                          // 5% of value, +8, once a year
export function sellRights(c, id: string): void                             // c.earn 70% of value (income), removes the asset
export function actorLikenessNodes(g: GameState, a: Asset): MenuNode[] | null
// actor-menu.ts
export const actorStanding: MenuGroup                                       // standingMenu({ id: 'actor.standing', label: 'Career', standingLabel: 'Reputation', incomeLabel: 'Residuals', peers: ACTOR_SPEC + starPower })
export function actorMenus(g: GameState): MenuNode[]                        // team, pipeline, actor.project.<id> (develop, costars, press, release date, campaign, walk away), industry (read-only: rank, hot type, next year's clash, era rule), press, scandal (visible at scandal > 0), range, likeness, actor.retire (age >= 55 or 10 credits, no active shoot; leave 'retired', farewell notice)
```

- [ ] **Step 1: Write the failing tests**
`test/actor-legacy.test.ts`:
```ts
it('folds residuals into the trust with no double pay', () => { /* before: credits pay residual personally; after createTrust: credits trust true, money change in yearlyLikeness only */ })
it('pays one likeness cheque a year per asset [RF3]', () => { /* yearlyLikeness twice in one (year, age): JSON and rng equal */ })
it('recoups a five-year licence at 35% of licensing until unrecouped is 0, then expires without debt')
it('sells for exactly 70% of value, booked as income, and removes the asset', () => { expect(after - before).toBe(Math.round(0.7 * trustValue(m, scale))) })
it('lets an heir keep and collect, with an empty record [RF2]', () => { /* createPerson child, killCharacter, continueAsChild like test/workshop-migration.test.ts:262: asset present, yearlyLikeness(n) pays the heir, actorStore.peek(n) null; heirs lose 5 likeness a year; rosterAt(n, ACTOR_SPEC) names equal the parent's for the same year and country */ })
it('refuses minors and wrong owners on direct run, and renders pure on a frozen state [RF5]', () => { /* age < 18 gate; assertMenuPure over the asset view */ })
it('returns null and no nodes for junk likeness details without throwing [RF1]')
```
`test/actor-menu.test.ts`:
```ts
it('renders every actor menu on a frozen state without rng or writes [RF5]', () => assertMenuPure(g, careerRoots('actor')))
it('keeps the legacy ids', () => { /* actor.audition, actor.practice, actor.agent.hire, actor.agent.fire, actor.stunt, actor.quit found by findNode, for a migrated and for a legacy life */ })
it('refuses gated rows by direct run when the gate fails', () => { /* press hire without cash, range work without a manager, release date outside post, retire at 40 */ })
it('keeps a 12-year steady and reckless playthrough clean', () => { /* playCareer('actor', ...) via assertCareersClean for seeds 11, 12 */ })
```

- [ ] **Step 2: Run to see it fail** Run: `npx vitest run test/actor-legacy.test.ts test/actor-menu.test.ts` Expected: FAIL, "Failed to resolve import '../src/game/special/actor-legacy'".

- [ ] **Step 3: Implement `actor-legacy.ts`**
Modeled on `music-rights.ts` (`musicMaster` reader, `details.actorLikeness` v1, junk-tolerant). Asset actions are not career menu rows, so each `run` builds `careerCtx(g, 'actor', actorStore.mut(g), { ...ACTION_BUDGET })` and moves money only through `c.earn` / `c.pay`. Gate age 18 inside every `run`. The asset is divisible property: `continueAsChild` needs no edit.

- [ ] **Step 4: Implement `actor-menu.ts` and the wiring**
All rows are `gatedAction`s calling the Task 5 to 7 operations; the Industry rows are `info` nodes reading `rankOf`, `hotTypes`, `clashOf(next year)`; hints through `honest(g, 'Acting', ...)` from `bestListing` (legacy, now scoring with the Task 5 `auditionBase`), `contractEV` and the representative rule in S5 Hints. `menus.ts` gets the one chained `??`. Legacy rows once `migrated` (the legacy `project(job)` is then null): `actor.develop` and `actor.costars` are hidden, since `actor.project.<id>` replaces them; `actor.stunt` and `actor.quit` act on the first `shoot` project of `pipeline` (quit drops every shoot, rep -15, floor -30, fame -3); `actor.audition` stays visible while shooting and the slot rules refuse inside `landProject`. A life that is not yet migrated keeps all legacy rows as today.

- [ ] **Step 5: Run to see it pass** Run: `npx vitest run test/actor-legacy.test.ts test/actor-menu.test.ts` and `npx vitest run test/careers-balance.test.ts -t actor` Expected: PASS.

- [ ] **Step 6: Regression and typecheck** Run: `npx vitest run $LEGACY test/gameplay-creative-society.test.ts test/actor-state.test.ts test/actor-world.test.ts test/actor-pipeline.test.ts test/actor-team.test.ts test/actor-events.test.ts test/career-money-scan.test.ts`, then `npm run typecheck`. Expected: PASS, no errors.

- [ ] **Step 7: Commit**
```bash
git add src/game/special/actor-legacy.ts src/game/special/actor-menu.ts src/game/special/actor.ts src/game/special/actor-sim.ts src/game/menus.ts test/actor-legacy.test.ts test/actor-menu.test.ts && git commit -m "feat(actor): likeness trust, career menus and wiring" -m $'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13'
```

---

## Task 9: Astronaut data, state, world and class (S6 State, Migration, Rivals and market, Era and country)

**Files:**
- Create: `src/game/special/astronaut-data.ts`, `astronaut-state.ts`, `astronaut-world.ts`, `astronaut-class.ts` (all in `src/game/special/`)
- Modify: `src/game/special/astronaut.ts` (`export` added to `SPACE_AGENCIES`; nothing else)
- Test: `test/astronaut-state.test.ts`, `test/astronaut-world.test.ts`, `test/astronaut-class.test.ts`

**Interfaces:**
- Consumes: Task 1 (`defineCareerState`, `RivalSpec`, `activeField`); Task 2 `budgetLevel`; `nation/state.ts` `policyOf`; `economy/model.ts` `economyOf`; `history/timeline.ts` `hasTech`; `assets.ts` `seeded`; `world.ts` `namePoolOf`, `getCountry`; `events/wealth-core.ts`; legacy `astronaut.ts` profile shape (`missions`, `spacewalks`, `moonLandings`, `marsLandings`, `planets`) and `Job.data { agency, lastMissionAge }`.
- Produces:
```ts
// astronaut-data.ts
export type EraKey = 'race' | 'lull' | 'shuttle' | 'station' | 'commercial'   // 1957-75, 1976-80, 1981-99, 2000-19, 2020+
export type MissionId = 'hop' | 'orbit' | 'orbiter' | 'satellite' | 'station' | 'moon' | 'deep' | 'mars' | 'own'
export type Role = 'commander' | 'pilot' | 'specialist'
export type Regimen = 'light' | 'standard' | 'intense'
export const ERA: Record<EraKey, { fundBase: number; moodTarget: number; manifest: number; classEvery: number; seats: number; riskMult: number }>   // 70/30/52/46/56, 70/40/52/50/55, 5/1/5/4/5, 2/6/3/4/2, 10/3/14/10/12, 2.0/1.2/1.5/0.9/1.0 in era order
export const MISSIONS: Record<MissionId, { label: string; seatCount: number; days: number[]; risk: number; bonus: number }>   // seats / days / risk / bonus: hop 1 / [1] / .004 / .04; orbit 2 / [3] / .007 / .05; orbiter 6 / [10] / .008 / .06; satellite 2 / [8] / .008 / .07; station 3 / [90, 180, 365] (outpost years 1973-99: [28, 56, 84]) / .008 / .06; moon 3 / [8] / .014 / .12; deep 4 / [120] / .012 / .12; mars 6 / [420] / .020 / .20; own 3 / [5] / .010 / .06. Station risk is x (1 + days/720); where the legacy `DESTINATIONS` has a row its `bonus` is kept
export const AGENCY_FROM: Record<string, number>        // us 1958, fr 1961, in 1969, esa 1975, it 1988, ca 1989, ru 1992, cn 1993, jp 2003, gb 2010, ae 2014, kr 2024
export const SPACE_SHOCKS: { year: number; scope: 'world' | string; delta: number }[]   // S6 list
// astronaut-state.ts
export interface ClassRec { year: number; agency: string; seats: number; finalists: number; rank: number; cut: number; mates: string[] }
export interface FlightRec { year: number; type: MissionId; role: Role; days: number; regimen: Regimen; result: 'clean' | 'abort' | 'anomaly'; crew: string[]; bone: number; dose: number }
export interface Inquiry { id: string; year: number; cause: 'hardware' | 'procedure' | 'schedule' | 'crew'; lost: string[]; involved: boolean; yearsOpen: number; status: 'open' | 'closed'; stance: '' | 'cause' | 'protect' | 'recuse'; coverup: boolean }
export interface AstroExtra { agency: string; stint: string; bone: number; muscle: number; dose: number; family: number; mood: number; safety: number; lobby: number; skills: { eva: number; pilot: number; fit: number; team: number }; fund: number[]; classes: ClassRec[]; flights: FlightRec[]; inquiries: Inquiry[]; tally: { flights: number; days: number; evas: number; commands: number; lunar: number; mars: number; own: number; concerns: number; blame: number; firsts: string[] }; mark: { groundedYear: number; rush: boolean }; legacy: { hall: boolean; memoirs: { year: number; advance: number; last: number; paid: number }[] } }   // caps 6, 12, 4, firsts 8, memoirs 3, fund 6; start 40
export type AstroState = CareerBase & AstroExtra
export const astronautStore: CareerStore<AstroState>    // key 'astronaut.sim', version 1, start 40
export function readAstro(g: GameState): { missions: number; spacewalks: number; moonLandings: number; marsLandings: number }   // legacy profile, tolerates junk
export function astroPoliticsEdge(g: GameState): number   // min(6, 2 flown + 2 landing + 1 over 180 days + 1 hall) - 3 x blame; reads the record only
// astronaut-world.ts (pure)
export function eraKey(year: number): EraKey
export interface Access { agency: 'own' | 'partner' | 'sfa' | 'rocketeer'; id: 'oea' | 'sfa' | 'rocketeer'; name: string }   // id is the legacy AGENCIES id (own and partner are both 'oea'): it goes in Job.data.agency, ClassRec.agency and the astro.apply.<id> rows
export function access(g: GameState, year?: number): Access[]                  // own launchers us, ru from 1961, cn from 2003; partner from 1983; sfa from 1983; rocketeer needs hasTech privateSpace (crews 2020)
export function agencyName(country: string, year: number): string             // never before AGENCY_FROM; else 'National Space Program'
export function missionsOpen(g: GameState, agency: Access['agency'], year?: number): MissionId[]   // S6 windows
export function fundingIndex(g: GameState, s: AstroState, year?: number): number   // F = clamp(round(base x line^0.85 x econ x (0.7 + 0.6 x mood/100) + lobby), 5, 100); +8 with marsFunding
export function moodTarget(year: number): number; export function shock(year: number, country: string): number
export function launchRisk(g: GameState, s: AstroState, type: MissionId, days: number, o: { prep: number; squeeze: boolean; rocketeer: boolean }): number   // base x era x safety factor x prep (1.2 or 1.0) x squeeze 1.3 x rocketeer 2.2
export const FATAL_SHARE = 0.6
export function projectBody(s: AstroState, days: number, regimen: Regimen, fit: number): { bone: number; muscle: number; dose: number; strain: number; injury: number }   // bone days/30 x 1.3 x mult x (1.25 - fit/200), muscle 2.0, dose 0.12/day, strain days/30 x 1.4, mult 1.0/0.7/0.45
export const ASTRO_SPEC: RivalSpec   // career 'astronaut', edges pilot engineer scientist physician, debutAge [26, 40], length [14, 26], field 0 before 1959 or without access else era base 4/3/8/6/8, depth clamp(F/50, .5, 1.3) from astronautStore.view
// astronaut-class.ts
export type Background = 'pilot' | 'engineer' | 'scientist' | 'physician'
export function classYear(agency: Access['agency'], year: number): boolean
export function classSeats(g: GameState, s: AstroState, year: number): number          // clamp(round(base x F/50), 0, 40); rocketeer funded 40 + 2 x (year - 2008), cap 90
export function classBias(g: GameState, agency: string, year: number): Background       // seeded weighted pick by era (race .7 pilot; shuttle .35/.25/.25/.15; later .15/.3/.35/.2)
export function seededCandidates(g: GameState, agency: string, classYear: number, n: number): { name: string; score: number; bg: Background }[]   // seeded('astro|lifeId|agency|year|i'); score 34 + 24u1 + 22u2, +3 on bias
export function playerScore(g: GameState, s: AstroState, agency: string, year: number): number   // 8 + .30 smarts + .18 athleticism + .14 health + .22 readiness + degree (3, STEM 6, MD or doctorate 8) + min(6, 2 spaceCamp) - 5 convictions, +3 on bias; no roll
export interface BoardResult { rank: number; finalists: number; seats: number; cut: number; passed: boolean; bias: Background; you: Background; mates: string[] }
export function runBoard(g: GameState, s: AstroState, agency: string, year: number, o: { cohort?: boolean; roll: number }): BoardResult   // finalists = seats x 4 + 6 (cohort: seats x 0.6, 3 per seat); roll = randInt(g, -6, 6) from the caller; pure
export function boardNotice(r: BoardResult): string   // 'You placed 9th of 62. The class took 14.'
```

- [ ] **Step 1: Write the failing tests**
`test/astronaut-state.test.ts`:
```ts
it('migrates the legacy profile and job data in memory [RF4]', () => { /* tally from missions/spacewalks/moonLandings/marsLandings; standing = job.performance; skills = round(.6 x performance); bone/muscle 100, dose 0, safety 60; view byte-identical; mut writes v1 once; legacy flag and Job.data untouched */ })
it('reads a damaged legacy profile without throwing [RF1]', () => { /* planets 'bad', missions NaN: readAstro and view fine */ })
it('keeps junk sim records bounded [RF1]', () => { /* 500 flights, 99 inquiries, NaN bone: caps 12 / 4, bone 15-100, dose 0-100, safety 15-95, lobby -6..20 */ })
it('starts an heir clean [RF2]', () => { /* another owner reads fresh: standing 40 */ })
it('astroPoliticsEdge matches the formula', () => { /* 3 flights, a landing, a 200-day tour, hall, blame 1: min(6, 2+2+1+1) - 3 = 3 */ })
```
`test/astronaut-world.test.ts`:
```ts
it('follows the era and access table', () => { /* 1950 none; 1962 hop and orbit for us and ru only; 1970 moon us only; 1978 nothing; 1985 orbiter; 2005 station; 2024 own and hop; 2035 moon; 2045 mars (F >= 60 or marsFunding) */ })
it('never names an agency before AGENCY_FROM')
it('computes F by hand at line 0.5, 1 and 2 on a fixed economy fixture, rising with the line')
it('reads without touching nation.policy or g.rng [RF5]')
it('projects 180 days standard at fit 70 as bone -4.9, muscle -7.6, dose +21.6, strain +8.4', () => { const b = projectBody(s, 180, 'standard', 70); expect([b.bone, b.muscle, b.dose, b.strain].map(x => +x.toFixed(1))).toEqual([4.9, 7.6, 21.6, 8.4]) })
it('keeps launchRisk x FATAL_SHARE for a station tour inside 0.2% to 1.0%')
```
`test/astronaut-class.test.ts`:
```ts
it('seededCandidates is identical across calls and uses no g.rng')
it('passes smarts 95 and fails smarts 45 over 30 seeds, and a smarts-65 graduate clears between 30% and 60%')
it('keeps seats scaling with F and class years following the era table')
it('the board notice reads "You placed 9th of 62. The class took 14." for rank 9, 62 finalists, 14 seats')
it('adds +3 to a matching background and BoardResult.bias equals classBias(g, agency, year)')
```

- [ ] **Step 2: Run to see it fail** Run: `npx vitest run test/astronaut-state.test.ts test/astronaut-world.test.ts test/astronaut-class.test.ts` Expected: FAIL, "Failed to resolve import '../src/game/special/astronaut-state'".

- [ ] **Step 3: Implement data, state, world, class**
Data and formulas verbatim from S6 (every constant in `astronaut-data.ts` for one-file tuning). `migrate[0]` per S6 Migration; `readAstro` clamps with `int`. `fundingIndex` reads `budgetLevel(g, 'space')`, `economyOf` growth and deficit and `astronautStore.view`; `ASTRO_SPEC.depth` uses the same view so rosters stay pure. `runBoard` is pure given `roll`: candidates `n = finalists - 1`, rank = 1 + count(score > yours), `passed = rank <= seats`.

- [ ] **Step 4: Run to see it pass** Run: `npx vitest run test/astronaut-state.test.ts test/astronaut-world.test.ts test/astronaut-class.test.ts` Expected: PASS.

- [ ] **Step 5: Regression and typecheck** Run: `npx vitest run $LEGACY test/career-rivals.test.ts test/currency-static.test.ts` (`astronaut.ts` only gained an `export`), then `npm run typecheck`. Expected: PASS, no errors.

- [ ] **Step 6: Commit**
```bash
git add src/game/special/astronaut-data.ts src/game/special/astronaut-state.ts src/game/special/astronaut-world.ts src/game/special/astronaut-class.ts test/astronaut-state.test.ts test/astronaut-world.test.ts test/astronaut-class.test.ts && git commit -m "feat(astronaut): era data, corps state, world model and selection board" -m $'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13'
```

---

## Task 10: Astronaut flight board, yearly sim, legacy edits and the test rewrite (S6 Yearly sim steps 1 to 9, Levers, Pinned legacy)

**Files:**
- Create: `src/game/special/astronaut-flight.ts`, `src/game/special/astronaut-sim.ts`
- Modify: `src/game/special/astronaut.ts` (the only legacy edits: (a) `astro.academy` disabled before 1959 with "No agency trains astronaut candidates yet."; (b) `yearlyCadet` runs `runBoard` (cohort mode) for every agency in `access(g)` and posts one `boardNotice` each instead of the 75% offer roll (the one deliberate behaviour change); the legacy `special.astro.offer` choice then lists only the agencies cleared, carrying each `BoardResult` in its modal `data`, and its handler logs the `ClassRec` from that data (a modal without data hires with no `ClassRec`, as before; none cleared posts a notice and the graduate stays eligible for the apply rows); (c) `astro.apply.<agency>` enabled only in a class year with access, one try, `run()` rechecks age 50, health 45, access, class year; (d) `astro.mission` becomes the Flight Board; (e) promotion adds `&& astroPromotionOk(g, next)`, mandatory retirement reads age 68 when `job.level >= 6`, both no-ops without a record; (f) `astro.train` calls `trainSkills(g)`, no-op without a record; (g) asteroid sensor reliability + `skills.pilot / 400`, no-op without a record; (h) the flight bridge of Step 3; `export` added to `agencyOf`, `payFor`, `adata`, `DESTINATIONS`), `src/game/special/kit/careers.ts` (`astronautSim`), `test/career-kit.ts` (`CAREER_SETUPS.astronaut`), `test/special-common-safety.test.ts` (append `'astronaut.sim'`), `test/special.test.ts` (rewrite lines 260-298)
- Test: `test/astronaut-flight.test.ts`

**Interfaces:**
- Consumes: Task 9 (all); kit (`settleYear`, `offerChoice`, `claimChoice`, `gatedAction`, `activeField`, `standingOf`, `noteRival`, `honest`); `special/common.ts` `addColleague`, `leave`, `hire`; `core.ts` `counter`; `death.ts` `killCharacter`.
- Produces:
```ts
export interface Offer { id: string; type: MissionId; days: number; role: Role; seats: number; risk: number; rival: { id: string; name: string } | null; edge: number }
export function buildOffers(g: GameState, s: AstroState): Offer[]        // pure, seeded, no rng, 6 built, 4 shown; funding < 20 -> [] ("No flights are scheduled this year.")
export function bidRivals(g: GameState, s: AstroState, type: MissionId): CareerRival[]   // top active rivals whose edge fits the seat, from the kit activeField import (so a test can spy it)
export function bidScore(g: GameState, s: AstroState, o: Offer): number  // 0.5 standing + 0.3 seat skill (pilot, team, eva) + 4 x level; edge = bidScore - rival score
export function bidBlock(g: GameState, s: AstroState, o: Offer): string | null   // commander level 4+, pilot level 2+ and pilot skill 50+, specialist level 1+; grounded year; dose; dose + days x 0.12 > 100
export function runBid(c: CareerCtx<AstroState>, offerId: string): 'won' | 'lost' | 'sure'   // two bids a year, second at -3; randInt(-5, 5) vs rival score + seeded(-4..4); a win spends the astro.mission year action, a lost bid only the bid; no rival is a sure seat; against a named rival it books `noteRival` { met 1, then won 1 or lost 1 }
export function resolveFlight(c: CareerCtx<AstroState>, o: Offer, days: number, regimen: Regimen): void   // flight pay min(0.4 x salary, salary x bonus x (0.8-1.3) + 0.0006 x salary x days) via c.earn; body, dose, strain; launch roll on g.rng; a loss names 1-3 crew in one Inquiry; FlightRec; tally; one crewmate via addColleague (3 living at most)
export function trainSkills(g: GameState): void
export function astroBodyRows(g: GameState): MenuNode[]    // astro.rehab (c.pay localPrice(g, 6000), bone +2.5, muscle +6, once a year), astro.family (strain 40+: no flights, strain -25, happiness +6, standing -3)
export function astroPromotionOk(g: GameState, next: number): boolean   // standing >= 50/55/60/66/74 for the next rank and a free slot (caps 12/8/4/1 for ranks 2-5); true without a record
// scripts: 'career.astronaut.board' (bids), 'career.astronaut.plan' (tour length, then regimen for tours over 30 days)
export const astronautSim: CareerSim
```

- [ ] **Step 1: Write the failing tests**
`test/astronaut-flight.test.ts` (fixtures built with `hire(g, { defId: 'astronaut', ... })` then `astronautStore.mut(g)`; `soloCorps(g)` = `vi.spyOn(rivals, 'activeField').mockReturnValue([])`, restored in `afterEach`):
```ts
it('prints an edge equal to bidScore minus the rival score, and the hint marks the largest edge')
it('gates roles by level and skill inside run, not only in the menu', () => { /* commander level 3 refused; pilot skill 49 refused; direct runBid refused */ })
it('refuses a tour that would pass dose 100 and a bid in a grounded year, by direct run [RF3]')
it('keeps 300 seeded station flights within the launch-risk band', () => { expect(launchRisk(...) * FATAL_SHARE).toBeGreaterThanOrEqual(0.002); /* <= 0.010 */ expect(deaths(seeds 1..300)).toBeLessThanOrEqual(6) })
it('opens exactly one inquiry per lost crew')
it('settles once per (year, age) and pays salary and flight pay once [RF3]', () => { /* hook twice: JSON and rng equal; legacy hook still pays salary */ })
it('conserves money over 10 yearly cycles', () => { /* money delta == 10 x salary + sum(flight pay) + fees; checkLedger = [] */ })
it('rejects a stale or unknown board modal [RF3]', () => { /* old year, unknown offer id: no change */ })
it('keeps junk sim records harmless and renders pure [RF1] [RF5]', () => { /* flag 'special.astronaut.sim' junk, and a legacy 'special.astronaut' profile with planets 'bad' under a hand-built astronaut job, through yearlySpecial and assertMenuPure */ })
it('resolves a legacy special.astro.dest modal queued before the record exists [RF4]', () => { /* legacy life with a queued dest modal: resolving it still launches, pays the legacy bonus once through flyOn(paid false) and leaves the legacy flag shape intact */ })
it('pays flight pay once through the bridge', () => { /* resolveFlight then flyOn(paid true): the cash delta equals the c.earn flight pay, with no arrive bonus on top; the Moon is never an offer in 2026 */ })
it('keeps the legacy hook byte-identical for a no-record life apart from edit (b) [RF4]', () => { /* level-6 job, no record: retirement age unchanged; promotion unchanged */ })
it('stays under 6,000 JSON nodes and 40 KB after 40 simulated years')
```
Rewritten `test/special.test.ts` astronaut block (replaces lines 260 to 298): the graduation test expects a board-result notice ("You placed") after the two drill years, then, after `drain(g, ['oea'])` answers the graduation offer, `job.defId` `astronaut` and one `ClassRec` for a smarts-100 fixture; a smarts-45 fixture stays eligible; `astro.mission` for a candidate still reads `/not cleared/i`; the fame test (seeds 1 to 19, year 2026) uses `soloCorps`, drains with the default first choice, expects fame > 0, `counter(g, 'spaceMissions')` 1 and that no offer has type `moon`. Also add `it('closes the Academy before 1959')` (1950 life: `astro.academy` disabled).

- [ ] **Step 2: Run to see it fail** Run: `npx vitest run test/astronaut-flight.test.ts test/special.test.ts` Expected: FAIL, "Failed to resolve import '../src/game/special/astronaut-flight'" and the rewritten special tests failing on the old instant hire.

- [ ] **Step 3: Implement `astronaut-flight.ts`**
Decisions the spec leaves: `buildOffers` seeds from `` `astro|${familySeed}|${agency}|${year}|offer|${i}` `` over `missionsOpen`, count `min(4, manifest n)`; the plan script keeps `{ offerId, step }` in modal data and `claimChoice` guards every step; `bidScore` constants live in `astronaut-data.ts`; launch is `chance(g, launchRisk(...))`, fatal when `chance(g, FATAL_SHARE)`, a non-fatal loss is an abort or anomaly flight record.
**Flight bridge (legacy edit h).** The legacy `DEST_SCRIPT` stays registered for stale modals. Its post-launch tail (the asteroid chain, then `arrive`) becomes `export function flyOn(g, destId, launchText, paid)` in `astronaut.ts`, which `DEST_SCRIPT` calls with `paid` false (behaviour unchanged). The `Flight` data and `arrive` carry `paid`; when true, `arrive` skips its `earnIncome` bonus and the bonus sentence, because `resolveFlight` already paid flight pay through `c.earn`. `resolveFlight` runs the launch roll, pay, body, `FlightRec` and tally, sets `Job.data.lastMissionAge`, then calls `flyOn(g, legacyDest(o.type), text, true)`. `legacyDest` maps station, satellite, moon, deep and mars to themselves and hop, orbit, orbiter and own to a new `DESTINATIONS` row `{ id: 'flight', label: 'Crewed flight', minLevel: 1, fame: 1, bonus: 0.06, asteroids: 0.35 }`; `arrive` gains a `flight` case with a generic scene (no station, Moon or Mars wording). `arrive` still books `missions`, `count('spaceMissions')`, fame, happiness and performance, so the pinned fame test holds. `buildOffers` also applies the legacy level gate (`DESTINATIONS.minLevel`, mars 3 with `marsFunding`) on top of the role gates, the `astro.mission` gate keeps the legacy "not cleared" and health wording, and a won `runBid` spends `useYearAction('astro.mission')`.

- [ ] **Step 4: Implement `astronaut-sim.ts`**
`settleYear` body for S6 steps 1 to 9 in order (world F, mood, safety, body, family, manifest and peer accidents, class intake, standing, inquiry aging: close at once with safety +4 when not involved at `yearsOpen` 1, cover-up leak 20% a year for 3 years, unanswered at `yearsOpen` 3 closes as recuse; the testimony choice arrives in Task 11), flight pay via `c.earn`, admin years run no flights. The sim never pays salary. When `live` is false (cadet, retired, no job) the body runs only the Task 11 memoir tail. Register `astronautSim` in `kit/careers.ts`; make the legacy edits (a) to (h) in `astronaut.ts` guarded by `astronautStore.has(g)` where the Files list says no-op.

- [ ] **Step 5: Run to see it pass** Run: `npx vitest run test/astronaut-flight.test.ts test/special.test.ts` and `npx vitest run test/careers-balance.test.ts -t astronaut` Expected: PASS.

- [ ] **Step 6: Regression and typecheck** Run: `npx vitest run $LEGACY test/astronaut-state.test.ts test/astronaut-world.test.ts test/astronaut-class.test.ts test/career-money-scan.test.ts test/save-schema.test.ts`, then `ANACHRONISM_LIVES=60 npx vitest run test/anachronism.test.ts`, then `npm run typecheck`. Expected: PASS, no errors.

- [ ] **Step 7: Commit**
```bash
git add src/game/special/astronaut-flight.ts src/game/special/astronaut-sim.ts src/game/special/astronaut.ts src/game/special/kit/careers.ts test/career-kit.ts test/special-common-safety.test.ts test/special.test.ts test/astronaut-flight.test.ts && git commit -m "feat(astronaut): flight board, yearly sim and selection-board legacy edits" -m $'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13'
```

---

## Task 11: Astronaut events and exits (S6 Events, Hints, Legacy and exits)

**Files:**
- Create: `src/game/special/astronaut-events.ts`, `src/game/special/astronaut-exits.ts`
- Modify: `src/game/special/astronaut-sim.ts` (forced choice, `crises: astroCrises`, report card), `src/game/special/astronaut.ts` (spread `astroLobbyRows(g)` and `astroPublicRows(g)` into `astronautJobNodes`, replacing the legacy `astro.research` row with the hot-line version under the same id; the Corps page as a read-only child of `spaceLogMenu`), `src/game/special/politics.ts` (import `astroPoliticsEdge`; add it to the poll sum near line 669; droppable, two lines)
- Test: `test/astronaut-events.test.ts`, `test/astronaut-exits.test.ts`

**Interfaces:**
- Consumes: Tasks 9 and 10; kit `defineCrises`, `offerChoice`, `claimChoice`, `honest`, `hot`, `gatedAction`; `core.ts` `remember(g, text)` (not the kit's rival `remember`); `special/common.ts` `promote(g, job, title, salary, level)` for the admin levels (levels 6 and 7 of the same job sit beyond the legacy six-rung `RANKS`, so title and pay are set directly).
- Produces:
```ts
// astronaut-events.ts
export const ASTRO_DEFS: readonly CrisisDef<AstroState, any>[]   // scheduleSqueeze, appropriations, anomaly, crewFriction, boneScan, homeFront, lostCrew
export const astroCrises: CrisisSet<AstroState>                  // defineCrises({ career: 'astronaut', store: astronautStore, talent: 'Academics', defs: ASTRO_DEFS })
export function forcedChoice(c: CareerCtx<AstroState>): boolean  // medical board (dose >= 85 or bone < 55) first, then inquiry testimony; scripts career.astronaut.medical and career.astronaut.inquiry via offerChoice; a loser waits a year
export function reportCard(c: CareerCtx<AstroState>): void       // one notice when something moved: 'Funding 58, down 6. Mood 41. Safety 63. Bone 91, strain 34.'
export function astroLobbyRows(g: GameState): MenuNode[]         // astro.lobby (level 3+ or fame 20+, once a year, lobby +6, +3 if mood < 40, halves yearly, cap 20; hostile hearing -3 standing), astro.concern (standing -3, safety +3 if under 70, concerns +1), astro.research (three lines, hot() pays x1.5, points round(2 + (smarts-40)/10 + 0..4) x role factor, cap 200)
// astronaut-exits.ts
export function legacyPoints(s: AstroState): number               // 4 flights + floor(days/30) + 15 lunar + 25 mars + 3 commands + 2 evas + 6 firsts - 10 blame
export function adminBlock(g: GameState, s: AstroState): string | null   // level 3+, age 42+, flights 2+, standing 65+ or a medical ground
export function takeAdmin(c: CareerCtx<AstroState>): void         // levels 6 (Deputy 150,000) and 7 (Administrator 210,000 after 3 years); retire at 68; Job.data.admin { years, stance }; script career.astronaut.admin (push lobby +8 safety -4, fund safety safety +8 lobby -3, hold)
export function ownedSpaceCompany(g: GameState): { safety: number; booms: number; wins: number } | null   // reads g.assets raw and guarded: details.industry 'spaceTech' and tech.done holding 'crew'; null on any shape mismatch; no writes, no business import
export function ownBlock(g: GameState, s: AstroState): string | null     // astro.own from 2020 with privateSpace and 1+ flight
export function lectureFee(g: GameState, s: AstroState): number          // round(clamp(600 + fame x 160, 800, 30000) x clamp(wealth, .3, 1.2)); 3 a year
export function memoirAdvance(g: GameState, s: AstroState): number       // round(clamp(20000 + 15000 x flights + 4000 x fame, 20000, 600000) x wealth); tail .4A .24A .14A over three yearly hooks (1.78A), each guarded by its last-paid marker; every 8 years, max 3
export function hallOfFame(c: CareerCtx<AstroState>): void               // retiring at 60+: once, fame +4, one remember line
export function astroPublicRows(g: GameState): MenuNode[]                // astro.public (astro.lecture, astro.memoir), astro.admin, astro.own, Corps page
```

- [ ] **Step 1: Write the failing tests**
`test/astronaut-events.test.ts`:
```ts
it('makes every def reachable through its weight and offers one choice a year', () => { /* craft a state per def; forced choices take the slot first and the random one waits */ })
it('moves safety, standing and blame by the stated numbers for the inquiry choices', () => { /* Name the cause: safety +10 when it matches the stored cause, +3 if not, standing -4 when the truth is schedule; Protect: standing +3, safety -6, coverup; Recuse: blame +1 when involved */ })
it('marks the option that matches Inquiry.cause and the hot research line, with Academics only')
it('rolls the odds it hints', () => { for (const def of ASTRO_DEFS) assertHonestOdds(def, mkFor(def)) })
it('keeps all text in voice and uses no wording like moon landing before 1969')
it('replays a testimony or medical choice with no effect [RF3]')
it('shows the dose 100 flight ban inside run() by direct call')
```
`test/astronaut-exits.test.ts`:
```ts
it('refuses admin below its gates by direct run, then pays 150,000 and 210,000')
it('caps lectures at 3 a year and prices them by the formula; memoir pays 1.78 A over three yearly hooks with an 8-year cooldown and one payment per hook [RF3]')
it('leaves a fixture asset deep-equal through ownedSpaceCompany and hides astro.own on a shape mismatch')
it('fires the Hall of Fame notice once at 60+ and shows legacy points on the Corps page [RF5]')
it('gives an heir an empty record, no tail and no hall [RF2]', () => { /* continueAsChild: astronautStore.peek(n) null; yearlySpecial pays no memoir tail */ })
it('renders every new row on a frozen state [RF5]', () => assertMenuPure(g, careerRoots('astronaut')))
it('keeps astroPoliticsEdge numbers and the politics poll line droppable', () => { /* poll sum includes the edge; with the record absent the edge is 0 */ })
```

- [ ] **Step 2: Run to see it fail** Run: `npx vitest run test/astronaut-events.test.ts test/astronaut-exits.test.ts` Expected: FAIL, "Failed to resolve import '../src/game/special/astronaut-events'".

- [ ] **Step 3: Implement events and the sim hooks**
Seven random defs plus the forced scripts from S6 Events with the exact numbers there; effects through `Effects` and `Branch.then(s, g)` (hull, no-flight year via `mark.groundedYear`, `Inquiry.stance`, and the partner relationship of Home front through `addRelationship` on the living spouse or partner in `g.people`); `forcedChoice` and `reportCard` are called from the Task 10 `run` body, then `crises.offer`.

- [ ] **Step 4: Implement exits and the rows**
Per S6 Legacy and exits; every payment is `c.earn` (flight pay and fees taxed). `ownedSpaceCompany` reads raw JSON with guards and imports nothing from `business/`. `politics.ts` poll edge: `import { astroPoliticsEdge } from './astronaut-state'` and one added term in the sum; skip it if it collides.

- [ ] **Step 5: Run to see it pass** Run: `npx vitest run test/astronaut-events.test.ts test/astronaut-exits.test.ts test/astronaut-flight.test.ts` and `npx vitest run test/careers-balance.test.ts -t astronaut` Expected: PASS.

- [ ] **Step 6: Regression and typecheck** Run: `npx vitest run $LEGACY test/career-money-scan.test.ts test/fuzz-politics.test.ts`, then `ANACHRONISM_LIVES=60 npx vitest run test/anachronism.test.ts`, then `npm run typecheck`. Expected: PASS, no errors.

- [ ] **Step 7: Commit**
```bash
git add src/game/special/astronaut-events.ts src/game/special/astronaut-exits.ts src/game/special/astronaut-sim.ts src/game/special/astronaut.ts src/game/special/politics.ts test/astronaut-events.test.ts test/astronaut-exits.test.ts && git commit -m "feat(astronaut): inquiries, medical board, report card and five exits" -m $'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13'
```

---

## Task 12: Model state, data and core math (S7 State, Migration; Rivals and market; Hints)

**Files:**
- Create: `src/game/special/model-state.ts`, `src/game/special/model-data.ts`, `src/game/special/model-core.ts`
- Modify: `src/game/special/model.ts` (`export` added to `AGENCIES`, `RANKS`, `RANK_MULT`, `PHOTOGRAPHERS`, `DESIGNERS`, `viewModel`, `modelingSkill`, `bestAgency`, `looksBar`; nothing else)
- Test: `test/model-state.test.ts`, `test/model-math.test.ts`

**Interfaces:**
- Consumes: Task 1; Task 2 `CareerCtx`; `economy/model.ts` `economyOf`; `nation/effects.ts` `luxuryLevel`; `activities/common.ts` `priceLevel(g)`; `special/social.ts` `totalFollowers(g)`; `history/timeline.ts` `hasTech`; `shops/everyday-brands.ts` `brandPool`; legacy `model.ts` `AGENCIES`, `RANKS`, `RANK_MULT`, `PHOTOGRAPHERS`, `modelJob`, the `special.model` profile (`headshot`, `headshotAge`, `couture`, `gigs`, `rejectedBy`); test only: `business/` `newBiz`.
- Produces:
```ts
// model-state.ts
export type Focus = 'runway' | 'editorial' | 'commercial'
export type Kind = 'catalogue' | 'commercial' | 'digital' | 'editorial' | 'cover' | 'runway' | 'couture' | 'campaign' | 'face'
export type Season = 'couture' | 'aw' | 'ss' | 'year'
export interface MdOffer { id: string; kind: Kind; season: Season; circuit: string; brand: string; house: string; fee: number; days: number; minLook: number; minTitle: number; abroad: boolean; window: number; rivals: string[]; status: 'open' | 'booked' | 'lost' | 'passed' | 'paid'; terms: { agency: string; commission: number; mother: number } | null }
export interface MdContract { appointmentId: string; agency: string; tier: number; commission: number; guarantee: boolean; exclusive: boolean; since: number; until: number; advance: number; unrecouped: number; bookerId: string; bookerName: string }
export interface MdRow { year: number; src: string; gross: number; agency: number; mother: number; recoup: number; net: number }
export interface MdWindow { brand: string; category: string; until: number }
export interface MdProtege { id: string; name: string; born: number; look: number; book: number; signed: number }
export interface ModelExtra { focus: Focus; focusYear: number; restYear: number; planYear: number; book: number; buzz: number; rep: number; strain: number; mood: number; mother: { agency: string; booker: string; since: number; overrideUntil: number } | null; floor: number; board: { year: number; items: MdOffer[] }; windows: MdWindow[]; photographers: string[]; agencies: { name: string; from: number; to: number }[]; ledger: MdRow[]; life: { gross: number; net: number; agency: number; mother: number; recoup: number; booked: number; faces: number; shows: number; peak: number; peakYear: number }; proteges: MdProtege[]; exit: '' | 'photographer' | 'label' | 'agent'; likeness: number; announced: string[] }   // caps: board 8, windows 8, photographers 8, agencies 8, ledger 24, proteges 2
export type ModelState = CareerBase & ModelExtra
export const modelStore: CareerStore<ModelState>   // key 'model.sim', version 1, start 20
export function readContract(job: Job | null): MdContract | null   // validated by appointmentId, derived id fallback like workplace/state.ts
export function payOut(c: CareerCtx<ModelState>, src: string, amount: number, parts: { agency: number; mother: number; recoup: number }): number   // c.earn(net), one MdRow, life totals
// model-data.ts: CIRCUITS (Paris couture 1900, New York 1943, Milan 1958, Paris ready-to-wear 1966, London 1984, Tokyo 1985, Sao Paulo 1996, Berlin 2007; homes fr us it gb jp br de), KINDS (from years, fee/day/points tables), FOCUS mods, SEASON_CAP { couture: 8, aw: 12, ss: 12, year: 24 }, FACE_AGENCIES (keyed by the legacy `AGENCIES[i].name`, which is what `Job.company` holds: 'Hometown Faces' from 1925, book 0; 'Silhouette Models' 1925, book 12; 'Prestige Model Management' 1946, book 30; 'Icon Elite' 1960, book 50), brand categories, the legacy fictional `DESIGNERS` plus fictional magazines
// model-core.ts (pure)
export const MODEL_SPEC: RivalSpec   // career 'model', edges the three focuses, debutAge [16, 22], length [8, 20], field 0 before 1925 else 12
export function shelf(focus: Focus, age: number, talent: boolean, year: number): number   // S7 step 5
export function lookValue(g: GameState, s: ModelState): number          // base x shelf x (1 - 0.006 x max(0, strain - 60)); base = .6 looks + .15 headshot x fresh + .15 skill + 10
export function scoreOf(look: number, book: number, buzz: number, rep: number): number   // .35 / .30 / .20 / .15
export function rankingOf(g: GameState, s: ModelState): number           // standingOf rank + round(40 x clamp((70 - score)/60, 0, 1)^1.5); above 50 means 'outside the top 50'
export function settleFee(fee: number, agencyPct: number, motherPct: number, unrecouped: number): { agency: number; mother: number; recoup: number; net: number }   // gross = agency + mother + recoup + net exactly
export function commissionFor(tier: number, rep: number, guarantee: boolean): number     // base 18/20/20/22 by tier, rep trims up to 3, guarantee +3, clamp 12-30
export function strainNext(strain: number, days: number, trips: number, rest: number): number   // clamp100(0.5 strain + 1.2 days + 6 trips - 10 - rest)
export function strainRisk(strain: number): number                       // 0.02 + 0.006 x max(0, strain - 55), cap 0.29
export function castPlan(g: GameState, s: ModelState, o: MdOffer): { fit: number; rivalMean: number; odds: number }   // fit = clamp100(50 + .8 (standing - req) + 6 niche + 4 home + up to 8 followers + 6 talent), req 15/28/42/58/72; odds = clamp(logistic((fit - mean - 4)/12), .05, .92)
export function renewalOdds(rep: number, book: number): number           // clamp(logistic((rep + book - 90)/20), .10, .85)
export function marketFactor(g: GameState): number                       // clamp(0.6 consumer.demand + 0.4 leisure.demand, .6, 1.4)
export function labelHeadStart(g: GameState): number                     // Math.round(clamp(15 + hidden.fame / 4, 0, 60)), exactly the newBiz expression
export function bookAfter(book: number, wins: { points: number }[]): number   // each win (100 - book) x min(.5, points/100), then x0.93 a year
```

- [ ] **Step 1: Write the failing tests**
`test/model-state.test.ts`:
```ts
it('survives null, arrays, NaN, 500 rows and huge strings with every cap held [RF1]')
it('migrates a legacy model life in memory [RF4]', () => { /* book = round(headshot x .35 + min(30, gigs x 1.5)); rep 50, strain 10, mood 60; focus runway at age <= 25 and looks >= 70 else editorial; mother = job.company; view byte-identical, mut writes v1 once, special.model and Job.data untouched; contract built from the Job (guarantee, commission base+3, until = year + 2, floor = job.salary) by readContract */ })
it('starts an heir clean [RF2]')
it('keeps SAVE_SCHEMA at 2')
it('reads without writing, also on a frozen state [RF5]')
```
`test/model-math.test.ts`:
```ts
it('follows the shelf table by focus, age, talent, 1990 and 2010', () => { /* prime ends 24/30/36 (+2 Modeling); after it 1 - decay x years, decay .07/.05/.035, floors .25/.35/.45, +.05 from 1990, +.10 from 2010; 0.75 at 16, +.05 a year */ })
it('makes a New Face (looks 60, headshot 40, skill 20) base 55 and lookValue fall past strain 60')
it('conserves fees over 500 random inputs', () => { /* gross === agency + mother + recoup + net; settleFee(20000, 25, 5, 2000) -> net 12000 */ })
it('keeps commission 12-30 and odds .05-.92, rising with fit; ranking is monotone in score')
it('pins labelHeadStart to newBiz(...).brand')
it('keeps marketFactor in .6-1.4 over 1930-2025 and agencies from 1925 only')
it('builds the hint text from the castPlan odds rounded to 5%', () => { /* oddsText(castPlan.odds) */ })
```

- [ ] **Step 2: Run to see it fail** Run: `npx vitest run test/model-state.test.ts test/model-math.test.ts` Expected: FAIL, "Failed to resolve import '../src/game/special/model-state'".

- [ ] **Step 3: Implement state, data and core**
Verbatim formulas from S7 steps 4 to 7 and the Rivals bullet. `payOut` calls `c.earn(src, net)`, appends one `MdRow` (24 kept) and adds to `life`. `labelHeadStart` imports nothing from `business/`.

- [ ] **Step 4: Run to see it pass** Run: `npx vitest run test/model-state.test.ts test/model-math.test.ts` Expected: PASS.

- [ ] **Step 5: Regression and typecheck** Run: `npx vitest run $LEGACY test/currency-static.test.ts` (`model.ts` only gained exports), then `npm run typecheck`. Expected: PASS, no errors.

- [ ] **Step 6: Commit**
```bash
git add src/game/special/model-state.ts src/game/special/model-data.ts src/game/special/model-core.ts src/game/special/model.ts test/model-state.test.ts test/model-math.test.ts && git commit -m "feat(model): sim state, circuit data and core math" -m $'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13'
```

---

## Task 13: Model board, agency, contract and the yearly sim (S7 Yearly sim, Levers)

**Files:**
- Create: `src/game/special/model-board.ts`, `src/game/special/model-agency.ts`, `src/game/special/model-sim.ts`
- Modify: `src/game/special/model.ts` (menus only: `model.book` is replaced by `model.board`; `model.freelance` refuses under an exclusive contract inside `run()`; `model.sabotage` targets one of the three nearest rivals above you; `modelCareerMenu` and `modelJobNodes` spread `modelRows(g)` and `modelStanding`; `yearlyModel`, `bookingScript`, `BOOKINGS`, Fashion Week and the scout script are untouched), `src/game/special/kit/careers.ts` (`modelSim`), `test/career-kit.ts` (`CAREER_SETUPS.model`), `test/special-common-safety.test.ts` (append `'model.sim'`)
- Test: `test/model-year.test.ts`, `test/model-flow.test.ts`

**Interfaces:**
- Consumes: Task 12; kit (`settleYear`, `offerChoice`, `claimChoice`, `gatedAction`, `standingMenu`, `rollScore`, `noteRival`, `honest`); `special/common.ts` `hire`, `addColleague`, `leave`; `shops/everyday-brands.ts` `streamBrand(g, category, next, opts)` fed by a seeded `next`, over `brandPool`'s categories (`brandAvailable` is `data/brands.ts`).
- Produces:
```ts
export function buildBoard(g: GameState, s: ModelState): MdOffer[]      // seeded and streamBrand over brandPool, never g.rng; <= 8; wwi/wwii close abroad circuits and cut the board by 2; no commercial/digital in 1935
export function castBlock(g: GameState, s: ModelState, o: MdOffer): string | null   // prison, age < 16, strain >= 95, unsigned couture, exclusivity window conflict, season day overflow (couture 8, aw 12, ss 12, year 24), slots 3 + floor(title/2) (+1 commercial, -2 after a rest season; a lost casting uses one)
export function castOffer(c: CareerCtx<ModelState>, id: string): void   // re-checks castBlock; abroad runway or couture: c.pay(1,800), refused if short, +6 strain; rolls castPlan odds on g.rng; status booked or lost; terms snapshotted at cast; a failed pay refunds its useYearAction slot
export function signWith(c: CareerCtx<ModelState>, agency: string, kind: 'guarantee' | 'commission'): void   // Guarantee: floor = retainer x title multiplier, exclusive, commission base+3; Commission-only: no floor, non-exclusive, base; terms 2 years at tier 0, 3 at tiers 1-2, 4 at tier 3; under 23 with book < 30 an advance of 3,000 x (tier + 1) booked as income
export function switchAgency(c: CareerCtx<ModelState>, agency: string): void   // new agency gates; release fee max(2,000, half last year's commission) via c.pay, free once until has passed, mid-term exit -10 rep; leave then hire so appointmentId changes
export function restSeason(c): void; export function recoveryPlan(c): void      // strain -30, slots -2, buzz -6; c.pay(1,500 x priceLevel), strain -15, health +2; each once a year; abstract workload words only
export function focusChange(c, focus: Focus): void; export function portfolioShoot(c, photographer: number): void   // one change a year, free the first time then book -3 and buzz x0.8; PHOTOGRAPHERS 150 / 1,200 / 7,500 for 2 / 5 / 9 book points
// script 'career.model.renewal' (forced choice): renew, push (renewalOdds; win commission -3, miss mood -10), walk
export const modelStanding: MenuGroup     // standingMenu({ id: 'model.standing', standingLabel: 'Marketability', incomeLabel: 'Bookings', peers: MODEL_SPEC + scoreOf })
export function modelRows(g: GameState): MenuNode[]   // model.board, model.cast.<id>, model.focus, model.contract, model.switch, model.rest, model.shoot
export const modelSim: CareerSim
```

- [ ] **Step 1: Write the failing tests**
`test/model-year.test.ts`:
```ts
it('settles once per (year, age) and pays each booked fee once [RF3]', () => { /* hook twice: JSON and rng equal; booked -> paid before pay */ })
it('offsets the retainer so total = max(floor, net fees)', () => { /* a hand-built legacy job (salary 10,000, no bookings): yearlySpecial pays exactly 10,000 once; net fees 25,000 over floor 10,000 pays 15,000 on top; commission-only sets job.salary 0 and offsets nothing */ })
it('keeps the legacy yearlyModel pin: unknown company pays exactly 10,000 and leaves g.rng on replay')
it('keeps board, ledger, windows and rows in caps over 40 years and the record under 6,000 JSON nodes and 40 KB')
it('builds the same board after burning g.rng and the same JSON for the same seed twice')
it('gates by era and country', () => { /* 1935 no commercial or digital; 1950 US home circuit New York; 1999 JP Tokyo; no agencies before 1925; every brand passes brandAvailable; no circuit or brand dated after 2026 */ })
it('keeps junk sim records harmless [RF1]', () => { /* 'special.model.sim' junk, and a legacy 'special.model' profile with rejectedBy 'bad' and couture 'bad' under a hand-built model job, through yearlySpecial and assertMenuPure [RF5] */ })
it('resolves legacy special.model.scout and booking modals queued before the first sim tick [RF4]', () => { /* both resolve with no throw; the legacy flag shape is untouched */ })
it('keeps a legacy model life byte-identical until its first sim tick adopts it [RF4]')
```
`test/model-flow.test.ts`:
```ts
it('refuses castOffer with no state change for prison, age < 16, strain >= 95, unsigned couture, an exclusivity conflict and season overflow')
it('blocks freelance under an exclusive contract inside run()')
it('chains sign, renew and switch: release fee paid, appointmentId changes, mother override 5% for 8 years, renewal drops at mood < 35 or lookValue < 28 with a Dropped notice and careerHistory')
it('recoups an advance then writes it off with no debt')
it('replays a resolved choice with no effect [RF3]')
it('renders every row on a frozen state [RF5]', () => assertMenuPure(g, careerRoots('model')))
it('keeps a 10-year steady and reckless playthrough clean')
```

- [ ] **Step 2: Run to see it fail** Run: `npx vitest run test/model-year.test.ts test/model-flow.test.ts` Expected: FAIL, "Failed to resolve import '../src/game/special/model-board'".

- [ ] **Step 3: Implement board and agency**
As signed above and S7 Levers. Booked fees pay only in the settle; `castOffer` writes `terms` at cast. Casting results go through `noteRival`: a lost casting adds `{ met: 1, lost: 1 }` to the winning rival's row; a win adds `{ met: 1, won: 1, grudge: 1 }` to each shortlisted rival, with grudge held at 3 at most. `modelRows` rows are `gatedAction`s (gates re-checked in `run()`); the board row marks the best odds with `honest(g, 'Modeling', ...)` as 'Odds about 55%: your fit 64 against two rivals near 58.' from `castPlan`; rest rows show 'Injury risk this year at your workload: about 14%.' from about 3% from the kit's `odds` for the injury (`strainRisk` is only its weight).

- [ ] **Step 4: Implement `model-sim.ts` and the `model.ts` menu edits**
`settleYear` body for S7 steps 1 to 8 in order: refresh, settle (booked to paid, `settleFee`, `payOut`), retainer offset (`s.floor` is the retainer the legacy hook just paid; rewrite it at the end of each settle to the next tick's retainer, 0 when commission-only or no job), strain, look, book, buzz, rep, mood, ranking and report line ('Ranking 14, up 3. Kept $158K.'), contract end (drop or the renewal choice), then `buildBoard` for next year (written once). When `live` is false (job gone) only the booked rows settle, then Task 14's protege income. Registered through `kit/careers.ts`.

- [ ] **Step 5: Run to see it pass** Run: `npx vitest run test/model-year.test.ts test/model-flow.test.ts` and `npx vitest run test/careers-balance.test.ts -t model` Expected: PASS.

- [ ] **Step 6: Regression and typecheck** Run: `npx vitest run $LEGACY test/model-state.test.ts test/model-math.test.ts test/career-money-scan.test.ts test/hedge-year.test.ts test/save-schema.test.ts`, then `npm run typecheck`. Expected: PASS, no errors (special.test.ts pins `model.agency` and the New Face pay; talent-perks pins the scout script).

- [ ] **Step 7: Commit**
```bash
git add src/game/special/model-board.ts src/game/special/model-agency.ts src/game/special/model-sim.ts src/game/special/model.ts src/game/special/kit/careers.ts test/career-kit.ts test/special-common-safety.test.ts test/model-year.test.ts test/model-flow.test.ts && git commit -m "feat(model): season board, agency contracts and the yearly sim" -m $'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13'
```

---

## Task 14: Model events and exits (S7 Events, Legacy and exits)

**Files:**
- Create: `src/game/special/model-events.ts`, `src/game/special/model-exit.ts`
- Modify: `src/game/special/model-sim.ts` (`crises: modelCrises`; yearly exit unlocks and `protegeIncome`), `src/game/special/model.ts` (`model.quit` becomes Retire with `retireSummary`; spread `modelExitRows(g)`)
- Test: `test/model-exit.test.ts`, `test/model-voice.test.ts`

**Interfaces:**
- Consumes: Tasks 12 and 13; kit `defineCrises`, `honest`, `gatedAction`; `data/jobs.ts` `getJobDef(id)`; `careers.ts` `jobRequirementProblem(g, def)`, `hireForJob(g, InterviewJob)`, `eraPayShape(year, industry)`, `companyName(g, industry, r)` (inside `run()` only; if the import cycle ever bites, fall back to `special/common.ts` `hire(g, { defId: 'photographer', title: 'Photographer', company, salary, category: 'fulltime' })`); `business/founding.ts` `foundingProblem(g, 'fashion')`, `startFounding(g, 'fashion')` (called, never edited).
- Produces:
```ts
export const MODEL_DEFS: readonly CrisisDef<ModelState, any>[]   // agencyApproach (p .25), windowConflict, injury (weight strainRisk), testShoot (book >= 20, .30), rumor (grudge >= 2, rep < 60, .30), youngerFaces (age >= 27, runway, shelf < .85), likenessLicence (once a life, 2023+ with aiAssistants), pressStorm (fame >= 30 or followers >= 500,000, .12)
export const modelCrises: CrisisSet<ModelState>                  // defineCrises({ career: 'model', store: modelStore, talent: 'Modeling', defs: MODEL_DEFS })
export function exitBlock(g: GameState, s: ModelState, exit: 'photographer' | 'label' | 'agent'): string | null   // photographer: 3 collaborators, book >= 50, age >= 22 and jobRequirementProblem; label: fame >= 30, book >= 50, 10 bookings; agent: rep >= 55, age >= 28 or retired, 10 bookings
export function takeExit(c: CareerCtx<ModelState>, exit: 'photographer' | 'label' | 'agent'): void   // photographer: hireForJob at the Photographer rung; label: foundingProblem then startFounding; agent: c.pay(6,000 x priceLevel) once
export function scoutProtege(c: CareerCtx<ModelState>): void    // c.pay(1,200), seeded newcomer, at most 2 proteges, 8 years each
export function protegeIncome(c: CareerCtx<ModelState>): void   // 10% of 40,000 x RANK_MULT[tier + 1] x (0.5 + standing/100), <= 25,000 each, c.earn with the protege named; past book 60 in year 3 leaves at .25 and pays one finder's fee
export function retireSummary(c: CareerCtx<ModelState>): void   // leave(g, 'retired'), one notice (bookings, faces, shows, peak ranking and year, gross, kept), one remember line
export function modelExitRows(g: GameState): MenuNode[]         // model.exits (once a threshold passes or after retiring), model.exit.photo|label|agent; unlocks fire once and log in announced
```

- [ ] **Step 1: Write the failing tests**
`test/model-exit.test.ts`:
```ts
it('gates each exit and refuses direct runs below the gates, with no state change')
it('lands a photographer Job through hireForJob, and mirrors foundingProblem for the label row')
it('caps proteges at 2 and 25,000 each, and logs each unlock once in announced')
it('retires with one notice and a remember line and leaves nothing as an Asset')
it('gives an heir nothing: the record is empty and no protege income pays [RF2]')
it('replays an exit row or a choice with no effect [RF3]')
it('renders the exits menu on a frozen state [RF5]', () => assertMenuPure(g, careerRoots('model')))
```
`test/model-voice.test.ts`:
```ts
it('drives all eight events and every notice and log through voiceProblems = []', () => { /* LIMITS log 90, outcome 120, scene 140; labels <= 5 words; no em-dash; no promise words in hints */ })
it('names no registry brand with a negative word', () => { /* any string containing an allBrands() name must not match /\b(fail|failed|lost|scandal|sued|lawsuit|fraud|bankrupt|cancel|cancelled|banned|dropped)\b/i */ })
it('rolls the odds it hints', () => { for (const def of MODEL_DEFS) assertHonestOdds(def, mkFor(def)) })
it('keeps hostile records harmless through every event weight [RF1]')
```

- [ ] **Step 2: Run to see it fail** Run: `npx vitest run test/model-exit.test.ts test/model-voice.test.ts` Expected: FAIL, "Failed to resolve import '../src/game/special/model-events'".

- [ ] **Step 3: Implement events and exits**
Eight defs per S7 Events with the stated numbers (renewal is the Task 13 forced script; the digest's Show invitation is cut). Failures name a rival or "the client", never a registry brand; likeness licence only from 2023 via `hasTech aiAssistants`. Exits per S7 Legacy and exits; `exitBlock` reuses `foundingProblem` and `jobRequirementProblem` so the row mirrors the real gate; the hint 'A label starts at brand 31 of 60.' comes from `labelHeadStart`.

- [ ] **Step 4: Wire the sim and menus, run to see it pass** Run: `npx vitest run test/model-exit.test.ts test/model-voice.test.ts test/model-flow.test.ts test/model-year.test.ts` and `npx vitest run test/careers-balance.test.ts -t model` Expected: PASS.

- [ ] **Step 5: Regression and typecheck** Run: `npx vitest run $LEGACY test/career-money-scan.test.ts test/save-schema.test.ts`, then `npm run typecheck`. Expected: PASS, no errors.

- [ ] **Step 6: Commit**
```bash
git add src/game/special/model-events.ts src/game/special/model-exit.ts src/game/special/model-sim.ts src/game/special/model.ts test/model-exit.test.ts test/model-voice.test.ts && git commit -m "feat(model): career events, exits and protege income" -m $'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13'
```

---

## Task 15: Architecture docs and slice check (S10 Everywhere, S12 step 6)

**Files:**
- Modify: `docs/ARCHITECTURE.md` (one short section, about 40 lines, appended before "## UI contract")
- Test: no new file; the targeted runs below

**Interfaces:**
- Consumes: everything above. Produces: the docs section only.

- [ ] **Step 1: Write the section "## Careers 2.0 (special/kit and the three sims)"**
Cover, one line each: the three state keys `special.actor.sim`, `special.astronaut.sim`, `special.model.sim` (optional, owner-stamped, versioned, `KIT_LIMITS` rows 12 / memory 16 / cool 24 / done 24 / line 90, under 6,000 JSON nodes and 40 KB); the kit modules and their one-line contracts (`state`, `rivals`, `year`, `crisis`, `menu`, `careers`); the rule "money only through `c.earn` / `c.pay`" and the static scan test; derived rivals and why heirs meet the same peers with an empty record; the budget (1 choice and 2 notices from the yearly hook, 3 and 6 inside an action; 2 pending career choices at most); the legacy guards (`yearlyActor` top guard and `adoptLegacy`; the astronaut edits (a) to (g); `yearlyModel` untouched with the retainer offset); the actor likeness Asset (`details.actorLikeness`, chained in `menus.ts`); the four-line recipe for a new career (one import, one `CAREER_SIMS` entry, one menu child, one `...xJobNodes(g)`); where the tuning constants live (`actor-data.ts`, `astronaut-data.ts`, `model-data.ts`); what is cut (Music 2.0, sector families, minigames).

- [ ] **Step 2: Run the slice checks** Run: `npx vitest run $LEGACY test/career-state.test.ts test/career-rivals.test.ts test/career-year.test.ts test/career-crisis.test.ts test/career-menu.test.ts test/career-money-scan.test.ts test/actor-state.test.ts test/actor-world.test.ts test/actor-pipeline.test.ts test/actor-team.test.ts test/actor-events.test.ts test/actor-legacy.test.ts test/actor-menu.test.ts test/astronaut-state.test.ts test/astronaut-world.test.ts test/astronaut-class.test.ts test/astronaut-flight.test.ts test/astronaut-events.test.ts test/astronaut-exits.test.ts test/model-state.test.ts test/model-math.test.ts test/model-year.test.ts test/model-flow.test.ts test/model-exit.test.ts test/model-voice.test.ts test/gameplay-creative-society.test.ts test/save-schema.test.ts test/hedge-year.test.ts` Expected: PASS.

- [ ] **Step 3: Run the matrix, the opt-in fuzz and the anachronism lint** Run: `npx vitest run test/careers-balance.test.ts` (3 careers x steady and reckless x seeds 11 and 12 x 10 years, about 180 s), then `FUZZ=1 FUZZ_SEEDS=30 FUZZ_YEARS=16 npx vitest run test/fuzz-careers.test.ts`, then `ANACHRONISM_LIVES=60 npx vitest run test/anachronism.test.ts`. Expected: PASS; `note-` lines in the fuzz output are read, not failures. Not the full suite.

- [ ] **Step 4: Typecheck, em-dash count and money-at-load** Run: `npm run typecheck`, then `npx vitest run test/voice-guards.test.ts test/currency-static.test.ts`. Expected: no errors; em-dash count still 24 or fewer; no `money()` call while the modules load.

- [ ] **Step 5: Commit**
```bash
git add docs/ARCHITECTURE.md && git commit -m "docs: careers 2.0 kit and the three sims" -m $'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Tq5bMwVNBuT54ZtqpiXV13'
```
