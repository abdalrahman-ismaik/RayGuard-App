// Synthetic software fixtures only: no scanner, checkpoint or actual predictions.
import { expect, test, type Page } from '@playwright/test'
import type { Intake, Run } from '../../src/types'
import { unconfiguredDemo } from './demo-fixture'
import { navigate } from './navigation'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64')
const task = 'iedxray.generic_explosive_detection'
const model = { id: 'author-yolov10m-generic', label: 'Synthetic detector', task, configured: true, reason: null }
const runId = (n: number) => n.toString(16).padStart(32, '0')

function completed(n: number): Run {
  const id = runId(n)
  const scan = { id, name: `synthetic-arrival-${n}.png`, width: 640, height: 320,
    sha256: 'c'.repeat(64), image_url: `/api/scans/${id}/image`, origin: 'folder' as const,
    received_at: `2026-09-25T12:0${n}:00Z` }
  return { id, scan_id: id, scan, state: 'succeeded', created_at: scan.received_at,
    completed_at: `2026-09-25T12:0${n}:02Z`, confidence: 0.25, elapsed_seconds: 2, error: null,
    review: { status: 'unreviewed', note: '', updated_at: null },
    result: { schema_version: '1.0', scan_id: id, status: 'ok', image: { width: 640, height: 320 },
      model: { id: model.id, task, provenance: 'sha256:' + 'd'.repeat(64) },
      run: { id, provenance: 'manifest.json' }, threshold: 0.25, error: null,
      detections: [{ id: `region-${n}`, kind: 'suspicious_region', box_xyxy: [100, 60, 200, 160],
        category: { namespace: task, label: 'Explosive' }, confidence: 0.9, device_id: null }] } }
}

async function receiver(page: Page, initialOrigin: 'folder' | 'upload' = 'folder') {
  const history = [completed(1)]
  history[0].scan.origin = initialOrigin
  const source: Intake = { configured: true, enabled: false, state: 'paused', adapter: 'folder',
    hardware_verified: false, source_label: 'Synthetic export inbox', confidence: 0.25,
    pending_count: 0, received_count: 0, last_received_at: null, error: null, pending: [], issues: [] }
  let failStart = false
  let delayedReview: Promise<void> | null = null
  let releaseReview: (() => void) | null = null
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.context().route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body })
    if (path === '/api/demo') return json(unconfiguredDemo)
    if (path === '/api/health') return json({ model,
      limits: { max_upload_bytes: 20 * 1024 * 1024, max_pixels: 20_000_000 }, active_run_id: null })
    if (path.endsWith('/image')) return route.fulfill({ contentType: 'image/png', body: png })
    if (path === '/api/intake') {
      if (request.method() === 'POST') {
        const value = request.postDataJSON()
        source.enabled = value.enabled && !failStart
        source.confidence = value.confidence
        source.state = failStart ? 'error' : source.enabled ? 'waiting' : 'paused'
        source.error = failStart ? { code: 'source_unavailable', message: 'The export folder is unavailable.' } : null
      }
      return json(source)
    }
    if (path === '/api/runs') return json({ items: history })
    const id = path.split('/')[3]
    const run = history.find(item => item.id === id)
    if (!run) return json({ detail: { code: 'run_not_found', message: 'Run missing' } }, 404)
    if (path.endsWith('/review')) {
      if (delayedReview) await delayedReview
      run.review = { ...request.postDataJSON(), updated_at: '2026-09-25T12:10:00Z' }
      return json(run)
    }
    return json(run)
  })
  return {
    errors,
    failStart: (value: boolean) => { failStart = value },
    queue: (n: number) => {
      source.pending.push({ id: runId(n), scan: completed(n).scan, state: 'queued' })
      source.pending_count = source.pending.length
      source.received_count++
      source.last_received_at = completed(n).scan.received_at!
      source.state = 'receiving'
    },
    complete: (n: number) => {
      history.unshift(completed(n))
      source.pending = source.pending.filter(item => item.id !== runId(n))
      source.pending_count = source.pending.length
      source.state = source.enabled ? 'waiting' : 'paused'
    },
    backpressure: () => {
      source.state = 'backpressure'
      source.error = { code: 'queue_full', message: 'Queue full; waiting for inference to free a slot.' }
    },
    delayReview: () => { delayedReview = new Promise(resolve => { releaseReview = resolve }) },
    releaseReview: () => { releaseReview?.(); delayedReview = null },
  }
}

async function start(page: Page) {
  await page.goto('/#workspace')
  await section(page, 'Source')
  await page.getByRole('button', { name: 'Start intake', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Image source and intake' }).getByText('Waiting for exports', { exact: true })).toBeVisible()
  await section(page, 'Inspect')
  await expect(page.getByRole('button', { name: 'Pause intake', exact: true })).toBeVisible()
}

async function section(page: Page, name: 'Inspect' | 'Session' | 'Source') {
  await navigate(page, name)
}

async function openHistory(page: Page) {
  await section(page, 'Session')
  await expect(page.getByRole('region', { name: 'Session history', exact: true })).toBeVisible()
}

test('incoming queue advances automatically and pause unlocks manual intake', async ({ page }) => {
  const server = await receiver(page)
  await start(page)
  await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeDisabled()
  await expect(page.getByText(/Scanner connection unverified/)).toBeVisible()
  server.queue(2)
  await openHistory(page)
  await expect(page.getByRole('list', { name: 'Queued scans' })).toContainText('synthetic-arrival-2.png')
  await section(page, 'Inspect')
  server.complete(2)
  await expect(page.getByRole('group', { name: 'X-ray scan: synthetic-arrival-2.png' })).toBeVisible()
  await expect(page.locator('.detection-box')).toHaveCount(1)
  await page.getByRole('button', { name: 'Pause intake', exact: true }).click()
  await page.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(page.getByLabel('Upload X-ray image')).toBeEnabled()
  expect(server.errors).toEqual([])
})

test('history selection stays fixed until operator explicitly follows latest', async ({ page }) => {
  const server = await receiver(page, 'upload')
  await start(page)
  await openHistory(page)
  await page.getByRole('button', { name: 'View run for synthetic-arrival-1.png' }).click()
  await expect(page.getByLabel('Follow latest')).not.toBeChecked()
  server.queue(2)
  server.complete(2)
  await expect(page.locator('.newer-count')).toContainText('1 new')
  await expect(page.getByRole('group', { name: 'X-ray scan: synthetic-arrival-1.png' })).toBeVisible()
  await page.getByRole('button', { name: 'Pause intake', exact: true }).click()
  await expect(page.getByLabel('Follow latest')).toBeVisible()
  await expect(page.locator('.newer-count')).toContainText('1 new')
  await page.getByLabel('Follow latest').check()
  await expect(page.getByRole('group', { name: 'X-ray scan: synthetic-arrival-2.png' })).toBeVisible()
  expect(server.errors).toEqual([])
})

test('typing review holds current scan and a late save cannot select an older run', async ({ page }) => {
  const server = await receiver(page)
  await start(page)
  await expect(page.getByRole('group', { name: 'X-ray scan: synthetic-arrival-1.png' })).toBeVisible()
  await page.getByRole('tab', { name: 'Review', exact: true }).click()
  await expect(page.getByLabel('Review note')).toBeVisible()
  await page.getByLabel('Review note').fill('Synthetic unsaved observation')
  await expect(page.getByLabel('Follow latest')).not.toBeChecked()
  await page.getByRole('tab', { name: 'Provenance', exact: true }).click()
  await section(page, 'Session')
  await section(page, 'Source')
  await section(page, 'Inspect')
  await page.getByRole('tab', { name: 'Review', exact: true }).click()
  await expect(page.getByLabel('Review note')).toHaveValue('Synthetic unsaved observation')
  server.queue(2)
  server.complete(2)
  await expect(page.locator('.newer-count')).toContainText('1 new')
  await expect(page.getByLabel('Review note')).toHaveValue('Synthetic unsaved observation')
  await expect(page.getByRole('group', { name: 'X-ray scan: synthetic-arrival-1.png' })).toBeVisible()
  server.delayReview()
  await page.getByRole('button', { name: 'Mark reviewed' }).click()
  await page.getByLabel('Follow latest').check()
  await expect(page.getByRole('group', { name: 'X-ray scan: synthetic-arrival-2.png' })).toBeVisible()
  server.releaseReview()
  await expect(page.getByRole('button', { name: 'Mark reviewed' })).toBeEnabled()
  await expect(page.getByRole('group', { name: 'X-ray scan: synthetic-arrival-2.png' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Operator review' })).toContainText('Unreviewed')
  expect(server.errors).toEqual([])
})

test('unavailable folder is visible and retry starts reception', async ({ page }) => {
  const server = await receiver(page)
  server.failStart(true)
  await page.goto('/#workspace')
  await section(page, 'Source')
  await page.getByRole('button', { name: 'Start intake', exact: true }).click()
  await section(page, 'Inspect')
  await expect(page.getByRole('alert')).toContainText('folder is unavailable')
  await expect(page.getByLabel('Upload X-ray image')).toBeEnabled()
  server.failStart(false)
  await page.getByRole('button', { name: 'Start intake', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause intake', exact: true })).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('queue backpressure remains an active receiver that can be paused', async ({ page }) => {
  const server = await receiver(page)
  await start(page)
  server.queue(2)
  server.backpressure()
  await expect(page.getByRole('region', { name: 'Image source and intake' })).toContainText('Queue full')
  await expect(page.getByRole('button', { name: 'Pause intake', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Pause intake', exact: true }).click()
  await openHistory(page)
  await expect(page.getByRole('list', { name: 'Queued scans' })).toContainText('synthetic-arrival-2.png')
})

test('keyboard image adjustment holds the scan and resets when following a new scan', async ({ page }) => {
  const server = await receiver(page)
  await start(page)
  await expect(page.getByRole('group', { name: 'X-ray scan: synthetic-arrival-1.png' })).toBeVisible()
  await expect(page.getByLabel('Follow latest')).toBeChecked()
  const brightness = page.getByRole('slider', { name: /^Brightness/ })
  await expect(brightness).toHaveValue('100')
  await brightness.focus()
  await page.keyboard.press('ArrowRight')
  await expect(brightness).toHaveValue('101')
  await expect(page.getByLabel('Follow latest')).not.toBeChecked()
  server.queue(2)
  server.complete(2)
  await expect(page.locator('.newer-count')).toContainText('1 new')
  await expect(page.getByRole('group', { name: 'X-ray scan: synthetic-arrival-1.png' })).toBeVisible()
  await expect(page.locator('.scan-svg image')).toHaveAttribute('style', /brightness\(101%\)/)
  await page.getByLabel('Follow latest').check()
  await expect(page.getByRole('group', { name: 'X-ray scan: synthetic-arrival-2.png' })).toBeVisible()
  await expect(brightness).toHaveValue('100')
  expect(server.errors).toEqual([])
})
