# AnotherLife v3.0.0

More to do in ordinary jobs, without turning every career into a business simulator.

## Careers

- 165 full-time job definitions now have a Work Plan: choose an approach, prepare, and get a
  review next year. Nine work families track mastery, reputation and specializations. The other
  14 full-time jobs keep their existing Professional Practice assignments.
- Role-specific packs cover office, technical, care, education, public safety, creative,
  hospitality, field and transport work. This release expands science, care, culture and field
  assignments and corrects 21 mixed-industry role mappings.
- All 70 part-time definitions have a lighter Shift Focus: reliability, learning or people.
  Reviews build skill and trust, and sustained good work can earn an employer reference.
- Field experience follows you between employers. Part-time years are weighted by hours.
  Experience and earned reputation give a small progression edge, capped at five percentage
  points, without bypassing performance or qualification gates.
- Annual limits, appointment checks and owner stamps prevent job-hopping rewards, stale reviews,
  stale part-time shift actions and inherited career progress. Work reviews never pay a second salary.
- Historical school-leaver jobs use their actual age gates. Work events affect the correct job,
  including when a part-time worker also holds a special main career.
- A social-account deletion notice now uses era-neutral wording, fixing a 2009 history-lint failure.

## Finance-company leadership

- Finance-manager candidates have specialties, approaches, risk postures and concise track records.
- Finance-specific fit matters in hiring and skill. Hired investment-firm and hedge-fund CEOs
  follow mandates and budgets, make bounded operating decisions and report what they did.
- Finance firms use their own operating models rather than generic product-company controls.
  Conflicting player controls are guarded while a hired CEO runs the firm.

## Saves and scope

New state is optional and validated; the save schema remains 2. Older saves load without
inventing field experience from ambiguous past job titles. Special careers, military and
player-owned businesses retain their dedicated systems.

This is not the entire FEATURE-ROADMAP. Personal Money Team 2.0, advanced hedge-fund liquidity
systems, new family-specific random events, outside-offer tuning and hard field-specific hiring
requirements remain planned. Some ordinary titles share a family assignment pack.

## Validation

- 413 distinct focused and integration tests across 27 files passed, covering careers, shifts,
  field progression, role packs, finance leadership, funds, save loading, special careers,
  deep-tech integration, voice guards and historical simulation.
- The initial history sweep found one social-account deletion wording failure. That line was
  fixed, its new regression passed, and all seven history tests passed on recheck.
- Final TypeScript and production build passed; `git diff --check` was clean.
- The voice report found zero lexer errors. Nine of ten repository-wide style targets remain
  missed; this release does not claim to resolve that existing debt or the large app bundle.

The earlier full-time foundation passed 5,119 tests before its final edge-case hardening. That
historical result is not a full-suite pass on the final v3 commit. The full suite was not rerun
locally for this release; the normal main-branch CI remains responsible for comprehensive checks.
