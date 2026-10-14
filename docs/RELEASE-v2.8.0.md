# AnotherLife v2.8.0: Yearly dividends

A company you own can now pay you on its own. Under Money, Yearly Dividend, you set a share of the year's profit or of the company's spare cash, and the company pays it at each year end. It keeps a cash floor and never pays out money it owes. You get your part, taxed as income. Your relatives and the other shareholders get theirs. One life-log line for each company and one popup a year say what was paid, and why anything wasn't.

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
