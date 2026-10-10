# Gameplay Expansion 2.0

Built on the unreleased World Simulation 2.0 working tree. This is an additive expansion,
not a replacement economic engine. No package dependency, backend, save-version bump,
published release or deployment is needed.

## Coverage and player routes

| Area | Existing system retained | Gap addressed | Playable addition and location |
| --- | --- | --- | --- |
| Professions | Jobs, education, salaries, performance, CV and promotions | Ordinary professional jobs lacked player-directed assignments and an accumulated practice record | Occupation → Professional Practice while in medicine, law, engineering/architecture or a skilled trade |
| Development | Asset values, mortgages, company production lines | Property purchases and ordinary capacity upgrades lacked a site-to-commissioning lifecycle | Assets → Development Projects: residential, commercial and industrial construction |
| Ownership | Landlord books, luxury fleet, personal trips and upkeep | No dedicated commercial fit-outs; luxury charter income was a flat payout | Commercial building → Landlord Operations; boat/aircraft → Charter Operations |
| Creative work | Label music career and existing discography royalties | Independent transferable masters lacked staged production and recoupable licensing | Musician → Independent Masters & Rights; owned masters also appear in Assets |
| Everyday life | Independent NPC lives, relationships, memories and CV | Most shared activities were immediate interactions rather than attended multi-year projects | Activities → Shared Life Projects |
| Legacy | Wills, estate division, company family employment and management | No restricted multi-year giving account or opt-in independent successor-readiness policy | Activities → Charity → Family Giving Fund; company → Family at the Company → Succession Planning → Succession Readiness Review |

## Professional work

Doctors/nurses/dentists, lawyers, engineers/architects and electricians/plumbers/carpenters/
mechanics can take employer-funded assignments. Their existing job and education must remain
eligible. Clinical review, legal settlement versus litigation, engineering delivery and
trade warranty work have different risks and outcomes. Engineering normally takes two years;
compressed delivery takes one and has greater failure risk. Faster workloads trade quality
and reputation risk for free time. Public-interest work is harder but builds more reputation.

Paid annual peer review improves preparation; two successes unlock a paid specialization.
Success builds skill, reputation, job performance and actual CV projects. Failure costs
reputation and performance. Leaving the employer hands back unfinished work. Salary already
pays for this work: there is no second salary or invented client cash. After three successes
and 60 reputation, eligible clinicians, engineers and tradespeople can enter the existing
clinic, construction or home-services founding flow with its real capital and legal gates.
Law partnership remains the existing promotion ladder, not a new reskinned business.

## Construction and operation

Choose a city and buy a site for 20% of the quoted base budget. City costs reuse the business
location factors. Pay locally scaled planning fees, choose economy or bonded contractors,
then move personal money into a segregated construction reserve. Property projects can use
the existing mortgage underwriting rules for a secured 15-year development loan.

Each funded year builds part of the project: at least two years for residences, four for
commercial buildings and three for industrial capacity. Economy-wide materials and wages
affect progress payments; shortages and contractor problems cause delays, cash losses and
quality damage. Insufficient reserves pause construction without inventing borrowing.
Commissioning requires a paid inspection. Unspent reserves return once; a property becomes
a normal house-kind asset, while an industrial site becomes actual company production lines
and the project asset disappears. The company then needs its normal labor, inputs, customers
and maintenance. Owner contributions increase its investment cost basis.

Industrial projects initially cover existing capacity-line industries, including factories,
farms, bakeries, breweries and energy. They require a standalone, wholly owned domestic
company to avoid bypassing group governance or transferring personal capital to minorities.
Deep-tech fabs retain their existing specialist construction system. Unfinished sites can be
sold at a distressed discount; attached secured debt is repaid even when proceeds are short.
Site ownership and secured liabilities use the ordinary estate flow.

Commercial fit-outs distinguish offices, retailers and workshops through cost, rent and
collection risk. They sign five-year leases, use business demand rather than household
affordability, and settle through the existing landlord statement exactly once. Service,
repairs, vacancy, managers, basic upkeep and mortgages remain real costs. Commercial premises
cannot be occupied as the player's home or leased through the household applicant flow.
They also cannot become fallback housing after foreclosure or prison release. Commercial
renewals keep five-year terms, and managers cannot bypass the initial paid fit-out.

## Charter operations

Owned boats and aircraft can hire a licensed charter operator, select 0–20 available weeks,
set an asking rate at 50–200% of market and choose commercial incident cover. Registration,
crew, fuel, agency fees, insurance and incidents consume money. Lack of operating cash or
safe condition stops bookings; prices, condition and leisure demand affect utilization.
The statement shows gross, expenses and net. Only positive net operating receipts become
taxable income; basic asset upkeep and personal trips remain separate. Luxury charters use
this ledger instead of also receiving their old flat payout. Asset registration/availability
continues to be governed by the existing country/era catalogues and travel-business rules.

## Independent music masters

With 60 instrument/voice skill and adult status, fund an original titled master. Writing,
recording and mastering take three attended stages over at least two birthdays. Self-work
costs less and requires skill; commissioning a producer costs more and reduces production
risk. Heirs without musical ability may pay a producer, but cannot inherit self-performance
skill. Domestic distribution is always available; international mass distribution uses the
existing local radio-adoption gate. No invented modern digital channel appears in 1900.

Ownership, quality, creation date, spending, audience, units and cash history live on one
asset. Domestic/international distribution, marketing and economy-sensitive demand affect
returns. A five-year license pays an advance once, then recoups it from the owner's 35% share
before paying additional cash. Unlicensed distribution pays 75%. Rights revert after five
settlements and unpaid recoupment expires without becoming personal debt. Audiences decline,
including for hits; catalogue income is finite. Selling the asset transfers every future
receipt. Legacy label releases keep their original accounting, without duplicate royalties
on these independent masters. Owned rights pass through existing estate retention/liquidation.

## Shared lives and funded legacy

Mentorship, community gardens, family oral-history albums and amateur club championships
require two or three attended years. Contacts must be alive, trusted, locally available and
appropriately aged/healthy. Mentorship needs relevant education and knowledge above the
learner's. NPC priorities can lead to declined invitations; contributions respect their cash.
Moving away, relationship breakdown and death affect ongoing projects. Completed work records
memories for both participants and a CV achievement. Mentoring raises practical NPC and family-
employee skill, never a degree or license. Sports improve athleticism and can earn a local
placing; gardens improve health/karma; family history builds shared memories and happiness.

The Family Giving Fund is an irrevocable charitable account, not a tax shelter or a trust.
Setup and annual administration cost actual money. Three-year education or health commitments
spend only their restricted reserves and feed actual charitable investment into World2.
Heirs continue stewardship and funded commitments, but the fund cannot be withdrawn, used to
pay family expenses or counted in the personal estate. It has no guaranteed investment return.

A paid, opt-in independent succession policy checks the designated successor's actual age,
skill, management role, relationship and experience. Graduates need three company years;
practical successors without a degree need six. Automatic management handoff waits until the
criteria are met; ownership bequests still follow the existing will. Existing hiring,
grooming, independent NPC education and new mentorship are the preparation routes. Ordinary
legacy succession behavior remains compatible until the player adopts this stricter policy.

## State and deliberate boundaries

Optional state is normalized on read; menu construction is pure. Professional and shared-
project progress belongs to one character and is not copied as personal skill to an heir.
Development, charter contracts and master rights are asset-owned. All new annual settlements
have year guards. Gameplay draws use the existing seeded RNG and snapshots carry the same
plain JSON. Histories, active developments, shared projects and music catalogues are bounded.

This implements representative slices, not every suggested profession or building type.
There is no separate law-firm industry, full legal-case simulator, film-production overhaul,
NPC-by-NPC charter passenger book, jurisdiction-specific trust law or new holding-company
model. Group governance, specialist R&D/fabs, authorship, inventions and game-engine licensing
retain their existing deeper systems. Public-interest benefits are aggregate game effects,
not claims about actual legal or financial arrangements.

## Representative routes

- A qualified engineer takes a two-year design assignment, pays for peer review, builds a
  portfolio and specializes. Three successful assignments and 60 reputation expose the
  existing construction-company founding flow. Separate personal savings can fund a
  commercial building, which must be permitted, constructed and commissioned before its
  five-year workshop lease produces rent.
- An independent musician funds a named recording, pays a producer across three stages,
  releases internationally when local technology permits, and licenses it for five years.
  The advance is paid once. An heir can retain the asset and its contract without receiving
  the musician's instrument skill, or sell the rights and end all future catalogue receipts.
- A young character records family history with a willing relative. An unfunded year pauses
  progress; two attended years leave memories and a CV activity. Later, the same family can
  support a three-year community-health program through a restricted giving fund. Its next
  steward inherits the commitment, not a withdrawable windfall.

## Verification — 10 October 2026

- `npm run typecheck` passed. `npm run build` also passed after the final source changes:
  463 modules, 7,147.61 kB minified JavaScript / 2,420.08 kB gzip. The existing single-bundle
  size warning remains; code splitting was not part of this gameplay change.
- The full first sweep ran 3,092 tests across 171 files: 3,090 passed and two failed.
  Both failures were corrected: the new giving-fund submenu had displaced the first ordinary
  donation in a recursive menu test, and a fictional Egyptian penny stock used an internet
  theme before local technology adoption. Ordinary charity ordering is preserved; restricted
  gifts now use the same donation-count/amount counters. Fictional penny-stock names and their
  historical sector exposure use the existing country technology gate.
- After the corrections and eight additional integration regressions, all **382 selected
  tests across 22 files passed**. This includes all **36 new gameplay tests**, the complete
  historical anachronism sweep, historical/investment markets, careers, activities, assets,
  rental operations, finance, prison, luxury, consumer brands, relationships, events and
  family succession/inheritance. The entire 172-file suite was not rerun a second time.
- New checks cover eligibility, preparation, success and setbacks, construction financing
  and commissioning, commercial lease renewals, paid fit-outs, charter cash/tax accounting,
  five-year license recoupment and expiry, funded NPC activities, giving commitments, successor
  readiness, malformed optional state, real save/load, compressed snapshots, Time Machine,
  deterministic replay, actual heir transfer and bounded century-long idle state.
- Browser testing used a separate localhost production-preview origin and a new test life;
  no live player save was accessed. A real family-history project was invited through menus,
  persisted through reloads, stayed paused during unfunded birthdays, deducted the player's
  and NPC's contributions, and progressed to 1/2 attended years at the next birthday.
  The rebuilt version correctly disables an unaffordable session with the required amount
  and available cash. Music-production and construction menus were also checked for access
  and childhood gates. Browser error logs were empty. Adult construction, licensing and
  succession completion were exercised by automated tests, not claimed as manual playthroughs.
- `git diff --check` passed. No new dependencies, commit, push, tag, release or deployment.
