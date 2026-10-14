# AnotherLife v2.5.0

## Save safety

### Before (v2.4.0)

The main save is one plain JSON string in localStorage. These are its sizes on the unchanged v2.4.0
engine, measured by `scripts/save-size.ts` with seed 17: a founder born in 1926 who owns 12 companies
from age 30 and lives on through the real yearly loop (`probeLife` in `test/probe-life.ts`). The founders
never see a doctor, and none of seeds 1 to 20 reached age 100, so this is the one who lived longest: the
founder died at 82, in 2008.

"Raw" is the characters of the JSON string, "gzip" is node's gzip at level 6, and each part is measured
on its own, so the parts do not add up exactly to the whole save.

| Part | Raw characters | Gzip bytes (level 6) | Gzip % of raw |
| --- | ---: | ---: | ---: |
| whole save | 2,108,511 | 336,583 | 15.96% |
| flags.worldEconomy.countries | 577,265 | 102,018 | 17.67% |
| flags.worldEconomy.previous | 574,124 | 101,624 | 17.70% |
| flags.worldEconomy.history | 428,501 | 58,117 | 13.56% |
| log | 235,345 | 34,717 | 14.75% |
| assets | 76,363 | 15,001 | 19.64% |
| everything else | 216,860 | 26,361 | 12.16% |
