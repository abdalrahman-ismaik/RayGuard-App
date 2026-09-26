// Synthetic API, predictions and pixels; public catalog labels are copied from the inspected catalog.
// These checks do not qualify a model, restart a real service or measure detector accuracy.
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Health, Intake, Run, RuntimeModelOption } from '../../src/types'
import { unconfiguredDemo } from './demo-fixture'
import { navigate } from './navigation'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64')
const generic: RuntimeModelOption = { id: 'author-yolov10m-generic', label: 'YOLOv10-M · Generic Explosive', family: 'YOLOv10-M',
  task: 'iedxray.generic_explosive_detection', kind: 'suspicious_region', classes: ['Explosive'],
  description: 'Locates suspicious explosive regions using one trained class.', selectable: true, reason: 'Synthetic artifact check passed; runtime verification is separate.' }
const device: RuntimeModelOption = { ...generic, id: 'author-yolov10m-device', label: 'YOLOv10-M · Electronic Devices',
  task: 'iedxray.device_detection', kind: 'device', classes: ['Laptop', 'Mobile', 'Pager', 'Walkie-Talkie'],
  description: 'Locates electronic devices; device presence does not establish an explosive threat.' }
const specific: RuntimeModelOption = { ...generic, id: 'author-yolov10m-specific', label: 'YOLOv10-M · Specific Explosives',
  task: 'iedxray.specific_explosive_detection', classes: ['IED Explosive', 'Laptop Explosive', 'Mobile Phone Explosive', 'Pager Explosive', 'Walkie-Talkie Explosive'],
  description: 'Locates suspicious explosive regions with five trained labels.' }
const unavailable = ['AO-DETR', 'Cascade R-CNN', 'Faster R-CNN', 'DETR', 'Grounding DINO'].map((family, index): RuntimeModelOption => ({
  id: `synthetic-unverified-${index}`, label: family, family, task: null, kind: null, classes: [], description: 'Unverified model family.',
  selectable: false, reason: 'No installed, verified backend and class mapping for this model family.',
}))
const activeModel = (model: RuntimeModelOption) => ({ id: model.id, label: model.label, task: model.task!, kind: model.kind,
  classes: model.classes, configured: true, reason: null })
function record(model = device, state: Run['state'] = 'succeeded'): Run {
  const id = '1'.repeat(32)
  const scan = { id, name: 'synthetic-model-history.png', width: 640, height: 320, sha256: 'b'.repeat(64),
    image_url: `/api/scans/${id}/image`, origin: 'dataset_demo' as const, source: { dataset: 'IEDXray' as const, split: 'test' as const, index: 0 } }
  return { id, scan_id: id, scan, state, created_at: '2026-09-26T12:00:00Z', completed_at: '2026-09-26T12:01:00Z', confidence: .25, elapsed_seconds: 1,
    model: { id: model.id, label: model.label, task: model.task!, kind: model.kind!, classes: [...model.classes], provenance: 'synthetic-model-hash' },
    error: state === 'failed' ? { code: 'synthetic_failure', message: 'Synthetic execution failure.' } : null,
    result: state !== 'succeeded' ? null : { schema_version: '1.0', scan_id: id, status: 'ok', image: { width: 640, height: 320 },
      model: { id: model.id, task: model.task!, provenance: 'synthetic-model-hash' }, run: { id, provenance: 'synthetic-run-hash' }, threshold: .25, error: null,
      detections: [{ id: 'synthetic-finding', kind: model.kind!, box_xyxy: [50, 50, 150, 150],
        category: { namespace: model.task!, label: model.classes[0] }, confidence: .8, device_id: null }] } }
}

async function fixture(page: Page) {
  const f = {
    health: { model: activeModel(generic), limits: { max_upload_bytes: 20_000_000, max_pixels: 20_000_000 }, active_run_id: null,
      service_instance_id: 'synthetic-model-instance-1', runtime: { policy: 'cpu', state: 'ready', ready: true, selected_device: 'cpu',
        profile: 'synthetic-profile', device_name: null, reason: 'CPU configured; checks run per inference.', verification_scan_id: null,
        error: null, can_verify: false, model_verified: false, restart_required: false, choices: {
          options: [{ device: 'cpu', kind: 'cpu', name: 'System processor', selectable: true, reason: null },
            { device: 'cuda:0', kind: 'gpu', name: 'Synthetic GPU', selectable: true, reason: null }],
          default_device: 'cuda:0', saved_device: null, can_save: true, can_restart: true, restart_block_reason: null, restarting: false,
          model_options: structuredClone([generic, device, specific, ...unavailable]), default_model_id: generic.id, saved_model_id: null,
        } } } as Health,
    intake: { configured: true, enabled: false, state: 'paused', adapter: 'folder', hardware_verified: false, source_label: 'Synthetic folder',
      confidence: .25, pending_count: 0, received_count: 0, last_received_at: null, error: null, pending: [], issues: [] } as Intake,
    history: [] as Run[], writes: [] as { path: string; body: unknown }[], documents: 0, healthReads: 0,
    response: 'normal' as 'normal' | 'fast' | 'lost' | 'reject',
    completeRestart(modelId = device.id, compute = 'cuda:0') {
      f.health.service_instance_id = 'synthetic-model-instance-2'
      f.health.model = activeModel(f.health.runtime!.choices!.model_options!.find(item => item.id === modelId)!)
      Object.assign(f.health.runtime!, { state: 'verification_required', ready: false, selected_device: compute, device_name: 'Synthetic GPU', can_verify: true, reason: 'Model verification is pending.' })
      Object.assign(f.health.runtime!.choices!, { saved_model_id: modelId, saved_device: compute, restarting: false })
      f.history = []
    },
  }
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) f.documents++ })
  await page.context().route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ json: body, status })
    if (path === '/api/health') { f.healthReads++; return json(f.health) }
    if (request.method() !== 'GET' && path !== '/api/scans') f.writes.push({ path, body: request.postDataJSON() })
    if (path === '/api/runtime/selection' || path === '/api/runtime/device') {
      const body = request.postDataJSON()
      if (f.response === 'reject') return json({ detail: { code: 'stale_service', message: 'Configuration rejected: the service session changed. Reconnect and choose again.' } }, 409)
      Object.assign(f.health.runtime!.choices!, { saved_model_id: body.model_id ?? null, saved_device: body.device, restarting: body.restart })
      const accepted = { model_id: body.model_id, device: body.device, restarting: body.restart, runtime: structuredClone(f.health.runtime) }
      if (f.response === 'fast' || f.response === 'lost') f.completeRestart(body.model_id, body.device)
      if (f.response === 'lost') return route.abort('connectionfailed')
      return json(accepted, body.restart ? 202 : 200)
    }
    if (path === '/api/intake') return json(f.intake)
    if (path === '/api/demo') return json({ ...unconfiguredDemo, configured: true, state: 'ready', total: 3, last_run_id: f.history[0]?.id ?? null })
    if (path === '/api/runs') return json({ items: f.history })
    if (path.endsWith('/image')) return route.fulfill({ contentType: 'image/png', body: png })
    if (path === '/api/scans') return json(record().scan, 201)
    if (path.endsWith('/comparison')) return json({ schema_version: 'rayguard.annotation-comparison.v1', run_id: f.history[0]?.id,
      status: 'unavailable', reason: 'This saved model task has no supported annotation pairing.', task: f.history[0]?.model?.task,
      iou_threshold: .5, annotation_source: null, image_id: null, image_sha256: null, boxes: [], evaluation: null, warnings: [] })
    const run = f.history.find(item => path === `/api/runs/${item.id}`)
    return run ? json(run) : json({ detail: 'Unexpected synthetic model request.' }, 404)
  })
  return f
}
const settings = (page: Page) => page.getByRole('region', { name: 'Inference device settings' })
const modelSelect = (page: Page) => settings(page).getByRole('combobox', { name: 'Model', exact: true })
const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const collected: string[] = []; errors.set(page, collected)
  page.on('pageerror', error => collected.push(error.message))
})
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]) })

test('model draft previews exact classes, survives polling, and never applies through Open workspace', async ({ page }) => {
  const f = await fixture(page)
  await page.goto('/#main-menu')
  await expect(modelSelect(page)).toHaveValue(generic.id)
  await expect(settings(page).locator('.model-classes')).toContainText('Model output classes (1): Explosive')
  await modelSelect(page).focus(); await page.keyboard.press('ArrowDown')
  await expect(modelSelect(page)).toHaveValue(device.id)
  await expect(settings(page).locator('.model-classes')).toContainText(device.classes.join(', '))
  await expect(settings(page).locator('.model-classes')).toContainText(device.task!)
  await expect(settings(page).locator('.runtime-current-model')).toHaveText(`Current model: ${generic.label}`)
  const reads = f.healthReads
  await expect.poll(() => f.healthReads).toBeGreaterThan(reads)
  await expect(modelSelect(page)).toHaveValue(device.id)
  await page.getByRole('button', { name: 'Open workspace', exact: true }).click()
  await navigate(page, 'Source')
  await expect(page.getByRole('region', { name: 'Detector settings' }).locator('.model-classes')).toContainText('Model output classes (1): Explosive')
  expect(f.writes).toEqual([])
})

test('unsupported model families stay disabled with visible reasons and no invented classes', async ({ page }) => {
  await fixture(page)
  await page.goto('/#main-menu')
  await expect(modelSelect(page).locator('option')).toHaveCount(8)
  for (const item of unavailable) await expect(modelSelect(page).locator(`option[value="${item.id}"]`)).toBeDisabled()
  await settings(page).getByText('Unavailable models', { exact: true }).click()
  for (const item of unavailable) await expect(settings(page).locator('li').filter({ has: page.getByText(item.label, { exact: true }) })).toContainText('Classes not verified.')
  await expect(settings(page).locator('.runtime-unavailable-models')).toContainText(unavailable[0].reason!)
})

test('save-only applies the model/device pair once without activating either draft', async ({ page }) => {
  const f = await fixture(page)
  f.health.runtime!.choices!.can_restart = false
  await page.goto('/#main-menu')
  await modelSelect(page).selectOption(specific.id)
  await expect(settings(page).locator('.model-classes')).toContainText(specific.classes.join(', '))
  await settings(page).getByRole('button', { name: 'Save for next launch' }).click()
  await expect(settings(page).getByRole('status')).toContainText('Model and device choices saved for the next launch')
  await expect(settings(page).locator('.runtime-current-model')).toHaveText(`Current model: ${generic.label}`)
  await expect(settings(page).locator('.runtime-current')).toContainText('Current service: CPU')
  await expect(settings(page)).toContainText(`Saved model: ${specific.label}.`)
  expect(f.writes).toEqual([{ path: '/api/runtime/selection', body: { model_id: specific.id, device: 'cuda:0', service_instance_id: 'synthetic-model-instance-1', restart: false } }])
  expect(f.documents).toBe(1)
})

for (const response of ['normal', 'fast', 'lost'] as const) {
  test(`${response} model restart waits for a new instance, resets old scans, and requires qualification`, async ({ page }) => {
    const f = await fixture(page); f.response = response; f.history = [record()]
    await page.goto('/#main-menu')
    await modelSelect(page).selectOption(device.id)
    await settings(page).getByRole('button', { name: 'Apply and restart' }).click()
    if (response === 'normal') {
      await expect(settings(page).getByRole('button', { name: 'Restarting service…' })).toBeDisabled()
      const reads = f.healthReads
      await expect.poll(() => f.healthReads).toBeGreaterThan(reads)
      await expect(settings(page).locator('.runtime-current-model')).toHaveText(`Current model: ${generic.label}`)
      expect(f.documents).toBe(1)
      f.completeRestart()
    }
    await expect.poll(() => f.documents).toBe(2)
    await expect(settings(page).locator('.runtime-current-model')).toHaveText(`Current model: ${device.label}`)
    await expect(settings(page).locator('.runtime-current')).toContainText('Model check pending')
    await page.getByRole('button', { name: 'Open workspace', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Choose a scan', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Replace scan', exact: true })).toHaveCount(0)
    await page.getByLabel('Upload X-ray image').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png })
    await expect(page.getByRole('button', { name: 'Run inference', exact: true })).toBeDisabled()
    expect(f.writes).toEqual([{ path: '/api/runtime/selection', body: { model_id: device.id, device: 'cuda:0', service_instance_id: 'synthetic-model-instance-1', restart: true } }])
  })
}

test('stale pair rejection preserves both drafts without claiming either was saved', async ({ page }) => {
  const f = await fixture(page); f.response = 'reject'
  await page.goto('/#main-menu')
  await modelSelect(page).selectOption(specific.id)
  await settings(page).getByRole('radio', { name: 'CPU', exact: true }).check()
  await settings(page).getByRole('button', { name: 'Apply and restart' }).click()
  await expect(settings(page).getByRole('alert')).toContainText('Configuration rejected')
  const reads = f.healthReads
  await expect.poll(() => f.healthReads).toBeGreaterThan(reads)
  await expect(modelSelect(page)).toHaveValue(specific.id)
  await expect(settings(page).getByRole('radio', { name: 'CPU', exact: true })).toBeChecked()
  await expect(settings(page)).not.toContainText('Saved model:')
  expect(f.writes).toHaveLength(1)
  expect(f.health.runtime!.choices!.saved_device).toBeNull()
  expect(f.health.runtime!.choices!.saved_model_id).toBeNull()
})

test('busy verification prevents changing or applying the pair even with stale permissive flags', async ({ page }) => {
  const f = await fixture(page)
  Object.assign(f.health.runtime!, { state: 'verifying', ready: false })
  await page.goto('/#main-menu')
  await expect(modelSelect(page)).toBeDisabled()
  await expect(settings(page).getByRole('radio', { name: 'CPU', exact: true })).toBeDisabled()
  await expect(settings(page).getByRole('button', { name: 'Apply and restart' })).toBeDisabled()
  expect(f.writes).toEqual([])
})

test('a missing saved model requires an explicit replacement rather than silently changing the pair', async ({ page }) => {
  const f = await fixture(page)
  f.health.runtime!.choices!.saved_model_id = 'removed-synthetic-model'
  await page.goto('/#main-menu')
  await expect(modelSelect(page)).toHaveValue('')
  await expect(settings(page).getByRole('button', { name: 'Apply and restart' })).toBeDisabled()
  await expect(settings(page)).toContainText('Saved model: removed-synthetic-model.')
  await modelSelect(page).selectOption(device.id)
  await expect(settings(page).getByRole('button', { name: 'Apply and restart' })).toBeEnabled()
  expect(f.writes).toEqual([])
})

test('old services retain their device endpoint and current model without fabricated catalog choices', async ({ page }) => {
  const f = await fixture(page)
  delete f.health.runtime!.choices!.model_options
  f.health.runtime!.choices!.can_restart = false
  await page.goto('/#main-menu')
  await expect(modelSelect(page)).toHaveCount(0)
  await expect(settings(page)).toContainText('Model selection requires an updated local service')
  await settings(page).getByRole('button', { name: 'Save for next launch' }).click()
  await expect(settings(page).getByRole('status')).toContainText('Device choice saved')
  expect(f.writes).toEqual([{ path: '/api/runtime/device', body: { device: 'cuda:0', service_instance_id: 'synthetic-model-instance-1', restart: false } }])
})

for (const state of ['succeeded', 'failed'] as const) {
  test(`${state} historical run retains its model and classes while a different model is active`, async ({ page }) => {
    const f = await fixture(page); f.history = [record(device, state)]
    await page.goto('/#workspace')
    const findings = page.getByRole('tabpanel', { name: 'Findings', exact: true })
    await expect(findings).toContainText(`Run model: ${device.label}`)
    await expect(findings).toContainText('Device localization only.')
    await expect(findings).toContainText('This saved model task has no supported annotation pairing.')
    await expect(page.locator('.annotation-box')).toHaveCount(0)
    if (state === 'succeeded') {
      await expect(page.locator('.detection-box')).toHaveAccessibleName('Finding 1: Laptop, 80.0% model score')
      await findings.getByRole('button', { name: /Laptop Device localization/ }).click()
    }
    await page.getByRole('tab', { name: 'Provenance', exact: true }).click()
    const provenance = page.getByRole('region', { name: 'Model and provenance', exact: true })
    await expect(provenance).toContainText(device.id)
    await expect(provenance.locator('.model-classes')).toContainText(device.classes.join(', '))
    await expect(provenance).not.toContainText(generic.id)
    if (state === 'succeeded') await expect(page.getByRole('region', { name: 'Selected finding details' })).toContainText('Not supplied')
    await navigate(page, 'Source')
    await expect(page.getByRole('region', { name: 'Detector settings' })).toContainText(generic.label)
    expect(f.writes).toEqual([])
  })
}

for (const palette of ['onyx', 'onyx-light']) {
  test(`${palette} model configuration remains accessible at 320px with full class names`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await page.addInitScript(value => localStorage.setItem('rayguard-appearance-v2', JSON.stringify({ palette: value, font: 'instrument-serif' })), palette)
    await fixture(page)
    await page.goto('/#main-menu')
    await modelSelect(page).selectOption(specific.id)
    await settings(page).scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await settings(page).screenshot({ path: testInfo.outputPath(`models-${palette}-mobile.png`) })
  })
}
