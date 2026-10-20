# AnotherLife v4.0.2

One fix from a player report. Saves from v4.0.1 load unchanged.

## Fixes

- **AI lab research was capped at 2 capabilities.** The Benchmarks research limit was one
  capability for every three program slots, and the lab's program slots stop at 8, so no lab
  could ever research more than 2 capabilities at once, and a lab with fewer than 16 sites could
  research only 1. The limit now grows with your labs: 1 site researches 1 capability, 2 sites 2,
  4 sites 3, 8 sites 4, 16 sites 5, and so on up to all 8 capabilities with 128 sites.
  Capability research also has its own room now, so it no longer takes program slots from your
  ordinary programs, and the lab screen shows both counts ("Running (3/6 programs, 2/3
  research)"). A hired manager still never starts a capability track on its own.
