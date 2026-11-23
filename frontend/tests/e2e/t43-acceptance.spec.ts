// T43 acceptance checks. All records and pixels are synthetic; no inference runs.
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Run } from '../../src/types'
import { unconfiguredDemo } from './demo-fixture'
import { navigate, workspaceLink } from './navigation'

const task = 'iedxray.generic_explosive_detection'
const syntheticImage = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320"><rect width="640" height="320" fill="#202d3b"/><text x="30" y="150" fill="white" font-size="26">SYNTHETIC UI TEST</text><text x="30" y="190" fill="white" font-size="20">No model inference or scan data</text></svg>'

function record(n: number, name: string, state: Run['state'], status: NonNullable<Run['review']>['status']): Run {
  const id = n.toString(16).padStart(32, '0')
  return {
    id, scan_id: id,
    scan: { id, name: `synthetic-${name}.png`, width: 640, height: 320,
      sha256: 'a'.repeat(64), image_url: `/api/scans/${id}/image`, origin: 'upload' },
    state, created_at: `2026-11-15T10:0${n}:00Z`, completed_at: `2026-11-15T10:0${n}:01Z`,
    confidence: .25, elapsed_seconds: 1,
    model: { id: 'synthetic-t43-model', label: 'Synthetic T43 detector', task,
      kind: 'suspicious_region', classes: ['Explosive'], provenance: 'Synthetic fixture only' },
    review: { status, note: '', updated_at: null },
    error: state === 'failed' ? { code: 'synthetic_failure', message: 'Synthetic inference failure; no result available.' } : null,
    result: state === 'succeeded' ? {
      schema_version: '1.0', scan_id: id, status: 'ok', image: { width: 640, height: 320 },
      model: { id: 'synthetic-t43-model', task, provenance: 'Synthetic fixture only' },
      run: { id, provenance: 'Synthetic run; no execution' }, threshold: .25, error: null,
      detections: n === 1 ? [{ id: 'synthetic-region', kind: 'suspicious_region', box_xyxy: [20, 20, 100, 100],
        category: { namespace: task, label: 'Explosive' }, confidence: .8, device_id: null }] : [],
    } : null,
  }
}

const history = (page: Page) => page.getByRole('region', { name: 'Session history', exact: true })
const rows = (page: Page) => history(page).locator('tbody tr')

async function fixture(page: Page) {
  const records = [
    record(1, 'bravo', 'succeeded', 'unreviewed'),
    record(2, 'alpha', 'succeeded', 'reviewed'),
    record(3, 'charlie', 'failed', 'follow_up'),
    { ...record(4, 'delta', 'succeeded', 'unreviewed'), result: null },
  ]
  const writes: string[] = []
  const unexpected: string[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // Block every API write. Merely reviewing saved evidence must not start work.
  await page.context().route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body })
    if (request.method() !== 'GET') {
      writes.push(`${request.method()} ${path}`)
      return json({ detail: 'T43 fixture forbids mutations' }, 409)
    }
    if (path.endsWith('/image')) return route.fulfill({ contentType: 'image/svg+xml', body: syntheticImage })
    if (path === '/api/health') return json({
      model: { id: 'synthetic-current-model', label: 'Synthetic current detector', task, configured: false,
        reason: 'Synthetic unavailable model; saved records remain reviewable.' },
      active_run_id: null, limits: { max_upload_bytes: 20_000_000, max_pixels: 20_000_000 },
    })
    if (path === '/api/runs') return json({ items: records })
    if (path === '/api/demo') return json(unconfiguredDemo)
    if (path === '/api/intake') return json({ configured: false, enabled: false, state: 'unconfigured',
      adapter: 'folder', hardware_verified: false, source_label: 'Synthetic export folder', confidence: .25,
      pending_count: 0, received_count: 0, last_received_at: null, error: null, pending: [], issues: [] })
    const run = records.find(item => path === `/api/runs/${item.id}`)
    if (run) return json(run)
    unexpected.push(path)
    return json({ detail: 'Unknown T43 fixture route' }, 404)
  })
  return { records, assertReadOnly: () => {
    expect(writes, 'Navigation and local review controls must not send writes').toEqual([])
    expect(unexpected, 'Every API response must be an intentional fixture').toEqual([])
    expect(errors, 'No browser runtime errors').toEqual([])
  } }
}

async function openHistory(page: Page) {
  await page.goto('/#session')
  await expect(rows(page)).toHaveCount(4)
}

test('T43 saved-session search and review filters distinguish failed, empty and missing results', async ({ page }) => {
  const server = await fixture(page)
  await openHistory(page)
  await history(page).getByLabel('Search scans').fill('  SYNTHETIC-ALPHA  ')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toContainText('synthetic-alpha.png')
  await expect(rows(page).first().locator('td').nth(4)).toHaveText('0')
  await history(page).getByLabel('Search scans').fill(server.records[2].id)
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toContainText('synthetic-charlie.png')
  await expect(rows(page).first().locator('td').nth(4)).toHaveText('—')
  await history(page).getByLabel('Search scans').fill('')
  for (const [filter, names] of [
    ['unreviewed', ['synthetic-delta.png', 'synthetic-bravo.png']],
    ['reviewed', ['synthetic-alpha.png']], ['follow_up', ['synthetic-charlie.png']],
    ['failed', ['synthetic-charlie.png']],
  ] as const) {
    await history(page).getByLabel('Filter runs').selectOption(filter)
    await expect(rows(page)).toHaveCount(names.length)
    for (let i = 0; i < names.length; i++) await expect(rows(page).nth(i)).toContainText(names[i])
  }
  await history(page).getByLabel('Search scans').fill('synthetic-no-match')
  await expect(history(page).getByRole('status')).toContainText('0 of 4 runs shown')
  await expect(history(page)).toContainText('No runs match these filters.')
  await history(page).getByLabel('Search scans').fill('')
  await history(page).getByLabel('Filter runs').selectOption('all')
  await expect(rows(page)).toHaveCount(4)
  server.assertReadOnly()
})

test('T43 sorting changes record order without changing saved run identity or settings', async ({ page }) => {
  const server = await fixture(page)
  await openHistory(page)
  for (const [sort, order] of [
    ['oldest', [0, 1, 2, 3]], ['newest', [3, 2, 1, 0]], ['name', [1, 0, 2, 3]],
  ] as const) {
    await history(page).getByLabel('Sort runs').selectOption(sort)
    for (let i = 0; i < order.length; i++) {
      await expect(rows(page).nth(i).getByRole('button', { name: `Open run ${server.records[order[i]].id}` })).toBeVisible()
      await expect(rows(page).nth(i).locator('td').nth(3)).toHaveText('25%')
    }
  }
  server.assertReadOnly()
})

test('T43 keyboard review keeps the draft and selected scan through filtering, routes and theme changes', async ({ page }) => {
  const server = await fixture(page)
  await openHistory(page)
  const run = server.records[0]
  const open = history(page).getByRole('button', { name: `Open run ${run.id}` })
  await open.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#workspace')).toBeFocused()
  const viewer = page.getByRole('group', { name: `X-ray scan: ${run.scan.name}` })
  await expect(viewer).toBeVisible()
  const findings = page.getByRole('tab', { name: 'Findings', exact: true })
  await findings.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Review', exact: true })).toBeFocused()
  const note = page.getByLabel('Review note')
  await note.fill('Synthetic T43 unsaved observation; no clearance.')
  await (await workspaceLink(page, 'Session')).focus()
  await page.keyboard.press('Enter')
  await history(page).getByLabel('Filter runs').selectOption('failed')
  await expect(history(page).getByRole('status')).toContainText('Selected scan is outside this filter')
  const theme = page.getByRole('button', { name: 'Switch to light mode' })
  await theme.focus()
  await page.keyboard.press('Enter')
  await navigate(page, 'Source')
  await navigate(page, 'Dashboard')
  await navigate(page, 'Inspect')
  await expect(viewer).toBeVisible()
  await expect(note).toHaveValue('Synthetic T43 unsaved observation; no clearance.')
  await expect(page.getByRole('button', { name: 'Run inference', exact: true })).toBeDisabled()
  await page.getByRole('tab', { name: 'Provenance', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Model and provenance' })).toContainText('synthetic-t43-model')
  server.assertReadOnly()
})

test('T43 saved empty and failed runs remain distinguishable when the current model is unavailable', async ({ page }) => {
  const server = await fixture(page)
  await openHistory(page)
  await history(page).getByRole('button', { name: `Open run ${server.records[1].id}` }).click()
  await expect(page.getByRole('heading', { name: 'No detections reported' })).toBeVisible()
  await expect(page.getByRole('tabpanel', { name: 'Findings', exact: true })).toContainText('This is not a safe or benign verdict.')
  await navigate(page, 'Session')
  await history(page).getByRole('button', { name: `Open run ${server.records[2].id}` }).click()
  await expect(page.getByRole('heading', { name: 'Inference did not complete' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No detections reported' })).toHaveCount(0)
  await expect(page.locator('[data-detection]')).toHaveCount(0)
  await page.getByRole('tab', { name: 'Review', exact: true }).click()
  await expect(page.getByLabel('Review note')).toBeEnabled()
  await expect(page.getByRole('region', { name: 'Operator review' })).toContainText('does not clear or classify the item')
  server.assertReadOnly()
})

for (const width of [320, 1366]) {
  for (const palette of ['Onyx', 'Onyx Light']) {
    test(`T43 session and review accessibility at ${width}px in ${palette}`, async ({ page }) => {
      test.setTimeout(60_000)
      const server = await fixture(page)
      await page.setViewportSize({ width, height: width === 320 ? 844 : 768 })
      await openHistory(page)
      await page.getByText('Appearance', { exact: true }).click()
      await page.getByRole('radio', { name: palette, exact: true }).check()
      await page.getByRole('button', { name: 'Close appearance' }).click()
      for (const view of ['session', 'review']) {
        if (view === 'review') {
          await history(page).getByRole('button', { name: `Open run ${server.records[0].id}` }).click()
          await page.getByRole('tab', { name: 'Review', exact: true }).click()
          await page.getByLabel('Review note').fill('Synthetic accessibility check.')
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), view).toBe(true)
        const analysis = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
        expect(analysis.violations, view).toEqual([])
      }
      server.assertReadOnly()
    })
  }
}
