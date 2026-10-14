# AnotherLife v2.8.0: Yearly dividends and share classes

This release has two parts so far.

**Yearly dividends.** A company you own can pay you on its own. Under Money, Yearly Dividend, you set a share of the year's profit or of the company's spare cash, and the company pays it at each year end. It keeps a cash floor and never pays out money it owes. You get your part, taxed as income. Your relatives and the other shareholders get theirs. One life-log line for each company and one popup a year say what was paid, and why anything wasn't.

**Share classes.** You can take your company public with founder shares or a non-voting float, and change the structure later with a board vote. Board seats, being fired as CEO and every "you'd lose control" line follow the votes, not the shares. In Investments, Stocks, the companies that really had classes show them in the years they had them, and their listed extra classes can be bought.

Money still follows the shares. Dividends, tax and what your stake is worth don't change.

## Yearly dividends

### Setting it

- **Where.** Company, Money, Yearly Dividend, right under Pay a Dividend. It has four rows: Share of Profit, Share of Spare Cash, Cash to Keep and Turn Off.
- **The share.** A slider from 5% to 100% in steps of 5. It starts at 30%.
- **The floor.** Cash to Keep is months of the company's running costs, from 0 to 24. It starts at 3. It needs a share set first.
- **The preview.** Each slider shows what the rule would pay now, your part and what stays in the company. When nothing would be paid, it says why.
- **Off.** Turn Off goes back to paying yourself by hand. Pay a Dividend works with or without a rule.
- **Who can change it.** Anyone who can run the company by hand. Not from prison, and not before 18.

### What it pays

- **Two bases.** A share of the year's profit after tax, or a share of the spare cash.
- **Spare cash.** What the company holds after its loans, after investors' share, after unreleased-game money and a bank's capital, and after the floor.
- **The cap.** It never pays more than the spare cash. A profit rule in a big year pays only what the cash allows.
- **Borrowing can't pay it.** A loan comes off the cash that can leave, so a company can't borrow to pay a dividend.
- **A year that pays nothing.** The life log says why: no profit, loans come first, investors are paid back first, the cash is at the floor, or there is no spare cash. Nothing carries over to the next year.
- **Once a year.** It pays at year end, before the company's annual report and before a hired CEO plans the next year, so both work from the cash that's left.

### Who gets it

- **You.** By your stake. It counts as income where you live and is taxed with the rest of your year. The popup gives an estimate of the tax.
- **Your relatives.** By theirs, the same way a manual dividend pays them.
- **Other shareholders.** They get the rest.
- **A listed company.** The share price falls by the payout per share, and the market cap and your stake's value fall with it. Buying shares just before year end to collect a dividend loses money.

### When you're not running it

- **A hired CEO.** A cash or profit mandate stops paying while your rule is set, so the company pays once, by your rule.
- **A board.** It never votes on the rule, and the payout never passes the board's reserve. The floor is the larger of your months and the board's.
- **Prison and young heirs.** It still pays.
- **A division of a group.** It ignores the rule, and the menu is hidden. Its cash belongs to the group.

### In Stocks

- The company screen shows the last dividend per share and its yield on the price. The yield is left out when the price makes it meaningless.

### Old saves

- Nothing changes until you set a rule. A damaged rule reads as no rule. The save schema number stays 2.

### Not in this release

- A fixed dollar amount a year.
- Dividend tax rates by country.
- A rule for groups.
- Special dividends.
- Buybacks as a payout.
- A line about it in the CEO's letter.
- An advisor that sets the rule.
- A hired CEO's own dividends reaching your relatives. The cash and profit mandates still pay only the owner when no rule is set.

## Share classes

### Your company

- **Where.** Share Classes sits in Capital & Ownership and, for a company that isn't listed yet, beside Go Public. It has three rows: One Class of Shares, Founder Class (A/B) and Non-Voting Float. Each row says the votes you'd hold and what the market does to the price.
- **Founder class.** Your whole stake becomes B shares with 10 votes each. The public's A shares have 1. A 25% float leaves you 75% of the shares and about 97% of the votes. At 15% of the shares you still hold about 64% of the votes, which is 7 seats on an 11-seat board.
- **Non-voting float.** Your shares have 1 vote and the public's have none. At 15% of the shares you hold all the votes.
- **The price.** The market pays 4% less for founder shares and 7% less for a non-voting float. It comes off the offer at the IPO and stays in the share price for as long as the company is listed. Putting in more money, buying out investors and company buybacks price the shares at that market value, so a small move in Capital & Ownership doesn't give the discount back.
- **Before the IPO.** Picking a structure only sets the plan the IPO will use. It's free, any time, with no vote. The IPO preview names the votes you'd hold, and says whether you'd keep control of the board. The IPO popup gives your votes.
- **After the IPO.** A change takes a board vote, once a year. A founder who controls the board passes it. One who doesn't mostly fails. A yes turns your whole stake into the founders' class (or back to one class), moves the price once by the difference and seats the board again. A no changes nothing, and no other change of structure can be put to the board that year. The board can still be asked about anything else. The row says "Classes change once a year." when the year's change is used.
- **New shares are ordinary.** Shares you buy from the market, shares you get from Buy Out Investors and shares the company issues carry 1 vote, not the founders' 10. A buyback raises your founders' part. A sale comes out of your ordinary shares first. A stake that shrank with no sale, for example when a CEO is given equity, doesn't bring its founder votes back when you buy. Relatives' shares count as founder shares, and executives' shares as ordinary.
- **Control.** Buy Out Investors needs control of the board, and the board reads votes. Going back to one class makes the votes equal the shares again.
- **Not for divisions.** A division of a group can't have its own classes. A company that comes out of a group to list lists with one class.
- **Dividends.** They're the same for every share, whatever its class.

### In Stocks

- **The screen.** Your listed company's screen shows its classes, then "Votes: you hold X of the votes with Y of the shares.", and says that at 50% of the votes you control the board.
- **The row.** It adds your votes after your stake, for example "(64% of votes)".
- **Buying.** The preview says whether the shares vote ("These shares carry 1 vote." or "These shares carry no vote.") and the votes you'd hold after the buy. The buying price follows the market's price for the structure.

### Real companies

- **The classes.** 21 companies show a "Share classes" line on their Stocks screen, for the years the class is documented: Alphabet, Meta, Berkshire Hathaway, Ford, Rogers, Shopify, Volkswagen, BMW, Porsche, Henkel, Richemont, Ericsson, Volvo, H&M, Electrolux, Kone, Samsung Electronics, Hyundai Motor, Tata Motors, Xiaomi and Meituan. The line names each class, its votes a share, who holds it and whether it's listed too. Each row comes from a public source (a filing, an annual report or the company's own pages), and a row that couldn't be confirmed was left out.
- **The second lines.** 12 of those classes are listed, and you can buy them from the company's screen: Alphabet's Class C (from 2014), Berkshire's Class B (from 1996), Rogers' Class A, the preferred shares of Volkswagen, BMW, Henkel, Samsung Electronics and Hyundai Motor, Ericsson's, Volvo's and Electrolux's Class A, and Tata Motors' DVR shares (2008 to 2024).
- **How a line trades.** It's part of the company's screen, with its own Buy and Sell and a ticker of its own (the company's with the class letter added), and not a row of its own in the list. Its price is the company's price plus a fixed gap for its votes: 3% more with more votes, 4% less with none and 2% less with fewer. There's no extra random draw.
- **It moves with the company.** News about the company (a ban, a contract, an invention) moves every line together. A split splits the line. A rename renames it, and "Google (Class C)" becomes "Alphabet (Class C)". When the company ends, the line ends on the same terms. Your own buying and selling moves only the line you traded.
- **When the class ends.** Once a class's last year has passed, the holder is paid out at the line's last price, as for any delisted stock.
- **No bets.** A line can't be a target for a bet, an option, a law or an announcement.

## Old saves

- The new field is optional and checked when a game loads. It's kept only when the kind is exactly founder shares or a non-voting float, with the founders' part limited to 0 to 100%. Anything else reads as one class.
- A save without it plays as before. The board, the IPO preview and every screen read the same as in v2.7.0 for a one-class company.
- A holding in a line whose data later goes is paid out as delisted, as any unknown stock is today.
- The save schema number stays 2.

## Not in this release

- Loyalty and double voting (LVMH, L'Oréal), A and H share listings, dual-listed pairs (Shell, Unilever), golden shares and sunset clauses.
- Roche, Novo Nordisk and Maersk. Their structure and dates weren't confirmed.
- Executive options, a dividend premium for a class, a preferred class for your company, and a second listed class of your own company.
- Classes at founding, and classes on groups and divisions.
- Bets and options on a second line.
- Takeover bids that count votes, and index membership rules.
- Unit sizes. One Berkshire A share is 1,500 B shares in real life. Here a line trades near its company's price.
- A cap on the vote lead. A non-voting float with a tiny stake keeps every vote, and the 7% price cost, the independents' veto and minority suits are the counterweights.
