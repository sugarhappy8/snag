# AnotherLife v2.0.0 — World & Gameplay Expansion

## World Simulation 2.0

- Connected household consumption, savings, debt, employment and credit conditions.
- Government budgets, interventions, international trade and supply-chain shocks.
- Autonomous economic rivals, company sourcing policies and resilience investments.
- Expanded economic reports and business/banking feedback.
- Compressed Time Machine snapshots and deterministic save/reload coverage.

## Gameplay Expansion 2.0

- Professional assignments, preparation and specialization for medicine, law,
  engineering and skilled trades.
- Residential, commercial and industrial development with permits, contractors,
  financing, construction costs and commissioning.
- Commercial property fit-outs and five-year leases; operating boat and aircraft
  charters with real expenses, wear and risk.
- Independent music production, owned masters, distribution, five-year licensing,
  recoupment, sale and inheritance.
- Funded multi-year projects with NPCs: mentorship, gardens, family history and sport.
- Restricted family giving funds and optional evidence-based succession reviews.
- Clearer affordability feedback and fixes for commercial-property handling,
  donation accounting and historically gated investment themes.

## Validation and scope

Local TypeScript validation and production builds pass. The gameplay full-suite sweep
passed 3,090 of 3,092 tests; both failures were fixed, then all 382 selected tests across
22 files passed, including 36 new gameplay tests. The entire suite was not rerun after
those corrections. World-simulation regression checks and isolated browser checks are
documented in the linked guides.

The existing large JavaScript bundle warning remains. This release implements substantial
representative career and development routes, not every profession or building variant.
The economic simulation uses bounded aggregate models, not real-world financial forecasts.

Remote CI is skipped as requested. Deployment runs separately. Attached ZIPs contain
the tagged source and the production web build.

- [World simulation details](https://github.com/sugarhappy8/snag/blob/v2.0.0/docs/LIVING-WORLD.md)
- [Gameplay routes, limitations and test evidence](https://github.com/sugarhappy8/snag/blob/v2.0.0/docs/GAMEPLAY-EXPANSION.md)
