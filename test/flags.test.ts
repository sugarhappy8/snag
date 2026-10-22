// ci: fast
// R1-P3 (K.11): the build-time feature switches in src/game/flags.ts, the release rule that ties them to the
// package.json version, the source guards that keep every track reading them the same way, and the text of the
// per-branch preview workflow. Pure and quick: it reads the source tree and imports the module, and nothing else.
//
// Not to be confused with GameState.flags (saved misc flags) or the player setting Settings.quietMode.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import pkg from '../package.json'
import {
  FLAG_DEFS,
  FLAGS,
  flagOn,
  parseFlagList,
  resetFlags,
  setFlags,
  withFlags,
  type FlagDef,
  type FlagKey,
  type FlagOverrides,
} from '../src/game/flags'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const EM_DASH = String.fromCharCode(0x2014)
const EN_DASH = String.fromCharCode(0x2013)

// The live flags the moment this file was imported, before any test could change them.
const AT_IMPORT: Record<string, boolean> = { ...FLAGS }
const KEYS = Object.keys(FLAG_DEFS) as FlagKey[]
const DEFAULTS = Object.fromEntries(KEYS.map((k) => [k, FLAG_DEFS[k].default])) as Record<FlagKey, boolean>
const ALL_ON = Object.fromEntries(KEYS.map((k) => [k, true])) as Record<FlagKey, boolean>
const ALL_OFF = Object.fromEntries(KEYS.map((k) => [k, false])) as Record<FlagKey, boolean>

afterEach(() => {
  resetFlags()
})

/** Every .ts and .tsx file under a repo directory, as repo-relative paths with forward slashes. */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (abs: string) => {
    for (const name of readdirSync(abs)) {
      const full = join(abs, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, full).split(sep).join('/'))
    }
  }
  walk(join(ROOT, dir))
  return out.sort()
}

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** The text without the lines that start a comment, so a note about a rule never trips the scan for it. */
function stripComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\/\*|\*)/.test(line))
    .join('\n')
}

/** The release rule: a flag whose `ships` version is at or below the package version must default on, the rest off. */
function parseVersion(v: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v)
  if (!m) throw new Error(`not an x.y.z version: ${v}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}
function versionAtLeast(version: string, ships: string): boolean {
  const a = parseVersion(version)
  const b = parseVersion(ships)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return true
}
function releaseRuleProblems(version: string, defs: Record<string, FlagDef>): string[] {
  const problems: string[] = []
  for (const [key, def] of Object.entries(defs)) {
    const shouldBeOn = versionAtLeast(version, def.ships)
    if (def.default !== shouldBeOn) {
      problems.push(`${key}: version ${version}, ships ${def.ships}, so the default must be ${shouldBeOn} (it is ${def.default})`)
    }
  }
  return problems
}

describe('FLAG_DEFS', () => {
  it('has the nine agreed keys, each well formed', () => {
    expect([...KEYS].sort()).toEqual([
      'annualReport2',
      'chartKit',
      'cockpits',
      'idbSaves',
      'navPalette',
      'navRegroup',
      'noticeDigest',
      'quietInbox',
      'yearCard',
    ])
    for (const key of KEYS) {
      expect(key, key).toMatch(/^[a-z][A-Za-z0-9]*$/)
      expect(typeof FLAG_DEFS[key].default, key).toBe('boolean')
      expect(FLAG_DEFS[key].ships, key).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })

  it('follows the release rule at the real package.json version', () => {
    // The lead's release commit bumps the version and flips the defaults together. Either half alone fails here.
    expect(releaseRuleProblems(pkg.version, FLAG_DEFS)).toEqual([])
  })

  it('applies the release rule to a synthetic version table', () => {
    const defs = (a: boolean, b: boolean, c: boolean): Record<string, FlagDef> => ({
      early: { default: a, ships: '4.1.0' },
      late: { default: b, ships: '4.10.0' },
      deferred: { default: c, ships: '5.0.0' },
    })
    const rows: [string, [boolean, boolean, boolean]][] = [
      ['4.0.3', [false, false, false]],
      ['4.1.0', [true, false, false]],
      ['4.1.1', [true, false, false]],
      ['4.9.9', [true, false, false]],
      ['4.10.0', [true, true, false]],
      ['5.0.0', [true, true, true]],
    ]
    for (const [version, [a, b, c]] of rows) {
      expect(releaseRuleProblems(version, defs(a, b, c)), version).toEqual([])
    }
    // Either half alone is a failure: the version moved without the defaults, and the defaults moved without the version.
    expect(releaseRuleProblems('4.1.0', defs(false, false, false))).toHaveLength(1)
    expect(releaseRuleProblems('4.0.3', defs(true, false, false))).toHaveLength(1)
    expect(releaseRuleProblems('4.10.0', defs(true, false, false))).toHaveLength(1)
    expect(releaseRuleProblems('4.1.0', defs(true, false, true))).toHaveLength(1)
    expect(() => releaseRuleProblems('4.1', defs(true, false, false))).toThrow()
  })
})

describe('parseFlagList', () => {
  const table: [string, string | null | undefined, FlagOverrides][] = [
    ['empty string', '', {}],
    ['null', null, {}],
    ['all', 'all', ALL_ON],
    ['none', 'none', ALL_OFF],
    ['a list', 'chartKit,navPalette', { chartKit: true, navPalette: true }],
    ['a negation', 'chartKit,-navRegroup', { chartKit: true, navRegroup: false }],
    ['unknown names', 'chartKit,nope,-alsoNope,constructor,__proto__', { chartKit: true }],
    ['mixed case', 'ChartKit,-NAVREGROUP,Cockpits', { chartKit: true, navRegroup: false, cockpits: true }],
    ['201 characters', 'chartKit' + ' '.repeat(193), {}],
    ['21 tokens', ['chartKit', ...Array.from({ length: 20 }, () => 'x')].join(','), {}],
  ]
  it.each(table)('%s', (_label, raw, want) => {
    expect(parseFlagList(raw)).toEqual(want)
  })

  it('accepts exactly 200 characters and exactly 20 tokens', () => {
    const padded = 'chartKit' + ' '.repeat(192)
    expect(padded).toHaveLength(200)
    expect(parseFlagList(padded)).toEqual({ chartKit: true })
    const twenty = ['chartKit', ...Array.from({ length: 19 }, () => 'x')].join(',')
    expect(parseFlagList(twenty)).toEqual({ chartKit: true })
  })

  it('reads the tokens in order, so a later one wins', () => {
    expect(parseFlagList('all,-navRegroup')).toEqual({ ...ALL_ON, navRegroup: false })
    expect(parseFlagList('none,chartKit')).toEqual({ ...ALL_OFF, chartKit: true })
    expect(parseFlagList('chartKit,-chartKit')).toEqual({ chartKit: false })
  })

  it('trims spaces, skips empty tokens and ignores a value that is not text', () => {
    expect(parseFlagList(' chartKit , ,-navRegroup,')).toEqual({ chartKit: true, navRegroup: false })
    expect(parseFlagList(undefined)).toEqual({})
    expect(parseFlagList(5 as unknown as string)).toEqual({})
  })

  it('never reads or writes the prototype', () => {
    const out = parseFlagList('__proto__,constructor,toString,-hasOwnProperty')
    expect(Object.keys(out)).toEqual([])
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).chartKit).toBeUndefined()
  })
})

// These tests move flags away from their defaults and back, so they hold both before the lead's release commit
// (defaults off) and after it (defaults on).
const away = (key: FlagKey): boolean => !DEFAULTS[key]
const awayOf = (...keys: FlagKey[]): FlagOverrides => Object.fromEntries(keys.map((k) => [k, away(k)]))

describe('FLAGS, flagOn, setFlags, resetFlags, withFlags', () => {
  it('equals the defaults at import in node, where there is no location', () => {
    expect(typeof location).toBe('undefined')
    expect(AT_IMPORT).toEqual(DEFAULTS)
  })

  it('withFlags applies the overrides and restores them afterwards', () => {
    expect(FLAGS.chartKit).toBe(DEFAULTS.chartKit)
    const seen = withFlags(awayOf('chartKit'), () => {
      expect(FLAGS.chartKit).toBe(away('chartKit'))
      expect(flagOn('chartKit')).toBe(away('chartKit'))
      expect(FLAGS.navRegroup).toBe(DEFAULTS.navRegroup)
      return 'result'
    })
    expect(seen).toBe('result')
    expect(FLAGS.chartKit).toBe(DEFAULTS.chartKit)
    expect(flagOn('chartKit')).toBe(DEFAULTS.chartKit)
  })

  it('withFlags can turn a flag on and can turn it off', () => {
    withFlags({ chartKit: true }, () => expect(FLAGS.chartKit).toBe(true))
    withFlags({ chartKit: false }, () => expect(FLAGS.chartKit).toBe(false))
    expect(FLAGS.chartKit).toBe(DEFAULTS.chartKit)
  })

  it('withFlags restores when the callback throws', () => {
    expect(() =>
      withFlags(awayOf('chartKit', 'cockpits'), () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect({ ...FLAGS }).toEqual(DEFAULTS)
  })

  it('nested withFlags calls restore in order', () => {
    withFlags(awayOf('chartKit'), () => {
      withFlags({ chartKit: DEFAULTS.chartKit, navRegroup: away('navRegroup') }, () => {
        expect(FLAGS.chartKit).toBe(DEFAULTS.chartKit)
        expect(FLAGS.navRegroup).toBe(away('navRegroup'))
        withFlags(awayOf('cockpits'), () => {
          expect(FLAGS.cockpits).toBe(away('cockpits'))
          expect(FLAGS.navRegroup).toBe(away('navRegroup'))
        })
        expect(FLAGS.cockpits).toBe(DEFAULTS.cockpits)
        expect(FLAGS.navRegroup).toBe(away('navRegroup'))
      })
      expect(FLAGS.chartKit).toBe(away('chartKit'))
      expect(FLAGS.navRegroup).toBe(DEFAULTS.navRegroup)
    })
    expect({ ...FLAGS }).toEqual(DEFAULTS)
  })

  it('withFlags restores what setFlags had set, not the defaults', () => {
    setFlags(awayOf('navPalette'))
    withFlags(awayOf('chartKit'), () => {
      expect(FLAGS.navPalette).toBe(away('navPalette'))
      expect(FLAGS.chartKit).toBe(away('chartKit'))
    })
    expect(FLAGS.navPalette).toBe(away('navPalette'))
    expect(FLAGS.chartKit).toBe(DEFAULTS.chartKit)
  })

  it('FLAGS and flagOn agree for every key and every override', () => {
    for (const key of KEYS) {
      withFlags(awayOf(key), () => {
        expect(FLAGS[key], key).toBe(away(key))
        expect(flagOn(key), key).toBe(away(key))
        for (const other of KEYS) if (other !== key) expect(flagOn(other), other).toBe(DEFAULTS[other])
      })
    }
  })

  it('setFlags replaces every override and defaults fill the rest', () => {
    setFlags(awayOf('chartKit'))
    expect(FLAGS.chartKit).toBe(away('chartKit'))
    setFlags(awayOf('navRegroup'))
    expect(FLAGS.chartKit).toBe(DEFAULTS.chartKit)
    expect(FLAGS.navRegroup).toBe(away('navRegroup'))
    setFlags({})
    expect({ ...FLAGS }).toEqual(DEFAULTS)
  })

  it('resetFlags goes back to the defaults', () => {
    setFlags(awayOf(...KEYS))
    expect(KEYS.every((k) => FLAGS[k] === away(k))).toBe(true)
    resetFlags()
    expect({ ...FLAGS }).toEqual(DEFAULTS)
  })

  it('an imported FLAGS stays the same live object across overrides', () => {
    const held = FLAGS
    setFlags(awayOf('idbSaves'))
    expect(held.idbSaves).toBe(away('idbSaves'))
    expect(held).toBe(FLAGS)
  })

  it('ignores a key that is not a flag', () => {
    setFlags({ notAFlag: true, chartKit: away('chartKit') } as unknown as FlagOverrides)
    expect(Object.keys(FLAGS).sort()).toEqual([...KEYS].sort())
    expect(FLAGS.chartKit).toBe(away('chartKit'))
  })

  it('does not let a consumer assign to FLAGS (a compile error, checked by npm run typecheck)', () => {
    const assign = (): void => {
      // @ts-expect-error FLAGS is read-only for consumers: use withFlags, or setFlags with resetFlags.
      FLAGS.chartKit = true
    }
    expect(typeof assign).toBe('function')
  })
})

describe('the module in a browser', () => {
  // A fresh copy of the real module per case, with a fake location and storage in place. The module is not
  // replaced: only the globals it reads are.
  async function loadWith(search: string | null, stored: string | null | 'throws'): Promise<Record<string, boolean>> {
    vi.resetModules()
    if (search !== null) vi.stubGlobal('location', { search })
    if (stored !== null) {
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => {
          if (stored === 'throws') throw new Error('storage blocked')
          return key === 'anotherlife.flags' ? stored : null
        },
      })
    }
    const mod = await import('../src/game/flags')
    return { ...mod.FLAGS }
  }
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('takes ?flags= from the URL', async () => {
    expect(await loadWith('?flags=chartKit,navPalette', null)).toEqual({ ...DEFAULTS, chartKit: true, navPalette: true })
    expect(await loadWith('?x=1&flags=all', null)).toEqual(ALL_ON)
  })

  it('lets the URL win over the stored list, and the stored list win over the defaults', async () => {
    expect(await loadWith('?flags=cockpits', 'chartKit')).toEqual({ ...DEFAULTS, cockpits: true })
    expect(await loadWith('?flags=none', 'all')).toEqual(ALL_OFF)
    expect(await loadWith('', 'chartKit,-navRegroup')).toEqual({ ...DEFAULTS, chartKit: true, navRegroup: false })
    expect(await loadWith('?other=1', 'all')).toEqual(ALL_ON)
  })

  it('keeps the defaults when there is nothing to read', async () => {
    expect(await loadWith('', null)).toEqual(DEFAULTS)
    expect(await loadWith('?flags=nope', null)).toEqual(DEFAULTS)
  })

  it('survives storage and location that throw', async () => {
    expect(await loadWith('', 'throws')).toEqual(DEFAULTS)
    vi.resetModules()
    vi.stubGlobal('location', {
      get search(): string {
        throw new Error('no search')
      },
    })
    const mod = await import('../src/game/flags')
    expect({ ...mod.FLAGS }).toEqual(DEFAULTS)
  })
})

describe('source guards', () => {
  const srcFiles = sourceFiles('src')
  const testFiles = sourceFiles('test')

  it('reads a flag at use only: no top-level const or let holds one', () => {
    // A module-level `const x = FLAGS.chartKit` would freeze the value at import and ignore withFlags.
    const topLevel = /^(?:export\s+)?(?:const|let|var)\s[^\n=]*=\s*[!(\s]*(?:FLAGS\b|flagOn\()/m
    const bad = srcFiles.filter((f) => topLevel.test(stripComments(read(f))))
    expect(bad, `read FLAGS or flagOn() inside the function that uses it, not in a module-level const: ${bad.join(', ')}`).toEqual([])
  })

  it('keeps src/game/flags.ts free of imports', () => {
    const text = stripComments(read('src/game/flags.ts'))
    expect(/^\s*import\b/m.test(text)).toBe(false)
    expect(/\bimport\s*\(/.test(text)).toBe(false)
    expect(/\brequire\s*\(/.test(text)).toBe(false)
  })

  it('has no em-dash or en-dash in the flags module, the preview workflow or the previews doc', () => {
    for (const rel of ['src/game/flags.ts', '.github/workflows/preview.yml', 'docs/PREVIEWS.md']) {
      const text = read(rel)
      expect(text.includes(EM_DASH), `${rel} has an em-dash`).toBe(false)
      expect(text.includes(EN_DASH), `${rel} has an en-dash`).toBe(false)
    }
  })

  it('never mocks the flags module in a test', () => {
    const mocks = /\bvi\.(?:doMock|mock)\(\s*['"`][^'"`]*game\/flags(?:\.[tj]s)?['"`]/
    const bad = testFiles.filter((f) => mocks.test(stripComments(read(f))))
    expect(bad, `use withFlags, or setFlags with resetFlags, instead of replacing the module: ${bad.join(', ')}`).toEqual([])
  })

  it('never assigns to a FLAGS property outside the module and its own test', () => {
    const assigns = [
      /\bFLAGS\s*\.\s*\w+\s*[-+*/%&|^?]*=(?![=>])/,
      /\bFLAGS\s*\[[^\]]*\]\s*[-+*/%&|^?]*=(?![=>])/,
      /\bObject\s*\.\s*(?:assign|defineProperty|defineProperties)\(\s*FLAGS\b/,
      /\bdelete\s+FLAGS\b/,
    ]
    const skip = new Set(['src/game/flags.ts', 'test/flags.test.ts'])
    const bad = [...srcFiles, ...testFiles]
      .filter((f) => !skip.has(f))
      .filter((f) => {
        const text = stripComments(read(f))
        return assigns.some((re) => re.test(text))
      })
    expect(bad, `use withFlags, or setFlags with resetFlags, never an assignment to FLAGS: ${bad.join(', ')}`).toEqual([])
  })

  it('catches the violations it is meant to catch', () => {
    const topLevel = /^(?:export\s+)?(?:const|let|var)\s[^\n=]*=\s*[!(\s]*(?:FLAGS\b|flagOn\()/m
    expect(topLevel.test("const on = FLAGS.chartKit\n")).toBe(true)
    expect(topLevel.test("export const on = !FLAGS.chartKit\n")).toBe(true)
    expect(topLevel.test("const { chartKit } = FLAGS\n")).toBe(true)
    expect(topLevel.test("let on = flagOn('chartKit')\n")).toBe(true)
    expect(topLevel.test("function f() {\n  const on = FLAGS.chartKit\n}\n")).toBe(false)
    expect(stripComments('// FLAGS.chartKit = true\nconst a = 1\n')).not.toMatch(/FLAGS/)
    expect(stripComments('/**\n * FLAGS.chartKit = true\n */\nconst a = 1\n')).not.toMatch(/FLAGS/)
    expect(stripComments("const glob = 'src/**'\nFLAGS.chartKit = true\n")).toMatch(/FLAGS/)
  })
})

describe('.github/workflows/preview.yml', () => {
  const text = read('.github/workflows/preview.yml')
  const steps = text.split(/^ {6}- /m).slice(1)

  it('is guarded by the token, runs read-only and never uses pull_request_target', () => {
    expect(text).toContain('HAS_CLOUDFLARE_API_TOKEN')
    expect(text).toContain('--preview-alias')
    expect(text).toContain('contents: read')
    expect(text).not.toContain('pull_request_target')
  })

  it('runs on release and claude branch pushes and by hand, one run per branch', () => {
    expect(text).toMatch(/branches:\s*\['release\/\*\*', 'claude\/\*\*'\]/)
    expect(text).toContain('workflow_dispatch:')
    expect(text).toContain('group: preview-${{ github.ref_name }}')
    expect(text).toContain('cancel-in-progress: true')
    expect(text).not.toMatch(/^\s*pull_request:/m)
  })

  it('skips every step but the notice when the token is missing', () => {
    expect(steps.length).toBeGreaterThanOrEqual(5)
    const notices = steps.filter((s) => s.includes('::notice::'))
    expect(notices).toHaveLength(1)
    expect(notices[0]).toContain("env.HAS_CLOUDFLARE_API_TOKEN != 'true'")
    for (const step of steps.filter((s) => !s.includes('::notice::'))) {
      expect(step, step.split('\n')[0]).toContain("if: env.HAS_CLOUDFLARE_API_TOKEN == 'true'")
    }
  })

  it('checks out without keeping credentials, installs with npm ci and builds through wrangler', () => {
    expect(text).toContain('persist-credentials: false')
    expect(text).toMatch(/node-version: 22/)
    expect(text).toMatch(/cache: npm/)
    expect(text).toContain('npm ci')
    expect(text).toContain('npx wrangler versions upload --preview-alias "$ALIAS" --message "$GITHUB_SHA"')
    expect(text).toContain('tee upload.log')
    expect(text).toContain('GITHUB_STEP_SUMMARY')
    expect(text).not.toMatch(/npx wrangler deploy/)
  })

  it('computes the alias from the branch name through the shell, not through an expression', () => {
    expect(text).toContain(
      `printf '%s' "$GITHUB_REF_NAME" | tr 'A-Z' 'a-z' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' | cut -c1-40 | sed -E 's/-+$//'`,
    )
    // Only these expressions appear, and the branch name only in the concurrency group.
    const expressions = [...text.matchAll(/\$\{\{([^}]*)\}\}/g)].map((m) => m[1].trim())
    expect(new Set(expressions)).toEqual(
      new Set(["secrets.CLOUDFLARE_API_TOKEN != ''", 'secrets.CLOUDFLARE_API_TOKEN', 'github.ref_name']),
    )
    expect(expressions.filter((e) => e === 'github.ref_name')).toHaveLength(1)
  })

  it('hands the token and account id to the upload step only', () => {
    const holders = steps.filter((s) => s.includes('secrets.CLOUDFLARE_API_TOKEN }}'))
    expect(holders).toHaveLength(1)
    expect(holders[0]).toContain('wrangler versions upload')
    // pipefail comes with an explicit shell: without it a failed upload piped through tee would pass.
    expect(holders[0]).toContain('shell: bash')
    expect(holders[0]).toContain('CLOUDFLARE_ACCOUNT_ID: ffa768ebc2ffc3bcd0bf7847c956b9df')
    expect(steps.filter((s) => s.includes('CLOUDFLARE_ACCOUNT_ID'))).toHaveLength(1)
  })
})

describe('docs/PREVIEWS.md', () => {
  const text = read('docs/PREVIEWS.md')
  it('says how to open a preview, the flag syntax and both ways to get one', () => {
    expect(text).toContain('?flags=')
    expect(text).toContain("localStorage['anotherlife.flags']")
    expect(text).toContain('CLOUDFLARE_API_TOKEN')
    expect(text).toContain('Workers Builds')
    expect(text).toContain('all')
    expect(text).toContain('none')
    expect(text.split('\n').length).toBeLessThanOrEqual(45)
  })
})
