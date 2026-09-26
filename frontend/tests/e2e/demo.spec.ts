// Synthetic HTTP/pixel fixtures only. Actual dataset inference is checked separately.
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { DatasetDemo, DemoAction, Run } from '../../src/types'
import { unconfiguredDemo } from './demo-fixture'
import { navigate } from './navigation'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64')
const task = 'iedxray.generic_explosive_detection'
const model = { id: 'synthetic-model', label: 'Synthetic detector', task, configured: true, reason: null }
const name = (index: number) => `synthetic-test-${index + 1}.png`

async function replay(page: Page, configured = true) {
  const demo: DatasetDemo = { ...unconfiguredDemo, configured, state: configured ? 'ready' : 'unconfigured',
    total: configured ? 8 : 0, next_name: configured ? name(0) : null }
  const history: Run[] = []
  const actions: DemoAction[] = []
  const external: string[] = []
  let reject = false
  page.on('request', request => { if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)) external.push(request.url()) })
  await page.context().route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body })
    if (path === '/api/health') return json({ model, limits: { max_upload_bytes: 20_000_000, max_pixels: 20_000_000 }, active_run_id: history.find(run => run.state === 'running')?.id ?? null })
    if (path === '/api/intake') return json({ configured: false, enabled: false, state: 'unconfigured', adapter: 'folder', hardware_verified: false,
      source_label: 'Export folder', confidence: 0.25, pending_count: 0, received_count: 0, last_received_at: null, error: null, pending: [], issues: [] })
    if (path === '/api/demo') {
      if (request.method() === 'POST') {
        const action = request.postDataJSON() as DemoAction
        actions.push(action)
        if (reject) return json({ detail: { code: 'demo_unavailable', message: 'The test dataset is unavailable. Check the local dataset link and retry.' } }, 409)
        if (action.action === 'start') {
          demo.cursor = action.start_index ?? demo.cursor
          demo.batch_total = Math.min(action.count ?? 3, demo.total - demo.cursor)
          demo.completed_count = 0
          demo.confidence = action.confidence ?? demo.confidence
        }
        demo.enabled = action.action !== 'pause'
        demo.state = demo.enabled ? 'running' : 'paused'
        demo.error = null
      }
      return json(demo)
    }
    if (path.endsWith('/image')) return route.fulfill({ contentType: 'image/png', body: png })
    if (path === '/api/runs') return json({ items: [...history].reverse() })
    const run = history.find(run => run.id === path.split('/')[3])
    if (!run) return json({ detail: { code: 'run_not_found', message: 'Run unavailable' } }, 404)
    if (path.endsWith('/review')) run.review = { ...request.postDataJSON(), updated_at: '2026-09-25T12:10:00Z' }
    return json(run)
  })
  return {
    demo, history, actions, external,
    reject: (value: boolean) => { reject = value },
    complete: (empty = false) => {
      const index = demo.cursor
      const id = (history.length + 1).toString(16).padStart(32, '0')
      const scan = { id, name: name(index), width: 640, height: 320, sha256: 'c'.repeat(64), image_url: `/api/scans/${id}/image`,
        origin: 'dataset_demo' as const, source: { dataset: 'IEDXray' as const, split: 'test' as const, index } }
      history.push({ id, scan_id: id, scan, state: 'succeeded', created_at: `2026-09-25T12:00:${String(history.length).padStart(2, '0')}Z`,
        completed_at: '2026-09-25T12:01:00Z', confidence: demo.confidence, elapsed_seconds: 2, error: null,
        review: { status: 'unreviewed', note: '', updated_at: null },
        result: { schema_version: '1.0', scan_id: id, status: 'ok', image: { width: 640, height: 320 },
          model: { id: model.id, task, provenance: 'synthetic' }, run: { id, provenance: 'synthetic' }, threshold: demo.confidence, error: null,
          detections: empty ? [] : [{ id: `region-${index}`, kind: 'suspicious_region', box_xyxy: [10, 20, 200, 220],
            category: { namespace: task, label: 'Explosive' }, confidence: 0.9, device_id: null }] } })
      demo.current_name = scan.name
      demo.last_run_id = id
      demo.cursor++
      demo.completed_count++
      demo.next_name = demo.cursor < demo.total ? name(demo.cursor) : null
      if (demo.completed_count === demo.batch_total) { demo.enabled = false; demo.state = 'completed' }
    },
  }
}

async function chooseDemo(page: Page) {
  await page.goto('/#workspace')
  await page.getByRole('button', { name: 'Dataset demo', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Dataset replay' })).toBeVisible()
}

test('dataset source is explicit, finite and never starts automatically', async ({ page }) => {
  const server = await replay(page)
  await page.setViewportSize({ width: 1366, height: 768 })
  await chooseDemo(page)
  await expect(page.getByText('Recorded images, fresh model inference.', { exact: false })).toBeVisible()
  await expect(page.locator('details.replay-settings')).not.toHaveAttribute('open', '')
  await page.getByRole('tab', { name: 'Provenance', exact: true }).click()
  await page.getByRole('tab', { name: 'Findings', exact: true }).click()
  await expect(page.getByLabel('Follow latest')).toBeChecked()
  expect(server.actions).toEqual([])
  await page.getByRole('button', { name: 'Start demo', exact: true }).click()
  expect(server.actions).toEqual([{ action: 'start', start_index: 0, count: 3, confidence: 0.25 }])
  await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeDisabled()
  server.complete(true)
  await expect(page.getByRole('group', { name: `X-ray scan: ${name(0)}` })).toBeVisible()
  expect((await page.locator('.image-stage').boundingBox())!.height).toBeGreaterThanOrEqual(330)
  await expect(page.locator('.canvas-title')).toContainText(name(0))
  await expect(page.getByText('No detections reported')).toBeVisible()
  await expect(page.getByText(/not a safe or benign verdict/)).toBeVisible()
  await expect(page.locator('.demo-progress')).toContainText('1 / 3 completed')
  server.complete()
  server.complete()
  await expect(page.locator('.demo-progress')).toContainText('Batch completed')
  await expect(page.locator('.demo-progress')).toContainText('3 / 3 completed')
  await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeEnabled()
  await navigate(page, 'Session')
  await expect(page.getByRole('cell', { name: 'Dataset demo', exact: true })).toHaveCount(3)
  expect(server.external).toEqual([])
})

test('pause and resume retain threshold, selection and unsaved review while new results arrive', async ({ page }) => {
  const server = await replay(page)
  await chooseDemo(page)
  await page.getByRole('button', { name: 'Start demo', exact: true }).click()
  server.complete()
  await expect(page.getByRole('group', { name: `X-ray scan: ${name(0)}` })).toBeVisible()
  await page.getByRole('tab', { name: 'Review', exact: true }).click()
  await expect(page.getByLabel('Review note')).toBeVisible()
  await page.getByLabel('Review note').fill('Synthetic unsaved review')
  await expect(page.getByLabel('Follow latest')).not.toBeChecked()
  await page.getByRole('button', { name: 'Pause demo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Resume demo', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Resume demo', exact: true }).click()
  expect(server.actions.slice(-2)).toEqual([{ action: 'pause' }, { action: 'resume' }])
  server.complete()
  await expect(page.locator('.newer-count')).toHaveText('1 new')
  await expect(page.getByLabel('Review note')).toHaveValue('Synthetic unsaved review')
  await expect(page.getByRole('group', { name: `X-ray scan: ${name(0)}` })).toBeVisible()
  await page.getByRole('button', { name: 'Pause demo', exact: true }).click()
  await page.getByLabel('Follow latest').check()
  await expect(page.getByRole('group', { name: `X-ray scan: ${name(1)}` })).toBeVisible()
  await expect(page.locator('.canvas-title')).toContainText(name(1))
  await page.reload()
  await expect(page.getByRole('button', { name: 'Dataset demo', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Resume demo', exact: true })).toBeEnabled()
  await expect(page.locator('.demo-progress')).toContainText('2 / 3 completed')
  expect(server.actions).toHaveLength(4)
})

test('replay settings send a zero-based index; service errors stay visible and permit retry', async ({ page }) => {
  const server = await replay(page)
  await chooseDemo(page)
  await page.locator('details.replay-settings > summary').click()
  await page.getByLabel('Start at image').fill('4')
  await page.getByLabel('Images per batch').selectOption('1')
  await page.locator('details.replay-settings > summary').click()
  server.reject(true)
  await page.getByRole('button', { name: 'Start demo', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('test dataset is unavailable')
  expect(server.actions[0]).toEqual({ action: 'start', start_index: 3, count: 1, confidence: 0.25 })
  await expect(page.locator('details.replay-settings')).not.toHaveAttribute('open', '')
  server.reject(false)
  await page.getByRole('button', { name: 'Start demo', exact: true }).click()
  server.complete()
  await expect(page.getByRole('group', { name: `X-ray scan: ${name(3)}` })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('unlinked dataset explains setup without enabling a demo', async ({ page }) => {
  const server = await replay(page, false)
  await chooseDemo(page)
  await expect(page.getByRole('button', { name: 'Start demo', exact: true })).toBeDisabled()
  await expect(page.getByText('Link the local test images in the app configuration to begin.')).toBeVisible()
  expect(server.actions).toEqual([])
})

test('inference failure keeps the failed index and exposes an explicit retry', async ({ page }) => {
  const server = await replay(page)
  await chooseDemo(page)
  await page.getByRole('button', { name: 'Start demo', exact: true }).click()
  server.demo.enabled = false
  server.demo.state = 'error'
  server.demo.error = { code: 'inference_failed', message: 'Synthetic inference failed. Start again to retry this image.' }
  await expect(page.getByRole('alert')).toContainText('Synthetic inference failed')
  await expect(page.getByRole('button', { name: 'Start demo', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Start demo', exact: true }).click()
  expect(server.actions[1]).toEqual({ action: 'start', start_index: 0, count: 3, confidence: 0.25 })
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('dataset controls remain accessible in dark and light palettes and narrow layouts', async ({ page }) => {
  await replay(page)
  await chooseDemo(page)
  for (const palette of ['Onyx', 'Daylight']) {
    await page.getByText('Appearance', { exact: true }).click()
    await page.getByRole('radio', { name: palette, exact: true }).check()
    await page.getByText('Appearance', { exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-palette', palette.toLowerCase())
    await expect(page.locator('html')).toHaveAttribute('data-theme', palette === 'Onyx' ? 'dark' : 'light')
    await expect(page.getByRole('button', { name: 'Start demo', exact: true })).toBeVisible()
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(result.violations).toEqual([])
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(page.getByLabel('Follow latest')).toBeVisible()
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  }
})
