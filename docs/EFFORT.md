# Effort

How research, practice and study work since R3 (v5.1.0): one engine that turns what a person or a company puts into a piece of work into odds, years and quality, and says why. Plain hyphens only: `test/effort-api.test.ts` fails on an em-dash or an en-dash here, on a constant of `src/game/effort/limits.ts` that has no row in section 6 or a row with another value, and on a name of the barrel that this note never writes.

## 1. What the engine is

- It lives in `src/game/effort/` and is imported through `src/game/effort/index.ts`. The folder is layer 2 (`WORLD_DIRS` in `test/layer-kit.ts`), so a domain above it (business, the Workshop, education) imports it directly and no `contract.ts` is needed. It may not import `household.ts` or `business/`: the player's fatigue is read raw from `flags.household`, and the staff traits are known by id.
- It draws no random number and books no dollar. The caller makes the one draw it has always made, hands it to `resolve`, and pays through the ledger with a reason. `quote` never reads the roll, never reads cash and writes nothing, so a deep-frozen state with a trapped `g.rng` reads fine (`test/effort-pure.test.ts`, `test/effort-conservation.test.ts`).
- Money buys odds and speed and never a lower price: `Quote.spend` is `k * task.cost`, and `cost` never scales with wealth.
- Balance is unchanged at the defaults (ambition 50, steady, fatigue 0, no know-how, no crew). Every term of the model is exactly zero there, so an old formula routed through `quote` gives its old answer bit for bit, and each migrated system keeps a parity grid against the oracle recorded on unmodified v5.0.0 code.
- The one saved thing is the player's record, `flags['effort.you']` (section 3). Each piece of work keeps its own optional `Fx`, and each company its own know-how map; the callers hold both.

## 2. The model

`quote(g, task, input)` answers with `Quote`: `p` (the odds it works), `hitP`, `years`, `yearsExact`, `quality`, `spread`, `k`, `spend`, `payrollX`, `reasons`, `effort` (`crew`, `tools`, `rho`, `phi`, `speed`), `risk`, `burnout` and `capped`. In the order the numbers are worked out:

1. **The budget multiple `k`** is the money relative to the task's normal cost, cut to `K_MIN` and the least of the task's `kmax` and `K_MAX`. More than 4 times the normal budget buys nothing more, and `capped` says so (`k`).
2. **Money** gives the odds before the other terms: `pk = 1 - (1 - base) * k^-oddsExp`, cut to `oddsLo..oddsHi`. `base` is the caller's own odds (the task's `p0` when left out).
3. **Deviations** are odds points, and each is exactly 0 at the defaults:

| Term (key) | Label | Points | Bound |
|---|---|---|---|
| crew | crew | `crewPts * log2(crew ratio)` | plus or minus `CREW_PTS_MAX`; the ratio is 0.25 to 4 |
| tools | tools | `TOOLS_PTS * tools` (tools is 0 to 1) | 6 |
| know | know-how | concave in know-how, exactly `KNOW_ODDS_MAX` at 100 | 15 |
| hard | hard field (easy field when positive) | `-HARD_PTS * (hardness - 1)` | hardness 0.5 to 2 |
| rival | rival pressure | the caller's pressure, as a loss | `RIVAL_PTS` |
| spill | public research | the caller's public pool, as a gain | `SPILL_TERM_MAX` |
| bold | bold plan | a bold plan pulls the odds toward 50%, a cautious one pushes away | zero at ambition 50 |
| tired | tired | `-TIRED_PTS * (1 - phi)` | about 10, since `phi` is never under 0.74 |

   Crew, tools, hard, bold and tired are shifts in logit space that add up, so none can push the odds past the clamp. Know-how, rival pressure and public research are then added in odds points, so each is worth exactly its capped points in the final odds whatever the others did: 100 know-how moves the odds by at most 15 points under every plan, a bold one and a tired one included (`deviate` cuts the know-how term at `KNOW_ODDS_MAX` where it enters the odds, and `test/effort-know-cap.test.ts` holds it over a grid of 189,000 inputs). The result is cut to `oddsLo..oddsHi`.
4. **Years** are `baseYears / (k^yearsExp * speed)`, with `speed = crew * (1 + 0.3 * tools) * rho * phi * (1 + knowYears * know / 100)`, rounded up and cut to `minYears..maxYears`. Only the studio engine sets `knowYears` (0.15), because it has no odds: everywhere else know-how buys odds only.
5. **Quality** is a budget curve plus know-how, cut to `lo..hi` and bent under the task's ceiling by `softCeil`: `up * (1 - k^-exp)` from k = 1, `down * log2(k)` below it. The quality never passes `ceiling`, and a `room` of 0 is a hard clamp, which is how the product task keeps its old `clamp(x, 5, 97)`.
6. **The lines** (`reasons`) are the caller's own terms first (`baseTerms`: team, a steady CEO), then funding and the engine's terms in the order crew, tools, know, hard, rival, spill, bold, tired. The engine's lines add up to `round(p * 100) - round(base * 100)` (what rounding and interactions leave goes to the largest line; know-how, rival pressure and public research add exactly their points and take no share of it, so their lines stay inside 15, 8 and 18 and on their own side of 0, and what the cap cuts goes to the largest line that has no cap), and a line of 0 is left out. The labels are `TERM_LABEL`.

A worker's output is `skill/100 * (0.35 + 0.95 * morale/100) * (0.9 + 0.2 * drive/100) * phi(fatigue)`, the shape of the leadership formula. A neutral worker (drive 50, fatigue 0) is the old formula bit for bit, and a driven one is at most 10% faster, so staff traits (`staffDrive`) matter with no free edge. The crew is the labor of the people (`laborOf`, which saturates at the task's `fteCap`, at most `FTE_CAP_MAX`) to the 0.8 power times their output, against the reference crew the task was calibrated on.

**Ambition and posture.** The pace ambition buys is `rho = 0.85 + 0.30 * (ambition/100) * POSTURE_FACTOR[posture]`, linear in ambition and cut to `RHO_MIN..RHO_MAX`: exactly 1 at ambition 50 and steady, never more than 1.25 (a quarter faster) at any ambition and posture. Pushing pays for the pace in fatigue (section 3), and fatigue takes it back: `phi = 1 - FATIGUE_SLOPE * max(0, fatigue - FATIGUE_KNEE)`. Ambition widens the variance (a bold plan has a wider quality spread and a larger chance of a hit) and adds no edge to the odds themselves. A strictly concave curve through "50 steady is 1" and a cap of 1.25 would have to be linear, so the cap, the fatigue and the burnout are the price; `rhoOf` is the one function to change if the owner wants a curve.

**Know-how** is a map from a field key (`rd.beverage`, `ops.<track>`, `dt.<trade>`, `dt.aiLab.cap.<cap>`, `studio.engine`, a Workshop category; `/^[a-z][a-zA-Z0-9.]{0,39}$/`) to 0 to 100. The player's is `fieldK` in the record, a company's is `BizState.knowHow`, passed to `step` by reference. At most `KNOW_HOW_FIELDS` fields; a value under `KNOW_FLOOR` is dropped; an idle field keeps `KNOW_FADE` of itself each year.

**Know-how is the only memory of a failure.** A failed project banks `KNOW_BANK * 100 * done`, damped by `(1 - K/110)^1.3`, so the odds it can ever buy stay under 15 odds points (`KNOW_ODDS_MAX`). A win banks no know-how; for the player it adds `WIN_SHIFT` to the ambition shift. `knowGain` and `Task.learn` belong to study and practice (R6), and no migrated system calls them.

**The terms from the world.** `spillPts(pool)` is public research a quote may take, at most 18 odds points, and one disclosure adds at most `SPILL_PTS_MAX` (6) to the pool; `rivalPts(pressure)` is at most 8; `ceilingOf(frontier, headroom)` is the highest a field's quality can be, and a task passes it as its curve's `ceiling`. The Frontier track works the three numbers out. The engine only bounds them, and the labels "public research" and "rival pressure" are the same two strings Frontier's reasons use.

## 3. The player

**Ambition** is hidden and derived, never stored: `0.5 * willpower + 0.3 * discipline + AMBITION_BASE + talents + shift`, cut to 0 to 100. The 6 centres a mean life (willpower 55, discipline 55) on 50. Inventor, Business, Leadership, Academics and Athletics add 4 each, Main Character Syndrome adds 8, at most 10 in all; `shift` is what results did to it (a win adds `WIN_SHIFT`, a burnout adds `BURNOUT_SHIFT`, within plus or minus `SHIFT_MAX`). Nothing shows under 18. From `AGE_REVEAL` the Profile shows a word (`ambitionWord`): Easygoing under 25, Steady under 45, Driven under 65, Hungry under 85, else Relentless. `ambitionReveal` also gives the rounded number, for a mode that shows exact figures.

**Posture** is the yearly pace, chosen in Life Priorities from 18: lean (take it easy), steady (the default) or push (push hard). The choice takes effect at the next age-up, like the priorities in `household.ts`, and holds until it is changed. A year of each adds `POSTURE_STRAIN` to the household's fatigue (lean rests, push builds 10), through `effortStrain`, one added term in the fatigue formula of `yearlyHousehold`. `postureNodes(g)` builds the rows (an info row and three actions, ids `effort.posture.lean|steady|push`) and is pure to read, so walking the menu changes nothing.

**Burnout.** At fatigue `BURNOUT_F` (85) or more, the yearly settle records a burnout: the ambition shift drops by 1, the year ahead is lean, and one notice at most every 3 years says "You pushed past your limit. You're easing off this year." So over 200 years of push at ambition 100 the speed `rho * phi` never exceeds 1.25 and every burnout drops the next year to lean, and a 10-year push at an ambition under 50 ends slower than steady (`test/effort-longrun.test.ts`).

**Focus weeks.** One pool of 12 focus weeks (`FOCUS_WEEKS`) a year replaces the four counters that Study Harder, club practice, lessons and tutorials had: `study` (3), `practice:<id>` (2), `act.lesson.<id>` (3) and `computer.dev.tutorial` (3). The pool is derived: the sum of the `g.yearActions` counters of `FOCUS_KEYS` (`workshop.build` and `workshop.brainstorm` count weeks too), which `aging.ts` already empties at every age-up, so there is no new saved field and the golden `character` slice is unchanged for a life within its old caps. `spendFocus(g, key, full, weeks = 1)` adds the weeks to the key's own counter, so the four sites keep their counters byte for byte.
- Within a key's own `full` (today's cap) a week is worth what it always was (`mult` 1). Beyond it a week still runs, at half value (`mult` 0.5).
- Once the 12 weeks are used, each further week is overtime: it adds one to `EffortYou.over` (`OVERTIME_STRAIN` of fatigue at the settle), up to `FOCUS_OVERTIME_MAX` more.
- The 25th week is refused: "You can't fit another week into this year." Overdoing is fatigue now, not a refusal at 3 (the fourth Study Harder runs at half value; `moved-tests.md` has the row).
- `focusPreview` and `focusReason` are the pure checks for a `disabledReason` and for the check a site makes before it takes payment.

**The saved record.** `flags['effort.you']` is personal (`world-flags.ts`: an heir starts clean) and owner-stamped with the `household.ts` string, so another life's record reads as the defaults. It holds `shift`, `posture`, `effective`, `over`, `fieldK`, `at`, `burnouts`, `burnAt` and `last`. It is created on first use and `writeYou` stores nothing when the record equals the defaults, so an untouched life has no key, no golden digest moves, and an old save has nothing to migrate. `readYou` is total: a save may hold anything, and every read cuts the record to its ranges and never throws. `effortModule` (id `effort.you`, layer 2) is the one yearly entry, phase `life`, order 35, right after the household has booked the year's fatigue. `yearlyEffort` is idempotent by `last`, makes the chosen posture effective, clears the overtime, fades the idle fields and records a burnout.

## 4. Results and learning

- `resolve(q, u, { drawHit, done, partial })` says how the run came out. It works exactly when `u < q.p`, the game's own roll test, so the caller keeps its draw order: `drawHit()` is called only when the run works and `hitP` is above 0. A failure carries its `cause`, a pure function of the reasons: the largest negative line (funding starved it, a crew churned, a rival got there first, you were tired, a bold plan took a shortcut, any other term is a dead end).
- `landQuality(q, task, r, hit, bounds?)` is `round(clamp(q.quality + (2r - 1) * q.spread + hit bonus, lo, hi))`, the launch roll with the caller's own draw.
- `step(g, task, outcome, ctx)` books the result once a year: the know-how of a failure, the ambition of a win, the project's `Fx` (`progress`, `quality`, `spent`, `hours`, `setbacks`, `insight`, `last`), and one `Reveal` (strength 0.35 times how far it got on a failure, 0.5 to 1 on a win, so research pays visibly). It is idempotent by `fx.last` (or by the field's `at` stamp for the player), so a replay changes nothing and returns `replay: true`. After booking, and never on a replay, it hands the reveals to the sink hook (section 5).
- `Fx` has nine fields, each within its cap (`FX_CAPS`). `normalizeFx` is total, and a project keeps its `fx` optional: an old save has none.
- The engine tells nobody when a notice is due and rolls no risk. Every notice and log line belongs to the caller, in the voice of `docs/VOICE.md` (contractions, no dash, a log line at most 90 characters).

## 5. What the player reads

- `oddsLine(q, policy?)` is "Odds 62%: team +9, funding +7, hard field -12, tired -4": the four terms that moved the odds most and "other +2" for the rest, at most 110 characters. `whyLines` gives one short sentence for each term, `causeLine(cause, field)` says why a failure failed ("The budget was too thin for a field this hard."), and `payoffLine(task, outcome, result)` says what a result left behind for every outcome ("You learned the field better: know-how 34."). `whyNodes(g, q)` builds the info rows for a menu. All of them are pure text.
- What the player may see is the reveal policy. `revealPolicyOf(g)` gives `EXACT_POLICY` while nothing is bound, which is what the test suite runs under (Exact mode): every number shows. Fog binds a realistic policy once (`bindRevealPolicy`): the odds read "about 60%", and a term the player doesn't know shows as "unknown factors" with no number, in the odds line and in the reasons alike. Knowledge binds the reveal sink once (`bindRevealed`): each `Reveal` that `step` returns becomes a reading of a stored estimate.
- The two hooks are not kernel ports. `test/hub-entry.test.ts` fails when a defined port is unbound after the real entry points, and the binders merge after this track. A second bind of the same function is fine and a different one throws, as with a port.

## 6. Constants

Every number that bounds the engine is in `src/game/effort/limits.ts`, and every growth term has a ceiling with a 100x probe row (`test/effort-ceilings.ts`, `test/ceiling-list.json`). Change a value in the file and in its row here together.

| Constant | Value | What it bounds |
|---|---|---|
| `K_MIN` | 0.01 | The least budget multiple. |
| `K_MAX` | 4 | The most budget multiple: more money buys no more odds, speed or quality. |
| `KNOW_MAX` | 100 | Know-how in one field. |
| `KNOW_HOW_FIELDS` | 40 | Fields in one know-how map. |
| `KNOW_FLOOR` | 0.5 | A value under this is dropped from a map. |
| `KNOW_FADE` | 0.95 | What an idle field keeps each year. |
| `KNOW_BANK` | 0.35 | The share of how far a failed project got that it banks, per 100. |
| `KNOW_ODDS_MAX` | 15 | The most odds points know-how adds: failed research banks at most 15. |
| `SPILL_PTS_MAX` | 6 | The most one disclosure of research adds to the public pool. |
| `SPILL_TERM_MAX` | 18 | The most odds points a quote takes from public research. |
| `TOOLS_PTS` | 6 | Odds points of perfect tools. |
| `HARD_PTS` | 30 | Odds points per step of hardness above 1 (and back per step below). |
| `TIRED_PTS` | 40 | Odds points times the pace fatigue costs. |
| `RIVAL_PTS` | 8 | The most odds points rival pressure takes. |
| `CREW_PTS_MAX` | 12 | The most odds points a crew adds or takes. |
| `RHO_MIN` | 0.85 | The slowest pace ambition gives. |
| `RHO_MAX` | 1.25 | The fastest pace ambition gives: at most a quarter faster than steady. |
| `POSTURE_FACTOR` | lean 0.6, steady 1, push 1.3 | How much a posture scales the ambition term. |
| `POSTURE_STRAIN` | lean -4, steady 0, push 10 | Fatigue a year of each posture adds. |
| `OVERTIME_PAY` | 1.15 | Payroll while pushing (reported as `payrollX`, see section 8). |
| `FATIGUE_KNEE` | 35 | Fatigue under this costs no speed. |
| `FATIGUE_SLOPE` | 0.004 | The share of speed each point of fatigue above the knee costs. |
| `BURNOUT_F` | 85 | Fatigue at which the body gives out. |
| `FTE_CAP_MAX` | 40 | The most full-time people one task can use. |
| `RISK_MAX` | 0.08 | The most any one risk of a bold plan is reported at. |
| `SHIFT_MAX` | 12 | The most results move ambition, either way. |
| `WIN_SHIFT` | 0.4 | What a win adds to the shift. |
| `BURNOUT_SHIFT` | -1 | What a burnout adds to the shift. |
| `AMBITION_BASE` | 6 | Centres a mean life on ambition 50. |
| `AGE_REVEAL` | 18 | The age ambition, posture and the Profile row show from. |
| `FOCUS_WEEKS` | 12 | The pool of focus weeks a year. |
| `FOCUS_OVERTIME_MAX` | 12 | Weeks past the pool that still work, at a cost in fatigue. |
| `OVERTIME_STRAIN` | 1.5 | Fatigue a week of overtime adds. |
| `TERM_LABEL` | team: team, funding: funding, crew: crew, tools: tools, know: know-how, hard: hard field, rival: rival pressure, spill: public research, bold: bold plan, tired: tired, ceo: steady CEO | The label of each term in the odds line. |
| `EASY_FIELD_LABEL` | easy field | The label of the hard term when it is positive. |

A module-level `const` that reads an import is flagged by rule (d) of `test/layer-kit.ts`, so a derived number is computed inside a function, in the file that needs it, never in `limits.ts`.

## 7. How to migrate a system

1. **Record the oracle first.** The parity oracle for the seven research systems (`test/fixtures/effort-parity.json`, with its kit `test/effort-parity-kit.ts`) was recorded on unmodified v5.0.0 code. A system that is not in it is recorded before its code moves. The grid sets willpower and discipline to 55 (ambition 50) so the engine's deviations are zero.
2. **Calibrate a task to today's numbers.** Build it with `defineTask` inside a function (never at module level) from the live numbers: `field`, `mode`, `cost`, `p0`, `oddsExp`, `yearsExp`, `baseYears`, `minYears`, `maxYears`, `oddsLo`, `oddsHi`, `quality` (`up`, `down`, `exp`, `ceiling`, `room`, `lo`, `hi`; `room` 0 is a hard clamp) and `hit`. The builder throws on a bound it can't honour and cuts what is merely too big. `cost` never scales with the wealth of the maker.
3. **Pass no `people` until the crew is modelled.** A task with no `refCrew`, or a quote with no `people`, has no crew term. Add the crew in a later step, with its own parity row.
4. **Build the input.** An owner-run company or the player's own work is `who: 'you'` (ambition, the posture in force, fatigue and the field's know-how come from the record) with `knowledge: knowHowOf(company.knowHow, field)` for a company. A hired-CEO or NPC firm is steady, ambition 50, fatigue 0: a board mandate does not set a posture. Hand in what the system already knows as `base`, `baseTerms` (team, a steady CEO), `quality0`, `k`, `rival` and `spill`.
5. **Ask `quote` and keep the draws where they were.** One draw per project, in today's order: `resolve(q, u, { drawHit })` where `u` is the number the system already drew (`chance` and `rand` stay in the caller, a hit's second draw only on a win), then `landQuality` with the launch roll's own draw.
6. **Book the result.** `step(g, task, outcome, { year, who, know, fx, k, weeks, quality })` once per piece of work and year. The project keeps an optional `fx` (`newFx(year)`, read back with `normalizeFx`), the company an optional `knowHow` (read with `readKnowHow`).
7. **Pay through the ledger.** The money is `q.spend`, and the system books it with a reason as it does today. The engine pays nothing, and a test (`effort-conservation`) holds the folder to that.
8. **Show it.** Previews show `oddsLine(q, revealPolicyOf(g))` or `whyNodes`, results append `payoffLine`, a failure `causeLine`. Pinned log strings stay untouched; new lines go to notices and result lines.
9. **Keep the parity grid green.** `expectParity` holds odds and quality to within 1 point and years exactly. A pinned number moves only when the new rule legitimately moves it, and then it gets a row in `docs/superpowers/plans/2026-10-22-r3-v5.1.0/moved-tests.md`.

## 8. Reserved in R3

`Quote.risk` (`shortcut`, `explosion`, `scandal`, each at most `RISK_MAX` and all 0 for a plan that is neither bold nor pushing) and `Quote.payrollX` (`OVERTIME_PAY` while pushing, else 1) are reported, not rolled and not booked. Only two systems use them: studio setbacks under push, one draw from `outcomeStream(g, 'effort.risk', ...)` and only when the posture is push, so no seeded run changes; and the Workshop's kaboom, where the engine's `explosion` adds to `buildOdds().kaboom` for a bold plan only, with no new draw. A later release that wants the others rolls them from a named stream, never `g.rng`, and books the overtime as payroll through the ledger.

## 9. Guards

| Test | What it holds |
|---|---|
| `test/effort-task.test.ts` | The layer row, the constants, `defineTask` and its throws, the know-how map against hostile values, the hooks. |
| `test/effort-curves.test.ts` | Each curve against its ceiling on a grid: identity under the knee, never above the ceiling, `rhoOf` bounds. |
| `test/effort-quote.test.ts` | `quote` equals the product R&D formulas at the defaults; the reasons add up; each term moves its own line only. |
| `test/effort-persona.test.ts` | Hostile records read as defaults; an untouched life never gets the key; the reveal at 18; the staff table is whole. |
| `test/effort-step.test.ts` | `resolve` against `chance`, the second draw only on a win, `step` twice equals once, the 15 point bank. |
| `test/effort-focus.test.ts` | The pool, the half value, the 25th week, the settle, the posture rows, the Profile row. |
| `test/effort-why.test.ts` | The odds line word for word, the folding, the 110 limit, a hidden term, a line for every cause and outcome. |
| `test/effort-kit.test.ts` | The purity tools: a trapped `g.rng`, a frozen game, a `u` trap, `roundSig`. |
| `test/effort-pure.test.ts` | No draw in a read, a frozen state survives every read, no `rand`, `chance`, `.rng`, `Math.random` or `Date` token in the folder. |
| `test/effort-conservation.test.ts` | The books and the cash are identical around 500 calls and a played life; the folder imports no `cash`, `ledger`, `spend` or `book`. |
| `test/effort-know-cap.test.ts` | Know-how is worth at most 15 odds points under every plan (a grid of 189,000 inputs, a bold plan and a tired owner included), and its line never reads past 15 (nor rival pressure past -8, public research past 18) while the lines still add up. |
| `test/effort-longrun.test.ts` | 200 years at maximum inputs: `k` at most 4, know-how at most 100, quality at most the ceiling, 15 banked points, `rho` at most 1.25; a hostile `effort.you` in an old save. |
| `test/effort-ceilings.ts` | Eight rows of `test/ceiling-list.json`, each scaled by 1 and 100. |
| `test/effort-api.test.ts` | The barrel, and this note. |
| `test/kernel-parity.test.ts` | The aging list holds `effort.you` after `household`, and the Life Priorities tree holds the posture rows. |

## 10. The API

Everything is exported from `src/game/effort/index.ts`.

- **Shapes** (types): `Task`, `TaskSpec`, `QualityCurve`, `EffortMode`, `Worker`, `Reason`, `TermKey`, `EffortInput`, `Quote`, `Outcome`, `OutcomeKind`, `CauseKind`, `Fx`, `Reveal`, `StepCtx`, `StepResult`, `ResolveOpts`, `Posture`, `EffortYou`, `BurnoutResult`, `FocusUse` and `RevealPolicy`.
- **Constants**: every name of section 6, and `FX_CAPS`, `EXACT_POLICY`, `YOU_KEY`, `POSTURE_LABELS`, `STAFF_DRIVE`, `FOCUS_KEYS` and `FOCUS_FULL_TEXT`.
- **Tasks and know-how** (`task.ts`, `knowhow.ts`): `defineTask`, `normalizeTask`, `isField`, `readKnowHow`, `knowHowOf`, `learnKnowHow`, `fadeKnowHow`.
- **The quote** (`engine.ts`): `quote`.
- **Curves and world terms** (`curves.ts`, `world.ts`): `softCeil`, `laborOf`, `phiOf`, `workerOutput`, `crewRatio`, `rhoOf`, `boldOf`, `budgetQuality`, `knowGain`, `knowBank`, `knowOdds`, `spillPts`, `rivalPts`, `ceilingOf`.
- **Results** (`step.ts`, `fx.ts`): `causeOf`, `resolve`, `landQuality`, `step`, `newFx`, `normalizeFx`.
- **The player** (`persona.ts`): `readYou`, `hasYou`, `blankYou`, `writeYou`, `ambitionOf`, `ambitionWord`, `ambitionReveal`, `postureOf`, `setPosture`, `effortStrain`, `fatigueOf`, `burnedOut`, `recordWin`, `recordBurnout`, `staffDrive`, `youInput`.
- **Focus weeks and the settle** (`focus.ts`, `menu.ts`, `module.ts`): `isFocusKey`, `focusUsed`, `focusLeft`, `focusPreview`, `focusReason`, `spendFocus`, `postureNodes`, `yearlyEffort`, `effortModule`.
- **Words and hooks** (`why.ts`, `hooks.ts`): `oddsLine`, `whyLines`, `causeLine`, `payoffLine`, `whyNodes`, `bindRevealed`, `revealedSink`, `bindRevealPolicy`, `revealPolicyOf`.

Left out of the barrel on purpose: the small pieces `quote` is built from (`factors.ts`) and the shared number readers (`num.ts`). A system asks `quote` for the odds and never works a term out for itself.
