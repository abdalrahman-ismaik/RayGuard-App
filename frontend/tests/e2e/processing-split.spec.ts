// SYNTHETIC pixels, annotations, API state and predictions. These tests never run a model.
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { AnnotationComparison, DatasetDemo, Intake, Run } from '../../src/types'
import { unconfiguredDemo } from './demo-fixture'
import { navigate } from './navigation'

const task = 'iedxray.generic_explosive_detection'
const model = { id: 'synthetic-split-model', label: 'Synthetic split detector', task, configured: true, reason: null }
const id = (n: number) => String(n).padStart(32, '0')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64')

function completed(n: number, confidence = .35, empty = false): Run {
  const scan = { id: id(n), name: `synthetic-split-${n}.png`, width: 640, height: 320,
    sha256: 'c'.repeat(64), source_sha256: 'd'.repeat(64), image_url: `/api/scans/${id(n)}/image`,
    origin: 'dataset_demo' as const, source: { dataset: 'IEDXray' as const, split: 'test' as const, index: n } }
  return { id: id(n), scan_id: scan.id, scan, state: 'succeeded',
    created_at: `2026-09-26T12:0${n}:00Z`, completed_at: `2026-09-26T12:0${n}:30Z`,
    confidence, elapsed_seconds: 1, error: null, review: { status: 'unreviewed', note: '', updated_at: null },
    result: { schema_version: '1.0', scan_id: scan.id, status: 'ok', image: { width: 640, height: 320 },
      model: { id: model.id, task, provenance: 'Synthetic fixture only' }, run: { id: id(n), provenance: 'Synthetic fixture only' },
      threshold: confidence, error: null, detections: empty ? [] : [{ id: `synthetic-finding-${n}`, kind: 'suspicious_region',
        box_xyxy: [120 + n, 50, 220 + n, 120], category: { namespace: task, label: 'Explosive' }, confidence: .81, device_id: null }] } }
}

function comparison(run: Run): AnnotationComparison {
  const detection = run.result?.detections[0]
  return { schema_version: 'rayguard.annotation-comparison.v1', run_id: run.id, status: 'available', reason: null,
    task, iou_threshold: .5, annotation_source: { name: 'synthetic-split-reference.json', sha256: 'a'.repeat(64), split: 'test' },
    image_id: Number(run.id), image_sha256: run.scan.source_sha256!,
    boxes: [{ annotation_id: Number(run.id), category_id: 0, label: 'Explosive', box_xyxy: [121, 50, 221, 120] }],
    evaluation: { outcome: detection ? 'matched' : 'missed', matched: detection ? 1 : 0, missed: detection ? 0 : 1, extra: 0,
      matches: detection ? [{ annotation_id: Number(run.id), detection_id: detection.id, iou: .9 }] : [],
      missed_annotation_ids: detection ? [] : [Number(run.id)], extra_detection_ids: [] }, warnings: ['Synthetic reference, not data validation.'] }
}

async function fixture(page: Page, options: { records?: Run[]; motion?: boolean } = {}) {
  // Appearance matrix iterations need a fresh app session, not a same-hash navigation.
  await page.goto('about:blank')
  await page.emulateMedia({ reducedMotion: options.motion ? 'no-preference' : 'reduce' })
  const records = options.records ?? [completed(2), completed(1)]
  const intake: Intake = { configured: true, enabled: false, state: 'paused', adapter: 'folder', hardware_verified: false,
    source_label: 'Synthetic export folder', confidence: .25, pending_count: 0, received_count: 0,
    last_received_at: null, error: null, pending: [], issues: [] }
  const demo: DatasetDemo = { ...unconfiguredDemo, configured: true, state: 'ready', total: 20 }
  let activeId: string | null = null
  let offline = false
  let gate: Promise<void> | null = null
  let release: (() => void) | undefined
  let missingActive: Run | null = null
  const writes: { path: string; body: unknown }[] = []
  const comparisons: string[] = []
  const exports: string[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/**', async route => {
    if (offline) return route.abort('connectionfailed')
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body })
    if (path === '/api/health') return json({ model, active_run_id: activeId, limits: { max_upload_bytes: 20_000_000, max_pixels: 20_000_000 } })
    if (path === '/api/intake') return json(intake)
    if (path === '/api/demo') return json(demo)
    if (path.endsWith('/image')) return route.fulfill({ contentType: 'image/svg+xml', body:
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320">
        <rect width="640" height="320" fill="#c9d0d2"/><path d="M0 80H640M0 160H640M0 240H640M160 0V320M320 0V320M480 0V320" stroke="#9da9ae"/>
        <rect x="110" y="40" width="130" height="100" rx="8" fill="#697e88"/>
        <rect x="350" y="80" width="160" height="160" rx="16" fill="#7f9592"/>
        <text x="320" y="285" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#152b35">SYNTHETIC SCAN ${Number(path.split('/')[3])}</text>
      </svg>` })
    if (path === '/api/scans' && request.method() === 'POST') {
      writes.push({ path, body: 'Synthetic upload bytes' })
      return json({ ...completed(8).scan, origin: 'upload', source: undefined }, 201)
    }
    if (path === '/api/runs' && request.method() === 'POST') {
      writes.push({ path, body: request.postDataJSON() })
      if (gate) await gate
      const run = completed(8, request.postDataJSON().confidence)
      Object.assign(run, { state: 'running', completed_at: null, elapsed_seconds: null, result: null })
      run.scan.origin = 'upload'
      delete run.scan.source
      records.unshift(run)
      activeId = run.id
      return json(run, 202)
    }
    if (path === '/api/runs') return json({ items: records })
    const run = records.find(item => item.id === path.split('/')[3]) ?? (missingActive?.id === path.split('/')[3] ? missingActive : null)
    if (!run) return json({ detail: 'Unknown synthetic route' }, 404)
    if (path.endsWith('/comparison')) { comparisons.push(run.id); return json(comparison(run)) }
    if (path.endsWith('/export')) { exports.push(run.id); return json({ run, annotation_comparison: comparison(run) }) }
    if (path.endsWith('/review')) {
      writes.push({ path, body: request.postDataJSON() })
      run.review = { ...request.postDataJSON(), updated_at: '2026-09-26T13:00:00Z' }
    }
    return json(run)
  })
  await page.goto('/#workspace')
  if (options.motion) await page.getByRole('button', { name: 'Skip intro', exact: true }).click()
  await expect(page.getByLabel('Upload X-ray image')).toBeEnabled()
  return {
    records, writes, comparisons, exports, errors,
    holdStart: () => { gate = new Promise(resolve => { release = resolve }) },
    releaseStart: () => { release?.(); gate = null },
    disconnect: () => { offline = true }, reconnect: () => { offline = false },
    background: (origin: 'folder' | 'dataset_demo' = 'folder', missing = false) => {
      const run = completed(9, .6)
      Object.assign(run, { state: 'running', completed_at: null, elapsed_seconds: null, result: null })
      run.scan.origin = origin
      if (origin === 'folder') { delete run.scan.source; intake.enabled = true; intake.state = 'receiving' }
      else Object.assign(demo, { enabled: true, state: 'running', batch_total: 1, current_name: run.scan.name, last_run_id: run.id })
      activeId = run.id
      if (missing) missingActive = run
      else records.unshift(run)
    },
    publishMissing: () => { if (missingActive) records.unshift(missingActive); missingActive = null },
    finish: (failed = false) => {
      const run = records.find(item => item.id === activeId)!
      const next = completed(Number(run.id), run.confidence)
      Object.assign(run, next, { scan: run.scan, completed_at: '2026-09-26T13:00:00Z' })
      if (failed) Object.assign(run, { state: 'failed', result: null, error: { code: 'SYNTHETIC_FAILURE', message: 'Synthetic detector stopped.' } })
      activeId = null
      intake.state = intake.enabled ? 'waiting' : 'paused'
      if (demo.enabled) Object.assign(demo, { enabled: false, state: 'completed', completed_count: 1 })
    },
  }
}

const split = (page: Page) => page.locator('.inspection-workspace.is-processing-split')
const left = (page: Page) => page.locator('#processing-scan-viewer')
const right = (page: Page) => page.locator('.completed-evidence')

async function upload(page: Page) {
  await page.getByLabel('Upload X-ray image').setInputFiles({ name: 'synthetic-split-8.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByRole('button', { name: 'Run inference', exact: true })).toBeEnabled()
}

async function choose(page: Page, n: number) {
  await navigate(page, 'Session')
  await page.getByRole('button', { name: `View run for synthetic-split-${n}.png`, exact: true }).click()
}

async function noDuplicateIds(page: Page) {
  expect(await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll('[id]'), element => element.id)
    return ids.filter((value, index) => ids.indexOf(value) !== index)
  })).toEqual([])
}

test('manual inference shows its image under the eye and a separate latest completed result, then collapses', async ({ page }) => {
  const server = await fixture(page)
  await upload(page)
  await page.getByRole('button', { name: 'Run inference', exact: true }).click()
  await expect(split(page)).toBeVisible()
  await expect(left(page).locator('image')).toHaveAttribute('href', `/api/scans/${id(8)}/image`)
  await expect(right(page).locator('.scan-svg image')).toHaveAttribute('href', `/api/scans/${id(2)}/image`)
  await expect(left(page)).toContainText('synthetic-split-8.png')
  await expect(right(page)).toContainText('synthetic-split-2.png')
  await expect(right(page).getByRole('heading', { name: 'Evidence inspector' })).toBeVisible()
  await expect(right(page).locator('[data-detection="synthetic-finding-2"]')).toBeVisible()
  await expect(right(page).locator('.annotation-box')).toBeVisible()
  await expect(left(page).locator('[data-detection], .annotation-box')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Image adjustment dock' })).toContainText('Completed image only')
  const eye = await left(page).locator('.eye-motion').boundingBox()
  const stage = await left(page).locator('.image-stage').boundingBox()
  expect(eye!.y + eye!.height).toBeLessThanOrEqual(stage!.y + 1)
  await noDuplicateIds(page)
  await left(page).locator('.scan-svg').focus()
  server.finish()
  await expect(split(page)).toHaveCount(0)
  await expect(left(page)).toHaveCount(0)
  await expect(page.locator('.scan-svg')).toHaveCount(1)
  await expect(page.locator('.scan-svg image')).toHaveAttribute('href', `/api/scans/${id(8)}/image`)
  await expect(page.locator('#scan-viewer')).toBeFocused()
  expect(server.writes.map(item => item.path)).toEqual(['/api/scans', '/api/runs'])
  expect(server.errors).toEqual([])
})

test('pending start keeps the uploaded image and does not borrow the completed result identity', async ({ page }) => {
  const server = await fixture(page)
  server.holdStart()
  await upload(page)
  await page.getByRole('button', { name: 'Run inference', exact: true }).click()
  await expect(split(page)).toBeVisible()
  await expect(left(page)).toContainText('Starting inference')
  await expect(left(page).locator('image')).toHaveAttribute('href', `/api/scans/${id(8)}/image`)
  await expect(right(page).locator('.scan-svg image')).toHaveAttribute('href', `/api/scans/${id(2)}/image`)
  server.releaseStart()
  await expect(left(page)).toContainText('Running local inference')
  server.finish()
  await expect(split(page)).toHaveCount(0)
  expect(server.errors).toEqual([])
})

for (const origin of ['folder', 'dataset_demo'] as const) {
  test(`${origin} activity shows the active image while completed evidence keeps its own threshold and export`, async ({ page }) => {
    const server = await fixture(page)
    server.background(origin)
    await expect(split(page)).toBeVisible()
    await expect(left(page).locator('image')).toHaveAttribute('href', `/api/scans/${id(9)}/image`)
    await expect(right(page).locator('.scan-svg image')).toHaveAttribute('href', `/api/scans/${id(2)}/image`)
    await right(page).getByRole('tab', { name: 'Provenance', exact: true }).click()
    const provenance = right(page).getByRole('tabpanel', { name: 'Provenance', exact: true })
    await expect(provenance).toContainText('35%')
    await expect(provenance).not.toContainText('60%')
    const download = page.waitForEvent('download')
    await right(page).getByRole('button', { name: 'Export run JSON' }).click()
    await download
    expect(server.exports).toEqual([id(2)])
    expect(server.comparisons).toContain(id(2))
    expect(server.comparisons).not.toContain(id(9))
    await page.getByRole('button', { name: 'Invert display', exact: true }).click()
    await expect(right(page).locator('.scan-svg image')).toHaveAttribute('style', /invert\(1\)/)
    await expect(left(page).locator('.scan-svg image')).not.toHaveAttribute('style', /invert\(1\)/)
    server.finish()
    await expect(split(page)).toHaveCount(0)
    expect(server.errors).toEqual([])
  })
}

test('latest completed means completion timestamp; newer failures do not replace a valid zero-detection result', async ({ page }) => {
  const latest = completed(1, .45, true)
  latest.completed_at = '2026-09-26T12:08:00Z'
  const failure = { ...completed(3), state: 'failed' as const, result: null,
    completed_at: '2026-09-26T12:09:00Z', error: { code: 'SYNTHETIC_FAILURE', message: 'Synthetic failure.' } }
  const server = await fixture(page, { records: [failure, completed(2), latest] })
  server.background()
  await expect(split(page)).toBeVisible()
  await expect(right(page).locator('.scan-svg image')).toHaveAttribute('href', `/api/scans/${id(1)}/image`)
  await expect(right(page).getByRole('heading', { name: 'No detections reported' })).toBeVisible()
  await expect(right(page)).toContainText('45% threshold')
  await expect(right(page)).toContainText('not a safe or benign verdict')
  expect(server.errors).toEqual([])
})

test('a health and history polling race never substitutes the held image for the active scan', async ({ page }) => {
  const server = await fixture(page)
  await choose(page, 1)
  await page.evaluate(() => {
    const observations: string[] = []
    Object.assign(window, { processingSourceObservations: observations })
    new MutationObserver(() => {
      const source = document.querySelector('#processing-scan-viewer .scan-svg image')?.getAttribute('href')
      if (source) observations.push(source)
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] })
  })
  server.background('folder', true)
  await expect(left(page).locator('.scan-svg image')).toHaveAttribute('href', `/api/scans/${id(9)}/image`)
  const sources = await page.evaluate(() => (window as Window & { processingSourceObservations: string[] }).processingSourceObservations)
  expect(sources.length).toBeGreaterThan(0)
  expect([...new Set(sources)]).toEqual([`/api/scans/${id(9)}/image`])
  server.publishMissing()
  server.finish()
  await expect(split(page)).toHaveCount(0)
  await expect(page.locator('.scan-svg image')).toHaveAttribute('href', `/api/scans/${id(1)}/image`)
  expect(server.errors).toEqual([])
})

test('the first run has an honest empty completed column; failed inference returns to the normal failure view', async ({ page }) => {
  const server = await fixture(page, { records: [] })
  await upload(page)
  await page.getByRole('button', { name: 'Run inference', exact: true }).click()
  await expect(right(page).getByRole('heading', { name: 'No completed result yet' })).toBeVisible()
  await expect(right(page).getByRole('heading', { name: 'Awaiting a completed result' })).toBeVisible()
  await expect(right(page)).not.toContainText('Run the detector to see localized regions')
  await expect(right(page).locator('.scan-svg')).toHaveCount(0)
  await expect(left(page).locator('image')).toHaveAttribute('href', `/api/scans/${id(8)}/image`)
  await page.screenshot({ path: '../output/playwright/processing-split-tests/first-run.png', fullPage: true })
  server.finish(true)
  await expect(split(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Inference did not complete' })).toBeVisible()
  await expect(page.locator('.scan-svg image')).toHaveAttribute('href', `/api/scans/${id(8)}/image`)
  await expect(page.locator('.eye-motion video')).toHaveCount(0)
  expect(server.errors).toEqual([])
})

for (const failed of [false, true]) {
  test(`held older review draft survives background ${failed ? 'failure' : 'completion'} with its original run identity`, async ({ page }) => {
    const server = await fixture(page)
    await choose(page, 1)
    await page.getByRole('tab', { name: 'Review', exact: true }).click()
    await page.getByLabel('Review note').fill('Synthetic held draft, not an operator finding.')
    server.background()
    await expect(split(page)).toBeVisible()
    await expect(left(page).locator('image')).toHaveAttribute('href', `/api/scans/${id(9)}/image`)
    await expect(right(page).locator('.scan-svg image')).toHaveAttribute('href', `/api/scans/${id(1)}/image`)
    await expect(right(page).getByLabel('Review note')).toHaveValue('Synthetic held draft, not an operator finding.')
    await expect(right(page)).toContainText('Held review')
    await right(page).getByLabel('Review note').focus()
    server.finish(failed)
    await expect(split(page)).toHaveCount(0)
    await expect(page.getByLabel('Review note')).toHaveValue('Synthetic held draft, not an operator finding.')
    await expect(page.getByLabel('Review note')).toBeFocused()
    await expect(page.locator('.scan-svg image')).toHaveAttribute('href', `/api/scans/${id(1)}/image`)
    await page.getByRole('button', { name: 'Mark reviewed', exact: true }).click()
    expect(server.writes.at(-1)).toEqual({ path: `/api/runs/${id(1)}/review`, body: {
      status: 'reviewed', note: 'Synthetic held draft, not an operator finding.' } })
    expect(server.errors).toEqual([])
  })
}

test('review notes on a held failed run are not silently discarded by background processing', async ({ page }) => {
  const failed: Run = { ...completed(1), state: 'failed', result: null,
    error: { code: 'SYNTHETIC_FAILURE', message: 'Synthetic prior failure.' } }
  const server = await fixture(page, { records: [completed(2), failed] })
  await choose(page, 1)
  await page.getByRole('tab', { name: 'Review', exact: true }).click()
  await page.getByLabel('Review note').fill('Synthetic failure follow-up draft.')
  server.background()
  await expect(split(page)).toBeVisible()
  await expect(left(page).locator('image')).toHaveAttribute('href', `/api/scans/${id(9)}/image`)
  server.finish()
  await expect(split(page)).toHaveCount(0)
  await expect(page.getByLabel('Review note')).toHaveValue('Synthetic failure follow-up draft.')
  await expect(page.locator('.scan-svg image')).toHaveAttribute('href', `/api/scans/${id(1)}/image`)
  expect(server.errors).toEqual([])
})

test('offline processing preserves both image identities, stops motion and reconnects without resubmitting', async ({ page }) => {
  const server = await fixture(page, { motion: true })
  await upload(page)
  await page.getByRole('button', { name: 'Run inference', exact: true }).click()
  await expect(left(page).locator('.eye-motion video')).toHaveCount(1)
  server.disconnect()
  await expect(left(page)).toContainText('Service unavailable · run status unknown')
  await expect(left(page).locator('.eye-motion video')).toHaveCount(0)
  await expect(left(page).locator('image')).toHaveAttribute('href', `/api/scans/${id(8)}/image`)
  await expect(right(page).locator('.scan-svg image')).toHaveAttribute('href', `/api/scans/${id(2)}/image`)
  server.finish()
  server.reconnect()
  // The active-run poll recovers the connection and removes the manual retry control.
  await expect(page.getByRole('button', { name: 'Reconnect service' })).toHaveCount(0)
  await expect(split(page)).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'RayGuard introduction' })).toHaveCount(0)
  expect(server.writes.filter(item => item.path === '/api/runs')).toHaveLength(1)
  expect(server.errors).toEqual([])
})

test('processing eye respects pause, reduced motion and hidden inspection navigation', async ({ page }) => {
  const server = await fixture(page, { motion: true })
  await upload(page)
  await page.getByRole('button', { name: 'Run inference', exact: true }).click()
  await expect(left(page).locator('.eye-motion video')).toHaveCount(1)
  await navigate(page, 'Source')
  await expect(left(page).locator('.eye-motion video')).toHaveCount(0)
  await page.locator('details.presentation-controls summary').click()
  await page.getByRole('checkbox', { name: 'Pause animations' }).check()
  await navigate(page, 'Inspect')
  await expect(left(page).locator('.eye-motion video')).toHaveCount(0)
  await expect(left(page)).toContainText('Running local inference')
  await navigate(page, 'Source')
  await page.getByRole('checkbox', { name: 'Pause animations' }).uncheck()
  await navigate(page, 'Inspect')
  await expect(left(page).locator('.eye-motion video')).toHaveCount(1)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(left(page).locator('.eye-motion video')).toHaveCount(0)
  await expect(left(page).locator('.eye-motion img')).toBeVisible()
  expect(server.errors).toEqual([])
})

for (const width of [1440, 1366, 390, 320]) {
  test(`processing columns remain readable and accessible at ${width}px in both appearances`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1366 ? 768 : width < 500 ? 844 : 1000 })
    for (const palette of ['onyx', 'onyx-light']) {
      await page.addInitScript(value => localStorage.setItem('rayguard-appearance-v2', JSON.stringify({ palette: value, font: 'instrument-serif' })), palette)
      const server = await fixture(page)
      await expect(page.locator('html')).toHaveAttribute('data-palette', palette)
      server.background()
      await expect(split(page)).toBeVisible()
      const processing = await left(page).boundingBox()
      const result = await right(page).boundingBox()
      if (width >= 1366) {
        expect(processing!.x + processing!.width).toBeLessThanOrEqual(result!.x + 1)
        expect(Math.abs(processing!.y - result!.y)).toBeLessThan(2)
      } else expect(result!.y).toBeGreaterThanOrEqual(processing!.y + processing!.height - 1)
      for (const panel of [left(page), right(page)]) {
        const stage = await panel.locator('.image-stage').boundingBox()
        expect(stage!.width).toBeGreaterThan(200)
        expect(stage!.height).toBeGreaterThan(140)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await noDuplicateIds(page)
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
      await right(page).getByRole('tab', { name: 'Review', exact: true }).click()
      await right(page).getByLabel('Review note').fill('Synthetic responsive review access check.')
      await expect(right(page).getByLabel('Review note')).toBeInViewport()
      await right(page).getByRole('tab', { name: 'Findings', exact: true }).click()
      await page.screenshot({ path: `../output/playwright/processing-split-tests/${palette}-${width}.png`, fullPage: true })
      if (width === 1366) {
        const zoom = left(page).getByRole('button', { name: 'Zoom in', exact: true })
        await zoom.scrollIntoViewIfNeeded()
        await expect(zoom).toBeInViewport()
        await zoom.click()
        await expect(left(page).getByLabel('Zoom level', { exact: true })).toHaveText('125%')
        const fit = left(page).getByRole('button', { name: 'Fit image', exact: true })
        await fit.click()
        await expect(left(page).getByLabel('Zoom level', { exact: true })).toHaveText('100%')
        const saved = page.getByRole('region', { name: 'Saved scan filmstrip', exact: true })
          .getByRole('button', { name: 'View scan synthetic-split-2.png', exact: true })
        await saved.scrollIntoViewIfNeeded()
        await expect(saved).toBeInViewport()
        await expect(saved).toBeEnabled()
      }
      expect(server.errors).toEqual([])
      await page.unroute('**/api/**')
    }
  })
}
