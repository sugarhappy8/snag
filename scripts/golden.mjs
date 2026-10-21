#!/usr/bin/env node
// golden.mjs - the golden-digest tool (R2-P2, K.7b). It plays the seeded lives of test/golden-run.ts and compares their
// per-slice digests with test/fixtures/golden-digests.json, or rewrites that file with a written reason.
//
//   node scripts/golden.mjs check  [--plan pr|deep|all]
//   node scripts/golden.mjs update --reason "why" [--plan pr|deep|all] [--at LABEL] [--allow-node]
//   node scripts/golden.mjs show   [--plan pr|deep|all]
//   node scripts/golden.mjs help
//
// This file only bundles test/golden-cli.ts with esbuild (a devDependency) into a temp .mjs and runs it under the same node,
// with GOLDEN_CLI=1 (so the bundle runs its command line) and GOLDEN_ROOT (so it finds the repo from a temp folder). The logic
// and its tests are in test/golden-cli.ts and test/golden-cli.test.ts, where tsc checks them. docs/CI.md has the rules: update
// under Node 22 (the version CI runs), always with a reason, and never merge the file by hand (rebase, then regenerate).
//
// Exit codes: 0 ok, 1 a digest moved or a problem, 2 bad usage. Node builtins plus esbuild.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ENTRY = join(ROOT, 'test', 'golden-cli.ts')

async function main(argv) {
  const { build } = await import('esbuild')
  const result = await build({
    entryPoints: [ENTRY],
    absWorkingDir: ROOT,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  })
  const work = mkdtempSync(join(tmpdir(), 'golden-'))
  try {
    const file = join(work, 'golden-cli.mjs')
    writeFileSync(file, result.outputFiles[0].text)
    const run = spawnSync(process.execPath, [file, ...argv], {
      stdio: 'inherit',
      env: { ...process.env, GOLDEN_CLI: '1', GOLDEN_ROOT: ROOT },
    })
    return run.status ?? 1
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (err) => {
    console.error(err?.stack ?? err)
    process.exitCode = 1
  },
)
