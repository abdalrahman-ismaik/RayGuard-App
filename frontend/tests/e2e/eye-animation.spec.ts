// Media playback is real; scan pixels, API responses and run outcomes are SYNTHETIC.
// These checks provide UI evidence only, not model/scanner performance evidence.
import { expect, test, type Page } from '@playwright/test'
import type { Intake, Run } from '../../src/types'
import { unconfiguredDemo } from './demo-fixture'
import { navigate } from './navigation'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64')
const task = 'iedxray.generic_explosive_detection'
const model = { id: 'synthetic-eye-test', label: 'Synthetic test detector', task, configured: true, reason: null }
const id = (n: number) => n.toString(16).padStart(32, '0')

function completed(n: number): Run {
  const scan = { id: id(n), name: `synthetic-eye-${n}.png`, width: 640, height: 320,
    sha256: 'c'.repeat(64), image_url: `/api/scans/${id(n)}/image`, origin: 'folder' as const }
  return { id: id(n), scan_id: scan.id, scan, state: 'succeeded',
    created_at: `2026-09-26T12:00:0${n}Z`, completed_at: `2026-09-26T12:00:1${n}Z`,
    confidence: 0.25, elapsed_seconds: 1, error: null,
    review: { status: 'unreviewed', note: '', updated_at: null },
    result: { schema_version: '1.0', scan_id: scan.id, status: 'ok', image: { width: 640, height: 320 },
      model: { id: model.id, task, provenance: 'synthetic fixture' },
      run: { id: id(n), provenance: 'synthetic fixture' }, threshold: 0.25, detections: [], error: null } }
}

async function fixture(page: Page, options: { history?: boolean; configured?: boolean; offline?: boolean } = {}) {
  let offline = options.offline ?? false
  const history: Run[] = options.history ? [completed(1)] : []
  const source: Intake = { configured: true, enabled: false, state: 'paused', adapter: 'folder',
    hardware_verified: false, source_label: 'Synthetic export inbox', confidence: 0.25,
    pending_count: 0, received_count: 0, last_received_at: null, error: null, pending: [], issues: [] }
  let uploadGate: Promise<void> | null = null
  let releaseUpload: (() => void) | undefined
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.context().route('**/api/**', async route => {
    if (offline) return route.abort('connectionfailed')
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body })
    if (path === '/api/health') return json({ model: { ...model, configured: options.configured !== false },
      limits: { max_upload_bytes: 20 * 1024 * 1024, max_pixels: 20_000_000 },
      active_run_id: history.find(run => run.state === 'running')?.id ?? null })
    if (path === '/api/demo') return json(unconfiguredDemo)
    if (path === '/api/intake') {
      if (request.method() === 'POST') {
        source.enabled = request.postDataJSON().enabled
        source.state = source.enabled ? 'waiting' : 'paused'
      }
      return json(source)
    }
    if (path.endsWith('/image')) return route.fulfill({ contentType: 'image/png', body: png })
    if (path === '/api/scans') {
      if (uploadGate) await uploadGate
      return json({ ...completed(3).scan, origin: 'upload' }, 201)
    }
    if (path === '/api/runs' && request.method() === 'POST') {
      const next = completed(3)
      next.scan.origin = 'upload'
      history.unshift({ ...next, state: 'running', completed_at: null, elapsed_seconds: null, result: null })
      return json(history[0], 202)
    }
    if (path === '/api/runs') return json({ items: history })
    const run = history.find(item => item.id === path.split('/')[3])
    if (run) return json(run)
    return json({ detail: 'Unknown synthetic route' }, 404)
  })
  return {
    errors,
    disconnect: () => { offline = true },
    reconnect: () => { offline = false },
    holdUpload: () => { uploadGate = new Promise(resolve => { releaseUpload = resolve }) },
    releaseUpload: () => { releaseUpload?.(); uploadGate = null },
    backgroundRun: () => {
      source.enabled = true
      source.state = 'receiving'
      history.unshift({ ...completed(2), state: 'running', completed_at: null, elapsed_seconds: null, result: null })
    },
    complete: () => {
      for (const run of history) if (run.state === 'running') Object.assign(run, completed(Number.parseInt(run.id, 16)))
      source.state = source.enabled ? 'waiting' : 'paused'
    },
  }
}

const intro = (page: Page) => page.getByRole('dialog', { name: 'RayGuard introduction' })

async function openWorkspace(page: Page) {
  await page.goto('/#workspace')
  await page.getByRole('button', { name: 'Skip intro', exact: true }).click()
  await expect(intro(page)).toHaveCount(0)
}

async function presentation(page: Page) {
  await navigate(page, 'Source')
  const controls = page.locator('details.presentation-controls')
  if (await controls.getAttribute('open') === null) await controls.locator('summary').click()
}

async function selectHistory(page: Page) {
  await navigate(page, 'Session')
  await page.getByRole('button', { name: 'View run for synthetic-eye-1.png' }).click()
  await expect(page.getByRole('group', { name: 'X-ray scan: synthetic-eye-1.png' })).toBeVisible()
  await page.getByRole('tab', { name: 'Review', exact: true }).click()
}

test('the packaged eye plays and reveals the workspace without a final hold', async ({ page, baseURL }) => {
  const server = await fixture(page)
  const external: string[] = []
  const appOrigin = new URL(baseURL!).origin
  page.on('request', request => {
    if (new URL(request.url()).origin !== appOrigin && !request.url().startsWith('data:')) external.push(request.url())
  })
  await page.goto('/#workspace')
  await expect(intro(page)).toBeVisible()
  const visibleAt = Date.now()
  await expect(intro(page)).toContainText('Embedded Explosive Detection in Electronic Devices')
  await expect(intro(page)).toContainText('Research preview')
  const video = page.locator('.rayguard-intro video')
  await expect(video).toHaveAttribute('src', '/media/rayguard/eye-intro.mp4')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0.1)
  const metadata = await video.evaluate((element: HTMLVideoElement) => ({ duration: element.duration, width: element.videoWidth, muted: element.muted }))
  expect(metadata.duration).toBeCloseTo(6, 1)
  expect(metadata.width).toBeGreaterThan(0)
  expect(metadata.muted).toBe(true)
  await expect(page.locator('.eye-motion video')).toHaveCount(0)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.ended),
    { timeout: 7500, intervals: [50] }).toBe(true)
  // Only the short exit fade follows the ended event; no frozen-frame delay.
  await expect(intro(page)).toHaveCount(0, { timeout: 1000 })
  expect(Date.now() - visibleAt).toBeGreaterThan(5500)
  await expect(page.locator('#workspace')).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Inspect a scan', exact: true })).toBeVisible()
  expect(external).toEqual([])
  expect(server.errors).toEqual([])
})

test('Skip and Escape work immediately and each fresh reload opens the intro again', async ({ page }) => {
  await fixture(page)
  await openWorkspace(page)
  await expect(page.locator('#workspace')).toBeFocused()
  await page.reload()
  await expect(intro(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Skip intro', exact: true })).toBeFocused()
  expect(await intro(page).evaluate(element => element.matches(':modal'))).toBe(true)
  await page.keyboard.press('Tab')
  // Native dialogs may cycle through browser chrome; the covered workspace stays inert.
  expect(await page.evaluate(() => document.activeElement === document.body || Boolean(document.activeElement?.closest('.rayguard-intro')))).toBe(true)
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Skip intro', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(intro(page)).toHaveCount(0)
  await expect(page.locator('#workspace')).toBeFocused()
  await page.getByRole('button', { name: 'Dataset demo', exact: true }).click()
  await expect(intro(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Upload', exact: true }).click()
  await page.reload()
  await expect(intro(page)).toBeVisible()
  await page.getByRole('button', { name: 'Skip intro', exact: true }).click()
  await expect(page.getByLabel('Upload X-ray image')).toBeEnabled()
  await page.goto('/')
  await page.getByRole('button', { name: 'Skip intro', exact: true }).click()
  await expect(page.locator('#dashboard')).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Your inspection, in focus.', exact: true })).toBeVisible()
  await expect(page.locator('#workspace')).toBeHidden()
})

test('reduced motion enters immediately and requests no video even during actual work', async ({ page }) => {
  const server = await fixture(page)
  const videos: string[] = []
  page.on('request', request => { if (/\.mp4(?:\?|$)/.test(request.url())) videos.push(request.url()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/#workspace')
  await expect(intro(page)).toHaveCount(0)
  await expect(page.getByLabel('Upload X-ray image')).toBeEnabled()
  await page.getByLabel('Upload X-ray image').setInputFiles({ name: 'synthetic-eye-3.png', mimeType: 'image/png', buffer: png })
  await page.getByRole('button', { name: 'Run inference', exact: true }).click()
  await expect(page.locator('.canvas-processing')).toContainText('Running local inference')
  await expect(page.locator('.eye-motion video')).toHaveCount(0)
  expect(videos).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  server.complete()
  await expect(page.getByRole('heading', { name: 'No detections reported' })).toBeVisible()
  await expect(page.getByText(/This is not a safe or benign verdict/)).toBeVisible()
  expect(server.errors).toEqual([])
})

for (const failure of ['missing', 'rejected', 'stalled'] as const) {
  test(`${failure} intro media cannot trap entry to the workspace`, async ({ page }) => {
    const server = await fixture(page)
    if (failure === 'missing') {
      await page.route('**/media/rayguard/eye-intro.mp4', route => route.fulfill({ status: 404, body: '' }))
    } else {
      await page.addInitScript((mode) => {
        HTMLMediaElement.prototype.play = function () {
          if (mode === 'rejected') return Promise.reject(new DOMException('Synthetic autoplay rejection', 'NotAllowedError'))
          this.dispatchEvent(new Event('playing'))
          return Promise.resolve()
        }
      }, failure)
    }
    await page.goto('/#workspace')
    await expect(page.locator('#workspace')).toBeFocused({ timeout: 8000 })
    await expect(intro(page)).toHaveCount(0)
    await expect(page.getByLabel('Upload X-ray image')).toBeEnabled()
    expect(server.errors).toEqual([])
  })
}

test('offline service exposes recovery immediately and reconnect does not replay', async ({ page }) => {
  const server = await fixture(page, { offline: true })
  await page.goto('/#workspace')
  await expect(page.getByRole('button', { name: 'Reconnect service' })).toBeVisible({ timeout: 2500 })
  await expect(intro(page)).toHaveCount(0)
  await expect(page.locator('.eye-motion video')).toHaveCount(0)
  server.reconnect()
  await page.getByRole('button', { name: 'Reconnect service' }).click()
  await expect(page.getByLabel('Upload X-ray image')).toBeEnabled()
  await expect(intro(page)).toHaveCount(0)
  expect(server.errors).toEqual([])
})

test('an unconfigured model exposes its actual state without perpetual loading', async ({ page }) => {
  await fixture(page, { configured: false })
  await openWorkspace(page)
  await expect(page.getByText('Model configuration required before detection.', { exact: false })).toBeVisible()
  await expect(page.locator('.eye-motion video')).toHaveCount(0)
  await expect(page.getByLabel('Upload X-ray image')).toBeEnabled()
})

test('manual replay preserves selected scan, review draft and focus', async ({ page }) => {
  const server = await fixture(page, { history: true })
  await openWorkspace(page)
  await selectHistory(page)
  await page.getByLabel('Review note').fill('Synthetic unsaved review kept across presentation')
  await presentation(page)
  const replay = page.getByRole('button', { name: 'Replay introduction', exact: true })
  await replay.click()
  await expect(intro(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(intro(page)).toHaveCount(0)
  await expect(replay).toBeFocused()
  await navigate(page, 'Inspect')
  await expect(page.getByRole('group', { name: 'X-ray scan: synthetic-eye-1.png' })).toBeVisible()
  await expect(page.getByLabel('Review note')).toHaveValue('Synthetic unsaved review kept across presentation')
  await navigate(page, 'Session')
  await expect(page.getByRole('button', { name: 'View run for synthetic-eye-1.png' })).toBeVisible()
  expect(server.errors).toEqual([])
})

test('one loading eye follows actual upload and run, can pause and stops when results arrive', async ({ page }) => {
  const server = await fixture(page)
  await openWorkspace(page)
  const replay = page.getByRole('button', { name: 'Replay introduction', exact: true })
  await expect(page.locator('.eye-motion video')).toHaveCount(0)
  server.holdUpload()
  await page.getByLabel('Upload X-ray image').setInputFiles({ name: 'synthetic-eye-3.png', mimeType: 'image/png', buffer: png })
  await expect(page.locator('.canvas-processing')).toContainText('Preparing your scan')
  await expect(page.locator('.eye-motion video')).toHaveCount(1)
  await presentation(page)
  await expect(replay).toBeDisabled()
  await navigate(page, 'Inspect')
  server.releaseUpload()
  await expect(page.getByRole('button', { name: 'Run inference', exact: true })).toBeEnabled()
  await expect(page.locator('.eye-motion video')).toHaveCount(0)
  await page.getByRole('button', { name: 'Run inference', exact: true }).click()
  await expect(page.locator('.canvas-processing')).toContainText('Running local inference')
  const loop = page.locator('.eye-motion video')
  await expect(loop).toHaveCount(1)
  await expect(loop).toHaveAttribute('src', '/media/rayguard/eye-loop.mp4')
  await expect.poll(() => loop.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0)
  await presentation(page)
  await expect(replay).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Pause animations' }).check()
  await expect(page.locator('.eye-motion video')).toHaveCount(0)
  await navigate(page, 'Inspect')
  await expect(page.locator('.eye-motion video')).toHaveCount(0)
  await expect(page.locator('.canvas-processing')).toContainText('Running local inference')
  await presentation(page)
  await page.getByRole('checkbox', { name: 'Pause animations' }).uncheck()
  await navigate(page, 'Inspect')
  await expect(page.locator('.eye-motion video')).toHaveCount(1)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.eye-motion video')).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator('.eye-motion video')).toHaveCount(1)
  server.complete()
  await expect(page.getByRole('heading', { name: 'No detections reported' })).toBeVisible()
  await expect(page.locator('.eye-motion video')).toHaveCount(0)
  await presentation(page)
  await expect(replay).toBeEnabled()
  await expect(intro(page)).toHaveCount(0)
  expect(server.errors).toEqual([])
})

test('losing the service during a run stops the eye and exposes uncertain run status', async ({ page }) => {
  const server = await fixture(page)
  await openWorkspace(page)
  await page.getByLabel('Upload X-ray image').setInputFiles({ name: 'synthetic-eye-3.png', mimeType: 'image/png', buffer: png })
  await page.getByRole('button', { name: 'Run inference', exact: true }).click()
  await expect(page.locator('.eye-motion video')).toHaveCount(1)
  server.disconnect()
  await expect(page.getByRole('button', { name: 'Reconnect service' })).toBeVisible()
  await expect(page.locator('.eye-motion video')).toHaveCount(0)
  await expect(page.locator('.canvas-processing')).toContainText('Service unavailable · run status unknown')
  server.complete()
  server.reconnect()
  await page.getByRole('button', { name: 'Reconnect service' }).click()
  await expect(page.getByLabel('Upload X-ray image')).toBeEnabled()
  await expect(intro(page)).toHaveCount(0)
  expect(server.errors).toEqual([])
})

test('held review shows one eye above the separate processing scan and waiting intake does not loop', async ({ page }) => {
  const server = await fixture(page, { history: true })
  await openWorkspace(page)
  await selectHistory(page)
  await page.getByLabel('Review note').fill('Synthetic held review')
  server.backgroundRun()
  await expect(page.locator('#processing-scan-viewer .eye-motion video')).toHaveCount(1)
  await expect(page.getByRole('region', { name: 'Image source and intake' }).locator('.eye-motion video')).toHaveCount(0)
  await expect(page.locator('.eye-motion video')).toHaveCount(1)
  await expect(page.getByRole('group', { name: 'X-ray scan: synthetic-eye-1.png' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Inspecting the scan' })).toHaveCount(0)
  await expect(page.getByLabel('Review note')).toHaveValue('Synthetic held review')
  server.complete()
  await expect(page.getByRole('region', { name: 'Image source and intake' })).toContainText('Waiting for exports')
  await expect(page.locator('.eye-motion video')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeDisabled()
  await presentation(page)
  await expect(page.getByRole('button', { name: 'Replay introduction', exact: true })).toBeEnabled()
  expect(server.errors).toEqual([])
})
