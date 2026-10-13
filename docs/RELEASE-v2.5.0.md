# AnotherLife v2.5.0 — Politics 2.0: Running the Country

Win the top job and you now actually run the country. Taxes, tariffs, the budget and the law are
yours to change, and the economy, every company (yours included), shop prices and your own tax
bill react. Office can also be abused. It pays, sometimes. It also leaves a trail.

## 🏛️ Govern

Occupation › your office › **Govern**. What you can touch depends on where you sit:

| Office | You control |
| --- | --- |
| Mayor | property tax, the city budget (police, roads, schools) |
| Governor, Premier, Chief Minister… | regional income, sales and property taxes, the regional budget, the minimum wage |
| Member of parliament | national bills (they rarely pass without the government behind them) |
| **Cabinet minister** (new: ask for a post) | Finance: taxes and budget · Trade: tariffs, deals, sanctions · Interior: the law and the police |
| President / Prime Minister | everything; presidents can set trade policy by executive order |

- **Taxes:** move income, corporate, capital gains, sales/VAT, wealth, inheritance and property
  taxes up or down. Create new ones (a luxury tax, a windfall tax on one industry, a sugar tax, a
  carbon tax from 1990, a digital services tax from 2019, a financial transactions tax) or give an
  industry a break. Every change raises or costs real revenue, moves prices, growth and inequality,
  hits company profits, and pleases some voters while angering others.
- **Trade:** tariffs on any kind of import, from one country or everyone; free-trade deals;
  sanctions; export bans. Protected industries sell more at home, importers and shoppers pay more,
  and partners often hit back with tariffs on your exports. Your own companies feel it, including
  any you have taken abroad.
- **Budget:** fund military, healthcare, education, infrastructure, police, research, welfare and
  (from 1957) a space program at 50–200%. Spending feeds the industries that supply it; deficits
  become debt; debt and a weak economy cost you your **credit rating**, which makes borrowing
  dearer. Push too far and a **debt crisis** forces austerity, a bailout with strings, or default.
- **Laws:** the minimum wage, labor rules, environmental rules (from the 1960s), deregulation,
  nationalizing or privatizing whole industries, and legalizing or banning casinos, alcohol,
  cannabis (2012+) and same-sex marriage (2001+).
- **Votes:** parliaments have parties, seats and coalitions. Every bill shows the real odds of
  passing. You can put it straight to a vote, lean on your party (political capital), cut a deal
  with a swing party (it costs the budget), or pay off waverers (illegal). Presidents of the other
  party can veto, and courts can strike down laws that go too far.

## 📰 The State of the Nation

Every year heads of government and ministers get a report card: growth, unemployment,
inflation, the budget, public debt, inequality and the credit rating, how each group of voters
sees you (workers, middle class, business owners, retirees, young and rural voters), and **what
your own policies did**, line by line. Approval now heads toward what the economy and your laws
deserve, so bad policy visibly hurts.

The **Politics Dashboard** shows your office, term, approval by group, legitimacy, fear,
political capital, the budget and debt, the taxes and tariffs in force, bills on your desk, open
scandals and investigations, and your rivals.

## 🚨 Crises, rivals and favours

- One crisis a year at most: recessions, strikes, wars from history, pandemics (1918, 1957, 1968,
  2020 and rare future ones), natural disasters, bank failures. Each has two or three real choices.
- Rivals with their own goals: the opposition leader, a rival in your own party, lobbyists. Co-opt
  them, smear them, or ignore them; a strong opposition leader costs you votes.
- Lobbyists offer donations (legal) and envelopes (not). Your own companies ask for tariffs, tax
  breaks or rescue loans: a conflict of interest, unless you put them in a **blind trust**.
  Relatives want "a little job in the government".

## 🤫 Abuse of power (fictional and abstract)

- **Line Your Pockets:** kickbacks, embezzlement, selling permits, pardons, appointments and
  passports, a cut from state enterprises, selling state assets to cronies, steering contracts to
  your own company. Each shows what it takes and the odds an auditor flags it this year.
- **Dirty money** goes to a slush fund, not your bank account. Launder it through a company you
  control (65% arrives), move it offshore (a fee), and bring it home as taxable "consulting fees".
  It can be seized, and it dies with you.
- **Insider trading on your own laws:** a tariff, tax or deregulation moves its industry's listed
  companies, and positions you hold become insider cases.
- **Keep Power:** friendly media, a press law, packed courts, longer term limits, emergency powers,
  postponed elections, gerrymanders, a loyal security force, a prepared vote count, bought votes,
  jailed or exiled rivals, and finally dissolving parliament. Where institutions are strong the
  worst steps are simply impossible.
- **Consequences:** case files that surface years later, protests that can become uprisings,
  coups, impeachment and no-confidence votes, foreign sanctions, leaked offshore accounts, exile,
  and trials once you leave office. In countries where corruption is the norm, schemes are cheaper,
  but coups are likelier and the next government often comes after the last one.

## 🐞 Fixes

- On a venture fund's pitch screen, the diligence line and the **Do Due Diligence** button shared
  an internal id, which could make the screen drop or repeat a row. They are now separate.

## Old saves

Nothing changes until a government in your game passes a law. Countries keep their own taxes
and customs. A head of government in an old save takes over their party's chamber at the next
birthday. Bribes taken from now on are dirty money; anything already in your bank account stays
there.

Design: `docs/superpowers/specs/2026-10-13-politics-2-governing-corruption-design.md`.

## Validation

These are the numbers the final code produced, good and bad.

- **Type check and build:** `tsc` clean. Production build FULL_BUILD.
- **Full test suite:** FULL_SUITE. New: `test/nation.test.ts` (32 tests: old saves load with no free
  money; menus stay pure and readable for presidents, prime ministers, MPs, governors and mayors
  across countries and eras; era and country gates hold in menus and resolvers; taxes, tariffs and
  budgets reach the economy, the trade network, companies and your own tax bill; dirty money is
  conserved; a set of regression tests from the code review) and `test/nation-balance.test.ts`.
- **Politics balance fuzzer** (`FUZZ=1 FUZZ_SEEDS=40 FUZZ_YEARS=16 npx vitest run test/fuzz-politics.test.ts`):
  120 seeded heads of government, 40 per strategy, 16 years each, in 10 countries and eras
  (US 1995, UK 1975, Brazil 1990, Nigeria 2005, Russia 2000, Sweden 2010, India 1985, Japan 1960,
  Venezuela 2020, Germany 2030), played through the real yearly loop:

  | Strategy | Ruined* | Average years in office | Clean money kept | Walked away with >10 years' salary |
  | --- | --- | --- | --- | --- |
  | Honest | 0% | 5.2 | none | 0% |
  | Careful corrupt | 35% | 5.4 | 12.4× salary on average | 35% |
  | Reckless | 73% | 5.0 | 19.2× salary on average | 13% |

  \*Ruined = convicted of a political crime, forced into exile, or killed in a coup. One honest
  life ended in prison for a burglary from an ordinary-life event, not for anything done in office.
  Careful corruption pays about a third of the time and ruins about a third of the time. It is
  never a sure thing. Reckless rulers take far more but usually lose it: on average $77M of
  $243M taken was seized. It varies a lot by country. Careful corrupt leaders were ruined 75% of
  the time in the US and 0% in India and Venezuela. Reckless strongmen were ruined only 25% of the
  time in Russia, Brazil and India, where institutions are weak, though 3 of the 4 Russian ones
  died before their 16 years were up.
- **Balance test** (in the normal suite, 6 seeds per strategy): honest 0% ruined, careful corrupt
  17%, reckless 83%.
- **Deep fuzzer, politics mode** (new: `FUZZ=1 FUZZ_POLITICS=1 FUZZ_SEEDS=24 FUZZ_YEARS=25`):
  24 politicians (mayors, governors and heads of government in 12 countries and eras), 511 years,
  720 random political actions and 4,304 menu rows tried on throwaway copies. Every year it checks
  menu purity, text and money, and it round-trips the save every 5 years. It found one bug (two
  dashboard rows shared an id), which is fixed. The final run had 0 failures.
- **Deep fuzzer, whole game** (`FUZZ=1 FUZZ_SEEDS=6 FUZZ_YEARS=110`): 6 lives of 110 years
  (2 generations each), 2,242 actions and 30,968 menu rows swept. It found one failure, an older
  duplicate id on the venture-fund pitch screen (above), which is fixed; that seed was re-run on
  the final code with 0 failures. One "big windfall" note was left for a human to review: an IPO lifted
  a company's owner from $15M to $239M. That is how listing already worked before this release.
- **Code review:** an independent review of the new code found 10 bugs, all fixed:
  - favours asked of offices that could never propose them;
  - a minister's pay rise that compounded with every reshuffle;
  - debt crises cutting a space program before 1957;
  - leak odds checking the wrong country's sanctions;
  - case-file updates lost when foreign sanctions fired;
  - float noise in property-tax rates;
  - desk bills that never showed their effects;
  - a credit-rating cost charged to any country with a policy record;
  - a disaster headline that could read "W flood";
  - private islands paying home property tax.
- **Browser, headless Chromium at phone size (390×844)** on the production build:
  - 3 random lives played to death (64, 72 and 68 years) with 0 errors and no network requests
    leaving the page.
  - 2 politician lives from injected head-of-government saves (US 2003 and UK 1977): the
    characters died after 21 and 13 years, with 0 errors.
  - A phone UI pass in light and dark: 2 saves × 14 screens (report, dashboard, Govern, taxes and
    a slider, trade, tariffs, budget, abuse of power, Line Your Pockets, Keep Power). No broken
    text, no horizontal overflow, no console errors.

Not covered: the fuzzers drive the engine directly, so they don't test layouts on screens other
than the 390×844 phone. Balance is measured by scripted strategies, not by people.
