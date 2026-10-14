# AnotherLife v2.7.0: Your listed company in Stocks

A company you've taken public now shows up in Investments, Stocks, under its size, on the exchange it trades on. It has a ticker, a company screen, and two ways to trade it. You can buy more of it from the public float, which raises your stake. You can sell it through the same sale as Exit, Sell Shares. A listed group gets a row you can only look at.

The row is a view of the company, not a second holding. Net worth, estates and Sell Everything count the company once, as before.

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
  - A note that above 50% you control the board.
  - What buying costs and what selling pays in tax.
- **Two exchanges, one code.** A company is placed from its own country and its exchange code, not from where you live. A Tehran company is not in the Tokyo list, though both are TSE. A company spun off a group listed abroad shows on the exchange it trades on.
- **Not a market security.** You can't bet on it or open a position in it. It isn't a target for a law or an announcement, so it stays out of insider cases.

## Buying

- **Who can.** An adult who's alive and out of prison, when the company is listed, isn't a division of a group, its exchange is open and you have the cash for one share. Each reason shows on the Buy row.
- **The amount.** A slider runs from one share to the most your cash and the limits allow. Its preview reads "N shares at about $X each (market $Y). You'd own Z%."
- **The price.** It's 3% over the higher of the market price and the company's fundamental value per share, and more for a big order. The order doesn't move the share price, so buying can't mark up the stake you already hold. A round trip loses the premium, the price impact on the way out and the capital gains tax.
- **The limits.** At most 15% of the company a year, and 1% always stays with the public. Relatives' and executives' slices don't change, so a buy also stops at what's left outside them.
- **One move a year.** A Stocks buy uses the company's one Capital & Ownership move for the year. Put In More Money, Buy Out Investors and Company Buys Back Shares share that one move. Using any of them uses up the Stocks buy, and a Stocks buy uses up all three.
- **Control.** You don't need control of the board to buy. A buy that takes you over 50% gives you control. The preview says "This gives you control of the board." when it will, and "You keep control of the board." when you already have it. A buy never loses control. There's no board vote and no random roll. Buy Out Investors in Capital & Ownership still needs control and a board vote.
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
