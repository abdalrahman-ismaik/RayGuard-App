// Synthetic service and pixel fixtures. These tests do not restart a real service or run a model.
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Health, Intake, ModelRuntime, RuntimeDeviceChoices } from '../../src/types'
import { unconfiguredDemo } from './demo-fixture'
import { navigate } from './navigation'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64')
const choices: RuntimeDeviceChoices = {
  options: [{ device: 'cpu', kind: 'cpu', name: 'System processor', selectable: true, reason: null },
    { device: 'cuda:0', kind: 'gpu', name: 'Synthetic NVIDIA GPU', selectable: true, reason: 'Compatible runtime detected; model verification is separate.' }],
  default_device: 'cuda:0', saved_device: null, can_save: true, can_restart: true, restart_block_reason: null, restarting: false,
}
const runtime: ModelRuntime = { policy: 'cpu', state: 'ready', ready: true, selected_device: 'cpu', profile: 'synthetic-cpu',
  device_name: null, reason: 'CPU configured; model compatibility is checked on each run.', verification_scan_id: null,
  error: null, can_verify: false, model_verified: false, restart_required: false, choices }

async function fixture(page: Page) {
  const f = {
    health: { model: { id: 'synthetic-device-test', label: 'Synthetic detector', task: 'iedxray.generic_explosive_detection', configured: true, reason: null },
      limits: { max_upload_bytes: 20_000_000, max_pixels: 20_000_000 }, active_run_id: null,
      runtime: structuredClone(runtime), service_instance_id: 'synthetic-instance-1' } as Health,
    intake: { configured: true, enabled: false, state: 'paused', adapter: 'folder', hardware_verified: false,
      source_label: 'Synthetic folder', confidence: .25, pending_count: 0, received_count: 0, last_received_at: null,
      error: null, pending: [], issues: [] } as Intake,
    writes: [] as { path: string; body: unknown }[], healthReads: 0, documents: 0,
    response: 'normal' as 'normal' | 'fast' | 'lost' | 'reject' | 'network',
    completeRestart(device = 'cuda:0', state: ModelRuntime['state'] = 'verification_required') {
      f.health.service_instance_id = 'synthetic-instance-2'
      f.health.runtime = { ...f.health.runtime!, policy: device, state, ready: state === 'ready',
        selected_device: state === 'checking' ? null : device, device_name: device.startsWith('cuda:') ? 'Synthetic NVIDIA GPU' : null,
        reason: state === 'ready' ? 'Synthetic model execution verified.' : 'Model verification is pending.',
        model_verified: state === 'ready', can_verify: state === 'verification_required',
        choices: { ...f.health.runtime!.choices!, saved_device: device, restarting: false, can_save: true, can_restart: true } }
    },
  }
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) f.documents++ })
  await page.context().route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ json: body, status })
    if (path === '/api/health') { f.healthReads++; return json(f.health) }
    if (request.method() !== 'GET' && path !== '/api/scans') f.writes.push({ path, body: request.postDataJSON() })
    if (path === '/api/runtime/device') {
      const body = request.postDataJSON()
      if (f.response === 'reject') return json({ detail: { code: 'stale_service', message: 'The service session changed. Reconnect and choose the device again.' } }, 409)
      if (f.response === 'network') return route.abort('connectionfailed')
      f.health.runtime!.choices!.saved_device = body.device
      f.health.runtime!.choices!.restarting = body.restart
      const accepted = { device: body.device, restarting: body.restart, runtime: structuredClone(f.health.runtime) }
      if (f.response === 'fast' || f.response === 'lost') f.completeRestart(body.device)
      if (f.response === 'lost') return route.abort('connectionfailed')
      return json(accepted, body.restart ? 202 : 200)
    }
    if (path === '/api/intake') return json(f.intake)
    if (path === '/api/demo') return json({ ...unconfiguredDemo, configured: true, state: 'ready', total: 3, next_name: 'synthetic.png' })
    if (path === '/api/runs') return json({ items: [] })
    if (path.endsWith('/image')) return route.fulfill({ contentType: 'image/png', body: png })
    if (path === '/api/scans') return json({ id: 'a'.repeat(32), name: 'synthetic-device-scan.png', width: 640, height: 320,
      sha256: 'b'.repeat(64), image_url: '/api/scans/synthetic/image', origin: 'upload' }, 201)
    return json({ detail: 'Unexpected synthetic device request.' }, 404)
  })
  return f
}

const settings = (page: Page) => page.getByRole('region', { name: 'Inference device settings' })
const radio = (page: Page, name: string) => settings(page).getByRole('radio', { name, exact: true })
const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const collected: string[] = []
  errors.set(page, collected)
  page.on('pageerror', error => collected.push(error.message))
})
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]) })

test('GPU default is distinct from current CPU; keyboard drafts survive polls and opening never applies them', async ({ page }, testInfo) => {
  const f = await fixture(page)
  await page.goto('/#main-menu')
  await expect(radio(page, 'GPU')).toBeChecked()
  await expect(settings(page).locator('.runtime-current')).toContainText('Current service: CPU')
  await expect(settings(page)).toContainText('Selected for restart: GPU')
  await expect(settings(page)).toContainText('Default on this host')
  await expect(settings(page)).not.toContainText('GPU ready')
  await settings(page).screenshot({ path: testInfo.outputPath('devices-desktop.png') })
  await radio(page, 'GPU').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(radio(page, 'CPU')).toBeChecked()
  const reads = f.healthReads
  await expect.poll(() => f.healthReads).toBeGreaterThanOrEqual(reads + 2)
  await expect(radio(page, 'CPU')).toBeChecked()
  await page.getByRole('button', { name: 'Open workspace', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Inspect a scan', exact: true })).toBeVisible()
  expect(f.writes).toEqual([])
  expect(f.documents).toBe(1)
})

test('CPU-only default explains unavailable GPU without claiming model readiness', async ({ page }) => {
  const f = await fixture(page)
  Object.assign(f.health.runtime!.choices!, { default_device: 'cpu' })
  Object.assign(f.health.runtime!.choices!.options[1], { selectable: false, reason: 'CUDA runtime is unavailable on this host.' })
  await page.goto('/#main-menu')
  await expect(radio(page, 'CPU')).toBeChecked()
  await expect(radio(page, 'GPU')).toBeDisabled()
  await expect(settings(page)).toContainText('CUDA runtime is unavailable on this host.')
  await expect(settings(page)).toContainText('CPU configured')
  await expect(settings(page)).not.toContainText('GPU ready')
  expect(f.writes).toEqual([])
})

test('saved explicit CPU takes precedence over a compatible GPU default', async ({ page }) => {
  const f = await fixture(page)
  f.health.runtime!.choices!.saved_device = 'cpu'
  await page.goto('/#main-menu')
  await expect(radio(page, 'CPU')).toBeChecked()
  await expect(radio(page, 'GPU')).toBeEnabled()
  await expect(settings(page)).toContainText('Saved device: CPU.')
  await expect(settings(page)).not.toContainText('Default on this host')
  expect(f.writes).toEqual([])
})

test('a missing saved GPU can be replaced directly without a CPU detour', async ({ page }) => {
  const f = await fixture(page)
  f.response = 'fast'
  Object.assign(f.health.runtime!, { state: 'unavailable', ready: false, selected_device: null, reason: 'The previously saved GPU is unavailable.' })
  f.health.runtime!.choices!.saved_device = 'cuda:7'
  f.health.runtime!.choices!.options[0].selectable = false
  await page.goto('/#main-menu')
  await expect(radio(page, 'GPU')).not.toBeChecked()
  await expect(radio(page, 'CPU')).toBeDisabled()
  await expect(settings(page)).toContainText('previously selected device is no longer reported')
  await expect(settings(page).getByRole('button', { name: 'Apply and restart' })).toBeDisabled()
  await radio(page, 'GPU').check()
  await settings(page).getByRole('button', { name: 'Apply and restart' }).click()
  await expect.poll(() => f.documents).toBe(2)
  expect(f.writes).toEqual([{ path: '/api/runtime/device', body: { device: 'cuda:0', service_instance_id: 'synthetic-instance-1', restart: true } }])
})

test('multiple GPU choice saves explicitly without changing the active service', async ({ page }) => {
  const f = await fixture(page)
  f.health.runtime!.choices!.options.push({ device: 'cuda:1', kind: 'gpu', name: 'Synthetic second GPU', selectable: true, reason: null })
  Object.assign(f.health.runtime!.choices!, { default_device: 'cuda:1', can_restart: false, restart_block_reason: 'This service was not started by the managed launcher.' })
  await page.goto('/#main-menu')
  const devices = settings(page).getByRole('combobox', { name: 'GPU device', exact: true })
  await expect(devices).toHaveValue('cuda:1')
  await devices.selectOption('cuda:0')
  const reads = f.healthReads
  await expect.poll(() => f.healthReads).toBeGreaterThan(reads)
  await expect(devices).toHaveValue('cuda:0')
  expect(f.writes).toEqual([])
  await settings(page).getByRole('button', { name: 'Save for next launch' }).click()
  await expect(settings(page).getByRole('status')).toContainText('Device choice saved for the next launch')
  await expect(settings(page).locator('.runtime-current')).toContainText('Current service: CPU')
  expect(f.writes).toEqual([{ path: '/api/runtime/device', body: { device: 'cuda:0', service_instance_id: 'synthetic-instance-1', restart: false } }])
  expect(f.documents).toBe(1)
})

for (const response of ['fast', 'lost'] as const) {
  test(`${response} restart reloads only on a new instance and keeps unverified GPU admission blocked`, async ({ page }) => {
    const f = await fixture(page)
    f.response = response
    await page.goto('/#main-menu')
    await settings(page).getByRole('button', { name: 'Apply and restart' }).click()
    await expect.poll(() => f.documents).toBe(2)
    await expect(settings(page).locator('.runtime-current')).toContainText('Current service: GPU')
    await expect(settings(page).locator('.runtime-current')).toContainText('Model check pending')
    await expect(settings(page)).not.toContainText('GPU ready')
    await page.getByRole('button', { name: 'Open workspace', exact: true }).click()
    await page.getByLabel('Upload X-ray image').setInputFiles({ name: 'synthetic-device-scan.png', mimeType: 'image/png', buffer: png })
    await expect(page.getByRole('button', { name: 'Run inference', exact: true })).toBeDisabled()
    expect(f.writes).toEqual([{ path: '/api/runtime/device', body: { device: 'cuda:0', service_instance_id: 'synthetic-instance-1', restart: true } }])
  })
}

test('delayed restart retains the current device until a new instance appears, including slow startup qualification', async ({ page }) => {
  const f = await fixture(page)
  await page.goto('/#main-menu')
  await settings(page).getByRole('button', { name: 'Apply and restart' }).click()
  await expect(settings(page).getByRole('button', { name: 'Restarting service…' })).toBeDisabled()
  await expect(settings(page).locator('.runtime-current')).toContainText('Current service: CPU')
  const reads = f.healthReads
  await expect.poll(() => f.healthReads).toBeGreaterThanOrEqual(reads + 2)
  expect(f.documents).toBe(1)
  f.completeRestart('cuda:0', 'checking')
  await expect.poll(() => f.documents).toBe(2)
  await expect(settings(page)).toContainText('Checking runtime')
  await expect(settings(page)).not.toContainText('GPU ready')
  f.completeRestart('cuda:0', 'ready')
  await expect(settings(page).locator('.runtime-current')).toContainText('GPU ready: Synthetic NVIDIA GPU')
  expect(f.writes).toHaveLength(1)
})

test('stale-session rejection preserves the draft and never retries without another explicit action', async ({ page }) => {
  const f = await fixture(page)
  f.response = 'reject'
  await page.goto('/#main-menu')
  await settings(page).getByRole('button', { name: 'Apply and restart' }).click()
  await expect(settings(page).getByRole('alert')).toContainText('The service session changed')
  await expect(radio(page, 'GPU')).toBeChecked()
  await expect(settings(page).locator('.runtime-current')).toContainText('Current service: CPU')
  const reads = f.healthReads
  await expect.poll(() => f.healthReads).toBeGreaterThan(reads)
  expect(f.writes).toHaveLength(1)
  expect(f.documents).toBe(1)
})

test('save request network failure stays visible and cannot claim activation', async ({ page }) => {
  const f = await fixture(page)
  f.response = 'network'
  f.health.runtime!.choices!.can_restart = false
  await page.goto('/#main-menu')
  await settings(page).getByRole('button', { name: 'Save for next launch' }).click()
  await expect(settings(page).getByRole('alert')).toContainText('local service is unavailable')
  await expect(settings(page).getByRole('button', { name: 'Reconnect service', exact: true })).toBeVisible()
  await expect(settings(page).locator('.runtime-current')).toContainText('Current service: CPU')
  expect(f.writes).toHaveLength(1)
  expect(f.documents).toBe(1)
})

for (const busy of ['verification', 'intake'] as const) {
  test(`${busy} blocks device switching even if a stale backend choice flag is permissive`, async ({ page }) => {
    const f = await fixture(page)
    if (busy === 'verification') Object.assign(f.health.runtime!, { state: 'verifying', ready: false })
    else Object.assign(f.intake, { enabled: true, state: 'waiting' })
    await page.goto('/#main-menu')
    await expect(radio(page, 'CPU')).toBeDisabled()
    await expect(radio(page, 'GPU')).toBeDisabled()
    await expect(settings(page).getByRole('button', { name: 'Apply and restart' })).toBeDisabled()
    expect(f.writes).toEqual([])
  })
}

test('old service exposes current information and relaunch guidance without false switching controls', async ({ page }) => {
  const f = await fixture(page)
  delete f.health.runtime!.choices
  delete f.health.service_instance_id
  await page.goto('/#main-menu')
  await expect(settings(page)).toContainText('This service does not expose device choices')
  await expect(settings(page).getByRole('radio')).toHaveCount(0)
  await expect(settings(page).getByRole('button', { name: /Apply and restart|Save for next launch/ })).toHaveCount(0)
  await navigate(page, 'Source')
  await page.getByRole('link', { name: 'Choose CPU or GPU in Workspace setup' }).click()
  await expect(page.getByRole('heading', { name: 'Set up your workspace', exact: true })).toBeVisible()
  expect(f.writes).toEqual([])
})

for (const palette of ['onyx', 'onyx-light']) {
  test(`${palette} device cards remain accessible and fit a narrow screen`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.addInitScript(value => localStorage.setItem('rayguard-appearance-v2', JSON.stringify({ palette: value, font: 'instrument-serif' })), palette)
    await fixture(page)
    await page.goto('/#main-menu')
    await expect(radio(page, 'GPU')).toBeChecked()
    await settings(page).scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await settings(page).screenshot({ path: testInfo.outputPath(`devices-${palette}-mobile.png`) })
  })
}
