// Synthetic API and pixel fixtures: these checks do not verify a model or GPU.
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { DatasetDemo, Health, Intake, ModelRuntime, Run, Scan } from '../../src/types'
import { unconfiguredDemo } from './demo-fixture'
import { navigate } from './navigation'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64')
const task = 'iedxray.generic_explosive_detection'
const scan: Scan = { id: 'a'.repeat(32), name: 'synthetic-runtime-check.png', width: 640, height: 320,
  sha256: 'c'.repeat(64), image_url: '/api/scans/synthetic/image' }
const pending: ModelRuntime = { policy: 'auto', state: 'verification_required', ready: false,
  selected_device: 'cuda:0', profile: 'synthetic-cuda-profile', device_name: 'Synthetic GPU',
  reason: 'GPU runtime probe passed. Verify the model with an authorized image.',
  verification_scan_id: null, error: null, can_verify: true, model_verified: false, restart_required: false }
const ready: ModelRuntime = { ...pending, state: 'ready', ready: true, model_verified: true,
  can_verify: false, reason: 'Model execution verified. Detection accuracy has not been measured.' }

async function fixture(page: Page, runtime: ModelRuntime = pending) {
  const state = {
    runtime: { ...runtime }, rejected: false,
    actions: [] as { path: string; body: unknown }[], history: [] as Run[],
    demo: { ...unconfiguredDemo, configured: true, state: 'ready', total: 8, next_name: 'synthetic-replay.png' } as DatasetDemo,
    intake: { configured: true, enabled: false, state: 'paused', adapter: 'folder', hardware_verified: false,
      source_label: 'Synthetic export folder', confidence: 0.25, pending_count: 0, received_count: 0,
      last_received_at: null, error: null, pending: [], issues: [] } as Intake,
  }
  await page.context().route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body })
    if (request.method() !== 'GET' && path !== '/api/scans') state.actions.push({ path, body: request.postDataJSON() })
    if (path === '/api/health') return json({ model: { id: 'synthetic-model', label: 'Synthetic detector', task, configured: true, reason: null },
      limits: { max_upload_bytes: 20_000_000, max_pixels: 20_000_000 }, active_run_id: null, runtime: state.runtime } satisfies Health)
    if (path === '/api/runtime/verify') {
      if (state.rejected) return json({ detail: { code: 'verification_rejected', message: 'Synthetic verification request failed. Retry the check.' } }, 409)
      state.runtime = { ...state.runtime, state: 'verifying', ready: false, can_verify: false, verification_scan_id: scan.id }
      return json(state.runtime, 202)
    }
    if (path === '/api/demo') {
      if (request.method() === 'POST') { state.demo.enabled = false; state.demo.state = 'paused' }
      return json(state.demo)
    }
    if (path === '/api/intake') {
      if (request.method() === 'POST') { state.intake.enabled = false; state.intake.state = 'paused' }
      return json(state.intake)
    }
    if (path.endsWith('/image')) return route.fulfill({ contentType: 'image/png', body: png })
    if (path === '/api/scans') return json(scan, 201)
    if (path === '/api/runs' && request.method() === 'GET') return json({ items: state.history })
    if (path.endsWith('/comparison')) return json({ schema_version: 'rayguard.annotation-comparison.v1', run_id: state.history[0]?.id,
      status: 'unavailable', reason: 'Synthetic upload has no annotation match.', task, iou_threshold: 0.5,
      annotation_source: null, image_id: null, image_sha256: null, boxes: [], evaluation: null, warnings: [] })
    return json({ detail: 'Unexpected synthetic request' }, 404)
  })
  return state
}

async function upload(page: Page) {
  await page.getByRole('button', { name: 'Choose a scan', exact: true }).waitFor()
  await expect(page.getByRole('button', { name: 'Choose a scan', exact: true })).toBeEnabled()
  await page.getByLabel('Upload X-ray image').setInputFiles({ name: scan.name, mimeType: 'image/png', buffer: png })
  await expect(page.getByRole('button', { name: 'Run inference', exact: true })).toBeVisible()
}

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }) })

for (const state of ['checking', 'verification_required', 'unavailable'] as const) {
  test(`${state} blocks manual, replay and intake starts while keeping upload available`, async ({ page }) => {
    const f = await fixture(page, { ...pending, state, can_verify: state === 'verification_required' })
    await page.goto('/#workspace')
    await upload(page)
    await expect(page.getByRole('button', { name: 'Run inference', exact: true })).toBeDisabled()
    await navigate(page, 'Source')
    await expect(page.getByRole('button', { name: 'Start intake', exact: true })).toBeDisabled()
    await navigate(page, 'Inspect')
    await page.getByRole('button', { name: 'Dataset demo', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Start demo', exact: true })).toBeDisabled()
    expect(f.actions).toEqual([])
  })
}

test('verification waits for health readiness and never starts an ordinary run automatically', async ({ page }) => {
  const f = await fixture(page)
  await page.goto('/#source')
  const runtime = page.getByRole('region', { name: 'Model runtime' })
  await expect(runtime.getByRole('button', { name: 'Verify with this scan' })).toBeDisabled()
  await navigate(page, 'Inspect')
  await upload(page)
  await navigate(page, 'Source')
  await runtime.getByRole('button', { name: 'Verify with this scan' }).click()
  await expect(runtime.getByRole('button', { name: 'Verifying model…' })).toBeDisabled()
  await expect(runtime).toContainText('This does not measure detection accuracy.')
  await expect(page.getByRole('button', { name: 'Start intake', exact: true })).toBeDisabled()
  await navigate(page, 'Inspect')
  await expect(page.getByRole('button', { name: 'Run inference', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Replace scan', exact: true })).toBeDisabled()
  f.runtime = { ...ready, verification_scan_id: scan.id }
  await expect(page.getByRole('button', { name: 'Run inference', exact: true })).toBeEnabled()
  expect(f.actions).toEqual([{ path: '/api/runtime/verify', body: { scan_id: scan.id } }])
  await expect(page.locator('.workspace-footer')).toContainText('0 session runs')
  await navigate(page, 'Source')
  await expect(runtime.getByRole('status')).toHaveText('GPU ready: Synthetic GPU')
})

test('a rejected verification request preserves the scan and allows an explicit retry', async ({ page }) => {
  const f = await fixture(page)
  f.rejected = true
  await page.goto('/#workspace')
  await upload(page)
  await navigate(page, 'Source')
  const verify = page.getByRole('button', { name: 'Verify with this scan' })
  await verify.click()
  await expect(page.getByRole('alert')).toContainText('Synthetic verification request failed')
  await expect(verify).toBeEnabled()
  await expect(page.getByRole('region', { name: 'Model runtime' })).toContainText(scan.name)
  f.rejected = false
  await verify.click()
  await expect(page.getByRole('button', { name: 'Verifying model…' })).toBeDisabled()
  expect(f.actions).toEqual(Array.from({ length: 2 }, () => ({ path: '/api/runtime/verify', body: { scan_id: scan.id } })))
})

test('Auto CPU fallback reports its reason without claiming verified GPU execution', async ({ page }) => {
  await fixture(page, { ...ready, selected_device: 'cpu', device_name: null, profile: 'synthetic-cpu-profile', model_verified: false,
    reason: 'Synthetic GPU check failed; Auto selected CPU. Model compatibility is checked on each run.' })
  await page.goto('/#workspace')
  await upload(page)
  await expect(page.getByRole('button', { name: 'Run inference', exact: true })).toBeEnabled()
  await navigate(page, 'Source')
  const runtime = page.getByRole('region', { name: 'Model runtime' })
  await expect(runtime.getByRole('status')).toHaveText('CPU configured')
  await expect(runtime).toContainText('Auto selected CPU')
  await runtime.getByText('Runtime details & recovery', { exact: true }).click()
  await expect(runtime.locator('dd').last()).toHaveText('Not verified')
})

for (const source of ['demo', 'intake'] as const) {
  test(`runtime failure leaves active ${source} pause available but blocks resume`, async ({ page }) => {
    const f = await fixture(page, { ...pending, state: 'unavailable', can_verify: false })
    if (source === 'demo') Object.assign(f.demo, { enabled: true, state: 'running', batch_total: 3, completed_count: 1 })
    else Object.assign(f.intake, { enabled: true, state: 'waiting' })
    await page.goto('/#workspace')
    const pause = page.getByRole('button', { name: source === 'demo' ? 'Pause demo' : 'Pause intake', exact: true })
    await expect(pause).toBeEnabled()
    await pause.click()
    await expect(page.getByRole('button', { name: source === 'demo' ? 'Resume demo' : 'Start intake', exact: true })).toBeDisabled()
    expect(f.actions).toEqual([{ path: `/api/${source}`, body: source === 'demo' ? { action: 'pause' } : { enabled: false, confidence: 0.25 } }])
  })
}

test('restart required blocks starts even when the last readiness value was true', async ({ page }) => {
  const f = await fixture(page, { ...ready, restart_required: true, reason: 'Runtime identity changed. Restart required.' })
  await page.goto('/#workspace')
  await upload(page)
  await expect(page.getByRole('button', { name: 'Run inference', exact: true })).toBeDisabled()
  await navigate(page, 'Source')
  await expect(page.getByRole('region', { name: 'Model runtime' })).toContainText('Restart the service before running inference.')
  expect(f.actions).toEqual([])
})

test('execution provenance belongs to the historical run, with missing evidence explicit', async ({ page }) => {
  const f = await fixture(page, ready)
  const run: Run = { id: 'b'.repeat(32), scan_id: scan.id, scan, state: 'succeeded',
    created_at: '2026-09-26T12:00:00Z', completed_at: '2026-09-26T12:00:03Z', confidence: 0.25,
    elapsed_seconds: 3, error: null, result: { schema_version: '1.0', scan_id: scan.id, status: 'ok',
      image: { width: 640, height: 320 }, model: { id: 'synthetic-model', task, provenance: 'Synthetic fixture' },
      run: { id: 'b'.repeat(32), provenance: 'Synthetic fixture' }, threshold: 0.25, detections: [], error: null },
    execution: { schema_version: 'rayguard.execution.v1', policy: 'cpu', profile: 'synthetic-old-profile', requested_device: 'cpu',
      actual_device: 'cpu', device_name: 'Synthetic older CPU', precision: 'float32', python: '3.11.synthetic', torch: '2.5.synthetic',
      torchvision: '0.20.synthetic', cuda: null, cudnn: null, backend: 'cpu' } }
  f.history = [run]
  await page.goto('/#workspace')
  await page.getByRole('tab', { name: 'Provenance', exact: true }).click()
  const execution = page.getByRole('region', { name: 'Execution device' })
  await expect(execution).toContainText('Synthetic older CPU')
  await expect(execution).toContainText('float32')
  await expect(execution).not.toContainText('Synthetic GPU')
  f.history = [{ ...run, execution: undefined }]
  await expect(execution).toHaveText('ExecutionNot recorded for this run.')
  await expect(page.getByRole('button', { name: 'Export run JSON' })).toBeEnabled()
})

test('pending runtime remains usable and accessible on a narrow screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await fixture(page)
  await page.goto('/#source')
  const runtime = page.getByRole('region', { name: 'Model runtime' })
  await expect(runtime.getByRole('status')).toHaveText('Model check pending')
  await runtime.getByText('Runtime details & recovery', { exact: true }).click()
  await expect(runtime.getByRole('button', { name: 'Verify with this scan' })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await runtime.screenshot({ path: testInfo.outputPath('runtime-pending-mobile.png') })
})
