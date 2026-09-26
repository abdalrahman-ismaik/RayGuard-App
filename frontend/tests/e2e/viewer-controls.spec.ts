// Synthetic pixels, annotations and predictions. These are interaction checks, not inference evidence.
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { AnnotationComparison, Run } from '../../src/types'
import { unconfiguredDemo } from './demo-fixture'

const task = 'iedxray.generic_explosive_detection'
function record(n: number): Run {
  const id = String(n).padStart(32, '0')
  const scan = { id, name: `synthetic-viewer-${n}.png`, width: 640, height: 320,
    sha256: 'c'.repeat(64), image_url: `/api/scans/${id}/image`, origin: 'dataset_demo' as const,
    source: { dataset: 'IEDXray' as const, split: 'test' as const, index: n } }
  return { id, scan_id: id, scan, state: 'succeeded', created_at: '2026-09-26T12:00:00Z', completed_at: '2026-09-26T12:00:01Z',
    confidence: .25, elapsed_seconds: 1, error: null, review: { status: 'unreviewed', note: '', updated_at: null },
    result: { schema_version: '1.0', scan_id: id, status: 'ok', image: { width: 640, height: 320 },
      model: { id: 'synthetic-viewer-model', task, provenance: 'synthetic' }, run: { id, provenance: 'synthetic' }, threshold: .25, error: null,
      detections: [{ id: 'synthetic-detection', kind: 'suspicious_region', box_xyxy: [240, 100, 340, 200],
        category: { namespace: task, label: 'Explosive' }, confidence: .8, device_id: null }] } }
}

function reference(run: Run): AnnotationComparison {
  return { schema_version: 'rayguard.annotation-comparison.v1', run_id: run.id, status: 'available', reason: null, task, iou_threshold: .5,
    annotation_source: { name: 'synthetic-viewer-reference.json', sha256: 'a'.repeat(64), split: 'test' }, image_id: 1, image_sha256: run.scan.sha256,
    boxes: [{ annotation_id: 10, category_id: 0, label: 'Explosive', box_xyxy: [240, 100, 340, 200] }],
    evaluation: { outcome: 'matched', matched: 1, missed: 0, extra: 0,
      matches: [{ annotation_id: 10, detection_id: 'synthetic-detection', iou: 1 }], missed_annotation_ids: [], extra_detection_ids: [] }, warnings: [] }
}

async function fixture(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const pixels = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 640; canvas.height = 320
    const context = canvas.getContext('2d')!
    for (let y = 0; y < 320; y += 20) for (let x = 0; x < 640; x += 20) {
      context.fillStyle = (x + y) % 40 ? '#073548' : '#edd899'
      context.fillRect(x, y, 20, 20)
    }
    context.fillStyle = '#be3030'; context.fillRect(240, 100, 100, 100)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const records = [record(1), record(2)]
  const server = { writes: [] as string[], errors: [] as string[] }
  page.on('pageerror', error => server.errors.push(error.message))
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body })
    if (route.request().method() !== 'GET') { server.writes.push(path); return json({}, 409) }
    if (path.endsWith('/image')) return route.fulfill({ contentType: 'image/png', body: Buffer.from(pixels, 'base64') })
    if (path === '/api/health') return json({ model: { id: 'synthetic-viewer-model', label: 'Synthetic detector', task, configured: true, reason: null }, active_run_id: null,
      limits: { max_upload_bytes: 20_000_000, max_pixels: 20_000_000 } })
    if (path === '/api/runs') return json({ items: records })
    if (path === '/api/demo') return json({ ...unconfiguredDemo, configured: true, state: 'ready', total: 2, last_run_id: records[0].id })
    if (path === '/api/intake') return json({ configured: false, enabled: false, state: 'unconfigured', adapter: 'folder', hardware_verified: false,
      source_label: 'Synthetic intake', confidence: .25, pending_count: 0, received_count: 0, last_received_at: null, error: null, pending: [], issues: [] })
    const id = path.match(/^\/api\/runs\/([^/]+)(?:\/comparison)?$/)?.[1]
    const run = records.find(item => item.id === id)
    return run ? json(path.endsWith('/comparison') ? reference(run) : run) : json({}, 404)
  })
  await page.goto('/#workspace')
  await expect(page.locator('.scan-svg .annotation-box')).toBeVisible()
  return server
}

async function point(page: Page, x = 400, y = 176) {
  return page.locator('.scan-svg image').evaluate((image, source) => {
    const p = new DOMPoint(source.x, source.y).matrixTransform((image as SVGGraphicsElement).getScreenCTM()!)
    return { x: p.x, y: p.y }
  }, { x, y })
}

async function sourceAt(page: Page, pointer: { x: number; y: number }) {
  return page.locator('.scan-svg image').evaluate((image, p) => {
    const source = new DOMPoint(p.x, p.y).matrixTransform((image as SVGGraphicsElement).getScreenCTM()!.inverse())
    return { x: source.x, y: source.y }
  }, pointer)
}

const zoom = (page: Page) => page.getByLabel('Zoom level', { exact: true })
const magnifier = (page: Page) => page.getByRole('button', { name: 'Magnifier', exact: true })
const lens = (page: Page) => page.locator('.scan-magnifier')

async function hoverLens(page: Page, x = 400, y = 176) {
  const pointer = await point(page, x, y)
  await page.mouse.move(pointer.x, pointer.y)
  await expect(lens(page)).toBeVisible()
  const alignment = await lens(page).locator('svg').evaluate((svg, source) => {
    const bounds = svg.getBoundingClientRect()
    const image = svg.querySelector('image') as SVGGraphicsElement
    const centered = new DOMPoint(source.x, source.y).matrixTransform(image.getScreenCTM()!)
    const mainImage = document.querySelector('.scan-svg image') as SVGGraphicsElement
    return { dx: centered.x - bounds.x - bounds.width / 2, dy: centered.y - bounds.y - bounds.height / 2,
      scale: image.getScreenCTM()!.a / mainImage.getScreenCTM()!.a }
  }, { x, y })
  expect(Math.abs(alignment.dx)).toBeLessThan(1)
  expect(Math.abs(alignment.dy)).toBeLessThan(1)
  expect(alignment.scale).toBeCloseTo(3, 1)
}

test('wheel zoom anchors the source pixel despite letterboxing, clamps and restores fit', async ({ page }) => {
  const server = await fixture(page)
  const pointer = await point(page)
  const before = await sourceAt(page, pointer)
  const svg = await page.locator('.scan-svg').boundingBox()
  const image = await page.locator('.scan-svg image').boundingBox()
  expect(Math.abs(svg!.height - image!.height) + Math.abs(svg!.width - image!.width)).toBeGreaterThan(1)
  await page.mouse.move(pointer.x, pointer.y)
  await page.mouse.wheel(0, -250)
  await expect(zoom(page)).not.toHaveText('100%')
  const after = await sourceAt(page, pointer)
  expect(after.x).toBeCloseTo(before.x, 1)
  expect(after.y).toBeCloseTo(before.y, 1)
  for (let i = 0; i < 25; i++) await page.mouse.wheel(0, -1000)
  await expect(zoom(page)).toHaveText('500%')
  await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeDisabled()
  for (let i = 0; i < 25; i++) await page.mouse.wheel(0, 1000)
  await expect(zoom(page)).toHaveText('100%')
  await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeDisabled()
  const reset = await sourceAt(page, pointer)
  expect(reset.x).toBeCloseTo(before.x, 1)
  expect(reset.y).toBeCloseTo(before.y, 1)
  expect(server.writes).toEqual([])
  expect(server.errors).toEqual([])
})

test('Ctrl-wheel remains browser-owned and scrolling outside the viewer does not zoom', async ({ page }) => {
  const server = await fixture(page)
  const prevented = await page.locator('.scan-svg').evaluate(svg => {
    const event = new WheelEvent('wheel', { deltaY: -200, ctrlKey: true, bubbles: true, cancelable: true })
    svg.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(prevented).toBe(false)
  await expect(zoom(page)).toHaveText('100%')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.mouse.move(15, 180)
  await page.mouse.wheel(0, 350)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await expect(zoom(page)).toHaveText('100%')
  expect(server.errors).toEqual([])
})

test('dragging from a finding pans without selecting it; clicks still select and pan stays bounded', async ({ page }) => {
  const server = await fixture(page)
  const fitted = await page.locator('.scan-svg image').boundingBox()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  const overlay = page.locator('.scan-svg [data-detection="synthetic-detection"]')
  await expect(overlay).toHaveAttribute('aria-pressed', 'false')
  const before = await page.locator('.scan-svg > g').getAttribute('transform')
  const start = await point(page, 250, 110)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 45, start.y + 30, { steps: 5 })
  await page.mouse.up()
  expect(await page.locator('.scan-svg > g').getAttribute('transform')).not.toBe(before)
  await expect(overlay).toHaveAttribute('aria-pressed', 'false')
  await overlay.click()
  await expect(overlay).toHaveAttribute('aria-pressed', 'true')
  for (const direction of [-1, 1]) {
    const center = await point(page, 320, 160)
    await page.mouse.move(center.x, center.y)
    await page.mouse.down()
    await page.mouse.move(center.x + direction * 1500, center.y + direction * 900, { steps: 5 })
    await page.mouse.up()
    const bounds = await page.locator('.scan-svg image').boundingBox()
    expect(bounds!.x).toBeLessThanOrEqual(fitted!.x + 1)
    expect(bounds!.y).toBeLessThanOrEqual(fitted!.y + 1)
    expect(bounds!.x + bounds!.width).toBeGreaterThanOrEqual(fitted!.x + fitted!.width - 1)
    expect(bounds!.y + bounds!.height).toBeGreaterThanOrEqual(fitted!.y + fitted!.height - 1)
  }
  expect(server.writes).toEqual([])
  expect(server.errors).toEqual([])
})

test('magnifier stays aligned after zoom and pan, copies display adjustments and visible overlays only', async ({ page }) => {
  const server = await fixture(page)
  await magnifier(page).click()
  await expect(magnifier(page)).toHaveAttribute('aria-pressed', 'true')
  await hoverLens(page)
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.locator('.scan-svg').focus()
  await page.keyboard.press('ArrowRight')
  await hoverLens(page)
  await page.getByRole('button', { name: 'Invert display', exact: true }).click()
  await page.getByRole('slider', { name: /^Brightness/ }).fill('150')
  await hoverLens(page)
  await expect(lens(page).locator('image')).toHaveAttribute('style', /brightness\(150%\).*invert\(1\)/)
  await expect(lens(page).locator('image')).toHaveAttribute('href', '/api/scans/' + '1'.padStart(32, '0') + '/image')
  await expect(lens(page).locator('.magnifier-detection')).toHaveCount(1)
  await expect(lens(page).locator('.magnifier-annotation')).toHaveCount(1)
  await expect(page.getByRole('button', { name: /^Finding 1:/ })).toHaveCount(1)
  await expect(lens(page).locator('[tabindex], [role="button"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Hide detection overlays', exact: true }).click()
  await hoverLens(page)
  await expect(lens(page).locator('.magnifier-detection')).toHaveCount(0)
  await expect(lens(page).locator('.magnifier-annotation')).toHaveCount(1)
  await page.getByRole('button', { name: 'Hide dataset annotations', exact: true }).click()
  await hoverLens(page)
  await expect(lens(page).locator('.magnifier-annotation')).toHaveCount(0)
  expect(server.writes).toEqual([])
  expect(server.errors).toEqual([])
})

test('magnifier clears on leave, Escape, fit and selected scan replacement', async ({ page }) => {
  const server = await fixture(page)
  await magnifier(page).click()
  await hoverLens(page)
  await page.mouse.move(5, 5)
  await expect(lens(page)).toHaveCount(0)
  await hoverLens(page)
  // Hovering need not move keyboard focus into the viewer.
  await page.getByRole('tab', { name: 'Findings', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(lens(page)).toHaveCount(0)
  await expect(magnifier(page)).toHaveAttribute('aria-pressed', 'false')
  await magnifier(page).click()
  await hoverLens(page)
  await page.getByRole('button', { name: 'Fit image', exact: true }).click()
  await expect(lens(page)).toHaveCount(0)
  await expect(magnifier(page)).toHaveAttribute('aria-pressed', 'false')
  await magnifier(page).click()
  await hoverLens(page)
  await page.getByRole('button', { name: 'View scan synthetic-viewer-2.png', exact: true }).click()
  await expect(lens(page)).toHaveCount(0)
  await expect(magnifier(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(zoom(page)).toHaveText('100%')
  expect(server.errors).toEqual([])
})

test('magnifier stays inside the viewer at image edges and after resizing', async ({ page }) => {
  const server = await fixture(page)
  await magnifier(page).click()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.locator('.scan-svg').scrollIntoViewIfNeeded()
    for (const [x, y] of [[1, 1], [639, 319]]) {
      await hoverLens(page, x, y)
      const bounds = await lens(page).boundingBox()
      const stage = await page.locator('.image-stage').boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(stage!.x)
      expect(bounds!.y).toBeGreaterThanOrEqual(stage!.y)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(stage!.x + stage!.width + 1)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(stage!.y + stage!.height + 1)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  expect(server.errors).toEqual([])
})

test('keyboard zoom, pan, reset and magnifier remain usable in both appearances', async ({ page }) => {
  const server = await fixture(page)
  for (const palette of ['onyx', 'onyx-light']) {
    await page.evaluate(value => localStorage.setItem('rayguard-appearance-v2', JSON.stringify({ palette: value, font: 'instrument-serif' })), palette)
    await page.reload()
    await expect(page.locator('.scan-svg .annotation-box')).toBeVisible()
    await page.locator('.scan-svg').focus()
    await page.keyboard.press('+')
    await expect(zoom(page)).toHaveText('125%')
    const before = await page.locator('.scan-svg > g').getAttribute('transform')
    await page.keyboard.press('ArrowRight')
    expect(await page.locator('.scan-svg > g').getAttribute('transform')).not.toBe(before)
    await page.keyboard.press('0')
    await expect(zoom(page)).toHaveText('100%')
    await magnifier(page).focus()
    await page.keyboard.press('Enter')
    await expect(magnifier(page)).toHaveAttribute('aria-pressed', 'true')
    await hoverLens(page)
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  }
  expect(server.errors).toEqual([])
})

test('touch scroll is available at fit; zoomed touch drag pans without displaying a hover lens', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const server = await fixture(page)
  const client = await context.newCDPSession(page)
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
  await page.locator('.scan-svg').scrollIntoViewIfNeeded()
  const start = await point(page, 400, 220)
  const beforeScroll = await page.evaluate(() => window.scrollY)
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y }] })
  for (let i = 1; i <= 5; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x, y: start.y - i * 20 }] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeScroll)
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await magnifier(page).click()
  await page.locator('.scan-svg').scrollIntoViewIfNeeded()
  const zoomed = await point(page, 320, 160)
  const beforePan = await page.locator('.scan-svg > g').getAttribute('transform')
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: zoomed.x, y: zoomed.y }] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: zoomed.x - 25, y: zoomed.y - 20 }] })
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  expect(await page.locator('.scan-svg > g').getAttribute('transform')).not.toBe(beforePan)
  await expect(lens(page)).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(server.writes).toEqual([])
  expect(server.errors).toEqual([])
})
