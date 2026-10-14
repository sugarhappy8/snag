# AnotherLife v2.5.0

## Save safety

### Before (v2.4.0)

The main save is one plain JSON string in localStorage. These are its sizes on the unchanged v2.4.0
engine, measured by `scripts/save-size.ts` on a 100-year life: seed 14, a founder in Romania (`ro`) born
in 1926 who owns 12 companies from age 30 and is alive at age 100, in 2026.

The probe uses `keepAlive` (see `probeLife` in `test/probe-life.ts`). It is a measurement aid, not a
faithful life: the founder never sees a doctor, and left alone nobody gets near 100 (the best of seeds 1
to 220 reached 93). So before every year the founder's health is put back to 100 and their conditions
are cleared, and nothing else is changed. Seed 14 is the first of seeds 1 to 60 to reach 100 alive.

"Raw" is the characters of the JSON string, "gzip" is node's gzip at level 6, and each part is measured
on its own, so the parts do not add up exactly to the whole save.

| Part | Raw characters | Gzip bytes (level 6) | Gzip % of raw |
| --- | ---: | ---: | ---: |
| whole save | 2,151,953 | 351,925 | 16.35% |
| flags.worldEconomy.countries | 560,097 | 104,208 | 18.61% |
| flags.worldEconomy.previous | 559,261 | 103,344 | 18.48% |
| flags.worldEconomy.history | 431,892 | 59,519 | 13.78% |
| log | 318,316 | 46,695 | 14.67% |
| assets | 72,016 | 14,838 | 20.60% |
| everything else | 210,318 | 24,168 | 11.49% |
