// Synthetic service records and pixels only. No real acquisition or model execution.
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { DatasetDemo, Intake, Run } from '../../src/types'
import { unconfiguredDemo } from './demo-fixture'
import { navigate } from './navigation'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64')
const id = 'd'.repeat(32)
const task = 'iedxray.generic_explosive_detection'
const scan = { id, name: 'synthetic-menu-scan.png', width: 640, height: 320,
  sha256: 'c'.repeat(64), image_url: `/api/scans/${id}/image`, origin: 'upload' as const }
const saved: Run = { id, scan_id: id, scan, state: 'succeeded', created_at: '2026-09-26T12:00:00Z',
  completed_at: '2026-09-26T12:00:02Z', confidence: .25, elapsed_seconds: 2, error: null,
  review: { status: 'unreviewed', note: '', updated_at: null }, result: { schema_version: '1.0', scan_id: id, status: 'ok',
    image: { width: 640, height: 320 }, model: { id: 'synthetic-menu-model', task, provenance: 'synthetic' },
    run: { id, provenance: 'synthetic' }, threshold: .25, error: null, detections: [] } }

async function fixture(page: Page, options: { history?: boolean; sources?: boolean; offline?: boolean; model?: boolean; paused?: boolean } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const history: Run[] = options.history ? [saved] : []
  const writes: { path: string; body: unknown }[] = []
  const errors: string[] = []
  let healthReads = 0
  let offline = options.offline ?? false
  const configured = options.sources !== false
  const demo: DatasetDemo = { ...unconfiguredDemo, configured, state: configured ? 'ready' : 'unconfigured',
    total: configured ? 8 : 0, next_name: configured ? scan.name : null }
  if (options.paused) Object.assign(demo, { state: 'paused', batch_total: 3, completed_count: 1, cursor: 1 })
  const intake: Intake = { configured, enabled: false, state: configured ? 'paused' : 'unconfigured', adapter: 'folder',
    hardware_verified: false, source_label: 'Synthetic menu export folder', confidence: .25, pending_count: 0,
    received_count: 0, last_received_at: null, error: null, pending: [], issues: [] }
  page.on('pageerror', error => errors.push(error.message))
  await page.context().route('**/api/**', async route => {
    if (offline) return route.abort('connectionfailed')
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ json: body, status })
    if (request.method() !== 'GET') writes.push({ path, body: path === '/api/scans' ? 'synthetic upload' : request.postDataJSON() })
    if (path === '/api/health') { healthReads++; return json({ model: { id: 'synthetic-menu-model', label: 'Synthetic detector', task,
      configured: options.model !== false, reason: options.model === false ? 'Synthetic model not configured' : null },
      limits: { max_upload_bytes: 20_000_000, max_pixels: 20_000_000 }, active_run_id: null }) }
    if (path === '/api/runs') return json({ items: history })
    if (path === '/api/demo') {
      if (request.method() === 'POST') {
        const action = request.postDataJSON()
        demo.enabled = action.action !== 'pause'
        demo.state = demo.enabled ? 'running' : 'paused'
        if (action.action === 'start') {
          demo.batch_total = action.count
          demo.confidence = action.confidence
          demo.completed_count = 0
        }
      }
      return json(demo)
    }
    if (path === '/api/intake') {
      if (request.method() === 'POST') {
        intake.enabled = request.postDataJSON().enabled
        intake.confidence = request.postDataJSON().confidence
        intake.state = intake.enabled ? 'waiting' : 'paused'
      }
      return json(intake)
    }
    if (path === '/api/scans') return json(scan, 201)
    if (path.endsWith('/image')) return route.fulfill({ contentType: 'image/png', body: png })
    if (path === `/api/runs/${id}`) return json(history[0] ?? saved)
    return json({ detail: 'Unexpected synthetic menu route.' }, 404)
  })
  return { writes, errors, demo, intake, healthReads: () => healthReads, reconnect: () => { offline = false }, complete: () => {
    history.splice(0, history.length, { ...saved, scan: { ...scan, origin: 'dataset_demo', source: { dataset: 'IEDXray', split: 'test', index: 0 } } })
    demo.completed_count = 1; demo.cursor = 1; demo.last_run_id = id; demo.current_name = scan.name
  } }
}

const menu = (page: Page) => page.locator('#main-menu')
const workflow = (page: Page, label: string) => menu(page).getByRole('radio', { name: new RegExp(`^${label}`) })
async function openMenu(page: Page) {
  await page.goto('/#main-menu')
  await expect(page.getByRole('heading', { name: 'Set up your workspace', exact: true })).toBeVisible()
}
async function enter(page: Page, label: string) {
  await workflow(page, label).check()
  await menu(page).getByRole('button', { name: 'Open workspace', exact: true }).click()
  await expect(page.locator('#workspace')).toBeVisible()
}

for (const label of ['Upload a scan', 'Dataset replay', 'Folder receiver', 'Review saved runs']) {
  test(`menu opens ${label} without starting acquisition or inference`, async ({ page }) => {
    const server = await fixture(page, { history: label === 'Review saved runs' })
    await openMenu(page)
    await enter(page, label)
    if (label === 'Upload a scan') await expect(page.getByLabel('Upload X-ray image')).toBeEnabled()
    if (label === 'Dataset replay') await expect(page.getByRole('button', { name: 'Start demo', exact: true })).toBeEnabled()
    if (label === 'Folder receiver') await expect(page.getByRole('button', { name: 'Start intake', exact: true })).toBeEnabled()
    if (label === 'Review saved runs') {
      await expect(page.getByRole('heading', { name: 'Session records', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: `View run for ${scan.name}` })).toBeVisible()
    }
    expect(server.writes).toEqual([])
    expect(server.errors).toEqual([])
  })
}

test('setup applies layout, future threshold and held-arrival preference only on explicit entry', async ({ page }) => {
  const server = await fixture(page)
  await openMenu(page)
  await workflow(page, 'Folder receiver').check()
  await menu(page).getByRole('radio', { name: /^Focused review/ }).check()
  await menu(page).getByRole('slider', { name: 'Starting score threshold', exact: true }).fill('42')
  await menu(page).getByRole('checkbox', { name: /^Follow latest results/ }).uncheck()
  expect(server.writes).toEqual([])
  await menu(page).getByRole('button', { name: 'Open workspace', exact: true }).click()
  await expect(page.locator('.adjustment-dock')).toBeHidden()
  await expect(page.locator('.filmstrip-dock')).toBeHidden()
  await expect(page.locator('.inspector-dock')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Follow latest', exact: true })).not.toBeChecked()
  expect(server.writes).toEqual([])
  await page.getByRole('button', { name: 'Start intake', exact: true }).click()
  expect(server.writes).toEqual([{ path: '/api/intake', body: { enabled: true, confidence: .42 } }])
  await expect(page.getByRole('checkbox', { name: 'Follow latest', exact: true })).not.toBeChecked()
  await page.getByRole('button', { name: 'Pause intake', exact: true }).click()
  await page.getByRole('button', { name: 'Upload', exact: true }).click()
  await page.getByLabel('Upload X-ray image').setInputFiles({ name: scan.name, mimeType: 'image/png', buffer: png })
  await expect(page.getByRole('group', { name: `X-ray scan: ${scan.name}` })).toBeVisible()
  expect(server.writes.map(write => write.path)).toEqual(['/api/intake', '/api/intake', '/api/scans'])
  expect(server.errors).toEqual([])
})

test('return and browser back preserve canvas zoom, unsaved review and unapplied layout choices', async ({ page }) => {
  const server = await fixture(page, { history: true })
  await openMenu(page)
  await enter(page, 'Review saved runs')
  await page.getByRole('button', { name: `View run for ${scan.name}` }).click()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('tab', { name: 'Review', exact: true }).click()
  await page.getByLabel('Review note').fill('Synthetic draft retained across main menu.')
  const transform = await page.locator('.scan-svg > g').getAttribute('transform')
  await navigate(page, 'Workspace setup')
  await expect(menu(page)).toBeVisible()
  await menu(page).getByRole('radio', { name: /^Focused review/ }).check()
  await menu(page).getByRole('button', { name: 'Return to workspace', exact: true }).click()
  await expect(page.locator('.adjustment-dock')).toBeVisible()
  await expect(page.locator('.filmstrip-dock')).toBeVisible()
  await expect(page.getByLabel('Review note')).toHaveValue('Synthetic draft retained across main menu.')
  await expect(page.locator('.scan-svg > g')).toHaveAttribute('transform', transform!)
  await page.goBack()
  await expect(menu(page)).toBeVisible()
  await page.goForward()
  await expect(page.getByLabel('Review note')).toHaveValue('Synthetic draft retained across main menu.')
  await expect(page.locator('.scan-svg > g')).toHaveAttribute('transform', transform!)
  expect(server.writes).toEqual([])
  expect(server.errors).toEqual([])
})

test('busy setup stays blocked while Return exposes pause and completed background evidence', async ({ page }) => {
  const server = await fixture(page)
  await openMenu(page)
  await enter(page, 'Dataset replay')
  await page.getByRole('button', { name: 'Start demo', exact: true }).click()
  await navigate(page, 'Workspace setup')
  await expect(menu(page).getByRole('status').filter({ hasText: 'Acquisition or inference is active' })).toBeVisible()
  await expect(workflow(page, 'Upload a scan')).toBeDisabled()
  await expect(menu(page).getByRole('button', { name: 'Open workspace', exact: true })).toBeDisabled()
  await expect(menu(page).getByRole('button', { name: 'Return to workspace', exact: true })).toBeEnabled()
  expect(server.writes).toHaveLength(1)
  server.complete()
  await menu(page).getByRole('button', { name: 'Return to workspace', exact: true }).click()
  await expect(page.getByRole('group', { name: `X-ray scan: ${scan.name}` })).toBeVisible()
  await page.getByRole('button', { name: 'Pause demo', exact: true }).click()
  expect(server.writes.map(write => write.body)).toEqual([{ action: 'start', start_index: 0, count: 3, confidence: .25 }, { action: 'pause' }])
  expect(server.errors).toEqual([])
})

test('paused replay retains its batch threshold while setup changes the threshold for future runs', async ({ page }) => {
  const server = await fixture(page, { paused: true })
  await openMenu(page)
  await workflow(page, 'Dataset replay').check()
  await menu(page).getByRole('slider', { name: 'Starting score threshold', exact: true }).fill('67')
  await menu(page).getByRole('button', { name: 'Open workspace', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Resume demo', exact: true })).toBeEnabled()
  await navigate(page, 'Source')
  const reads = server.healthReads()
  await expect.poll(server.healthReads).toBeGreaterThan(reads + 1)
  await expect(page.getByRole('slider', { name: 'Score threshold', exact: true })).toHaveValue('67')
  expect(server.writes).toEqual([])
  await navigate(page, 'Inspect')
  await page.locator('details.replay-settings > summary').click()
  await expect(page.locator('details.replay-settings')).toContainText('Resume the remaining batch at 25%')
  await page.getByRole('button', { name: 'Resume demo', exact: true }).click()
  expect(server.writes).toEqual([{ path: '/api/demo', body: { action: 'resume' } }])
  expect(server.demo.confidence).toBe(.25)
  expect(server.errors).toEqual([])
})

test('unconfigured sources explain the requirement and Source settings remain reachable', async ({ page }) => {
  const server = await fixture(page, { sources: false, model: false })
  await openMenu(page)
  await workflow(page, 'Dataset replay').check()
  await expect(menu(page).getByText('Dataset replay needs a configured local test-image folder.', { exact: false })).toBeVisible()
  await expect(menu(page).getByRole('button', { name: 'Open workspace', exact: true })).toBeDisabled()
  await workflow(page, 'Folder receiver').check()
  await expect(menu(page).getByText('Folder receiver needs a configured export folder.', { exact: false })).toBeVisible()
  await expect(menu(page).getByRole('button', { name: 'Open workspace', exact: true })).toBeDisabled()
  await menu(page).getByRole('button', { name: 'Source settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Source & detector', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Detector settings', exact: true })).toContainText('Configuration required')
  expect(server.writes).toEqual([])
  expect(server.errors).toEqual([])
})

test('offline menu explains recovery and reconnect does not start a workflow', async ({ page }) => {
  const server = await fixture(page, { offline: true })
  await openMenu(page)
  await expect(menu(page).getByText('Local service offline', { exact: true })).toBeVisible()
  await workflow(page, 'Dataset replay').check()
  await expect(menu(page).getByRole('button', { name: 'Open workspace', exact: true })).toBeDisabled()
  server.reconnect()
  await menu(page).getByRole('button', { name: 'Reconnect service', exact: true }).click()
  await expect(menu(page).getByRole('button', { name: 'Open workspace', exact: true })).toBeEnabled()
  expect(server.writes).toEqual([])
  expect(server.errors).toEqual([])
})

test('default menu supports keyboard, persisted appearance, dark/light accessibility and mobile layouts', async ({ page }) => {
  test.setTimeout(60_000)
  const server = await fixture(page)
  await openMenu(page)
  await workflow(page, 'Upload a scan').focus()
  await page.keyboard.press('ArrowDown')
  await expect(workflow(page, 'Dataset replay')).toBeChecked()
  for (const palette of ['Onyx', 'Onyx Light']) {
    await page.getByText('Appearance', { exact: true }).click()
    await page.getByRole('radio', { name: palette, exact: true }).check()
    await page.getByText('Appearance', { exact: true }).click()
    for (const width of [1366, 390, 320]) {
      await page.setViewportSize({ width, height: width === 1366 ? 768 : 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(menu(page).getByRole('button', { name: 'Open workspace', exact: true })).toBeVisible()
      const analysis = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
      expect(analysis.violations, `${palette} ${width}`).toEqual([])
    }
  }
  await page.reload()
  await expect(menu(page)).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'onyx-light')
  await expect(page.locator('#workspace')).toBeHidden()
  expect(server.writes).toEqual([])
  expect(server.errors).toEqual([])
})
