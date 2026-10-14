# AnotherLife v2.6.1: Fair insider cases

A player who was a UK member of parliament put 2 trillion pounds into one company's stock, passed a law that moved its shares, and was charged with insider trading. The regulator took money from the bank, the base sentence was 40 to 80 years, the money never came back, and there was no suit to bring. This release fixes each step: only shares bought recently count, a law that would start a case warns you first, a case is charged and sentenced for what it is, the money an investigation takes is held and comes back when you are cleared, an acquittal gives you a real suit to bring, Do Anything points to that suit instead of picking a random outcome, and a big buy order says what it will cost before you place it and what it returned after.

## Insider cases

- **Timing counts.** A share is an insider position only if it was bought in the current or the previous game year. Shares you have held longer never count. Each investment now keeps the units bought in those two years (`details.buys`); a holding saved without that falls back to the year of its first purchase. A sale uses this year's units first, then last year's, then the older ones.
- **One case per security.** While a law's insider case on a security is open, a second law on the same industry adds no second case, no extra heat and no extra karma loss. Bets placed in between are tagged to the case that is already open.
- **A fair charge.** A policy case records whether the law helped the company (`bullish`). A law that helped is charged as Abuse of Office, a law that hurt as Market Manipulation. Before this release every policy case was charged as Market Manipulation. A saved case without the field keeps that label.
- **A fair sentence.** A policy case that rests only on held shares has severity 3 at most, a base sentence of 5 to 15 years. It used to reach severity 5, a base of 40 to 80 years, for a stake of 10 million dollars or more (scaled to the country's wealth). Cases on open bets, index options and market-moving announcements are unchanged.
- **A warning before the vote.** The bill popup, for a vote and for an executive order, adds a plain line when the law would start a case: which companies, and that the regulator could call it insider trading. Seeing it draws no random numbers and changes nothing.

## Money held by an investigation

- When the regulator opens a case, the cash it takes is held on the case (`held`) instead of being destroyed. The scandal notice says the investigators are holding it until the case is decided. Open bets they freeze are still lost, as before. A case never holds more than the profit the regulator claims, however many times it is opened.
- The arrest carries the money and the regulator's name to the trial, for the immediate arrest and for the later arrest of a case that waited out an office holder's immunity.
- **Cleared:** an acquittal pays it back once ("You got back the X taken in your case."). A conviction overturned on appeal, or a death-row exoneration, pays it back once from the conviction record.
- **Not cleared:** a conviction or a plea deal keeps it. So does running from the arrest, bribing the officer, an informant deal, a pardon, and an arrest made while you are already in prison.
- **No trial:** the statute of limitations, and a case file "lost in a flood", pay it back and say so in the life log. A case that stays pending keeps it.
- If the character dies with money held, it is not returned.

## Suing

- An acquittal that follows a false accusation, or a prosecution by a named agency, files a real suit in Activities, Lawsuit. The notice says "You can sue the FCA under Activities, Lawsuit." exactly when one was filed. The row shows the agency's name; prices, fees, odds and damages are unchanged. A minor gets none (Lawsuit is 18 and over), and neither does an acquittal that sends a fugitive back to prison.
- **Do Anything** answers legal wording ("sue the FCA", "fight the seizure in court", "hire a lawyer", "legal action") with a pointer to Activities, Lawsuit. Under 18 it gives the age rule; in prison it says the menu is closed. It changes no money, stat or record and draws no random numbers. Wording that names a crime first still runs the crime ("sue him and rob him" steals).

## Big orders

- **Before:** the Buy row for a listed stock, a penny stock or a coin names the size where price impact starts to cost more than 10%: "Orders above about X lose over 10% to price impact". For an ordinary listed stock that is about 190 million dollars before your own buying has moved the price.
- **After:** when an order loses more than 10% to price impact, the Order Filled notice says so in a plain sentence, with the share lost on paper and what selling the whole position would return, before tax. It is the figure the Sell All row shows. Smaller orders keep the old text.
- **The header:** when selling the whole portfolio would pay more than 5% above or below its marked value, the Investments header adds "Sells for about X". The marked figures stay as they were.
- The savings notice reads "into savings" (a term deposit reads "into a term deposit").
- In the case that started this, a 2 trillion order in one stock is marked at 0.3% of what was paid, and selling it all returns about 98.6%. Price impact, fees, taxes and valuations are unchanged.

## Old saves

- Every new field is optional and checked when a game loads. `held` on an insider case must be a finite number of 0 or more, is rounded, and is capped at 1e15 per case; anything else is dropped. A case saved before this release holds nothing, so one that already took money under the old rules is not paid back. `bullish` is kept only when it is true or false. `refund` on a crime record is dropped when it is negative or not a number. `details.buys` on an investment is read only when it is a plain object, and never counts more units than the holding has.
- The save schema number stays 2.

## Not in this release

- A partial sale of a position your own buying lifted is taxed on a gain that is not there, and the sell fee is charged on the lifted value. Both are left as they were.
- A case's stake and paper gain are still worked out from the marked value of the shares, not from what a sale would return.
- Do Anything: "press charges" and "report him to the police" still get the generic answer, and a murder or self-harm wording still runs its own rule first.
