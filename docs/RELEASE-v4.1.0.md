# AnotherLife v4.1.0

Release R1, "See it": charts for the numbers, search and cockpits for finding things, a quieter stream
of notices, and saves in IndexedDB. Saves from v4.0.3 load unchanged.

## What's new

- **Profit and Loss as a waterfall.** The Annual Report draws where the sales went, with a bridge
  that shows why profit changed. It has five tabs: Summary, Profit and loss, Cash, Market and Plan.
  It fits a phone, and the arrow keys move between tabs.
- **History and cash charts.** Each company you own keeps 30 years of books. The report and a Books
  and Charts group on the company screen draw profit and cost history and a cash walk. A chart that
  spans years uses one set of prices and says so ("prices of 2026").
- **Rank ladders and stock sparklines.** The market screens draw a ladder of rivals and your share
  over 20 years. Benchmarks, career standings and nation approval get charts. Stock lists show a
  small trend line.
- **A cockpit for each company, and one for your wealth.** A company opens as a short summary and four
  tiles: Run, Money, Leadership and Exit. Assets opens on a wealth cockpit, and the other tabs get a
  short summary above their list.
- **Your net worth as a line.** It's on your profile, on the death screen and in the graveyard.
- **Search.** The header has a Search button. Ctrl or Cmd+K, or "/", opens it too. Pin up to 12 places
  with the star in the breadcrumbs. The last 8 places you opened are listed. The keys 1 to 4 open the
  four tabs, and A ages you up.
- **Breadcrumbs and "Needs you".** A nested menu shows where you are and takes you back up in one tap.
  A row with something waiting wears a "Needs you" badge, and a card at the top of a tab lists them.
- **Activities in 8 sections.** Do Anything is still on top and Surrender still last.
- **One OK for a run of notices.** Plain notices in a row share one card, "5 updates".
- **Quiet Mode, on by default.** Routine news waits in an inbox behind the bell in the header instead
  of popping up. Decisions, money, health and legal notices still pop up. Settings has a Notices switch.
- **The life log shows the last 3 years open.** Each older year is one row. Tap it to open.
- **The Year-End Desk.** When two or more reports queue in one year, a bar above them shows
  "2 of 6", a chip for each company and one button, "Keep every plan".
- **Keyboard and screen reader fixes.** Focus stays inside a popup or sheet and comes back when it
  closes. The arrow keys, Home and End move through menu rows. Each chart has a text readout and a table.
- **Bigger tap targets.** Header buttons are 44 pixels, and the header text is easier to read.
- **Saves in IndexedDB.** The first time you open v4.1.0, your save is copied into IndexedDB, read
  back and compared, and only then removed from local storage. If IndexedDB can't open or takes over
  3 seconds, the game plays from local storage as before and leaves your save alone. A save that can't
  be loaded is kept as a copy that you can download from Home.
- **Charts and search load when you open them,** not at the start.
- **CI runs the tests in four shards,** with one required check, "CI gate".

## For players with old saves

Nothing in a v4.0.3 save needs converting. A few screens start from this version:

- A company's history from before this version has the profit line but no cost detail. The charts say
  "History starts {year}" where the books begin.
- The net-worth line starts this version. It gains a point each year you play.
- The cash walk shows an "Everything else" row until the ledger arrives in a later version.

## If you go back

The move to IndexedDB removes the old local storage save. An older build opened on the same address
sees no save until you return to v4.1.0, and a life started there is filed as an older copy. Opening
v4.1.0 with `?flags=none` after the move has the same look: Home is empty while your life sits in
IndexedDB.
