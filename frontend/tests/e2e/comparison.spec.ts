// Synthetic reference boxes, predictions and pixels: UI software checks, not detector evidence.
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { AnnotationComparison, Run } from '../../src/types'
import { unconfiguredDemo } from './demo-fixture'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64')
const task = 'iedxray.generic_explosive_detection'
function record(n = 1, state: Run['state'] = 'succeeded', origin: Run['scan']['origin'] = 'dataset_demo'): Run {
  const id = String(n).padStart(32, '0')
  const scan = { id, name: `synthetic-reference-${n}.png`, width: 640, height: 320,
    sha256: 'c'.repeat(64), image_url: `/api/scans/${id}/image`, origin, source: { dataset: 'IEDXray' as const, split: 'test' as const, index: n } }
  return { id, scan_id: id, scan, state, created_at: `2026-09-26T12:00:0${n}Z`, completed_at: state === 'running' ? null : '2026-09-26T12:01:00Z',
    confidence: .25, elapsed_seconds: state === 'running' ? null : 1,
    review: { status: 'unreviewed', note: '', updated_at: null },
    error: state === 'failed' ? { code: 'synthetic_failure', message: 'Synthetic detector failed.' } : null,
    result: state === 'succeeded' ? { schema_version: '1.0', scan_id: id, status: 'ok', image: { width: 640, height: 320 },
      model: { id: 'synthetic-reference-model', task, provenance: 'synthetic' }, run: { id, provenance: 'synthetic' }, threshold: .25, error: null,
      detections: [{ id: 'synthetic-detection', kind: 'suspicious_region', box_xyxy: [50, 50, 150, 150],
        category: { namespace: task, label: 'Explosive' }, confidence: .8, device_id: null }] } : null }
}

function reference(run: Run, outcome: NonNullable<AnnotationComparison['evaluation']>['outcome'] = 'matched'): AnnotationComparison {
  const matched = outcome === 'matched' ? 1 : 0
  const missed = ['missed', 'mixed'].includes(outcome) ? 1 : 0
  const extra = ['extra', 'mixed'].includes(outcome) ? 1 : 0
  return { schema_version: 'rayguard.annotation-comparison.v1', run_id: run.id, status: 'available', reason: null, task, iou_threshold: .5,
    annotation_source: { name: 'synthetic-reference.json', sha256: 'a'.repeat(64), split: 'test' }, image_id: 1, image_sha256: run.scan.sha256,
    boxes: outcome === 'empty' || outcome === 'extra' ? [] : [{ annotation_id: 10, category_id: 0, label: 'Explosive', box_xyxy: [50, 50, 150, 150] }],
    evaluation: run.state !== 'succeeded' ? null : { outcome, matched, missed, extra,
      matches: matched ? [{ annotation_id: 10, detection_id: 'synthetic-detection', iou: 1 }] : [],
      missed_annotation_ids: missed ? [10] : [], extra_detection_ids: extra ? ['synthetic-detection'] : [] },
    warnings: ['Synthetic annotation limitations remain visible.'] }
}

async function fixture(page: Page, initial: Run[], initialReferences: Record<string, AnnotationComparison>) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const server = { records: initial, references: initialReferences, requests: [] as string[], writes: [] as string[], errors: [] as string[], delayed: null as string | null,
    release: () => {}, failure: false, wrongRun: false, polls: 0 }
  page.on('pageerror', error => server.errors.push(error.message))
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body })
    if (route.request().method() !== 'GET') { server.writes.push(path); return json({}, 409) }
    if (path.endsWith('/image')) return route.fulfill({ contentType: 'image/png', body: png })
    if (path === '/api/health') return json({ model: { id: 'synthetic-reference-model', label: 'Synthetic model', task, configured: true, reason: null },
      active_run_id: server.records.find(run => run.state === 'running')?.id ?? null, limits: { max_upload_bytes: 20_000_000, max_pixels: 20_000_000 } })
    if (path === '/api/runs') { server.polls++; return json({ items: server.records }) }
    if (path === '/api/demo') return json({ ...unconfiguredDemo, configured: true, state: 'ready', total: 20, last_run_id: server.records[0]?.id ?? null })
    if (path === '/api/intake') return json({ configured: false, enabled: false, state: 'unconfigured', adapter: 'folder', hardware_verified: false,
      source_label: 'Synthetic intake', confidence: .25, pending_count: 0, received_count: 0, last_received_at: null, error: null, pending: [], issues: [] })
    const comparisonId = path.match(/^\/api\/runs\/([^/]+)\/comparison$/)?.[1]
    if (comparisonId) {
      server.requests.push(comparisonId)
      if (server.delayed === comparisonId) await new Promise<void>(resolve => { server.release = resolve })
      if (server.failure) return json({ detail: { message: 'Synthetic comparison service unavailable.' } }, 503)
      const payload = server.references[comparisonId]
      return payload ? json(server.wrongRun ? { ...payload, run_id: 'wrong' } : payload) : json({}, 404)
    }
    const run = server.records.find(item => path === `/api/runs/${item.id}`)
    return run ? json(run) : json({}, 404)
  })
  return server
}

const panel = (page: Page) => page.getByRole('region', { name: 'Published annotation comparison', exact: true })

for (const [outcome, label] of [['matched', 'Matched annotations'], ['missed', 'Missed target'], ['extra', 'Extra detection'], ['mixed', 'Mixed result'], ['empty', 'No annotated targets']] as const) {
  test(`published reference reports ${outcome} per image without a safety or accuracy claim`, async ({ page }) => {
    const run = record()
    if (outcome === 'missed' || outcome === 'empty') run.result!.detections = []
    if (outcome === 'mixed') run.result!.detections[0].box_xyxy = [250, 50, 350, 150]
    const comparison = reference(run, outcome)
    const server = await fixture(page, [run], { [run.id]: comparison })
    await page.goto('/#workspace')
    await expect(panel(page).getByText(label, { exact: true })).toBeVisible()
    await expect(panel(page).getByText('Per-image comparison · IoU ≥ 0.50 · saved threshold 25%', { exact: true })).toBeVisible()
    for (const [name, value] of [['Annotated', comparison.boxes.length], ['Matched', comparison.evaluation!.matched], ['Missed', comparison.evaluation!.missed], ['Extra', comparison.evaluation!.extra]]) {
      await expect(panel(page).locator('.comparison-counts > div').filter({ has: page.getByText(String(name), { exact: true }) }).locator('dd')).toHaveText(String(value))
    }
    if (!run.result!.detections.length) await expect(page.getByText('No regions met this run’s 25% threshold. This is not a safe or benign verdict.')).toBeVisible()
    if (outcome === 'empty') await expect(panel(page).getByText('No targets are annotated for this task. This is not a safety verdict.')).toBeVisible()
    await panel(page).getByText('Reference & limits (1)', { exact: true }).click()
    await expect(panel(page).getByText(comparison.warnings[0], { exact: true })).toBeVisible()
    await expect(panel(page).getByText(/not overall model accuracy/)).toBeVisible()
    await expect(panel(page).getByText(comparison.annotation_source!.sha256, { exact: true })).toBeVisible()
    expect(server.writes).toEqual([])
    expect(server.errors).toEqual([])
  })
}

test('reference boxes share image coordinates and zoom but not image filters or model visibility', async ({ page }) => {
  const run = record()
  const server = await fixture(page, [run], { [run.id]: reference(run) })
  await page.goto('/#workspace')
  const box = page.locator('[data-annotation="10"] > rect').first()
  await expect(box).toBeVisible()
  await expect(box).toHaveAttribute('x', '50')
  await expect(box).toHaveAttribute('width', '100')
  const sameTransform = await page.locator('.scan-svg > g').evaluate(group => group.contains(document.querySelector('.annotation-box')) && group.contains(document.querySelector('.detection-box')) && group.contains(document.querySelector('.scan-svg image')))
  expect(sameTransform).toBe(true)
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  const transform = await page.locator('.scan-svg > g').getAttribute('transform')
  expect(transform).toContain('scale(1.25)')
  await page.getByRole('button', { name: 'Invert display', exact: true }).click()
  await expect(page.locator('.scan-svg image')).toHaveAttribute('style', /invert\(1\)/)
  expect(await box.evaluate(element => getComputedStyle(element).filter)).toBe('none')
  await page.getByRole('button', { name: 'Hide detection overlays', exact: true }).click()
  await expect(page.locator('.detection-box')).toHaveCount(0)
  await expect(box).toBeVisible()
  await page.getByRole('button', { name: 'Hide dataset annotations', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.annotation-box')).toHaveCount(0)
  await page.getByRole('button', { name: 'Show detection overlays', exact: true }).click()
  await expect(page.locator('.detection-box')).toBeVisible()
  await expect(page.locator('.scan-svg > g')).toHaveAttribute('transform', transform!)
  expect(server.writes).toEqual([])
})

test('failed, running and unavailable comparisons never report a match', async ({ page }) => {
  for (const kind of ['failed', 'running', 'unavailable'] as const) {
    const run = record(1, kind === 'unavailable' ? 'succeeded' : kind)
    const comparison = reference(run)
    if (kind === 'unavailable') Object.assign(comparison, { status: 'unavailable', reason: 'Synthetic annotation hash mismatch.', evaluation: null, boxes: [] })
    await page.goto('about:blank')
    await page.unroute('**/api/**')
    const server = await fixture(page, [run], { [run.id]: comparison })
    await page.goto('/#workspace')
    if (kind === 'running') {
      await expect(page.locator('#processing-scan-viewer')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'No completed result yet' })).toBeVisible()
      await expect(page.locator('.annotation-box')).toHaveCount(0)
      expect(server.requests).toEqual([])
    } else await expect(panel(page).getByText('Not evaluated', { exact: true })).toBeVisible()
    await expect(panel(page).getByText('Matched annotations', { exact: true })).toHaveCount(0)
    if (kind === 'unavailable') { await expect(panel(page).getByText(comparison.reason!)).toBeVisible(); await expect(page.locator('.annotation-box')).toHaveCount(0) }
    expect(server.writes).toEqual([])
  }
})

test('comparison fetch failures and mismatched response IDs show no reference overlay', async ({ page }) => {
  for (const wrongRun of [false, true]) {
    const run = record()
    await page.goto('about:blank')
    await page.unroute('**/api/**')
    const server = await fixture(page, [run], { [run.id]: reference(run) })
    server.failure = !wrongRun
    server.wrongRun = wrongRun
    await page.goto('/#workspace')
    await expect(panel(page).getByText('Not evaluated', { exact: true })).toBeVisible()
    await expect(panel(page).getByText(wrongRun ? /response does not match this run/ : 'Synthetic comparison service unavailable.')).toBeVisible()
    await expect(page.locator('.annotation-box')).toHaveCount(0)
    expect(server.writes).toEqual([])
  }
})

test('comparison waits for the selected run to finish and stays stable across completed-run polls', async ({ page }) => {
  const run = record(1, 'running')
  const finished = record()
  finished.result!.detections = []
  // The reference endpoint already knows the final result while the run list is stale.
  const server = await fixture(page, [run], { [run.id]: reference(finished, 'missed') })
  await page.goto('/#workspace')
  await expect(page.locator('#processing-scan-viewer')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No completed result yet' })).toBeVisible()
  await expect.poll(() => server.polls).toBeGreaterThanOrEqual(3)
  await expect(panel(page).getByText('Missed target', { exact: true })).toHaveCount(0)
  await expect(panel(page).getByText('Loading reference…', { exact: true })).toHaveCount(0)
  expect(server.requests).toEqual([])
  server.records = [finished]
  await expect(panel(page).getByText('Missed target', { exact: true })).toBeVisible()
  const polls = server.polls
  await expect.poll(() => server.polls).toBeGreaterThanOrEqual(polls + 2)
  await expect(panel(page).getByText('Missed target', { exact: true })).toBeVisible()
  expect(server.requests).toEqual([run.id])
  expect(server.writes).toEqual([])
})

test('a transient comparison failure can be retried for the same sole saved run', async ({ page }) => {
  const run = record()
  const server = await fixture(page, [run], { [run.id]: reference(run) })
  server.failure = true
  await page.goto('/#workspace')
  await expect(panel(page).getByText('Synthetic comparison service unavailable.')).toBeVisible()
  server.failure = false
  await panel(page).getByRole('button', { name: 'Retry reference', exact: true }).click()
  await expect(panel(page).getByText('Matched annotations', { exact: true })).toBeVisible()
  await expect(page.locator('.annotation-box')).toHaveCount(1)
  expect(server.requests).toEqual([run.id, run.id])
  expect(server.writes).toEqual([])
  expect(server.errors).toEqual([])
})

test('changing selected scans immediately hides old boxes and discards late responses', async ({ page }) => {
  const a = record(1), b = record(2), uploaded = record(3, 'succeeded', 'upload'), folder = record(4, 'succeeded', 'folder')
  const server = await fixture(page, [a, b, uploaded, folder], { [a.id]: reference(a), [b.id]: reference(b, 'missed') })
  server.delayed = a.id
  await page.goto('/#workspace')
  await expect.poll(() => server.requests.length).toBe(1)
  await page.getByRole('button', { name: `View scan ${b.scan.name}`, exact: true }).click()
  await expect(panel(page).getByText('Missed target', { exact: true })).toBeVisible()
  server.release()
  await expect(panel(page).getByText('Matched annotations', { exact: true })).toHaveCount(0)
  for (const other of [uploaded, folder]) {
    await page.getByRole('button', { name: `View scan ${other.scan.name}`, exact: true }).click()
    await expect(panel(page)).toHaveCount(0)
    await expect(page.locator('.annotation-box')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /dataset annotations/ })).toHaveCount(0)
  }
  expect(server.requests).toEqual([a.id, b.id])
  expect(server.writes).toEqual([])
})

for (const palette of ['onyx', 'onyx-light']) {
  test(`${palette} reference remains accessible on desktop and 390/320px mobile`, async ({ page }) => {
    const run = record()
    run.result!.detections = []
    const server = await fixture(page, [run], { [run.id]: reference(run, 'missed') })
    await page.addInitScript(value => localStorage.setItem('rayguard-appearance-v2', JSON.stringify({ palette: value, font: 'instrument-serif' })), palette)
    await page.goto('/#workspace')
    await expect(panel(page).getByText('Missed target', { exact: true })).toBeVisible()
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await panel(page).scrollIntoViewIfNeeded()
      await expect(panel(page).getByText('Missed target', { exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    }
    expect(server.writes).toEqual([])
    expect(server.errors).toEqual([])
  })
}
