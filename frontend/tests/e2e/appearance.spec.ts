// Synthetic HTTP/image fixtures only; these checks never execute a model.
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Run } from '../../src/types'
import { unconfiguredDemo } from './demo-fixture'
import { navigate } from './navigation'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64')
const id = 'a'.repeat(32)
const task = 'iedxray.generic_explosive_detection'
const run: Run = {
  id, scan_id: id, scan: { id, name: 'synthetic-appearance-scan.png', width: 640, height: 320,
    sha256: 'b'.repeat(64), image_url: `/api/scans/${id}/image`, origin: 'upload' },
  state: 'succeeded', created_at: '2026-09-26T12:00:00Z', completed_at: '2026-09-26T12:00:02Z',
  confidence: .25, elapsed_seconds: 2, error: null, review: { status: 'unreviewed', note: '', updated_at: null },
  result: { schema_version: '1.0', scan_id: id, status: 'ok', image: { width: 640, height: 320 },
    model: { id: 'synthetic-appearance-model', task, provenance: 'synthetic' }, run: { id, provenance: 'synthetic' },
    threshold: .25, error: null, detections: [{ id: 'synthetic-region', kind: 'suspicious_region',
      box_xyxy: [100, 60, 200, 160], category: { namespace: task, label: 'Explosive' }, confidence: .9, device_id: null }] },
}

async function fixture(page: Page, empty = false) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const evidence = { errors: [] as string[], external: [] as string[], mutations: [] as string[], failedAssets: [] as string[] }
  page.on('pageerror', error => evidence.errors.push(error.message))
  page.on('request', request => {
    const url = new URL(request.url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) evidence.external.push(request.url())
  })
  page.on('response', response => { if (response.status() >= 400) evidence.failedAssets.push(response.url()) })
  await page.context().route('**/api/**', async route => {
    const request = route.request()
    if (request.method() !== 'GET') {
      evidence.mutations.push(request.method() + ' ' + request.url())
      return route.fulfill({ status: 409, json: { detail: 'Appearance must not change server records.' } })
    }
    const path = new URL(request.url()).pathname
    if (path.endsWith('/image')) return route.fulfill({ contentType: 'image/png', body: png })
    if (path === '/api/health') return route.fulfill({ json: {
      model: { id: 'synthetic-appearance-model', label: 'Synthetic detector', task, configured: true, reason: null },
      limits: { max_upload_bytes: 20_000_000, max_pixels: 20_000_000 }, active_run_id: null,
    } })
    if (path === '/api/runs') return route.fulfill({ json: { items: empty ? [] : [run] } })
    if (path === '/api/demo') return route.fulfill({ json: unconfiguredDemo })
    if (path === '/api/intake') return route.fulfill({ json: { configured: false, enabled: false, state: 'unconfigured',
      adapter: 'folder', hardware_verified: false, source_label: 'Export folder', confidence: .25,
      pending_count: 0, received_count: 0, last_received_at: null, error: null, pending: [], issues: [] } })
    if (path === `/api/runs/${id}`) return route.fulfill({ json: run })
    return route.fulfill({ status: 404, json: { detail: 'Unexpected synthetic route.' } })
  })
  return evidence
}

async function ready(page: Page) {
  await page.goto('/#workspace')
  await expect(page.getByRole('group', { name: `X-ray scan: ${run.scan.name}` })).toBeVisible()
}

const appearance = (page: Page) => page.locator('summary').filter({ hasText: /^Appearance$/ })

async function expectInstrumentText(page: Page) {
  const mismatches = await page.evaluate(() => {
    const elements = new Set<Element>()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      if (walker.currentNode.textContent?.trim() && walker.currentNode.parentElement) elements.add(walker.currentNode.parentElement)
    }
    for (const control of document.querySelectorAll('input, textarea, select')) elements.add(control)
    return [...elements].filter(element => {
      const style = getComputedStyle(element)
      return element.getClientRects().length && style.visibility !== 'hidden' && !element.closest('[hidden], .appearance-font')
        && style.fontFamily.split(',')[0].replaceAll(/["']/g, '').trim() !== 'Instrument Serif'
    }).map(element => ({ tag: element.tagName, text: element.textContent?.trim().slice(0, 70), family: getComputedStyle(element).fontFamily }))
  })
  expect(mismatches, 'Visible text, evidence labels and form values should use the chosen interface font').toEqual([])
}

test('all palettes and fonts use local assets and preserve readable controls', async ({ page }) => {
  test.setTimeout(60_000)
  const evidence = await fixture(page)
  const loadedFonts: string[] = []
  page.on('response', response => {
    if (response.ok() && /\/fonts\/(choices|console|liquid)\/.*\.(woff2|ttf)$/.test(new URL(response.url()).pathname)) loadedFonts.push(new URL(response.url()).pathname)
  })
  await ready(page)
  await expect(page.locator('html')).toHaveAttribute('data-font', 'instrument-serif')
  await page.evaluate(() => document.fonts.ready)
  for (const section of ['Dashboard', 'Workspace setup', 'Session', 'Source', 'Inspect']) {
    await navigate(page, section)
    await expectInstrumentText(page)
  }
  for (const tab of ['Review', 'Provenance', 'Findings']) {
    await page.getByRole('tab', { name: tab, exact: true }).click()
    await expectInstrumentText(page)
  }
  for (const palette of ['Onyx', 'Onyx Light', 'Graphite', 'Midnight', 'Slate', 'Forest', 'Daylight', 'Pearl', 'Sand', 'Lavender']) {
    await appearance(page).click()
    await page.getByRole('radio', { name: palette, exact: true }).check()
    await expect(page.locator('html')).toHaveAttribute('data-palette', palette.toLowerCase().replaceAll(' ', '-'))
    const analysis = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(analysis.violations, `${palette} accessibility`).toEqual([])
    await appearance(page).click()
  }
  await appearance(page).click()
  for (const font of ['Instrument Serif', 'Barlow', 'Geist', 'Inter', 'Manrope', 'Public Sans', 'Source Sans 3', 'IBM Plex Sans', 'System']) {
    await page.getByRole('radio', { name: font, exact: true }).check()
    await page.evaluate(() => document.fonts.ready)
    const family = await page.locator('body').evaluate(node => getComputedStyle(node).fontFamily)
    if (font !== 'System') {
      expect(family).toContain(font)
      // fonts.ready covers faces currently in use; light mode can use only weight 600.
      await page.evaluate(name => document.fonts.load(`14px "${name}"`), font)
      expect(await page.evaluate(name => document.fonts.check(`14px "${name}"`), font)).toBe(true)
    }
    await expect(page.getByRole('radio', { name: font, exact: true })).toBeChecked()
  }
  for (const file of ['GeistVariable', 'InterVariable', 'ManropeVariable', 'PublicSansVariable', 'SourceSans3Variable']) {
    expect(loadedFonts).toContain(`/fonts/choices/${file}.woff2`)
  }
  await page.evaluate(async () => {
    for (const weight of [400, 500, 600]) await document.fonts.load(`${weight} 14px "Barlow"`)
    await document.fonts.load('600 20px "Barlow Semi Condensed"')
    await document.fonts.load('400 14px "Instrument Serif"')
    await document.fonts.load('italic 400 14px "Instrument Serif"')
  })
  for (const file of ['Barlow-Regular', 'Barlow-Medium', 'Barlow-SemiBold', 'BarlowSemiCondensed-SemiBold']) {
    expect(loadedFonts).toContain(`/fonts/console/${file}.woff2`)
  }
  for (const style of ['Regular', 'Italic']) expect(loadedFonts).toContain(`/fonts/liquid/InstrumentSerif-${style}.ttf`)
  expect(evidence).toEqual({ errors: [], external: [], mutations: [], failedAssets: [] })
})

test('appearance supports keyboard selection, Escape and persisted preferences', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('rayguard-appearance-v1', JSON.stringify({ palette: 'sand', font: 'manrope' }))
  })
  const evidence = await fixture(page)
  await ready(page)
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'onyx')
  await expect(page.locator('html')).toHaveAttribute('data-font', 'instrument-serif')
  await appearance(page).focus()
  await page.keyboard.press('Enter')
  const graphite = page.getByRole('radio', { name: 'Graphite', exact: true })
  await graphite.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'Midnight', exact: true })).toBeChecked()
  await page.getByRole('radio', { name: 'Onyx Light', exact: true }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('html')).toHaveAttribute('data-font', 'instrument-serif')
  await page.getByRole('radio', { name: 'Inter', exact: true }).check()
  await page.keyboard.press('Escape')
  await expect(appearance(page)).toBeFocused()
  await expect(page.getByRole('radio', { name: 'Inter', exact: true })).toBeHidden()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'onyx-light')
  await appearance(page).click()
  await expect(page.getByRole('radio', { name: 'Inter', exact: true })).toBeChecked()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rayguard-appearance-v2')!))).toEqual({ palette: 'onyx-light', font: 'inter' })
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rayguard-appearance-v1')!))).toEqual({ palette: 'sand', font: 'manrope' })
  expect(evidence).toEqual({ errors: [], external: [], mutations: [], failedAssets: [] })
})

test('blocked preference storage keeps appearance usable with a default on reload', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage blocked for synthetic test', 'SecurityError') } })
  })
  const evidence = await fixture(page)
  await ready(page)
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'onyx')
  await expect(page.locator('html')).toHaveAttribute('data-font', 'instrument-serif')
  await appearance(page).click()
  await page.getByRole('radio', { name: 'Daylight', exact: true }).check()
  await page.getByRole('radio', { name: 'Manrope', exact: true }).check()
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'daylight')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'onyx')
  await expect(page.getByRole('group', { name: `X-ray scan: ${run.scan.name}` })).toBeVisible()
  expect(evidence).toEqual({ errors: [], external: [], mutations: [], failedAssets: [] })
})

test('layout partitions and section navigation retain draft review and scan view at laptop and mobile widths', async ({ page }) => {
  const evidence = await fixture(page)
  await ready(page)
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  const transform = await page.locator('.scan-svg > g').getAttribute('transform')
  await page.getByRole('tab', { name: 'Review', exact: true }).click()
  await page.getByLabel('Review note').fill('Synthetic draft survives navigation and layout controls.')
  for (const width of [1366, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1366 ? 768 : 844 })
    if (width === 1366) expect((await page.locator('.image-stage').boundingBox())!.height).toBeGreaterThanOrEqual(330)
    await page.getByText('Layout options', { exact: true }).click()
    for (const [label, selector] of [['Adjustment dock', '.adjustment-dock'], ['Evidence inspector', '.inspector-dock'], ['Filmstrip', '.filmstrip-dock']]) {
      await page.getByRole('checkbox', { name: label, exact: true }).uncheck()
      await expect(page.locator(selector)).toBeHidden()
    }
    await expect(page.getByRole('button', { name: 'Show evidence', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Reset layout', exact: true }).click()
    await page.getByText('Layout options', { exact: true }).click()
    await expect(page.locator('.adjustment-dock')).toBeVisible()
    await expect(page.locator('.inspector-dock')).toBeVisible()
    await expect(page.locator('.filmstrip-dock')).toBeVisible()
    await expect(page.getByLabel('Review note')).toHaveValue('Synthetic draft survives navigation and layout controls.')
    await expect(page.getByRole('status', { name: 'Zoom level' })).toHaveText('150%')
    await expect(page.locator('.scan-svg > g')).toHaveAttribute('transform', transform!)
    await appearance(page).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('radio', { name: 'Onyx', exact: true })).toBeVisible()
    await appearance(page).click()
    for (const name of ['Session', 'Source', 'Inspect']) await navigate(page, name)
    await expect(page.getByLabel('Review note')).toHaveValue('Synthetic draft survives navigation and layout controls.')
    await expect(page.locator('.scan-svg > g')).toHaveAttribute('transform', transform!)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width < 760) {
      await page.getByRole('button', { name: `View scan ${run.scan.name}`, exact: true }).click()
      await expect(page.locator('#scan-viewer')).toBeFocused()
      await expect(page.locator('#scan-viewer')).toBeInViewport({ ratio: .5 })
      await expect(page.getByLabel('Review note')).toHaveValue('Synthetic draft survives navigation and layout controls.')
      await expect(page.locator('.scan-svg > g')).toHaveAttribute('transform', transform!)
    }
  }
  expect(evidence).toEqual({ errors: [], external: [], mutations: [], failedAssets: [] })
})

test('empty Daylight workstation keeps the disabled adjustment dock and help keyboard-accessible', async ({ page }) => {
  const evidence = await fixture(page, true)
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/#workspace')
  await expect(page.getByLabel('Upload X-ray image')).toBeEnabled()
  await appearance(page).click()
  await page.getByRole('radio', { name: 'Daylight', exact: true }).check()
  await appearance(page).click()
  const dock = page.getByRole('region', { name: 'Image adjustment dock', exact: true })
  await expect(dock.getByRole('slider', { name: /^Brightness/ })).toBeDisabled()
  await expect(dock.getByRole('button', { name: 'Reset image display', exact: true })).toBeDisabled()
  const bounds = await dock.evaluate(node => ({ height: node.clientHeight, content: node.scrollHeight }))
  await dock.focus()
  await expect(dock).toBeFocused()
  if (bounds.content > bounds.height) {
    await page.keyboard.press('End')
    await expect.poll(() => dock.evaluate(node => node.scrollTop)).toBeGreaterThan(0)
  }
  const help = dock.locator('summary').filter({ hasText: 'About image adjustments' })
  await help.focus()
  await page.keyboard.press('Enter')
  await expect(dock.getByText(/not material discrimination/)).toBeVisible()
  const analysis = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(analysis.violations).toEqual([])
  expect(evidence).toEqual({ errors: [], external: [], mutations: [], failedAssets: [] })
})
