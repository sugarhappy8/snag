# Conglomerate treasury and elite management

## Playing the changes

- **Business → your conglomerate → Autonomous Management:** a hired CEO sweeps
  surplus cash, sets division budgets, recruits and retains subsidiary CEOs, handles
  their salary requests, and starts new businesses. Business creation has its own
  pause switch. Pausing all autonomous management also pauses new ventures.
- **Buy Back Group Shares:** use group cash to repurchase and retire a chosen
  percentage of unaffiliated outside shares at a 5% premium. This works for private
  and listed groups. Executive awards, including retained awards of former executives,
  cannot be confiscated through this action. Remaining owners' percentages rise;
  the player's personal cash and tax basis do not change.
- **Group Services / Internal Contracts → Assign All:** assign all eligible missing
  provider/customer pairs without toggling existing contracts off. Domestic-operation,
  ownership, service compatibility, capacity, delivery-cost and portfolio limits apply.
- **Company → Financial Operations:** banks and investment firms have their own levers
  (rates, lending appetite and products; fund styles, strategies, startups, commissions).
  Business talent adds honest purple hints, not an optimizer. Hired CEOs set them
  automatically, without foresight.

## Cash and expansion

Group cash is held by a designated wholly owned treasury-custodian division, not added
as a second asset. Surplus sweeps and allocations move existing cash between ledgers;
they are not new income and do not trigger another tax charge. Division operating
buffers, debt and earmarked projects are protected. Subsidiaries with their own outside
investors are excluded from free cash transfers. Automatic division-CEO dividends no
longer pay group profits directly to the player; an explicit group dividend still can.

At most one new division is founded each year, after the group's formation year, up to
32 divisions. The CEO evaluates supported ordinary and financial sectors, respects
country/era availability, and requires a positive forecast and funded startup/runway.
Registration, equipment and working capital are funded from existing shareholder cash.
The resulting asset is a real, wholly group-owned company with a CEO at least as highly
rated as the group CEO. It begins fiscal operations the following year. Corporate
reinvestment does not manufacture new personal tax basis.

Owner-appointed family CEOs are not automatically dismissed for low ratings. New
autonomous recruitment and interim replacements respect the group CEO's rating floor.
Delegated raises are assessed for affordability and board approval without an owner
decision popup. Retention equity remains permanent and costs the player's ownership;
the head-office CEO cannot award themselves shares.

## Elite CEOs and invention IP

Ratings 85–99 have much stronger demand, efficiency, execution and market-foresight
advantages. Their judgments and deep-tech plans have smaller errors. They can still
lose money if costs or debt overwhelm operating earnings.

A **100-rated hired CEO** has an explicit perfect-foresight game ability: annual company
net earnings are positive. When ordinary earnings cannot achieve the profit/cash floor,
additional strategic trading income is booked once, displayed separately, and taxed.
Costs and losses are not erased; deposits and client assets are not appropriated. This
protects annual earnings, not a public share price, an owner's personal investments,
or the resale value of capital equipment. It applies in the normal yearly business
settlement across ordinary, game-studio and deep-tech companies. Banks and investment
firms (v2.2) earn only what their books earn: their statements opt out. It does not
apply to a 100-skilled player or replace the need to retain a hired CEO.
An active 100-rated conglomerate CEO also provides this protection to supervised
divisions, including existing family appointments below that rating.

CEOs commercialize inventions already assigned or licensed to their company. They choose
product prices, pay to build and upgrade fabs within company funds and board budgets,
and plan output against demand, inventory and working capital. The existing factory,
labor, royalty and sales ledger executes the plan. Patent terms are unchanged; expired
licenses are not used, and owned products face the existing patent-expiry competition.
Financial institutions do not manufacture invention products.

## Banks and investment firms

Banks (Banking 2.0, `business/bank*.ts`) and investment firms (Investment Firms 2.0,
`business/fund*.ts`) run on their own models behind the `finance-firm.ts` dispatcher.
Elite CEOs, key staff and the Business talent improve underwriting, rate setting and fund
picks modestly; nobody gets foresight, and a fund manager's edge shrinks as the book grows
past its capacity. Inventors can build a hedge-fund trading algorithm (computer era only);
it may be a dud, and any edge fades within a few years. Leverage on a macro call magnifies
losses as well as gains.

Customer deposits and client assets remain segregated from shareholder cash. Only interest
spreads, fees, carry, commissions and the firm's own co-investment results enter company
earnings; there is no strategic top-up for financial firms.

## Verification

The production build and TypeScript validation pass. Focused regressions cover treasury
cash conservation, reserve/minority protection, funded ventures and hiring floors, salary
delegation, private/public buybacks, vested merger awards, bulk service assignment,
invention commercialization, quant capacity, client-book segregation and the 100-rated
earnings rule across company types and group supervision.

The broader checks included 438 passing tests across 29 files. After the final ownership
and group-supervision changes, 177 tests across 15 affected files passed, including the
fixed-size sixteen-division/sixty-contact performance, save/reload and inheritance tests.
The full game suite was not rerun. The existing large-bundle warning remains. No release
or deployment is included in this implementation.
