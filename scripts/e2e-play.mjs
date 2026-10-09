// Headless playthrough of AnotherLife in Chromium.
//   npm i --no-save playwright && npm run build && npx vite preview --port 4341 --strictPort
//   PW_CHROMIUM=/path/to/chromium node scripts/e2e-play.mjs http://localhost:4341/ [--years 120] [--seed 1] [--shots dir]
// Plays a random life: answers every popup, opens menus and taps random rows, and ages up until
// death. Fails on page errors, console errors and any network request that leaves the page's
// own origin (the game must never call out).
import { chromium } from 'playwright'
import fs from 'node:fs'

const args = process.argv.slice(2)
const url = args[0] ?? 'http://localhost:4341/'
const opt = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : d
}
const YEARS = Number(opt('--years', '130'))
const SHOTS = opt('--shots', null)
const SEED = Number(opt('--seed', '1'))
let rs = SEED * 2654435761 >>> 0 || 1
const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296)
const pick = (xs) => xs[Math.floor(rnd() * xs.length)]

const errors = []
// Set PW_CHROMIUM to a Chromium binary to skip Playwright's own download.
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`)
})
// Everything runs in the browser: any request to another origin is a bug.
const origin = new URL(url).origin
page.on('request', (r) => {
  const u = r.url()
  if (u.startsWith('data:') || u.startsWith('blob:')) return
  let requestOrigin = ''
  try {
    requestOrigin = new URL(u).origin
  } catch {
    errors.push(`network: ${r.method()} ${u}`)
    return
  }
  if (requestOrigin !== origin) errors.push(`network: ${r.method()} ${u}`)
})

await page.addInitScript(() => {
  if (sessionStorage.getItem('e2e-init')) return
  sessionStorage.setItem('e2e-init', '1')
  localStorage.clear()
})

let shot = 0
async function snap(name) {
  if (!SHOTS) return
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: `${SHOTS}/${String(++shot).padStart(3, '0')}-${name}.png` })
}

await page.goto(url)
await page.waitForLoadState('networkidle')
await snap('home')
await page.getByText('New Life', { exact: false }).first().click()
await snap('newlife')
await page.getByText('Random Life', { exact: false }).first().click()
await page.waitForTimeout(300)
await snap('born')

const stats = { popups: 0, choices: 0, menuActions: 0, years: 0, minigames: 0, lives: 1 }

/** Answer a prompt's field: type into text/number inputs, nudge sliders with the keyboard. */
async function fillField(field, text, number) {
  const type = await field.getAttribute('type')
  if (type === 'range') {
    await field.focus().catch(() => {})
    await field.press(pick(['Home', 'End', 'ArrowRight', 'ArrowLeft', 'PageUp'])).catch(() => {})
    return
  }
  await field.fill(type === 'number' ? number : text)
}

/** Resolve whatever popup is open. Returns true if something was handled. */
async function handlePopup() {
  const field = page.locator('.popup-field input, .popup-field textarea')
  if (await field.count()) {
    await fillField(field.first(), 'Alex', '100')
    await page.locator('.popup-actions button').first().click()
    stats.popups++
    return true
  }
  const actions = page.locator('.popup-actions button')
  const n = await actions.count()
  if (n > 0) {
    if (n > 1) stats.choices++
    await actions.nth(Math.floor(rnd() * n)).click()
    stats.popups++
    return true
  }
  // Minigame: click random enabled buttons inside the popup until it goes away.
  const popup = page.locator('.popup')
  if (await popup.count()) {
    stats.minigames++
    for (let i = 0; i < 400 && (await popup.count()) && !(await page.locator('.popup-actions button').count()); i++) {
      const btns = popup.locator('button:enabled')
      const k = await btns.count()
      if (!k) {
        await page.waitForTimeout(200)
        continue
      }
      await btns.nth(Math.floor(rnd() * k)).click({ timeout: 2000 }).catch(() => {})
      await page.waitForTimeout(40)
    }
    return true
  }
  return false
}

const ageEnabled = () => page.locator('button[aria-label="Age up one year"]:enabled').count()

/** Answer popups until the game is idle (Age button enabled) or the life is over. */
async function drain() {
  let idle = 0
  for (let i = 0; i < 600; i++) {
    if (await handlePopup()) {
      idle = 0
      await page.waitForTimeout(40)
      continue
    }
    if ((await page.locator('.death-tomb').count()) || (await ageEnabled())) {
      // Popups animate in, so make sure nothing new shows up right after.
      if (++idle >= 2) return
    }
    await page.waitForTimeout(80)
  }
  throw new Error('popups never stopped')
}

async function randomMenuAction() {
  const tabs = page.locator('.bb-btn:enabled')
  const k = await tabs.count()
  if (!k) return
  await tabs.nth(Math.floor(rnd() * k)).click()
  await page.waitForTimeout(150)
  // Walk down the menu tree a few levels, then tap an action.
  for (let depth = 0; depth < 4; depth++) {
    const rows = page.locator('.sheet .menu-list button:enabled').filter({ hasNotText: 'Give up on this life' })
    const n = await rows.count()
    if (!n) break
    await rows.nth(Math.floor(rnd() * n)).click({ timeout: 2000 }).catch(() => {})
    await page.waitForTimeout(120)
    // A text/number prompt or confirm dialog from the menu (rendered with the popup classes).
    const dlgInput = page.locator('.popup-field input, .popup-field textarea')
    if (await dlgInput.count()) await fillField(dlgInput.first(), pick(['Go jogging', 'Bake a cake', 'Learn guitar']), '50')
    const dlgBtn = page.locator('.popup-actions .btn-primary')
    if (await dlgBtn.count()) await dlgBtn.first().click().catch(() => {})
    if (!(await page.locator('.sheet').count())) break
  }
  stats.menuActions++
  // Close any sheet left open.
  for (let i = 0; i < 3 && (await page.locator('.sheet').count()); i++) {
    await page.keyboard.press('Escape')
    const close = page.locator('.sheet-nav[aria-label="Close"]')
    if (await close.count()) await close.first().click().catch(() => {})
    await page.waitForTimeout(80)
  }
  await drain()
}

const ageBtn = page.locator('button[aria-label="Age up one year"]')
for (let year = 0; year < YEARS; year++) {
  await drain()
  if (await page.locator('.death-tomb').count()) break
  const actions = Math.floor(rnd() * 3)
  for (let i = 0; i < actions; i++) await randomMenuAction()
  if (await page.locator('.death-tomb').count()) break
  await ageBtn.first().click({ timeout: 10000 })
  stats.years++
  await page.waitForTimeout(60)
  if (year % 15 === 0) await snap(`year-${year}`)
}
await drain()
await snap('death')
const died = await page.locator('.death-tomb').count()
console.log(JSON.stringify({ died: !!died, ...stats, errors: errors.slice(0, 20), errorCount: errors.length }, null, 2))
await browser.close()
if (errors.length || !died) process.exit(1)
