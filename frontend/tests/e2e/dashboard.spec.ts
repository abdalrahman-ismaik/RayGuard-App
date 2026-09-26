// Synthetic API records and pixels only. Navigation must never start model work.
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Run } from '../../src/types'
import { unconfiguredDemo } from './demo-fixture'
import { navigate, workspaceLink } from './navigation'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64')
const task = 'iedxray.generic_explosive_detection'
function record(n: number, state: Run['state'] = 'succeeded', reviewed = false): Run {
  const id = n.toString(16).padStart(32, '0')
  const scan = { id, name: `synthetic-dashboard-${n}.png`, width: 640, height: 320,
    image_url: `/api/scans/${id}/image`, sha256: 'c'.repeat(64), origin: 'upload' as const }
  return { id, scan_id: id, scan, state, created_at: `2026-09-26T12:00:0${n}Z`, completed_at: state === 'running' ? null : '2026-09-26T12:01:00Z',
    confidence: .25, elapsed_seconds: state === 'running' ? null : 1,
    error: state === 'failed' ? { code: 'synthetic_failure', message: 'Synthetic detector failure.' } : null,
    review: { status: reviewed ? 'reviewed' : 'unreviewed', note: '', updated_at: null },
    result: state === 'succeeded' ? { schema_version: '1.0', scan_id: id, status: 'ok', image: { width: 640, height: 320 },
      model: { id: 'synthetic-dashboard-model', task, provenance: 'synthetic' }, run: { id, provenance: 'synthetic' }, threshold: .25,
      error: null, detections: reviewed ? [] : [{ id: `synthetic-region-${n}`, kind: 'suspicious_region', box_xyxy: [10, 20, 150, 180],
        category: { namespace: task, label: 'Explosive' }, confidence: .8, device_id: null }] } : null }
}

async function fixture(page: Page, options: { records?: Run[]; offline?: boolean; busy?: boolean; sources?: boolean; backpressure?: boolean } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const records = options.records ?? []
  const writes: string[] = []
  const errors: string[] = []
  const external: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (/^https?:/.test(request.url()) && !['127.0.0.1', 'localhost'].includes(new URL(request.url()).hostname)) external.push(request.url()) })
  await page.context().route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body })
    if (request.method() !== 'GET') { writes.push(request.method() + ' ' + path); return json({ detail: 'Unexpected navigation mutation' }, 409) }
    if (options.offline) return route.abort('connectionfailed')
    if (path.endsWith('/image')) return route.fulfill({ contentType: 'image/png', body: png })
    if (path === '/api/health') return json({ model: { id: 'synthetic-dashboard-model', label: 'Synthetic detector', task, configured: true, reason: null },
      active_run_id: records.find(run => run.state === 'running')?.id ?? null, limits: { max_upload_bytes: 20_000_000, max_pixels: 20_000_000 } })
    if (path === '/api/runs') return json({ items: records })
    if (path === '/api/demo') return json({ ...unconfiguredDemo, configured: options.sources !== false, total: options.sources === false ? 0 : 8,
      enabled: Boolean(options.busy), state: options.busy ? 'running' : options.sources === false ? 'unconfigured' : 'ready',
      batch_total: options.busy ? 3 : 0, current_name: options.busy ? records[0]?.scan.name : null, next_name: 'synthetic-dashboard-next.png' })
    if (path === '/api/intake') return json({ configured: options.sources !== false, enabled: Boolean(options.backpressure),
      state: options.sources === false ? 'unconfigured' : options.backpressure ? 'backpressure' : 'paused',
      adapter: 'folder', hardware_verified: false, source_label: 'Synthetic dashboard export folder', confidence: .25,
      pending_count: options.backpressure ? 1 : 0, received_count: options.backpressure ? 2 : 0, last_received_at: null,
      error: options.backpressure ? { code: 'queue_full', message: 'Synthetic incoming queue is full.' } : null,
      pending: options.backpressure ? [{ id: record(5).id, scan: { ...record(5).scan, origin: 'folder' }, state: 'queued' }] : [], issues: [] })
    const selected = records.find(run => path === `/api/runs/${run.id}`)
    return selected ? json(selected) : json({ detail: 'Unknown synthetic dashboard route' }, 404)
  })
  return { writes, errors, external }
}

const dashboard = (page: Page) => page.locator('#dashboard')
const acquisition = (page: Page) => dashboard(page).getByRole('region', { name: 'Acquisition activity', exact: true })
const configuration = (page: Page) => dashboard(page).getByRole('region', { name: 'Source configuration', exact: true })
async function home(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your inspection, in focus.', exact: true })).toBeVisible()
}

test('default dashboard reports an empty actual session without starting acquisition', async ({ page }) => {
  const server = await fixture(page)
  await page.setViewportSize({ width: 320, height: 844 })
  await home(page)
  await expect(dashboard(page).getByRole('button', { name: 'Set up an inspection', exact: true })).toBeVisible()
  await expect(dashboard(page).getByText('0 loaded · 0 results awaiting review')).toBeVisible()
  await expect(dashboard(page).getByText('Your first run will appear here.')).toBeVisible()
  const dataset = configuration(page).getByRole('definition').filter({ hasText: '8 test images available' })
  await expect(dataset).toBeVisible()
  await expect(dataset).not.toContainText('Replay not started')
  await expect(acquisition(page)).toContainText('Replay not started')
  await expect(configuration(page).getByText('Scanner connection unverified.', { exact: true })).toBeVisible()
  await expect(dashboard(page).getByRole('img')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(server).toEqual({ writes: [], errors: [], external: [] })
})

test('dashboard services preselect setup or open records without server writes', async ({ page }) => {
  const server = await fixture(page)
  await home(page)
  const shortcuts = dashboard(page).getByRole('region', { name: 'Inspection actions', exact: true })
  await expect(shortcuts.getByRole('button')).toHaveCount(4)
  for (const [service, selected] of [['Upload a scan', 'Upload a scan'], ['Dataset replay', 'Dataset replay'], ['Folder receiver', 'Folder receiver']]) {
    const action = shortcuts.getByRole('button', { name: new RegExp(`^${service}`) })
    await expect(action.locator('svg')).toHaveAttribute('aria-hidden', 'true')
    await action.click()
    await expect(page).toHaveURL(/#main-menu$/)
    await expect(page.locator('#main-menu').getByRole('radio', { name: selected, exact: true })).toBeChecked()
    expect(server.writes).toEqual([])
    await navigate(page, 'Dashboard')
  }
  const review = shortcuts.getByRole('button', { name: /^Review saved runs/ })
  await expect(review.locator('svg')).toHaveAttribute('aria-hidden', 'true')
  await review.click()
  await expect(page).toHaveURL(/#session$/)
  await expect(page.getByRole('heading', { name: 'Session records', exact: true })).toBeVisible()
  expect(server).toEqual({ writes: [], errors: [], external: [] })
})

test('native navigation, direct hashes and browser history address every page', async ({ page }) => {
  const server = await fixture(page)
  await home(page)
  for (const [name, hash, heading] of [
    ['Workspace setup', '#main-menu', 'Set up your workspace'], ['Inspect', '#workspace', 'Inspect a scan'],
    ['Session', '#session', 'Session records'], ['Source', '#source', 'Source & detector'],
    ['Dashboard', '#dashboard', 'Your inspection, in focus.'],
  ]) {
    const link = await workspaceLink(page, name)
    await expect(link).toHaveAttribute('href', hash)
    await link.click()
    await expect(page).toHaveURL(new RegExp(hash + '$'))
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await expect(await workspaceLink(page, name)).toHaveAttribute('aria-current', 'page')
    await page.goto('/' + hash)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
  await navigate(page, 'Session')
  await navigate(page, 'Source')
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Session records', exact: true })).toBeVisible()
  await page.goForward()
  await expect(page.getByRole('heading', { name: 'Source & detector', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Skip to Source', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#source$/)
  await expect(page.getByRole('heading', { name: 'Source & detector', exact: true })).toBeVisible()
  await navigate(page, 'Session')
  await page.getByRole('link', { name: 'Skip to Session', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#session$/)
  await expect(page.getByRole('heading', { name: 'Session records', exact: true })).toBeVisible()
  expect(server).toEqual({ writes: [], errors: [], external: [] })
})

test('dashboard navigation and compact sidebar retain the selected scan, zoom and draft review', async ({ page }) => {
  const saved = record(1)
  const server = await fixture(page, { records: [saved] })
  await page.setViewportSize({ width: 1366, height: 768 })
  await home(page)
  await dashboard(page).getByRole('button', { name: 'Continue inspection', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('tab', { name: 'Review', exact: true }).click()
  await page.getByLabel('Review note').fill('Synthetic dashboard navigation draft.')
  const transform = await page.locator('.scan-svg > g').getAttribute('transform')
  const image = await page.locator('.scan-svg image').getAttribute('href')
  await page.getByRole('button', { name: 'Collapse navigation', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Expand navigation', exact: true })).toBeVisible()
  expect((await page.locator('.image-stage').boundingBox())!.height).toBeGreaterThanOrEqual(330)
  for (const name of ['Dashboard', 'Workspace setup', 'Source', 'Session', 'Inspect']) await navigate(page, name)
  await expect(page.getByLabel('Review note')).toHaveValue('Synthetic dashboard navigation draft.')
  await expect(page.locator('.scan-svg > g')).toHaveAttribute('transform', transform!)
  await expect(page.locator('.scan-svg image')).toHaveAttribute('href', image!)
  await page.getByRole('button', { name: 'Expand navigation', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Collapse navigation', exact: true })).toBeVisible()
  expect(server).toEqual({ writes: [], errors: [], external: [] })
})

test('mixed busy records show actual counts and incomplete states without fabricated predictions', async ({ page }) => {
  const server = await fixture(page, { records: [record(4, 'running'), record(3, 'failed'), record(2), record(1, 'succeeded', true)], busy: true })
  await home(page)
  const recent = dashboard(page).getByRole('region', { name: 'Recent runs', exact: true })
  await expect(recent).toContainText('4 loaded · 1 results awaiting review')
  await expect(recent.getByRole('listitem')).toHaveCount(3)
  await expect(recent).toContainText('Inference in progress')
  await expect(recent).toContainText('Run failed')
  await expect(recent).toContainText('Result available')
  const current = dashboard(page).getByRole('region', { name: 'synthetic-dashboard-4.png', exact: true })
  await expect(current).toContainText('Inference in progress')
  await expect(current).not.toContainText('regions reported')
  const dataset = configuration(page).getByRole('definition').filter({ hasText: '8 test images available' })
  await expect(dataset).toBeVisible()
  await expect(dataset).not.toContainText('Batch')
  await expect(acquisition(page)).toContainText('Batch running · 0/3 processed')
  await dashboard(page).getByRole('button', { name: 'Configure workspace', exact: true }).click()
  await expect(page.locator('#main-menu').getByRole('button', { name: 'Open workspace', exact: true })).toBeDisabled()
  await page.locator('#main-menu').getByRole('button', { name: 'Return to workspace', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause demo', exact: true })).toBeEnabled()
  expect(server).toEqual({ writes: [], errors: [], external: [] })
})

test('a held historical scan stays distinct from another running job and the source catalog', async ({ page }) => {
  const active = record(4, 'running')
  const held = record(2, 'succeeded', true)
  const server = await fixture(page, { records: [active, held], busy: true })
  await home(page)
  await dashboard(page).getByRole('button', { name: /^synthetic-dashboard-2\.png/ }).click()
  await expect(page.getByRole('group', { name: `X-ray scan: ${held.scan.name}`, exact: true })).toBeVisible()
  await navigate(page, 'Dashboard')
  // Wait for the actual polling path to refresh state while the older scan is held.
  await page.waitForResponse(response => new URL(response.url()).pathname === '/api/runs' && response.request().method() === 'GET')
  const current = dashboard(page).getByRole('region', { name: held.scan.name, exact: true })
  await expect(current).toContainText('Result available')
  await expect(current).toContainText('0 regions')
  await expect(current.getByText('Research output · no safety decision')).toBeVisible()
  await expect(current).not.toContainText('Inference in progress')
  await expect(current).not.toContainText(active.scan.name)
  await expect(current.getByRole('img', { name: `Selected X-ray: ${held.scan.name}`, exact: true })).toBeVisible()
  await expect(acquisition(page)).toContainText(active.scan.name)
  await expect(acquisition(page)).not.toContainText(held.scan.name)
  await expect(acquisition(page)).toContainText('Batch running · 0/3 processed')
  await expect(configuration(page)).toContainText('8 test images available')
  await expect(configuration(page)).not.toContainText('Batch running')
  expect(server).toEqual({ writes: [], errors: [], external: [] })
})

test('the selected preview remains visible with a long failed-run filename at narrow and intermediate widths', async ({ page }) => {
  const saved = record(1, 'failed')
  saved.scan.name = 'synthetic-dashboard-long-export-name-for-a-selected-scan-with-a-failed-detector-run-and-no-result.png'
  const options = { records: [saved], offline: false }
  const server = await fixture(page, options)
  await home(page)
  const current = dashboard(page).getByRole('region', { name: saved.scan.name, exact: true })
  const preview = current.getByRole('img', { name: `Selected X-ray: ${saved.scan.name}`, exact: true })
  await expect(current).toContainText('Run failed')
  for (const width of [320, 390, 1000]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(preview).toBeVisible()
    expect((await preview.boundingBox())!.width).toBeGreaterThan(48)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `viewport ${width}`).toBe(true)
    await expect(current).not.toContainText('regions reported')
  }
  options.offline = true
  await expect(configuration(page)).toContainText('Service offline')
  await expect(preview).toBeVisible()
  await expect(current).toContainText('Run failed')
  await expect(acquisition(page)).not.toContainText('Batch running')
  expect(server).toEqual({ writes: [], errors: [], external: [] })
})

test('queue saturation stays explicit and disconnected running records become unknown', async ({ page }) => {
  const active = record(4, 'running')
  active.scan.origin = 'folder'
  const options = { records: [active], backpressure: true, offline: false }
  const server = await fixture(page, options)
  await home(page)
  const current = dashboard(page).getByRole('region', { name: active.scan.name, exact: true })
  const recent = dashboard(page).getByRole('region', { name: 'Recent runs', exact: true })
  await expect(acquisition(page)).toContainText('Queue full · processing backlog')
  await expect(acquisition(page)).toContainText(/1 images? queued/)
  await expect(current).toContainText('Inference in progress')
  await expect(recent).toContainText('Inference in progress')
  options.offline = true
  await expect(current).toContainText('Run status unavailable while offline')
  await expect(recent).toContainText('Run status unavailable while offline')
  await expect(acquisition(page)).toContainText('Activity unavailable while offline.')
  await expect(dashboard(page)).not.toContainText('Inference in progress')
  await expect(acquisition(page)).not.toContainText('Queue full · processing backlog')
  expect(server).toEqual({ writes: [], errors: [], external: [] })
})

test('offline dashboard states its unavailable sources and provides settings recovery', async ({ page }) => {
  const server = await fixture(page, { offline: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await home(page)
  await configuration(page).locator('summary').filter({ hasText: /^Source details$/ }).click()
  await expect(configuration(page).getByRole('definition').filter({ hasText: 'Service offline' })).toBeVisible()
  await expect(configuration(page).getByRole('definition').filter({ hasText: 'Unavailable while offline' })).toHaveCount(2)
  await expect(dashboard(page).getByText('0 loaded · 0 results awaiting review')).toBeVisible()
  await expect(dashboard(page).getByRole('img')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await dashboard(page).getByRole('button', { name: 'Source & detector settings', exact: true }).click()
  await expect(page).toHaveURL(/#source$/)
  await expect(page.getByRole('region', { name: 'Detector settings', exact: true })).toContainText('Service unavailable')
  await navigate(page, 'Dashboard')
  await expect(page.getByRole('button', { name: 'Reconnect service', exact: true })).toBeVisible()
  expect(server).toEqual({ writes: [], errors: [], external: [] })
})

test('a succeeded record missing result data never supplies a zero-region or valid-result claim', async ({ page }) => {
  const server = await fixture(page, { records: [{ ...record(1), result: null }] })
  await home(page)
  await expect(dashboard(page).getByRole('button', { name: 'Continue inspection', exact: true })).toBeVisible()
  await expect(dashboard(page)).not.toContainText('0 regions reported')
  await expect(dashboard(page)).not.toContainText('Result available')
  await expect(dashboard(page).getByText('1 loaded · 0 results awaiting review')).toBeVisible()
  await expect(dashboard(page).getByRole('region', { name: 'synthetic-dashboard-1.png', exact: true })).toContainText(/result.*(missing|unavailable)|no valid result/i)
  expect(server).toEqual({ writes: [], errors: [], external: [] })
})

test('dashboard supports keyboard, light/dark palettes and mobile Menu without page overflow', async ({ page }) => {
  test.setTimeout(60_000)
  const server = await fixture(page)
  await home(page)
  await (await workspaceLink(page, 'Workspace setup')).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Set up your workspace', exact: true })).toBeVisible()
  await navigate(page, 'Dashboard')
  // Secondary explanations stay available without adding noise to the initial view.
  for (const [summary, content] of [
    ['Source details', 'Dataset: IEDXray published test split. Configuration is not inference validation.'],
    ['Workspace notes', 'Session records clear when the local service restarts. Export records you need to keep.'],
  ]) {
    const disclosure = dashboard(page).locator('summary').filter({ hasText: new RegExp(`^${summary}$`) })
    const detail = dashboard(page).getByText(content, { exact: true })
    await expect(detail).toBeHidden()
    await disclosure.focus()
    await page.keyboard.press('Enter')
    await expect(detail).toBeVisible()
    await expect(disclosure).toBeFocused()
    await page.keyboard.press('Space')
    await expect(detail).toBeHidden()
    expect(server.writes).toEqual([])
  }
  for (const palette of ['Onyx', 'Onyx Light']) {
    await page.getByText('Appearance', { exact: true }).click()
    await page.getByRole('radio', { name: palette, exact: true }).check()
    await page.getByText('Appearance', { exact: true }).click()
    for (const width of [1366, 390, 320]) {
      await page.setViewportSize({ width, height: width === 1366 ? 768 : 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      if (width < 900) {
        const toggle = page.getByRole('button', { name: 'Menu', exact: true })
        await toggle.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('button', { name: 'Close menu', exact: true })).toHaveAttribute('aria-expanded', 'true')
        await page.keyboard.press('Escape')
        await expect(toggle).toBeFocused()
        await navigate(page, 'Session')
        await expect(page).toHaveURL(/#session$/)
        await expect(page.getByRole('button', { name: 'Menu', exact: true })).toHaveAttribute('aria-expanded', 'false')
        await page.goBack()
        await expect(dashboard(page)).toBeVisible()
      }
      const analysis = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
      expect(analysis.violations, `${palette} ${width}`).toEqual([])
    }
  }
  expect(server).toEqual({ writes: [], errors: [], external: [] })
})
