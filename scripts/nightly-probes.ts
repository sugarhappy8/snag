// The nightly life probes as a standalone node script (the probes live in test/nightly-probes.ts, where tsc checks them).
//
//   node_modules/.bin/esbuild scripts/nightly-probes.ts --bundle --platform=node --format=esm --outfile=/tmp/nightly-probes.mjs
//   node /tmp/nightly-probes.mjs balance --start 1 --count 50 --out metrics/balance-1.json
//   node /tmp/nightly-probes.mjs ceiling --start 1 --count 6 --years 20 --scale 100 --out metrics/ceiling-1.json
//
// Each run plays one shard and writes a metrics file (test/nightly-metrics.ts shape); NIGHTLY_SHARD sets the shard number in it.
// scripts/nightly.mjs merges the shards and diffs them against the previous night. Exit 0 ok, 1 a probe failed, 2 bad usage.
import { probeCli } from '../test/nightly-probes'

try {
  process.exitCode = probeCli(process.argv.slice(2))
} catch (e) {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e))
  process.exitCode = 1
}
