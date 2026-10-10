# AnotherLife v2.1.0 — Autonomous Conglomerates & Elite Business

This release expands conglomerate management, executive behavior, invention
commercialization, and private quantitative finance.

## Highlights

- Conglomerate CEOs can autonomously sweep and allocate treasury cash, launch
  funded subsidiaries, recruit and retain appropriately rated CEOs, and resolve
  affordable salary requests. Autonomous business creation can be paused.
- Conglomerates can buy back unaffiliated outside shares using group cash while
  protecting current and vested executive awards. Group Services now has an
  idempotent **Assign All** action for eligible internal contracts.
- Stronger executive scaling, improved business forecasting, and a special
  perfect-foresight ability for hired 100-rated CEOs. The ability guarantees
  positive annual company net earnings through separately booked and taxed
  strategic trading income when ordinary results fall short; it does not
  guarantee stock prices or erase operating costs.
- CEOs can commercialize inventions assigned or licensed to their companies,
  including price, fabrication capacity, and production planning.
- Elite finance leaders, Business talent, and private investment firms gain
  stronger quantitative strategies, with capacity, decay, and financing costs
  retained as balancing factors. Customer assets remain segregated.

See [CONGLOMERATE-AUTONOMY.md](CONGLOMERATE-AUTONOMY.md) for the detailed
mechanics and scope.

## Validation

- Production build and TypeScript validation pass.
- 177 targeted regression tests across 15 affected files passed, including
  treasury, buybacks, CEO management, investment firms, invention products,
  save/reload, and performance coverage.
- The complete test suite was not rerun for this release. The build retains the
  existing large-bundle warning.
