// All API responses and pixels in these tests are SYNTHETIC software fixtures.
// Real CPU/browser inference is recorded separately in docs/verification.md.
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { unconfiguredDemo } from './demo-fixture'
import { navigate, workspaceLink } from './navigation'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64')
const task = 'iedxray.generic_explosive_detection'
const scan = {
  id: 'a'.repeat(32), name: 'synthetic-test-image.png', width: 640, height: 320,
  sha256: 'c'.repeat(64), image_url: '/api/scans/' + 'a'.repeat(32) + '/image',
}
const model = { id: 'author-yolov10m-generic', label: 'Synthetic test detector', task, configured: true, reason: 'Synthetic test configuration' }
const review = { status: 'unreviewed', note: '', updated_at: null }
const detection = {
  id: 'threat-0', kind: 'suspicious_region', box_xyxy: [100, 60, 200, 160],
  category: { namespace: task, label: 'Explosive' }, confidence: 0.91, device_id: null,
}

const pageErrors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors: string[] = []
  pageErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([])
})

async function fixture(page: Page, options: { configured?: boolean; empty?: boolean; failed?: boolean } = {}) {
  let currentScan = { ...scan }
  let currentRun: any = null
  let polls = 0
  let uploads = 0
  let offline = false
  let restarted = false
  let rejectUpload = false
  let failReview = false
  let failExport = false
  let lastRequest: any = null
  await page.context().route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (offline) return route.abort('connectionfailed')
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body })
    if (path === '/api/demo') return json(unconfiguredDemo)
    if (path === '/api/health') return json({ model: { ...model, configured: options.configured !== false },
      limits: { max_upload_bytes: 20 * 1024 * 1024, max_pixels: 20_000_000 },
      active_run_id: !restarted && currentRun?.state === 'running' ? currentRun.id : null })
    if (path === '/api/intake') return json({ configured: false, enabled: false, state: 'unconfigured',
      adapter: 'folder', hardware_verified: false, source_label: 'Export folder', confidence: 0.25,
      pending_count: 0, received_count: 0, last_received_at: null, error: null, pending: [], issues: [] })
    if (path.endsWith('/image')) return route.fulfill({ contentType: 'image/png', body: png })
    if (path === '/api/scans') {
      uploads++
      if (rejectUpload) return json({ detail: { code: 'invalid_image', message: 'The file could not be decoded as a complete image.' } }, 422)
      currentScan = { ...scan, id: uploads.toString(16).padStart(32, '0') }
      return json(currentScan, 201)
    }
    if (path === '/api/runs' && request.method() === 'GET') return json({ items: !restarted && currentRun ? [currentRun] : [] })
    if (path === '/api/runs' && request.method() === 'POST') {
      lastRequest = request.postDataJSON()
      currentRun = { id: 'b'.repeat(32), scan_id: currentScan.id, scan: currentScan,
        state: 'running', created_at: '2026-09-25T12:00:00Z', completed_at: null,
        confidence: lastRequest.confidence, elapsed_seconds: null, result: null, error: null, review }
      polls = 0
      return json(currentRun, 202)
    }
    if (restarted) return json({ detail: { code: 'run_not_found', message: 'This run is not in the current session.' } }, 404)
    if (path.endsWith('/review') && request.method() === 'PATCH') {
      if (failReview) return json({ detail: { code: 'storage_error', message: 'Could not save review evidence.' } }, 507)
      currentRun = { ...currentRun, review: { ...request.postDataJSON(), updated_at: '2026-09-25T12:02:00Z' } }
      return json(currentRun)
    }
    if (path.endsWith('/export') && failExport) return json({ detail: { code: 'export_failed', message: 'Export is unavailable. Please retry.' } }, 507)
    if (path.endsWith('/export')) return route.fulfill({ contentType: 'application/json',
      headers: { 'Content-Disposition': 'attachment; filename="synthetic-run.json"' },
      body: JSON.stringify({ schema_version: 'rayguard.gui.export.v1', run: currentRun }) })
    if (path.startsWith('/api/runs/')) {
      if (++polls >= 3) {
        currentRun = { ...currentRun, state: options.failed ? 'failed' : 'succeeded', completed_at: '2026-09-25T12:00:02Z', elapsed_seconds: 2,
          error: options.failed ? { code: 'inference_failed', message: 'Synthetic model execution failure.' } : null,
          result: options.failed ? null : { schema_version: '1.0', scan_id: currentScan.id, status: 'ok',
            image: { width: currentScan.width, height: currentScan.height },
            model: { id: model.id, task, provenance: 'sha256:' + 'd'.repeat(64) },
            run: { id: currentRun.id, provenance: 'manifest.json' }, threshold: currentRun.confidence,
            detections: options.empty ? [] : [detection], error: null } }
      }
      return json(currentRun)
    }
    return json({ detail: 'Synthetic route not found' }, 404)
  })
  return {
    offline: (value: boolean) => { offline = value },
    restart: () => { restarted = true },
    rejectUpload: (value: boolean) => { rejectUpload = value },
    failReview: (value: boolean) => { failReview = value },
    failExport: (value: boolean) => { failExport = value },
    uploads: () => uploads,
    lastRequest: () => lastRequest,
  }
}

async function upload(page: Page) {
  await expect(page.getByLabel('Upload X-ray image')).toBeEnabled()
  await page.getByLabel('Upload X-ray image').setInputFiles({ name: scan.name, mimeType: 'image/png', buffer: png })
  await expect(page.getByRole('group', { name: `X-ray scan: ${scan.name}` })).toBeVisible()
}

async function run(page: Page) {
  await page.getByRole('button', { name: 'Run inference', exact: true }).click()
  await expect(page.locator('#processing-scan-viewer')).toContainText('Running local inference')
  await expect(page.getByLabel('Upload X-ray image')).toBeDisabled()
  await expect(page.getByLabel('Score threshold')).toBeDisabled()
  await expect(page.locator('#processing-scan-viewer')).toHaveCount(0)
}

async function openDetails(page: Page, selector: string) {
  if (selector.includes('run-details')) await page.getByRole('tab', { name: 'Provenance', exact: true }).click()
  else await navigate(page, selector.includes('history') ? 'Session' : 'Source')
}

async function inspect(page: Page) {
  await navigate(page, 'Inspect')
}

async function palette(page: Page, name: string) {
  const chooser = page.locator('details.appearance-menu')
  if (await chooser.getAttribute('open') === null) await chooser.locator('summary').click()
  await page.getByRole('radio', { name, exact: true }).check()
  await chooser.locator('summary').click()
}

test('empty workspace and unconfigured model are usable without fabricated findings', async ({ page }) => {
  await fixture(page, { configured: false })
  await page.goto('/#workspace')
  await expect(page.getByRole('button', { name: 'Run inference', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Ready when you are' })).toBeVisible()
  await expect(page.getByText('Model configuration required before detection.', { exact: false })).toBeVisible()
  await openDetails(page, 'details.workspace-settings')
  await expect(page.getByText('Configuration required', { exact: true })).toBeVisible()
  await expect(page.locator('.detection-box')).toHaveCount(0)
  await inspect(page)
  await upload(page)
  await expect(page.getByRole('button', { name: 'Run inference', exact: true })).toBeDisabled()
})

test('prediction, selection, shared zoom transform, history and export retain run evidence', async ({ page }) => {
  const server = await fixture(page)
  await page.goto('/#workspace')
  await upload(page)
  await run(page)
  expect(server.lastRequest().confidence).toBe(0.25)
  const finding = page.locator('.finding-item')
  const overlay = page.locator('[data-detection="threat-0"]')
  await finding.click()
  await expect(finding).toHaveAttribute('aria-pressed', 'true')
  await expect(overlay).toHaveAttribute('aria-pressed', 'true')
  await openDetails(page, 'details.run-details')
  await expect(page.getByText('100.0, 60.0, 200.0, 160.0', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Findings', exact: true }).click()
  const box = overlay.locator('rect').first()
  const before = await box.boundingBox()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(page.getByLabel('Zoom level')).toHaveText('125%')
  const after = await box.boundingBox()
  expect(after!.width / before!.width).toBeCloseTo(1.25, 1)
  const alignment = await page.locator('.scan-svg').evaluate((svg) => {
    const image = svg.querySelector('image') as SVGGraphicsElement
    const rect = svg.querySelector('[data-detection] > rect') as SVGGraphicsElement
    const a = image.getScreenCTM()!
    const b = rect.getScreenCTM()!
    return { image: [a.a, a.d, a.e, a.f], box: [b.a, b.d, b.e, b.f] }
  })
  expect(alignment.image).toEqual(alignment.box)
  await page.getByRole('button', { name: 'Hide detection overlays' }).click()
  await expect(overlay).toHaveCount(0)
  await expect(finding).toBeVisible()
  await page.getByRole('button', { name: 'Show detection overlays' }).click()
  await page.getByRole('button', { name: 'Fit image' }).click()
  await expect(page.getByLabel('Zoom level')).toHaveText('100%')
  await openDetails(page, 'details.workspace-settings')
  await page.getByLabel('Score threshold').fill('50')
  await inspect(page)
  await openDetails(page, 'details.run-details')
  await expect(page.locator('.run-evidence')).toContainText('25%')
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export run JSON' }).click()
  const download = await downloaded
  expect(await download.failure()).toBeNull()
  expect(download.suggestedFilename()).toBe(`rayguard-${'b'.repeat(32)}.json`)
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(exported.schema_version).toBe('rayguard.gui.export.v1')
  expect(exported.run.result.detections).toEqual([detection])
  expect(exported.run.confidence).toBe(0.25)
  await upload(page)
  await expect(page.locator('.detection-box')).toHaveCount(0)
  await expect(page.locator('.run-evidence')).toHaveCount(0)
  await openDetails(page, 'details.history-section')
  await page.getByRole('button', { name: `View run for ${scan.name}` }).click()
  await openDetails(page, 'details.run-details')
  await expect(page.locator('.run-evidence')).toContainText('25%')
  await expect(page.locator('.detection-box')).toHaveCount(1)
})

test('successful empty result has no benign verdict', async ({ page }) => {
  await fixture(page, { empty: true })
  await page.goto('/#workspace')
  await upload(page)
  await run(page)
  await expect(page.getByRole('heading', { name: 'No detections reported' })).toBeVisible()
  await expect(page.getByText(/This is not a safe or benign verdict/)).toBeVisible()
  await expect(page.locator('.detection-box')).toHaveCount(0)
})

test('failed inference cannot carry stale predictions and can be retried', async ({ page }) => {
  await fixture(page, { failed: true })
  await page.goto('/#workspace')
  await upload(page)
  await run(page)
  await expect(page.getByRole('heading', { name: 'Inference did not complete' })).toBeVisible()
  await expect(page.locator('.detection-box')).toHaveCount(0)
  const retry = page.getByRole('button', { name: 'Run inference', exact: true })
  await expect(retry).toBeEnabled()
  await expect(retry).toHaveClass(/primary-button/)
  await expect(page.getByRole('list', { name: 'Inspection workflow' }).locator('[aria-current="step"]')).toContainText('Run detection')
})

test('invalid file and server decode errors expose a recovery path', async ({ page }) => {
  const server = await fixture(page)
  await page.goto('/#workspace')
  await expect(page.getByLabel('Upload X-ray image')).toBeEnabled()
  await page.getByLabel('Upload X-ray image').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic invalid input') })
  await expect(page.getByRole('alert')).toContainText('Choose a PNG or JPEG')
  expect(server.uploads()).toBe(0)
  server.rejectUpload(true)
  await page.getByLabel('Upload X-ray image').setInputFiles({ name: scan.name, mimeType: 'image/png', buffer: png })
  await expect(page.getByRole('alert')).toContainText('could not be decoded')
  await expect(page.getByRole('button', { name: 'Run inference', exact: true })).toHaveCount(0)
  server.rejectUpload(false)
  await upload(page)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('network failure during start reveals reconnect and recovers', async ({ page }) => {
  const server = await fixture(page)
  await page.goto('/#workspace')
  await upload(page)
  server.offline(true)
  await page.getByRole('button', { name: 'Run inference', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reconnect service' })).toBeVisible()
  server.offline(false)
  await page.getByRole('button', { name: 'Reconnect service' }).click()
  await expect(page.getByText('Local service', { exact: true })).toBeVisible()
  await upload(page)
  await expect(page.getByRole('button', { name: 'Run inference', exact: true })).toBeEnabled()
})

test('server restart during a job cannot leave the workspace locked', async ({ page }) => {
  const server = await fixture(page)
  await page.goto('/#workspace')
  await upload(page)
  await page.getByRole('button', { name: 'Run inference', exact: true }).click()
  await expect(page.locator('#processing-scan-viewer')).toContainText('Running local inference')
  server.restart()
  await expect(page.getByLabel('Upload X-ray image')).toBeEnabled()
  await expect(page.locator('.detection-box')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Run inference', exact: true })).toHaveCount(0)
  await expect(page.getByRole('group', { name: `X-ray scan: ${scan.name}` })).toHaveCount(0)
})

test('dark theme persists and mobile/reduced-motion layout remains usable', async ({ page }) => {
  await fixture(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#workspace')
  await palette(page, 'Midnight')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.setViewportSize({ width: 390, height: 844 })
  await upload(page)
  await run(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.locator('.finding-item')).toBeVisible()
  await page.locator('.finding-item').click()
  await page.setViewportSize({ width: 320, height: 700 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await palette(page, 'Daylight')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('export failure is visible and retry preserves the same run', async ({ page }) => {
  const server = await fixture(page)
  await page.goto('/#workspace')
  await upload(page)
  await run(page)
  await openDetails(page, 'details.run-details')
  server.failExport(true)
  await page.getByRole('button', { name: 'Export run JSON' }).click()
  await expect(page.getByRole('alert')).toContainText('unavailable')
  await page.getByRole('tab', { name: 'Findings', exact: true }).click()
  await expect(page.locator('.finding-item')).toBeVisible()
  await openDetails(page, 'details.run-details')
  server.failExport(false)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export run JSON' }).click()
  const exported = JSON.parse(await readFile((await (await pending).path())!, 'utf8'))
  expect(exported.run.id).toBe('b'.repeat(32))
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('laptop controls fit and keyboard canvas pan/reset preserves box alignment', async ({ page }) => {
  await fixture(page)
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/#workspace')
  await upload(page)
  const action = await page.getByRole('button', { name: 'Run inference', exact: true }).boundingBox()
  expect(action!.y + action!.height).toBeLessThanOrEqual(768)
  await run(page)
  const canvas = page.locator('.scan-svg')
  await canvas.focus()
  await page.keyboard.press('+')
  await expect(page.getByLabel('Zoom level')).toHaveText('125%')
  const before = await page.locator('.scan-svg > g').getAttribute('transform')
  await page.keyboard.press('ArrowRight')
  expect(await page.locator('.scan-svg > g').getAttribute('transform')).not.toBe(before)
  await page.keyboard.press('0')
  await expect(page.getByLabel('Zoom level')).toHaveText('100%')
  await page.locator('[data-detection="threat-0"]').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.finding-item')).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

for (const theme of ['light', 'dark']) {
  test(`${theme} completed workspace passes automated accessibility checks`, async ({ page }) => {
    await fixture(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/#workspace')
    await palette(page, theme === 'dark' ? 'Graphite' : 'Daylight')
    await upload(page)
    await run(page)
    await page.locator('.finding-item').click()
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(result.violations).toEqual([])
  })
}

test('review save failure retains notes and retry exports the operator record', async ({ page }) => {
  const server = await fixture(page)
  await page.goto('/#workspace')
  await upload(page)
  await run(page)
  await page.getByRole('tab', { name: 'Review', exact: true }).click()
  await page.getByLabel('Review note').fill('Synthetic review: inspect the localized region')
  server.failReview(true)
  await page.getByRole('button', { name: 'Flag for follow-up' }).click()
  await expect(page.getByRole('alert')).toContainText('Could not save review evidence')
  await expect(page.getByLabel('Review note')).toHaveValue('Synthetic review: inspect the localized region')
  server.failReview(false)
  await page.getByRole('button', { name: 'Flag for follow-up' }).click()
  await expect(page.getByRole('region', { name: 'Operator review' })).toContainText('Follow-up requested')
  await openDetails(page, 'details.run-details')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export run JSON' }).click()
  const exported = JSON.parse(await readFile((await (await pending).path())!, 'utf8'))
  expect(exported.run.review.status).toBe('follow_up')
  expect(exported.run.result.detections).toEqual([detection])
})

test('view adjustments change displayed pixels without changing result boxes or input URL', async ({ page }) => {
  await fixture(page)
  await page.goto('/#workspace')
  await upload(page)
  await run(page)
  const image = page.locator('.scan-svg image')
  const original = await image.getAttribute('href')
  const box = page.locator('.detection-box > rect').first()
  const coordinates = () => box.evaluate(rect => ['x', 'y', 'width', 'height'].map(key => rect.getAttribute(key)))
  const before = await coordinates()
  await page.getByRole('button', { name: 'Grayscale', exact: true }).click()
  await page.getByRole('button', { name: 'Invert display', exact: true }).click()
  await page.getByRole('slider', { name: /^Brightness/ }).fill('150')
  await expect(image).toHaveAttribute('style', /brightness\(150%\).*grayscale\(1\).*invert\(1\)/)
  expect(await image.getAttribute('href')).toBe(original)
  expect(await coordinates()).toEqual(before)
  const transforms = await page.locator('.scan-svg').evaluate(svg => {
    const a = (svg.querySelector('image') as SVGGraphicsElement).getScreenCTM()!
    const b = (svg.querySelector('[data-detection] > rect') as SVGGraphicsElement).getScreenCTM()!
    return { image: [a.a, a.d, a.e, a.f], box: [b.a, b.d, b.e, b.f] }
  })
  expect(transforms.image).toEqual(transforms.box)
  await expect(page.locator('.detection-box')).not.toHaveAttribute('style', /filter/)
  await upload(page)
  await expect(image).toHaveAttribute('style', /brightness\(100%\).*grayscale\(0\).*invert\(0\)/)
})

test('navigation and evidence tabs preserve inspection and unsaved review', async ({ page }) => {
  await fixture(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#workspace')
  await (await workspaceLink(page, 'Source')).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Score threshold')).toBeVisible()
  await inspect(page)
  await upload(page)
  await run(page)
  const findings = page.getByRole('tab', { name: 'Findings', exact: true })
  await findings.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Review', exact: true })).toBeFocused()
  await page.getByLabel('Review note').fill('Draft remains across navigation')
  await page.getByRole('tab', { name: 'Review', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Export run JSON' })).toBeVisible()
  await page.getByRole('tab', { name: 'Provenance', exact: true }).focus()
  await page.keyboard.press('Home')
  await expect(findings).toBeFocused()
  await page.getByRole('tab', { name: 'Review', exact: true }).click()
  await openDetails(page, 'history')
  await expect(page.getByRole('button', { name: 'View run for synthetic-test-image.png' })).toBeVisible()
  await page.setViewportSize({ width: 768, height: 900 })
  const table = page.getByRole('region', { name: 'Run history table', exact: true })
  await table.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => table.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
  await inspect(page)
  await expect(page.getByLabel('Review note')).toHaveValue('Draft remains across navigation')
})

test('workflow identifies the actual next step through upload, processing, review and replacement', async ({ page }) => {
  await fixture(page)
  await page.goto('/#workspace')
  const workflow = page.getByRole('list', { name: 'Inspection workflow' })
  const current = workflow.locator('[aria-current="step"]')
  await expect(workflow.getByRole('listitem')).toHaveCount(3)
  await expect(current).toHaveCount(1)
  await expect(current).toContainText('Choose scan')
  await expect(page.getByRole('heading', { name: 'Your scan will appear here' })).toBeVisible()
  await upload(page)
  await expect(current).toContainText('Run detection')
  await page.getByRole('button', { name: 'Run inference', exact: true }).click()
  await expect(page.locator('#processing-scan-viewer')).toContainText('Running local inference')
  await expect(current).toContainText('Run detection')
  await page.getByRole('tab', { name: 'Review', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Operator review' })).toBeVisible()
  await expect(current).toHaveCount(1)
  await expect(current).toContainText('Review result')
  await expect(page.getByRole('button', { name: 'Export run JSON' })).toBeHidden()
  await upload(page)
  await expect(current).toContainText('Run detection')
  await page.getByRole('tab', { name: 'Findings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ready when you are' })).toBeVisible()
})

test('local fonts load without remote requests and blocked fonts retain a usable fallback', async ({ page }) => {
  await fixture(page)
  const external: string[] = []
  page.on('request', request => { if (request.url().startsWith('http') && new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url()) })
  await page.goto('/#workspace')
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready
    return [...document.fonts].filter(font => font.family.replaceAll('"', '') === 'Instrument Serif').map(font => ({ weight: font.weight, status: font.status }))
  })
  expect(fonts.some(font => font.status === 'loaded')).toBe(true)
  expect(external).toEqual([])
  await page.route('**/fonts/**', route => route.abort())
  await page.reload()
  await upload(page)
  await run(page)
  await expect(page.locator('.finding-item')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
