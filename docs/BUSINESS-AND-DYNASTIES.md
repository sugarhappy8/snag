# Business finance and independent lives

## Playable contract

AnotherLife retains its browser text interface, yearly turns, death and continuation as an
heir. The player chooses funding and operating policy, advances a year, and sees the booked
result. NPCs progress without being opened. Companies can fail; grants of equity never
guarantee profit, and a royal birth does not guarantee succession. No account, server,
additional dependency or second economic engine was introduced.

## Where to find the changes

- Start a business: choose the initial-capital slider after the city. Equipment and fees are
  distinct from working cash. The following funding screen quotes personal contribution,
  debt and investor dilution. Investment firms first ask for a type: asset manager, hedge
  fund (1949+), venture capital (1946+) or brokerage.
- Company → Financial Operations: banks set savings and loan rates, a lending appetite,
  products and one campaign a year. Asset managers pick a fund style and fee; hedge funds a
  strategy (a macro call with leverage), fees and co-investment; venture firms raise funds
  and back startups; brokerages set a commission.
- Company → Money: **Invest My Own Money** is a slider. **Capital & Ownership** (labelled
  **Financial Rescue & Ownership** for distressed companies) explains runway and separates
  secondary purchases, equity subscriptions and company-funded buybacks. Loans, staffing
  changes and site closures retain their existing controls nearby.
- Investments → **Stocks**: a company you've listed shows there under its size and exchange. It is a
  second door to the ownership move in **Capital & Ownership** (buying more from the public float) and
  to **Exit → Sell Shares**, and each pair shares its yearly limit. A listed group shows as a row you
  can only look at.
- Company → Money → Capital & Ownership, and beside Go Public: **Share Classes**. Pick one class of shares,
  founder shares (B has 10 votes, A has 1) or a non-voting float. Share classes change who runs the board,
  not who is paid: board seats, being fired as CEO and every "you'd lose control" line follow the votes,
  while dividends, tax and what your stake is worth follow the shares. The market pays 4% less for founder
  shares and 7% less for a non-voting float. A private company sets the plan its IPO will use; a listed one
  asks its board, once a year. In Investments → **Stocks**, real companies show the classes they had in the
  years they had them, and a listed second class (Alphabet's Class C, Berkshire's Class B) can be bought.
- Conglomerate → **Group Services / Internal Contracts**: assign compatible divisions to
  advertising, distribution, software, components, property or treasury administration.
- Relationships → person: **Life & Career**, business financials, investment/partnership,
  acquisition and the existing family/friend recruitment and Money Matters controls.
- Activities → **Royal Family & Court**, only for eligible royals: duties, standing,
  succession status and renunciation. Ordinary lives still have no royal menu.
- New Life → Custom Life → **Royal birth**: choose Random, Royal family or Non-royal family.
  Royal family is available only for eligible countries and years; changing to an ineligible
  setting clears that selection. Rank and succession remain dynastic rolls/rules. Family
  wealth stays random for every option: there is no wealthy or billionaire birth selector.
- Every slider supports an exact numeric value in the displayed currency/unit. Use
  **Apply exact value**, inspect the preview, then confirm the action.

## Financial invariants

| Decision | Personal cash | Company cash | Ownership / earnings |
| --- | --- | --- | --- |
| Capital injection | Decreases | Increases equally | No revenue; ownership unchanged |
| Buy investor shares | Decreases | Unchanged | Seller is paid; ownership rises |
| Subscribe to new shares | Decreases | Increases equally | Other shares diluted; no operating profit |
| Company share buyback | Unchanged | Decreases | Remaining shareholders own a greater fraction |
| Invest in an NPC company | Decreases | Increases equally | Private investment claim, not an exchange-traded security |
| Acquire an NPC company | Decreases | Unchanged | Founder receives payment; the same company moves to player assets |

Transactions validate the current company, adult/living player, funds, control, available
shares and annual negotiation limits at execution. Private shareholders may refuse a sale;
ambitious, profitable NPC founders can refuse acquisitions. Vested executive shares are not
offered in the outside-investor pool, including tracked grants to dismissed CEOs. Existing
executive grants initialize the ledger on old saves; previously discarded historical CEO
identities cannot be reconstructed.

Bank deposits and loans, and investment clients' money (AUM, venture LP funds, brokerage
accounts), are client books, not shareholder cash. Fees, spreads, carry, defaults, operating
expenses and the firm's own co-investment gains/losses enter the real statement. Borrowed
cash is excluded from regulatory capital. Below the minimum, regulators warn, then force loan
sales with a fine, then threaten seizure; owner payouts stop at the capital they require.
Runs are paid from reserves and bonds first, then by discounted loan sales or an emergency
central-bank loan (repayable company debt at a penalty rate), never free shareholder money.

Asset managers earn a fee on AUM; hedge funds a management fee plus a performance fee above
the high-water mark; venture firms 2% a year and 20% carry on LPs' money; brokerages
commissions, order flow and interest on idle cash. Fund returns follow the same market engine
as personal investments; skill adds a modest edge that shrinks for very large books, and rank
against peers drives client flows. Quant strategies and an Inventor's trading algorithm need
the computer era, and an algorithm's edge fades as rivals copy it.

Elite CEOs use the existing planner, with finer pricing/output decisions, broader candidate
searches and more decisive marketing adjustments. The annual letter compares modeled plans
under the same market conditions. That comparison is an estimate, not booked profit or a
promise that an insolvent firm can always be rescued.

Internal service providers reserve up to 20% of capacity instead of selling it externally.
Delivery is capped by real customer spending and shared provider capacity; at-cost invoices
include delivery expense. Expensive or unfunded contracts fall back to outside procurement.
The reserved capacity still has an opportunity cost, so contracts are not always worthwhile.
Invoices are removed from consolidated revenue; equal internal revenue and delivery costs
cancel. Customer expense reductions are the actual pre-tax benefit. Generic back-office and
purchasing bonuses are excluded for contract customers to avoid stacking them.

## Persistent NPCs and family resources

Important contacts keep versioned education, experience, skill, ambition, country/city,
income, debt, investments, housing, employer and bounded history. Existing family/group and
influence payroll is not paid again as a generic NPC salary. Careers, layoffs, retirement,
tuition, borrowing, household spending, home purchases and bankruptcy affect actual resources.
The established relationship engine still owns marriages, children and family events.

Entrepreneurs fund real company startup costs from their savings. Their company is stored
once on the person and uses the existing business simulator, not a wealth multiplier. Profits
may fund dividends; debt and poor demand can destroy equity. Qualified, profitable firms can
reinvest in one forecast-positive domestic location every three years, up to twelve locations
while NPC-controlled. Player-controlled firms retain their existing expansion rules. Acquiring
a firm installs an interim CEO; recruiting the founder is a separate choice.

Graduates can approach a suitable player business through the existing recruitment popup.
Relevant degrees and experience improve job skills, but do not guarantee elite ability,
acceptance of a pay cut or loyalty. Friends and partners use the existing employment system.
Annual NPC announcements are capped; private financial detail is hidden from low-trust contacts.

Birth backgrounds range from extreme poverty to a very rare billionaire dynasty. Probabilities
depend on country resources, inequality and era; assets scale with historical real income.
Parents own the initial cash, housing, portfolios and funded businesses. The newborn receives
none of that cash. Childhood support uses current family resources and paid tutoring, not a
permanent rich/poor modifier. Background labels are relative game categories, not universal
modern dollar cutoffs.

Estate liquidation pays private stakes once. Heirs retain recorded degrees, their own company,
financial resources, passports and adult location. Known contacts' life records and the shared
economy continue across generations. The old save schema remains readable: missing records
initialize without retroactive salary or a cash award.

## Royalty and historical boundaries

Random eligible births use the engine RNG at one in ten thousand; custom lives can explicitly
choose royal or non-royal status. A chosen royal birth creates a compatible biological family
but does not alter the ordinary family-wealth roll. Most royals are distant branches, not
heirs. Country/year dynasty tables include reigning and abolished houses, restoration gaps,
male-line, preference, equal-order and council succession. Titles distinguish Japanese
imperial ranks, Gulf sheikhs/emirs, Malaysian state royalty and other traditions. UAE birth
records identify the individual emirate/house; becoming its ruler does not inherit the elected
federal presidency. Malaysia currently models Johor state royalty, not automatic accession
to the rotating federal kingship.

Adults must perform duties at home to receive a bounded annual official allowance. Children
receive no royal cash. Reputation, convictions, eligibility, living siblings and council
approval affect succession. Abolition ends official status/allowances; existing private
property remains separate. Japan's modeled marriage/male-line restrictions apply. Children
and heir continuation carry appropriate dynastic records, not state property.
Royal parents, consorts, biological siblings and eligible descendants use persistent royal
career tracks rather than ordinary job rolls. UAE appointments include ministry advisers,
undersecretaries and ministers, emirate department chairs, diwan advisers, university lecturers,
qualified deans, university council chairs and charitable foundation chairs. Federal ministry
roles begin in 1971, domestic university roles in 1976 and female cabinet appointments in 2004.
Earlier emirate lives use local diwan and patronage roles. British/European constitutional
families use public duties and patronage, while Japanese relatives use imperial household and
cultural roles; these paths do not appoint them to political ministries.

Seniority depends on age, skill, experience and education. Initial adult backstories carry their
qualifications; young royal students spend actual years studying and pay the usual tuition.
Annual progression retains their career path, with retirement into patronage. Reigning parents
do not retire automatically. Abolition ends official appointments/income, and living abroad
does not pay a domestic court salary. Explicit player-company jobs take precedence; private
business holdings remain separate and do not pay a duplicate owner salary over official pay.
Validated old saves upgrade living relatives' current profiles without granting money,
qualifications or assets, or advancing RNG. Newborn saves also correct current parent birth
descriptions; older diary entries are preserved rather than rewritten with today's job.

Historical references used for the modeled distinctions:

- [UK succession](https://www.royal.uk/encyclopedia/succession) and
  [Succession to the Crown Act](https://www.legislation.gov.uk/ukpga/2013/20?view=extent).
- [Japan's Imperial House Law](https://www.kunaicho.go.jp/en/kunaicho/hourei/hourei-01.html).
- [UAE Federal Supreme Council](https://u.ae/en/about-the-uae/the-uae-government/the-federal-supreme-council)
  and [Constitution](https://www.uaelegislation.gov.ae/en/constitution).
- [UAE cabinet formation](https://u.ae/en/about-the-uae/the-uae-government/the-uae-cabinet),
  [UAE University history](https://uaeu.ac.ae/en/about/history-key-achievements.shtml), and
  [Zayed University biography of the first female minister](https://www.zu.ac.ae/leadership2006/sheikhalubna.aspx).
- [Working duties of the British royal family](https://www.royal.uk/the-role-of-the-royal-family).
- [Saudi government mechanism](https://my.gov.sa/en/content/govmechanism).
- [Nepal presidency and republican transition](https://president.gov.np/history-background/).
- [Spain's succession order](https://www.casareal.es/EN/corona/Paginas/la-corona-hoy_orden.aspx).
- [Sweden's monarchy](https://www.kungahuset.se/english/the-monarchy-of-sweden).

## Deliberate limits

This is a game abstraction, not a complete reconstruction of banking law or historical royal
genealogy. Royal characters are fictional branches of attested dynasties, not exact real-world
individuals. Rules operate at annual resolution (including the UK's late-2011 birth boundary),
cover the explicit dynasty table, and cannot predict future constitutional change. It does not
add a complete court-marriage, palace-estate or sovereign-government management simulator.

Bank capital/reserve profiles and computing-adoption stages approximate country/era differences;
they are not jurisdiction-by-jurisdiction regulatory schedules. Investment firms use aggregate
client pools, not individual client accounts. NPC foreign moves currently use citizenship and
established free-movement rights, not every work/asylum visa route. NPC companies have one
founder ledger and bounded lightweight decisions, not their own full conglomerate agent.
Private equity is illiquid: there is no secondary private-exchange exit screen; dividends,
acquisition and estate/liquidation are the current settlement paths. Existing Money Matters
loans remain personal loans, not a new company-specific lending contract UI.

Internal contracts require wholly controlled domestic divisions and compatible services;
cross-border tax allocation, minority-shareholder transfer-pricing agreements and construction
of dedicated shared-service facilities are not modeled. This conservative restriction avoids
using a domestic tax shortcut for international operations.

## Verification

Royal-career follow-up: 163 tests across eight files covering engine, save/load, Time Machine,
historical and birth/UI regressions pass, along with TypeScript validation and the production build. An isolated
browser life verified UAE minister roles in the birth diary and parent profile (including
ministry employer and actual qualifications), then successfully advanced a year. This is
local verification, not a new deployment or a full-suite run.

Royal-birth selector follow-up: 120 relevant tests across six files passed, including 15 new
selection/eligibility/UI checks. TypeScript validation and the production build passed. Browser
verification confirmed selection, automatic reset on an ineligible country, and an actual royal
birth with a separately randomized family background. The full-suite results below describe
the preceding overhaul batch, not a new full-suite run after this small follow-up.

Final local verification on 2026-10-10:

- TypeScript validation and the production build passed.
- The final full run exercised 150 test files: 2,490 tests passed; two large simulations
  exceeded the default 15-second limit without assertion failures. Those two tests now have
  explicit 120-second limits. Their unchanged assertions passed in a focused rerun (22.86
  seconds total), accounting for all 2,492 tests. No game code changed between the full run
  and the timeout rerun.
- Forty new regression tests cover the business-finance and NPC/dynasty systems.
- `git diff --check` passed. These are local verification results; remote CI is not part of
  this verification record.

Use `npm run typecheck`, `npm test -- --maxWorkers=2` and `npm run build`.
Focused tests in `business-financial-overhaul.test.ts` and `npc-dynasty-overhaul.test.ts` cover
bank reserves and regulatory capital, financial era gates, balanced ownership
transactions, executive vesting, startup working cash, internal invoice elimination, NPC
degrees/recruitment/growth/acquisition, estates, deterministic saves, heir continuity, royalty
eligibility/succession/abolition and financially backed birth backgrounds.

Legacy randomized tests now distinguish valid early death/company exit from insufficient
test coverage, and retain their financial/state assertions. The historical computer sample
was enlarged to 200 lives per cohort; its coding threshold accommodates the richer family
distribution while still requiring a strong historical contrast. Friends are now explicitly
recruitable, and emigration fixtures explicitly move the family member whose access is tested.

Browser checks at a 375 × 812 mobile viewport exercised exact numeric entry, the live bank
rate preview, saving financial policy, NPC profiles and company actions, and investment-firm
founding. A $2,000,000 startup selection quoted $616,000 of equipment, $1,384,000 of company
cash and $600 of fees; self-funding deducted exactly $2,000,600 from personal cash. A 3.7%
deposit rate preview showed $925,000 annual interest on $25,000,000 of customer deposits.
No browser console errors were observed. The temporary QA save was removed; existing saves
were not changed by that check.

The production build succeeds but emits a bundle-size warning: the main JavaScript bundle
is approximately 7.03 MB minified (2.38 MB gzip). Code splitting remains a separate performance
improvement; this warning was not hidden or disabled.
