# SNAG v2.9 Feature Roadmap

Current plan: [docs/superpowers/plans/2026-10-20-living-world-roadmap.md](superpowers/plans/2026-10-20-living-world-roadmap.md). This v2.9 audit is kept as written; only rows marked v4.0.3 were re-checked since.

> Baseline: `v2.9.0` at commit `a28ed647ac1791b0d02ca02a79507cb9c3c98d07`
> Audit date: 2026-10-17
> Scope: every tracked file in the v2.9 repository, including Markdown, configuration, scripts, tests, text fixtures, and the compressed fixture.

This roadmap supersedes the planning assumptions in PR #22, which was based on v2.4. It does not imply that PR #22's code was merged.

## Status legend

- **SHIPPED**: present and verified in the v2.9 baseline.
- **IMPLEMENTED**: present and verified on this branch; awaiting merge and release.
- **CURRENT**: actively being implemented or awaiting required validation.
- **PLANNED**: designed and prioritized, but not implemented.
- **DEFERRED**: intentionally outside the current slice.

Status describes repository state, not aspiration.

## Audit record

| Area | Files | Physical newline count | Status |
|---|---:|---:|---|
| Markdown documentation | 46 | 9,223 | Complete |
| UI, platform, scripts, config, workflows, public assets, root source | 71 | 20,285 | Complete |
| Business systems | 150 | 53,373 | Complete |
| World, economy, advisors, nation, investments, events, data, history | 161 | 61,951 | Complete |
| Life systems, activities, special systems, shops, computer, workshop | 177 | 109,530 | Complete |
| Tests and fixtures | 338 | 94,754 | Complete |
| **Total** | **943** | **349,116** | **Complete** |

The newline count is a reproducible physical count, not a claim that every line is executable code. The test inventory includes TypeScript tests, text fixtures, and one gzip fixture. The gzip file was decompressed, parsed as JSON, and traversed; its 1,262,511 decompressed bytes and 72,517 JSON nodes are not added to the physical newline total.

Generated dependencies and untracked files are not part of the audited v2.9 repository.

## Non-negotiable implementation invariants

Every roadmap item must preserve these rules:

1. **No foresight**
   - Decisions may use only information available at that point in the simulation.
   - Manager skill may improve judgment, not reveal future returns.

2. **Deterministic simulation**
   - Identical state, seed, and action order must produce identical results.
   - Candidate profiles must be generated once and survive save/reload unchanged.

3. **Accounting conservation**
   - Every fee, tax, transfer, loss, refund, subscription, and redemption has a matching source and destination.
   - Family-fund gains and costs are allocated pro rata by units.

4. **Action-level authorization**
   - Restrictions must be enforced inside action functions, not only by hiding or disabling menu choices.
   - Direct calls, restored menus, and older saves must not bypass ownership or CEO controls.

5. **Save compatibility**
   - New fields are optional and normalized by readers.
   - Existing v2.9 saves and historical fixtures must still load.
   - Player-owned advisor state remains owner-stamped.

6. **Yearly idempotence**
   - A yearly phase cannot charge fees, publish letters, move assets, or make decisions twice if invoked repeatedly.

7. **Pure presentation**
   - Opening a menu or report must not mutate game state or consume simulation randomness.

8. **Bounded state**
   - Histories, rivals, notices, modifiers, live portfolio companies, and decision logs need explicit retention limits.

9. **Accessible interaction**
   - Dialogs require focus management, keyboard navigation, meaningful labels, and reliable disabled-state behavior.

10. **Truthful player-facing copy**
    - Hiring screens and letters may promise only behavior that the relevant manager actually performs.
    - New or changed copy must meet the project's voice constraints and avoid false certainty.

## v2.9 baseline capabilities: do not rebuild

This table records the audited baseline before the implementation slice below. The corporate-finance boundaries addressed by this branch remain here so the v2.9 baseline snapshot stays reproducible.

| System | Verified v2.9 capability | Known boundary |
|---|---|---|
| Personal Money Team | One advisor and one personal financial manager; deterministic yearly three-person offers; claimed and true skill; hidden honesty; advisor vetting; fees, dishonest billing, detection/refund, blunders, slippage; stock-index, government-bond, and savings mandate; annual statement and advisor findings | No specialties, negotiated contracts, transparent performance attribution, or hedge-fund assignment |
| Personal hedge fund | Player-owned fund with deterministic strategies and yearly returns | Player-operated; no delegated manager |
| Family hedge fund | Relative unit holders, pro-rata ownership, and inheritance handling | Player-operated; no manager assignment or redemption queue |
| Company cash-at-work fund | Company-owned investment vehicle | Not a substitute for a separately governed investment-management business |
| Corporate investment firms | Asset manager, hedge fund, venture capital, and brokerage modes; strategies, fees, high-water marks, leverage, co-investment, algorithms, flows, and compliance | Leadership is still represented by a generic CEO model; liquidity and market-plumbing depth are limited |
| Banks | Bank-specific economics and operating levers; CEO control locks on bank levers | Generic hiring and board evaluation; mandates do not fully guide bank operation |
| Corporate governance | CEOs, boards, mandates, replacement, succession, and shareholder mechanics | Finance firms are evaluated using several generic price/production assumptions; some transactions bypass board approval |
| v2.9 R&D and deep technology | Expanded research, invention, commercialization, and deep-tech systems | Must remain compatible with finance and governance changes |

## Priority 0: simulation correctness and integrity

These defects take precedence over broad feature expansion.

| ID | Status | Problem | Required result |
|---|---|---|---|
| C-01 | **IMPLEMENTED** | The v2.9 baseline lets banks and investment firms enter generic CEO optimizer and board-outlook paths that assume price and production economics | Recognized finance books are now excluded from those generic paths; synthetic group wrappers remain generic |
| C-02 | **IMPLEMENTED** (v4.0.3) | Tariff retaliation compares against policy state after the new policy has already been written | Compare the previous and enacted policies before committing the new state. Fixed in v4.0.3 (R0-5), `test/nation.test.ts` |
| C-03 | **PLANNED** | Personal investment gains omit nation capital-gains tax and personal transactions omit applicable transaction tax | Apply taxes at the correct taxable event with ledger-visible debits |
| C-04 | **PLANNED** | Bond maturity can pay the marked market price instead of par | Pay contractual maturity value and record the final gain or loss correctly |
| C-05 | **PLANNED** | Time Machine snapshots can bypass the complete save-schema migration path | Restore through the same normalization and migration pipeline as ordinary saves |
| C-06 | **IMPLEMENTED** (v4.0.3) | Divorce settlement can overpay, erase deficiencies, or discard stepchild relationships; emigration refusal uses an incomplete separation path | Use one conserved settlement and relationship transition path. v4.0.3 (R0-6) fixes the overpayment, `test/love.test.ts`; the forgiven deficiency and the rest move to R4 of the living-world roadmap |
| C-07 | **IMPLEMENTED** (v4.0.3) | Generation carryover relies on a fragile manual whitelist | Centralize inherited-state policy and cover every retained field with migration tests. v4.0.3 (R0-4) carries `nation.policy` to heirs and tests every world flag, `test/heir-world-flags.test.ts`; the whitelist itself ends with R1 and R2 of the living-world roadmap |
| C-08 | **PLANNED** | Some acquisitions and takeover accept paths bypass required board votes | Enforce approval inside the transaction action |
| C-09 | **IMPLEMENTED** (v4.0.3) | Bank long-horizon capital state is not consistently rolled; repeated manager calls can duplicate work | Add explicit phase markers and idempotence tests. Fixed in v4.0.3 (R0-15): bank `capitalYear` marker, `test/finance-manager-idempotence.test.ts` (investment firms already had theirs) |
| C-10 | **IMPLEMENTED** (v4.0.3) | Rival, modifier, and live venture-company collections can grow without bounds | Define limits and deterministic pruning. Played years were already bounded; v4.0.3 (R0-15) caps the three lists a damaged save could inflate on load, `test/collection-bounds.test.ts` |
| C-11 | **IMPLEMENTED** | A v2.9 baseline board message claims skill 100 gives “perfect foresight” | The message now says forecasts can still miss |
| C-12 | **IMPLEMENTED** (v4.0.3) | Some finance macro decisions rely on stale booked marks | Make the observation window and timing explicit and test it against phase ordering. Fixed in v4.0.3 (R0-15): a bank CEO plans on last year or this year, `test/finance-observation-year.test.ts` |

## Implemented on this branch: corporate finance leadership

**Status: IMPLEMENTED**

This first post-audit code slice improves hired leadership for banks and corporate investment firms without duplicating the personal Money Team.

### 1. Finance-specific leadership profiles

Adds an optional, backward-compatible finance profile to corporate managers:

- Specialty: asset management, hedge fund, venture capital, brokerage, banking, or generalist.
- Approach: systematic, fundamental, growth, macro, event-driven, client-led, or risk-led.
- Risk posture: cautious, balanced, or bold.
- Track-record summary based only on deterministic candidate data.
- Sector-appropriate role label.

Profiles are created once, stored with the candidate, and preserved through hiring and save/reload. A profileless direct appointment receives one deterministic target-specialist profile when installed; an existing profile is never regenerated. Synthetic group CEOs remain generic unless they are managing a real finance-firm record.

### 2. Better finance hiring

The hiring screen presents comparable finance dossiers with:

- General leadership skill.
- Relevant specialty.
- Approach and risk posture.
- Compensation and equity terms.
- Finance skill after specialty and record adjustments.
- For asset managers and hedge funds, visible fit with the current board mandate.

Automatic board choices and the Business-talent recommendation use a normalized score that also
accounts for hidden integrity and compensation. The score must not combine incomparable raw units,
reveal hidden integrity, or regenerate candidates while the player is reviewing them.

### 3. Finance leadership skill

Banks and investment firms use an explicit finance-leadership calculation rather than raw generic manager skill.

The calculation must:

- Remain bounded.
- Reward relevant specialty without making adjacent experience useless.
- Preserve raw skill exactly for profileless managers from older saves.

Specialty and record affect finance skill. Approach and risk posture affect the asset/hedge decision
model; integrity remains part of hiring and the existing board-governance consequences.

### 4. Correct finance model routing

Recognized banks and investment firms do not use the generic price, production, or inventory optimizer.

Finance detection relies on actual finance state, not only an industry label. This prevents a diversified group whose lead division happens to be financial from being misclassified as a standalone fund or bank. Legacy records with finance books still use the existing era migration; an industry-labeled object with no `financeFirm` record remains generic by design.

### 5. Mandate-aware investment-firm operation

A hired CEO operates each corporate investment firm using:

- Firm type.
- Board mandate.
- Finance leadership skill.
- Current and historical information already visible at the decision point.
- Existing fee, strategy, leverage, co-investment, campaign, and compliance mechanics.

Asset-manager and hedge-fund decisions also use the manager's approach and risk posture. Brokerage
and venture-capital decisions use their existing skill-sensitive model plus the board mandate; this
slice does not claim that every résumé trait affects those two models.

The CEO may change only the controls assigned to that role. Decisions must be deterministic and must not read future market outcomes.

Venture-capital fundraising belongs to the CEO. The owner may still choose individual pitches,
due diligence, and follow-ons. The owner-inventor algorithm and regulatory-confession exceptions
also remain available.

### 6. Consistent owner-control locks

When a hired CEO controls an investment firm:

- Operational settings are blocked at the action layer.
- Menus explain who controls the setting.
- Direct action calls cannot bypass the restriction.
- Autopilot changes cannot silently conflict with a player action from the same phase.

### 7. Finance decision letter

Corporate fund CEOs publish a concise annual decision letter containing:

- The board mandate followed.
- The operating settings chosen for the next year.
- Material company-capital, campaign, fundraising, or venture-investment decisions.

The letter reports choices, not guaranteed outcomes. It must be generated once per applicable year,
survive repeated post-settlement and next-year pre-settlement calls without changing the plan,
contain no false forecasts, and meet the project voice constraints.

Bank hiring text must not promise a decision letter until a bank-specific letter is implemented.

### 8. Immediate-slice acceptance criteria

The slice is complete only when all of the following are true:

- [x] Legacy managers without finance fields load and operate safely.
- [x] Candidate generation occurs once per candidate.
- [x] Save/reload preserves the complete candidate and hired-manager profile.
- [x] Group core CEOs are not accidentally finance-specialized.
- [x] Banks and investment firms never use the generic price/production optimizer.
- [x] Candidate comparison changes with finance-firm type and, for asset/hedge roles, mandate.
- [x] Finance leadership skill is bounded and covered at low, medium, and high skill.
- [x] CEO control is enforced by both menus and action functions.
- [x] Asset-manager and hedge-fund decisions use no future data.
- [x] Repeating a yearly manager phase does not repeat decisions or letters.
- [x] Existing venture-capital and owner-inventor exceptions still work.
- [x] New finance decision letters stay within the CEO-letter word limit, add no voice-guard regression, and make no guarantee of profit.
- [x] Focused finance-leadership regression tests (68/68), the complete test suite, typecheck, and the production build pass.
- [x] Architecture and this roadmap match the implemented behavior.

Validation on 2026-10-17: the focused finance-leadership regression set passed 68/68; the complete Vitest suite passed 5,086 tests across 278 files, with two intentional skips. Typecheck and the production build passed. The voice report completed with zero lexer errors and no new guard failure. Repository-wide voice debt remains at 9 of 10 targets missed and is not claimed as fixed by this slice.

### Expected implementation surface

- `src/game/business/state.ts`
- `src/game/business/finance-leadership.ts`
- `src/game/business/career.ts`
- `src/game/business/manage.ts`
- `src/game/business/board.ts`
- `src/game/business/board-ceo.ts`
- `src/game/business/bank-model.ts`
- `src/game/business/conglomerate-management.ts`
- `src/game/business/group-ventures.ts`
- `src/game/business/fund-model.ts`
- `src/game/business/fund-manager.ts`
- `src/game/business/fund-state.ts`
- `src/game/business/fund-actions.ts`
- `src/game/business/fund-menu.ts`
- `src/game/business/fund.ts`
- `test/fund-fixtures.ts`
- `test/finance-leadership.test.ts`
- Architecture documentation

### Explicitly outside this slice

- A second personal financial manager.
- Personal or family hedge-fund delegation.
- Prime-broker and margin simulation.
- Persistent redemption queues and side pockets.
- Multiple hedge-fund products or share classes.
- Full bank mandate autopilot and bank annual letters.
- Separate CIO, portfolio-manager, COO, compliance, and investor-relations hiring.

## Implemented: moderate-depth ordinary careers

**Status: IMPLEMENTED (v3 includes full-time Work Plans, light part-time shifts and career continuity).**

### Audited baseline and target depth

The v2.9 catalog contains 179 full-time and 70 part-time job definitions, including historical
work. Hiring already has qualifications, CV screening, interviews, bosses, coworkers, hours,
performance, raises, promotions, layoffs and pensions. Once hired, however, most jobs share the
same small set of actions. Only 14 full-time job IDs have the existing Professional Practice
assignment loop.

The target is a middle layer: ordinary careers should offer recurring role-flavored decisions,
transferable progress and workplace consequences, but should not become a second business
simulator. A career should normally add one meaningful plan and one preparation decision per
year, plus occasional specialization choices. It should not add payroll, inventory, P&L, board,
staffing or operating-control screens.

### Implemented foundation

The shared Work Plan engine currently routes the 165 full-time definitions not owned by
Professional Practice into exactly one of nine families:

| Family | Typical work |
|---|---|
| Office & Commercial | Corporate, finance, banking and real-estate roles |
| Technical & Research | Software, engineering-adjacent, laboratory and science roles |
| Care & Wellbeing | Health, dental, veterinary, animal-care and mortuary roles |
| Civic & Public Safety | Government, law, police, fire, security and church roles |
| Education & Learning | Schools, universities, libraries and instruction |
| Creative & Media | News, publishing, film, recording, design, museums and performance |
| Service & Hospitality | Food, retail, travel, hotels, leisure and customer service |
| Field, Craft & Operations | Trades, factories, farms, fisheries and site work |
| Transport & Logistics | Aviation, trucking, rideshare, post and historical transit roles |

Each family supplies four era-neutral assignments, three approaches (quality, speed or people),
and three specializations. Accountant, software, teacher, police, detective, firefighter, pilot,
chef and reporter roles have more specific assignment sets. V3 adds 15 more packs (60 catalog assignments)
for pharmacy, veterinary care, science, laboratory work, ecology, archaeology, history teaching,
curation, crafts, tailoring, jewelry, farming, fishing, beekeeping and jockey work. Other jobs use
their family pack. Mixed-industry roles have 21 explicit family corrections, with exhaustive
classification tests across all 249 ordinary job definitions. The laboratory pack currently maps
to part-time roles; its assignment records are reserved content, not extra Shift Focus activities.

The current foundation also provides:

- A pure Work Plan menu showing mastery, reputation, employer trust, warnings, manager
  relationship, the current assignment and recent reviews.
- One saved annual approach and one preparation/feedback action. If the player does nothing, a
  careful default plan starts during the yearly career step.
- Seeded next-birthday resolution using existing performance, household work priority, manager
  relationship, preparation, specialty, plan difficulty, mastery and employer trust.
- Bounded effects on performance, mastery, reputation, trust, happiness, warnings, and boss or
  coworker relationships. Work Plans never pay extra salary.
- Cross-employer family progress, employer-local trust, six retained reviews, one updated CV
  portfolio entry per family, and a CV specialization credential after three successful plans.
- Defensive readers for missing or malformed optional state, an owner stamp so another life does
  not inherit a career profile, and settlement markers that prevent a plan resolving twice.
- Removal of the blanket age-18 listing lock so each job's era-aware minimum age governs access;
  current part-time tenure now counts toward total work experience.
- Work-event slot tracking so an event cannot silently apply its performance result to an
  unrelated special main career or to a replacement job.
- All 70 part-time definitions get one annual Shift Focus: reliability, learning or people.
  Next-year reviews build portable skill and employer-local trust without a second wage. Three
  successful years with enough trust can earn a bounded CV employer reference.
- Owner-scoped field experience follows the player between jobs, with hours-weighted part-time
  credit and at most one same-family working year per calendar year. Old ambiguous history is
  not guessed or backfilled.
- Earned experience, mastery, reputation, a living current boss relationship and a relevant
  part-time reference provide at most five percentage points of progression odds. Existing
  performance, tenure, qualifications and market rules remain in place.

### Explicit boundaries

- The 14 Professional Practice jobs keep their existing cases and assignments; Work Plans do not
  run alongside them.
- Special careers, military careers and player-owned businesses keep their dedicated systems.
- Part-time work uses the lighter shift system, not full-time specializations. Freelance gigs
  retain their existing system.
- This foundation does not yet add family-specific random events, field-specific experience
  requirements, or a bespoke assignment pack for every title.
- Career continuity influences raises and promotions, not external offer pay or hard new hiring
  prerequisites. Historical saves remain eligible under the existing qualification rules.

### Remaining phases

1. **Role events**: add standalone family-specific workplace events without perturbing special
   career event routing, retaining bounded histories and era-safe text.
2. **External opportunities**: consider referrals, field-specific prerequisites and outside
   offers only with a migration policy for old ambiguous career histories.
3. **Balance and variety**: expand bespoke title packs and use playtesting to tune the existing
   bounded progression edge. This is not a plan to turn every career into a business simulator.

### Ordinary-career acceptance criteria

The initial foundation has a complete-suite run; v3 additions have their own focused and
integration checks. Release validation is recorded separately below.

- [x] All 179 full-time definitions map to one Work Plan family or one of the 14 explicit
  Professional Practice exemptions.
- [x] All nine representative families can start, prepare and settle a plan with deterministic
  replay from the same state and seed.
- [x] Opening or reading the Work Plan menu consumes no RNG and mutates no state.
- [x] A plan cannot settle in its starting year, settle twice, pay extra salary, or settle after
  its appointment is no longer current.
- [x] Family progress survives an employer change while employer trust and review history do not.
- [x] Optional and malformed state loads safely; reviews, CV entries, text and numeric values stay
  bounded and deduplicated.
- [x] Professional Practice, special careers, military careers and businesses do not receive a
  duplicate Work Plan loop.
- [x] Historical school-leaver roles remain reachable at their own minimum age, current part-time
  tenure counts consistently, and work events update only the job slot that caused them.
- [x] Initial foundation: focused career tests, a complete-suite run, typecheck, production build
  and applicable voice/anachronism checks were completed, with the timing qualification below.
- [x] Part-time shift reviews are salary-neutral, repeat-safe, appointment-bound and use no global RNG.
- [x] Field experience is portable, owner-isolated and bounded; progression cannot create new eligibility.
- [x] All 249 definitions are classified; role packs use existing IDs and era-neutral wording.

Validation on 2026-10-17: all 43 focused ordinary-career regressions passed, followed by 122/122
affected career, profession, event, special-career, CEO and deep-tech integration tests. The
complete Vitest run before the final edge-case hardening passed 5,119 tests across 281 files, with
two intentional test and file skips. Final typecheck and the production build passed. The voice
report completed with zero lexer errors and no guard failure; repository-wide voice debt remains
at 9 of 10 targets missed and is not claimed as fixed by this slice.

The v3 additions were implemented after that complete-suite run. See
[RELEASE-v3.0.0.md](RELEASE-v3.0.0.md) for final-head validation; the earlier 5,119 result must not
be represented as a complete-suite pass on the final v3 commit.

## Priority 1: Personal Money Team 2.0

**Status: PLANNED**

The existing Money Team is functional. The next version should make hiring legible and consequential rather than replace it.

### Candidate dossiers

Each candidate should present:

- Claimed capability and confidence range.
- Relevant credentials or specialties.
- Investment philosophy and risk posture.
- Quoted annual rate and estimated first-year bill.
- Clearly listed authority and excluded assets.
- Advisor diligence findings, confidence, and red flags.

True skill and honesty remain hidden. Dossiers must distinguish verified facts from claims.

### Engagement terms

Add an explicit hiring confirmation covering:

- Fee basis.
- Scope.
- Cash-reserve target.
- Turnover limit.
- Review date.
- Termination or transition cost, if any.

Hiring must still move no investment principal. Any signing or termination charge must be explicit and accounted for.

### Performance and fee attribution

The annual statement should separate:

- Opening managed value.
- Deposits and withdrawals.
- Gross market result.
- Manager decision effect.
- Fees.
- Slippage and mistakes.
- Closing managed value.
- Relevant benchmark result.

Attribution must avoid claiming skill for general market movement.

### Review and accountability

Add:

- Probation or first-year review.
- Advisor-reported conflicts or inconsistencies.
- Renegotiation, retain, and fire decisions.
- A bounded history of findings and yearly outcomes.

### Money Team 2.0 acceptance criteria

- Candidate information is deterministic and save-stable.
- The player can see cost and scope before hiring.
- Hidden traits remain genuinely hidden until revealed by gameplay.
- Every charged amount appears in the statement and ledger.
- Firing and replacement cannot duplicate charges or lose managed assets.
- Manager authority remains limited to the displayed scope.
- Existing Money Team saves load without migration loss.

## Priority 1: Managed Hedge Mandates

**Status: PLANNED**

Personal and family hedge funds should be delegable to the existing personal financial manager. Do not create a second overlapping personal manager.

### Assignment

- Store assigned hedge-fund asset IDs in the owner-stamped Money Team state.
- Support personal and family funds.
- Allow explicit assignment and removal from the fund and Money Team menus.
- Remove stale assignments safely if a fund closes, transfers, or disappears.

### Manager effect

- True manager skill affects decision quality or the hedge return model without guaranteeing gains.
- Decisions remain deterministic and use only available information.
- The first slice does not introduce a second “2 and 20” layer or a new high-water mark.

### Fees and family accounting

- Charge the agreed Money Team AUM rate against opening fund NAV after investment return and existing running costs.
- Reduce NAV once.
- Allocate the resulting value across family unit holders pro rata.
- Store optional `last.manager` and `last.fee` details for explanation and save compatibility.

### Managed Hedge Mandates acceptance criteria

- One manager can oversee allowed conventional assets and assigned hedge funds.
- Unassigned funds behave exactly as they do in v2.9.
- Assignment survives save/reload and generation transition only when ownership rules permit it.
- Fees are charged once and reconcile with NAV.
- Family unit ownership is conserved.
- Low skill can hurt and high skill can still lose money.
- Repeated yearly execution is idempotent.
- Closing or transferring a fund clears the assignment without corrupting Money Team state.

## Priority 1: Hedge-fund depth

**Status: PLANNED**

### HF-1: Liquidity and investor accounting

- Subscription and redemption notice queues.
- Lockups, gates, and suspension rules.
- Cash and liquid-asset requirements.
- Side pockets for illiquid assets.
- High-water-mark equalization where different entry dates require it.
- Deterministic forced sales when obligations cannot be met.

### HF-2: Market plumbing

- Prime-broker relationships.
- Margin, collateral, and financing cost.
- Short borrow availability and recalls.
- Crowding and liquidity-sensitive execution.
- Counterparty exposure.
- Forced deleveraging and liquidation waterfalls.

### HF-3: Organization and governance

- CIO and portfolio-manager roles.
- Operations and compliance leadership.
- Compensation and retention.
- Risk limits and escalation.
- Board and investor permissions.
- Investor-relations requests, disclosures, and bounded side-letter mechanics.

### HF-4: Products and reporting

- Multiple vehicles or share classes.
- Separate books and mandates.
- Exposure and concentration reporting.
- Gross-to-net performance attribution.
- Benchmark and factor comparison.
- Stress tests and scenario analysis.
- Bounded decision and investor-communication history.

### Hedge-fund depth acceptance criteria

- Capital, units, fees, financing, and realized losses reconcile.
- Investors cannot redeem assets that do not exist.
- Lockups and gates are enforced at the transaction layer.
- Forced liquidation follows a documented deterministic priority.
- No report reads future returns.
- State collections are bounded.
- Old single-vehicle funds remain valid.

## Priority 1: Finance governance and reporting

**Status: PLANNED**

- Finance-specific board scorecards for return, drawdown, liquidity, compliance, flows, and mandate adherence.
- Bank-specific mandate behavior and annual decision letters.
- Explicit owner-versus-manager decision rights for every finance control.
- Decision ledger showing who changed what, when, and why.
- Finance-aware CEO succession and board replacement.
- Approval enforcement for acquisitions and takeovers.
- Compliance consequences proportional to exposure and repeat behavior.

## Priority 2: Economy, investment, and nation systems

**Status: PLANNED**

- Correct capital-gains and transaction-tax application.
- Bond par maturity and clearer duration/credit reporting.
- Dynamic sovereign risk, foreign exchange, and credit conditions.
- Policy transition ordering and tariff-retaliation repair.
- More explicit inflation, rate, and liquidity transmission into banks and funds.
- Historical information screens that distinguish contemporary knowledge from player hindsight.
- Cross-system stress tests for recession, high inflation, default, and capital controls.

## Priority 2: Family, inheritance, and save integrity

**Status: PLANNED**

- Conserved divorce settlement with unpaid obligations retained.
- Stepchild and blended-family relationship preservation.
- One separation path for divorce, emigration refusal, and related events.
- Central generation-carryover policy.
- Full migration path for Time Machine restores.
- Ownership cleanup for inherited funds, Money Team assignments, companies, and governance roles.
- Historical-save matrix covering pre-feature, current, and malformed optional state.

## Priority 2: UI and accessibility

**Status: PARTLY DONE in v4.1.0 (modal focus, keyboard in menus, header contrast); announcements for changing values and finance dashboards remain**

- Reliable focus traps and focus restoration for every modal.
- Full keyboard navigation for menus, candidate comparisons, and financial controls.
- Semantic labels and announcements for changing values.
- Disabled predicates that fail closed instead of granting access after an error.
- Robust bounds for malformed minigame input.
- Clear explanations when ownership, CEO control, liquidity, or compliance blocks an action.
- Responsive finance dashboards that do not hide critical risk information.

## Priority 2: Performance and tooling

**Status: PLANNED**

The audited production build succeeds, but its JavaScript output is approximately 7.81 MB uncompressed and 2.65 MB gzip.

Planned work:

- Route-level or feature-level code splitting.
- Lazy loading for large optional systems.
- Bundle budgets and change reporting.
- Test-before-deploy enforcement.
- Build, typecheck, focused-test, full-test, and migration-test gates.
- Automated check that new player-facing text does not worsen the existing voice-report baseline.
- Determinism tests that run the same scenario twice and compare state.
- Detection of unbounded histories and duplicate yearly execution.

## Priority 2: Career, world, and history integration

**Status: PLANNED**

- Finance-specific career paths and qualifications.
- Manager reputation that reflects verified outcomes rather than only raw profit.
- Regional finance centers and regulatory differences.
- More dynamic sovereign, credit, currency, and capital-flow interaction.
- Historical availability for financial products and regulation.
- Better interaction among education, networks, family wealth, hiring, and governance.
- AI decisions that respect the knowledge, institutions, and instruments of the current year.

## Priority 3: Longer-horizon expansion

**Status: DEFERRED**

- Deeper property development and mortgage markets.
- Political careers, lobbying, and regulatory capture with transparent consequences.
- Creative-industry ownership and royalty systems.
- Sports ownership and athlete-management depth.
- Broader modding APIs with schema validation and compatibility contracts.
- Additional investment products only after core accounting, liquidity, and governance are reliable.

## Delivery order

1. Corporate finance leadership and finance-routing correctness.
2. Remaining high-risk accounting and authorization fixes.
3. Personal Money Team 2.0.
4. Managed Hedge Mandates.
5. Hedge liquidity, margin, governance, and reporting.
6. Family, migration, and generation integrity.
7. Accessibility, performance, and deployment gates.
8. Broader economy, career, world, and long-horizon features.

Later phases may begin only when they do not obscure unresolved accounting or authorization defects.

## Definition of done

A roadmap item is not **IMPLEMENTED** or **SHIPPED** merely because a menu or state field exists. It must satisfy all applicable conditions:

- Behavior is reachable through the intended interface.
- The underlying action independently enforces authorization.
- All money and ownership changes reconcile.
- Decisions use no unavailable future information.
- Identical seeded runs remain deterministic.
- Repeated yearly calls are idempotent.
- Old saves and fixtures load safely.
- New collections have retention bounds.
- Menus and reports are mutation-free.
- Keyboard and modal behavior is tested where UI changes.
- New copy is truthful and does not add voice violations.
- Focused regression tests pass.
- The complete test suite passes.
- Typecheck passes.
- Production build passes.
- Architecture and player-facing documentation describe the shipped behavior.
- The status in this roadmap is updated only after those checks pass.
