# Prompt for a local Sonnet ultracode session: build R0 (v4.0.3) and R1 (v4.1.0)

How to use it: on your laptop, in the cloned repo, start Claude Code with the Sonnet model and a permission mode that does not stop on every command (otherwise it stalls overnight). Keep the laptop awake (macOS: `caffeinate -dimsu`; Windows: Power settings, never sleep; Linux: `systemd-inhibit`). Then paste everything between the two lines below as your first message (it is ready to use; to let it merge and release on its own, replace the last decision line with: After CI is green and the PR is mergeable, merge to main (merge commit), then publish the release with the Release workflow (workflow_dispatch: tag v4.0.3 or v4.1.0, target main, notes from the release notes file) without asking).

---------------------------------------------------------------------------------------------

ultracode

You are building Release R0 (v4.0.3) and then Release R1 (v4.1.0) of the Living World programme for AnotherLife (a browser life simulator: Vite, React 19, strict TypeScript, Vitest; engine in `src/game`). Use the Workflow tool for orchestration. EVERY agent you start uses model "sonnet" (never Opus). Work autonomously; I will not answer questions until the end of each phase, so use the defaults below and note any assumption in the PR description.

## 0. Setup and base (read carefully, an earlier session lost hours to a stale base)

- The GitHub repo is `sugarhappy8/snag`. Its default branch is the OLD branch `claude/fervent-cerf-1iuzn5`. Never base work on it and never target it. The base for everything is `origin/main` (v4.0.2). Run `git fetch origin` first. PRs always pass `--base main` explicitly.
- The plan is in `docs/` on `origin/main` (the docs PR is merged: https://github.com/sugarhappy8/snag/pull/27). If `docs/superpowers/plans/2026-10-20-living-world-roadmap.md` is missing from `origin/main`, stop and tell me. Read, completely: `CLAUDE.md`, `docs/VOICE.md`, `docs/superpowers/specs/2026-10-20-living-world-design.md` sections 1, 4, 12, 13 and 14, and `docs/superpowers/plans/2026-10-20-living-world-roadmap.md` header, parts A.1 to A.6, B (blocks R0 and R1), C (the R0 task plan), D (R1 in detail), F.1 and G. Give each agent only the task text and file paths it needs, not the whole documents.
- Do not touch branch `claude/fervent-cerf-1iuzn5` or PR #22.
- One git worktree per track: `git worktree add ../wt/<release>-<track> -b claude/<release>-<track> release/<version>`. Do NOT run `npm ci` in each worktree: install once in the main clone and symlink `node_modules` into every worktree (same lockfile; this saves RAM and disk).

## 1. This machine (8 GB RAM, on 24/7): concurrency rules

- Reading and writing agents are cheap: run as many as you like (up to 8) at once.
- Agents that run tests or the type checker are expensive (about 0.5 GB per vitest worker, about 1 GB for tsc): at most 3 at a time. Always `npx vitest run --maxWorkers=1 <files>` with `NODE_OPTIONS=--max-old-space-size=2048`. Never run the full test suite locally (it takes about 40 minutes and 4 GB+); GitHub CI is the one full check. Never run `npm run build` in two agents at once. If the machine swaps, stop starting test runs until memory frees.
- Use a simple semaphore in the workflow script (a counter and a queue) for the test-running agents. Never poll in a loop: wait for notifications.

## 2. Decisions already made (use these)

- R0-3: REMOVE the skill-100 CEO "strategic trading income" guarantee in `business/executive-foresight.ts` (it mints money). Give top CEOs no replacement in R0 (the bounded benefit comes in R3).
- Keep the Investing talent's gut feeling (`invest/instinct.ts`) as the one documented foresight exception, fenced and explained in the scan test.
- R1: keep the four tab names and "+ Age", open each on a cockpit; Quiet Mode on by default (decisions, money and health shocks stay modal); chart money in constant prices with a "prices of {year}" chip; 30 years of company books and whole-life series; features ship dark behind flags where the roadmap says so.
- The repo is public, so CI minutes are free: split CI into 4 shards as roadmap item K.7a says (first R1 task, so every later run is faster).
- Do NOT merge to main or publish a release without my explicit OK; stop at a green PR and tell me.

## 3. What to build, in order

Phase 1, R0 (v4.0.3), about 14 tasks, 3 tracks, the plan is part C of the roadmap (verify each fix against the code before changing it; the plan names file, function, failing behaviour, change, and regression test). Branch `release/v4.0.3` from `origin/main`. One Sonnet implementer per task, tasks in order within a track, tracks in parallel; each task is test first (red), minimal fix, targeted tests, `npm run typecheck`, commit with explicit paths. After the tracks: merge them into `release/v4.0.3`, add `docs/RELEASE-v4.0.3.md` (plain language, what changed for the player), bump `package.json` and `package-lock.json` to 4.0.3, push, open the PR, and let CI run. One fresh whole-diff Sonnet reviewer, then one fix pass. Fix every red CI check at its root cause.

Phase 2, R1 (v4.1.0), parts B and D of the roadmap. Branch `release/v4.1.0` from `release/v4.0.3` (so you do not wait for me; when R0 is merged, merge `origin/main` into it). Start with the CI shards and the import-cycle ratchet test (K items), then run the 4 tracks of the roadmap in parallel: the chart kit and the Profit and Loss waterfall with the book series (S1), navigation (search, palette, pins, recents, cockpits), the notice digest with Quiet Mode and the text picker, and the accessibility pass with IndexedDB saves. Profit and Loss graphics are the headline deliverable: there are no graphics in the game today, only text. Check them on a phone-width browser viewport (Playwright with Chromium) in light and dark before you call them done, and put screenshots in the PR description.

## 4. Rules for every change (from CLAUDE.md and the roadmap, non-negotiable)

- No foresight (nothing reads the future); deterministic seeded RNG (an extra `g.rng` draw shifts seeded tests, so draw-preserving changes only; no `g.rng` in pure reads); accounting conservation (every dollar booked once); all new saved fields optional, validated and bounded (SAVE_SCHEMA stays 2 unless the roadmap says otherwise; old saves must load); yearly idempotence; pure presentation; every growth term has a real-world ceiling (a studio once made a trillion dollars); R&D cost must not scale with how rich the company is.
- Voice: plain narrator, contractions, NO em-dash or en-dash character anywhere in `src` (the cap is exactly 24 em-dashes and the test guards it). Line caps: log 90, outcome 120, scene 140.
- Tests: never skip, delete or weaken a test; update a pinned number only when the new rule legitimately changes it, and say why in the commit. Every fix and feature gets a regression test that fails before and passes after.
- Commits: explicit paths, one task per commit, message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Cross-track hot files: edits are additive and in their own hunk; the lead merges tracks in the order the roadmap lists. Push the release branch early and often so CI runs in parallel with the merges (the last big release found four cross-track failures only in CI).

## 5. Report back

At the end of each phase: update the PR description (what changed for the player, test and CI results, screenshots for R1, anything that deviates from the plan and why, assumptions), then tell me in a few lines: PR links, CI status, agent and token use, wall-clock time, problems. Ask me only if: a decision is not covered above, a pinned balance number must change by more than 10 percent, CI fails twice for the same reason after your fixes, or the plan contradicts the code in a way you cannot resolve.

---------------------------------------------------------------------------------------------
