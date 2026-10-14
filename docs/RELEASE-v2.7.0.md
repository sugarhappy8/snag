# AnotherLife v2.7.0: Your listed company in Stocks, and Heavy R&D

This release has two parts.

**Your listed company in Stocks.** A company you've taken public now shows up in Investments, Stocks, under its size, on the exchange it trades on. It has a ticker, a company screen, and two ways to trade it. You can buy more of it from the public float, which raises your stake. You can sell it through the same sale as Exit, Sell Shares. A listed group gets a row you can only look at. The row is a view of the company, not a second holding. Net worth, estates and Sell Everything count the company once, as before.

**Heavy R&D.** A company's Products screen has a new section for breakthroughs. A breakthrough costs far more than an ordinary line, takes four to six years and often flops. When it works it is a new kind of product. The company wins customers and the whole trade gets more. The launch makes the news. Rivals need as long as the company did to have their own. A product line you retire never comes back as an R&D idea. The details are in the Heavy R&D section below.

Both parts leave the save schema number at 2, and an old save plays as it did before.

## In Stocks

- **Where it sits.** The row is the first in its size section on the list for the exchange the company trades on. A size the list has no companies for this year gets its heading when you own a company of it. A company on any other exchange, or a list with no size headings, goes in a "Your listed companies" block at the top, with its exchange named. A country with no stock market this year shows the block under the "no market" line.
- **Size.** It's set by the company's market cap, the share price times all its shares. Mega-cap is $200B and up, Large-cap $10B up to $200B, Mid-cap $2B up to $10B, and Small-cap under $2B. They're in today's money with no inflation step, and a company exactly on a line is in the bigger size.
- **The row.** It reads `Name (TICK)`, then the price, the size, "yours 60%" and the exchange. The ticker is four letters, chosen when the company lists. It's unique on its exchange among the registry companies and your own, and it comes from the company's name.
- **The screen.**
  - Market cap and size.
  - Price, with how far it has moved since the IPO.
  - Your stake: shares, percentage and what it's worth.
  - Outside shareholders, with relatives' and executives' slices when they hold some.
  - The exchange and the year it listed.
  - A note that at 50% or more you control the board.
  - What buying costs and what selling pays in tax.
- **Two exchanges, one code.** A company is placed from its own country and its exchange code, not from where you live. A Tehran company is not in the Tokyo list, though both are TSE. A company spun off a group listed abroad shows on the exchange it trades on.
- **Not a market security.** You can't bet on it or open a position in it. It isn't a target for a law or an announcement, so it stays out of insider cases.

## Buying

- **Who can.** An adult who's alive and out of prison, when the company is listed, isn't a division of a group, its exchange is open and you have the cash for one share. Each reason shows on the Buy row.
- **The amount.** A slider runs from one share to the most your cash and the limits allow. Its preview reads "N shares at about $X each (market $Y). You'd own Z%."
- **The price.** It's 3% over the higher of the market price and the company's fundamental value per share, and more for a big order. The order doesn't move the share price, so buying can't mark up the stake you already hold. A round trip loses the premium, the price impact on the way out and the capital gains tax.
- **The limits.** At most 15% of the company a year, and 1% always stays with the public. Relatives' and executives' slices don't change, so a buy also stops at what's left outside them.
- **One move a year.** A Stocks buy uses the company's one Capital & Ownership move for the year. Put In More Money, Buy Out Investors and Company Buys Back Shares share that one move. Using any of them uses up the Stocks buy, and a Stocks buy uses up all three.
- **Control.** You don't need control of the board to buy. A buy that takes you to 50% or more gives you control. The preview says "This gives you control of the board." when it will, and "You keep control of the board." when you already have it. A buy never loses control. There's no board vote and no random roll. Buy Out Investors in Capital & Ownership still needs control and a board vote.
- **What it changes.** Your cash goes down by the amount paid. Your stake and your cost basis go up. The share count, the share price and the company's value stay as the market had them. There's no brokerage fee, and the buy isn't counted in your investing totals.

## Selling

- **Same sale as Exit.** Sell Shares on the screen is Exit, Sell Shares: the same price impact, the same capital gains tax on the gain and the same two sales a year. Sales from either door count toward the two.
- **The slider.** It's the percent of your shares, 1 to 100, and starts at 10. The preview gives the proceeds and the tax. It adds "You'd lose control of the board." when the sale takes it from you.
- **Selling out.** A sale of all your shares, or one that leaves you under 0.5%, removes the company, and the preview says so first. It reads "That's the last of your shares. Name leaves your companies." Relatives' family shares are paid out once. The row goes, and an open screen says "You no longer own this." A repeat sale does nothing.
- **A small stake.** A stake stored under 1% is judged as it's stored. A 0.6% stake is shown as 0.6%, and a sale from it previews its own removal.
- **A company that joins a group.** It stops being listed, so its row goes. A screen left open says "It isn't listed any more."

## Groups

- A listed group gets one row with the group's market cap, your stake in the group, its exchange and its size. It has no ticker, and no Buy or Sell. Its screen points to the group's own screen under Businesses.
- None of the group's divisions get a row.
- Sell out of the group and the row is gone.

## Old saves

- Every new field is optional and checked when a game loads. `ticker` is kept only when it's exactly four capital letters. `ipoPrice` is kept only when it's a finite number above 0 and at most 1e12. Anything else is dropped.
- A save with no ticker gets one worked out from the company's name. It's the same on every read and in every year while your companies on that exchange stay the same, and no two of your companies on one exchange share one. It's stored for good at the company's next Stocks buy.
- A company with no IPO price shows no "since the IPO" change.
- The save schema number stays 2.

## Not in this release

- Share classes, such as a ten-vote class for the founder and a non-voting float. They come next.
- Lock-ups and insider rules for owners trading their own company.
- Dividend yield on the row. No payout is recorded to show.
- Trading a group from Stocks. A group is still sold from its own screen.
- A company that replaces a failed one on the exchange in a later year could draw the same four letters as your ticker. The rows are keyed by company, so nothing breaks. The repeat is cosmetic.

## Heavy R&D

A company's Products screen has a Heavy R&D section. A breakthrough costs far more than an ordinary line, takes four to six years and often flops. When it works it is a new kind of product. The company wins customers with it, the whole trade gets more customers, it makes the news, and rivals need as long as the company did to have their own.

### Who and what

- **Who can start one.** Any company with a Products screen except deep-tech companies, game studios and finance firms, which keep their own R&D. A hired CEO never starts one. You can start one on a company a CEO runs, from its Products screen. A company with a board may have to put the spend to a vote, as it does for other R&D.
- **What's on offer.** Every trade has three breakthroughs, each with a first year. One shows up when the year and the era allow it. It stays off the list when the company retired it, has it on sale, is developing it or has launched it already.
- **One at a time.** A company runs one breakthrough at once. After the project is decided, by a launch or a flop, it waits five years before the next one. The row names the year it can start. A running breakthrough doesn't take a slot from the ordinary R&D team, and ordinary R&D works as before.

### The project

- **Cost.** 8 times what the company's first ordinary idea costs to develop, rounded to two digits. It's fixed, with no slider. All of it leaves company cash when the project starts, and the cushion R&D always keeps back (about three months of running costs) has to stay in the account. When it doesn't, the row says how much is missing.
- **Years.** Three times an ordinary project's time, from four to six. Food trades take four, trades whose product sells worldwide take six, the rest four or five.
- **Odds.** 55% of the odds an ordinary launch would have for the company, never under 8% or over 60%. Those depend on who runs the company, its quality and its quality staff.
- **The roll.** It's made at the year-end the last year is done. If it works, 35% of the launches are smash hits. If it flops, the money is gone and the brand loses 6 points.
- **Quality and brand.** The line aims 14 points above a lavishly funded ordinary line (at most 97) and lands within 10 points either way. A smash hit adds 12 quality. The brand gains 5 points, or 12 for a smash hit.

### When it works

- **A new kind of product.** The line is a kind of its own, not a better version of a classic. It addresses 1.6 times as much of its kind's demand as a core line does.
- **Its demand.** Demand for the kind starts at about 8% of its eventual level in the launch year, is about half by the fourth year and full at ten. It holds until the 18th year, then fades toward 60%.
- **The whole trade.** The trade's potential market in the breakthrough's market (the country, or the world for a trade that sells worldwide) grows by 10% to 26% for each breakthrough. A costlier one lifts it more: 10% plus 4% for each doubling of its cost over $240,000 in 2026 money, up to four doublings. A third of the lift arrives in the launch year, two thirds in the next and all of it the year after. It holds through the eighth year after the launch, then halves every ten years. All of a market's breakthroughs together are capped at 40%. Every company of that trade and market gets it, yours and the rivals'.
- **Rivals catch up.** No rival has its own before the company's development time has passed after the launch. A giant follows after that time, a major rival after 1.25 times it, a mid-size one after 1.5 times and a small one after twice it, each rounded up, and about half of the rivals a year later. The long tail of small competitors follows at twice the development time. A rival's version starts 6 to 15 quality points under yours and never passes it. Rivals hold no cash in this game, so what they can fund is how long they need: a bigger rival is quicker, and none is quicker than you were.
- **The news.** The life log says "Company launched Name." A popup, "Name: a New Kind of Trade", names the market and the year rivals can follow. The launch is also listed in the trade's news, which keeps the newest 20 items. When the first rival can offer its own, the life log says so once.
- **The screen.** The Heavy R&D section shows the trade's latest three news items, then a row for each breakthrough with its cost, years, odds and the year rivals could follow. A row that can't start yet gives one reason: not enough cash, a project already running, or the wait. A running breakthrough sits in the project list marked Heavy R&D. A launched line says "rivals can have their own from about" the year, until a rival sells one or that year has passed.

### When it flops

- The cost is gone, the brand loses 6 points, and the R&D Results popup says so in one line. There's no news item and no effect on the market. The breakthrough is offered again once the five years are up.

### Retired lines

- **What's remembered.** A line you retire from the Products screen, the lines Retire Weak Lines takes off sale, and the lines a hired CEO retires. The company keeps the names, up to 400, newest last.
- **What it does.** R&D never offers a remembered name as an idea. Asking for it says "Name was retired. Develop something else." and charges nothing. The breakthrough list obeys the same names.
- **What it doesn't.** Retiring a line hides that exact name. Its next generation and its variants have other names and stay on offer. A line that runs out after 30 years and the storage trim of a very long list aren't remembered, so R&D can offer those again.

### Old saves

- Every new field is optional and checked when a game loads: the retired names, the year of the last project, a project's Heavy flag and cost, the breakthrough records of each market and the news list. A record is kept only for a breakthrough in the catalogue, with numbers that are finite and in range, at most 12 for a trade and market. A project's years are limited to 4, or to 6 for a Heavy R&D project. A field of the wrong type reads as empty.
- A save with none of this plays as it did before. A market with no record gives the same numbers as before, and a company with no retired names is offered the same ideas.
- The save schema number stays 2.

### Not in this release

- Breakthroughs for deep-tech companies and game studios. They keep their own R&D.
- A funding slider for a breakthrough. The cost is fixed.
- Patents, and rivals developing breakthroughs of their own to compete with each other.
- A lift that spills across borders. The trade's lift stays in the market the breakthrough was launched in.
- The Market screen's list of what a rival sells doesn't name a rival's version of a breakthrough yet. Its effect on share and customers is counted.
