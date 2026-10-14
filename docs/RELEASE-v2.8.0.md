# AnotherLife v2.8.0: Hedge funds

Investments now has a Hedge Funds row. You can start a Personal fund and a Family fund with your own cash, and you can set an ordinary company's spare cash to work in a fund. A fund runs on the same strategy maths as a hedge-fund firm, charges no fee and costs 0.5% a year to run. Gains are taxed when they come out. Relatives can join the family fund, and when you die the fund passes to your heir or is wound up and the relatives are paid first.

A fund is a view of your own money, not extra money. Starting one moves cash into units, so net worth doesn't change. A company's fund adds nothing, because the cash stays on its books.

## In Investments

- **Where it sits.** Hedge Funds is a row in the Invest block, right after Crypto. It's greyed out before 1949, in prison, and when your home market is closed or investing is banned there, and it says why. It isn't shown to anyone under 18 or to a character who has died.
- **What's inside.** Your Funds lists a Personal and a Family fund, each as a start action or the fund itself. Company Funds lists up to 20 of your companies that can hold a fund, largest first. Each fund also shows under Assets, on the same screen.
- **The row.** With no fund it reads "Personal, family and company funds". Otherwise it counts your funds and the companies with a target, and adds what your units are worth.
- **Not a market security.** You can't bet on a fund or open a position in it. The Investments total and Sell Everything leave funds out. The Stocks list is unchanged.

## Personal and family funds

- **Starting.** You need to be 18 or older, alive and out of prison, with the year 1949 or later. Your home market must be open and investing allowed. The first deposit is at least 5 times a typical year's income in your country, and a slider sets it. You can have one Personal fund and one Family fund.
- **What it follows.** Your home index, with the strategies a hedge-fund firm has: Long/Short, Macro, Quant and Event-driven. Quant is refused where the firm refuses it. Each strategy shows the firm's one-line description.
- **The year.** On each birthday the pool moves by the strategy's return, less the 0.5% a year to run. The return comes from the firm's own formulas, with the market's real move for that year and a random draw. The draw is set by your life, the fund and the year, so reloading doesn't change it and a Time Machine jump rerolls it.
- **Your skill.** Smarts, discipline, an MBA or a business degree and the years you've run the fund set your edge, and the Investing talent adds to it. The edge runs from about -2% a year for a novice to about +1% at best. At any skill the average year stays under the US index, because a fund trades some return for smaller swings.
- **Put In More and Take Out.** Put In More is a money slider that buys units at the going price. Take Out is a percent of your share, 1 to 100, and starts at 10. The preview gives the cash and the tax. Taking out all of it, or leaving less than the smallest trade, closes the fund and the preview says so.
- **Macro lasts one year.** A Macro call is bull, bear or flat, with leverage from 1x to 3x. After the year the strategy goes back to Long/Short, flat, 1x, and the popup says so. An office holder can't set Macro. A Macro call saved before taking office runs as Long/Short while they hold the job.
- **Closing.** Close Fund asks first. You get your units' value, taxed on the gain, and each relative gets their value in full.

## The family fund

- **Who can join.** An adult relative with a will role other than friend, a relationship of 40 or more, not disowned and not estranged, with savings of at least 5 times a typical year's income. The screen shows the 8 closest. Anyone who can't join shows why.
- **What they put in.** 20% of their money, and never more than your own units are worth, at the going price. You can invite 8. Their units earn the same return as yours, and the pool pays no fee.
- **Pay Out.** You can pay a relative their value in cash at any time. The price doesn't change.
- **Cooling.** A year of -15% or worse cools every relative in the fund by 3, and the life log says so. A relative whose relationship falls under 15, who is disowned or who becomes estranged takes their money out on the next birthday.
- **When a relative dies.** Their units go to the heirs the game models for them. A part that comes to you joins your units. A relative with no heirs modelled leaves with their value. Settling never changes the unit price, so it can't change anyone else's value.
- **The popup.** Each birthday one popup lists your funds and your companies' cash at work, and the life log has a line for each fund.

## Passing on

- **Net worth and the estate.** They count your units once. A relative's money is never in your net worth or your estate.
- **A sole adult heir** keeps the family fund as it is. The relatives stay in it and their money isn't touched. A relative who was already in the fund and is now the heir has their units added to their own on the next birthday.
- **A split estate or a minor heir** winds the fund up. The relatives are paid in cash before the heirs' money is worked out, and the estate text says the fund was wound up and what the relatives got. Your units' value goes into the estate like any other asset.
- **A Personal fund** is part of the estate like any investment. A sole adult heir keeps it, and a split estate cashes it in.

## Company funds

- **Who can.** A company you own a share of. Banks can't. An investment firm has its own fund on its company screen. A division of a group can't, because its cash belongs to the group. The home market of the company has to be open, and it has to be 1949 or later.
- **Setting it up.** A company's fund screen has a Cash at Work slider, a Strategy, a Market Call, Leverage and Stop. The slider runs from 0 to the company's spare cash. There's no board vote.
- **The floor.** The company keeps 6 months of running costs in cash, or the board's reserve if that's more. Loans, investors' preference and earmarked cash are held back too. What's left is spare cash, and the company puts the lesser of your target and its spare cash to work.
- **Booking the year.** At each fiscal year end, before the year is worked out, the cash at work earns the strategy's return. A gain goes in as other income. A loss goes in as a cost and lowers the year's tax. The company's statement and corporate tax count it once. The cash never leaves the company's books, so its loans work as before.
- **What it does to the company's value.** The company's value moves by the cash the fund made or lost, and no more. The result is left out of the yearly profit that the value is worked out from, as one-off franchise fees are, so a good year doesn't count twice.
- **The worst year.** A year can lose a little over 95% of the cash at work at the most. That cash is spare cash above the floor, so after the worst year the company still holds the floor.
- **Setting a target.** It moves no money and changes no value. The screen shows the cash at work against the spare cash, the floor, the strategy and last year's result. The Cash at Work slider previews an average year and a bad year in dollars.
- **No spare cash.** The year is skipped and the screen says why: its loans come first, investors are paid back first, its cash is at the floor, or it has no spare cash. The life log says "X had no cash to put to work."
- **Who runs it.** A company you run takes the strategy you set. A hired CEO, or you in prison or under 18, runs the firm's autopilot terms: Long/Short, or the best of Long/Short, Event-driven and Quant when the leader's skill is 50 or more. A CEO's skill counts. A Macro call you set lasts one year. A CEO's year leaves your settings alone.
- **Dividends.** A dividend comes out of the same cash, so the next year's cash at work can shrink.

## Tax and fees

- **No fee.** There's no management fee, no performance fee and no high-water mark on a fund you run. It costs 0.5% a year to run, taken from the return.
- **Personal and family funds.** A gain is taxed as income when you take it out, after any loss you've carried forward. A loss adds to the carried loss. Putting money in is not a sale and isn't taxed. Relatives get their full value, untaxed.
- **Company funds.** The result is part of the company's year, so it's taxed in the company's statement like its other income.

## Old saves

- Every new field is optional and checked when a game loads. A fund record that isn't a plain, usable record reads as no record. The fund keeps its stored value in your net worth and its screen says "The books for this fund are damaged."
- A fund's units never read as fewer than the units you and your relatives hold, so a damaged record can lower a price and can't raise one. Cash-at-work records on a company are kept only when they pass the same checks, with amounts finite and in range.
- A game saved before this release has no fund and no company record, and plays as it did.
- A game saved with funds and opened in an older version shows each fund as a plain investment asset and loses a company's record.
- The save schema number stays 2.

## Not in this release

- Hired fund managers with a 2-and-20 fee and a high-water mark, and checking whether a manager is honest.
- Lock-ups and notice before you can take money out.
- More than one fund of each kind, a fund with outside investors or fees (that's a hedge-fund firm), gifting units, naming a fund and family votes.
- Relatives topping up their share after they join.
- A fund tax that differs by country.
- A shortcut to the fund in a company's Money screen.
- Funds for groups, divisions, banks and investment firms.
- A cash-at-work amount set as a percent.
- A Macro call that lasts more than a year.
- Anything other than your home index.
- A fund taken by creditors or a divorce judge goes whole at its value, and the relatives' slices go with it. No money is created.
- A company's cash loses value to the company inflation rule even while it's at work, so a real return is slightly understated in a high-inflation year.
- Fixed terms in the strategies mean a fund can beat the index in a weak home market. That's the firm's balance, reused as it is.
- An office holder who sets Macro in the year they take office can run that one call. It goes back after the year.
