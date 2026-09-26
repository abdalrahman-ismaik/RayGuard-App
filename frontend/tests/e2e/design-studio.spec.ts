// Synthetic software fixtures only. No dataset assets or model inference.
import { expect, test, type Page } from '@playwright/test'
import type { Run } from '../../src/types'

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64')
const task = 'iedxray.generic_explosive_detection'

function run(index: number, name: string, state: Run['state'], review: 'unreviewed' | 'reviewed' | 'follow_up', origin: 'upload' | 'folder' | 'dataset_demo'): Run {
  const id = index.toString(16).padStart(32, '0')
  return {
    id, scan_id: id, state, created_at: '2026-09-26T09:00:00Z',
    completed_at: state === 'running' ? null : '2026-09-26T09:00:02Z',
    confidence: 0.25, elapsed_seconds: state === 'running' ? null : 2,
    scan: { id, name, width: 640, height: 320, sha256: 'a'.repeat(64),
      image_url: `/api/scans/${id}/image`, origin,
      ...(origin === 'dataset_demo' ? { source: { dataset: 'IEDXray' as const, split: 'test' as const, index: 7 } } : {}) },
    review: { status: review, note: review === 'follow_up' ? 'Synthetic follow-up note.' : '', updated_at: null },
    error: state === 'failed' ? { code: 'inference_failed', message: 'Synthetic execution failure.' } : null,
    result: state === 'succeeded' ? {
      schema_version: '1.0', scan_id: id, status: 'ok', image: { width: 640, height: 320 },
      model: { id: 'synthetic-detector', task, provenance: 'sha256:' + 'b'.repeat(64) },
      run: { id, provenance: 'synthetic-manifest' }, threshold: 0.25,
      detections: index === 1 ? [{ id: 'synthetic-region', kind: 'suspicious_region',
        box_xyxy: [100, 60, 200, 160], category: { namespace: task, label: 'Synthetic region' },
        confidence: 0.8, device_id: null }] : [], error: null,
    } : null,
  }
}

const runs = [
  run(1, 'synthetic-alpha.png', 'succeeded', 'follow_up', 'upload'),
  run(2, 'synthetic-beta.png', 'succeeded', 'reviewed', 'dataset_demo'),
  run(3, 'synthetic-failed.png', 'failed', 'unreviewed', 'folder'),
  run(4, 'synthetic-running.png', 'running', 'unreviewed', 'folder'),
]

const faults = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  faults.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (request.url().includes('/api/') && request.method() !== 'GET') errors.push(`API mutation: ${request.method()}`)
    if (request.url().startsWith('http') && new URL(request.url()).hostname !== '127.0.0.1') errors.push('External request')
  })
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/runs') return route.fulfill({ json: { items: runs } })
    if (/^\/api\/scans\/[a-f0-9]{32}\/image$/.test(path)) return route.fulfill({ contentType: 'image/png', body: pixel })
    errors.push(`Unexpected API route: ${path}`)
    return route.fulfill({ status: 404, json: {} })
  })
})
test.afterEach(async ({ page }) => { expect(faults.get(page)).toEqual([]) })

test('advanced gallery keeps the compact alternatives and opens real partitions', async ({ page }) => {
  await page.goto('/design-studio/')
  await expect(page.locator('.design-card')).toHaveCount(6)
  await expect(page.getByRole('heading', { name: 'Operations Console', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Compact/ }).click()
  await expect(page.locator('.design-card')).toHaveCount(10)
  await expect(page.getByRole('heading', { name: 'Integrated Console', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Advanced/ }).click()
  await page.locator('.design-card').filter({ has: page.getByRole('heading', { name: 'Operations Console', exact: true }) }).getByRole('link', { name: 'Open preview' }).click()
  await expect(page.locator('.advanced-station')).toHaveAttribute('data-design', 'operations-console')
  await expect(page.getByRole('navigation', { name: 'Preview workspace sections' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Saved scans', exact: true })).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'Evidence sections' })).toBeVisible()
  await page.getByRole('button', { name: 'Next design', exact: true }).click()
  await expect(page.locator('.advanced-station')).toHaveAttribute('data-design', 'review-bench')
  await expect(page.getByRole('heading', { name: 'Original image', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Model overlay', exact: true })).toBeVisible()
})

test('saved-scan filtering preserves image identity and selected source evidence', async ({ page }) => {
  await page.goto('/design-studio/?design=operations-console')
  await expect(page.locator('.a-selected-name')).toHaveText('synthetic-alpha.png')
  await page.getByRole('searchbox', { name: 'Search saved scans' }).fill('beta')
  await expect(page.locator('.a-run')).toHaveCount(1)
  await expect(page.locator('.a-selected-name')).toHaveText('synthetic-alpha.png')
  await page.getByRole('button', { name: 'Select saved scan synthetic-beta.png', exact: true }).click()
  await expect(page.locator('.a-selected-name')).toHaveText('synthetic-beta.png')
  await page.getByRole('navigation', { name: 'Preview workspace sections' }).getByRole('button', { name: 'Source', exact: true }).click()
  await expect(page.locator('.a-source-context')).toContainText('IEDXray')
  await expect(page.locator('.a-source-context')).toContainText('Dataset replay')
  await page.getByRole('navigation', { name: 'Preview workspace sections' }).getByRole('button', { name: 'Inspect', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search saved scans' }).fill('')
  await page.getByRole('combobox', { name: 'Review filter', exact: true }).selectOption('failed')
  await page.getByRole('button', { name: 'Select saved scan synthetic-failed.png', exact: true }).click()
  await expect(page.locator('.a-result-title')).toHaveText('Inference did not complete')
  await expect(page.getByRole('tabpanel')).toContainText('Synthetic execution failure.')
  await expect(page.locator('.a-image .model-box')).toHaveCount(0)
  await expect(page.getByRole('tabpanel')).not.toContainText('No detections reported')
})

test('analyst tabs, display adjustments and inspector visibility work by keyboard', async ({ page }) => {
  await page.goto('/design-studio/?design=analyst-studio')
  const findings = page.getByRole('tab', { name: 'Findings', exact: true })
  await findings.focus()
  await findings.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Review', exact: true })).toBeFocused()
  await expect(page.getByRole('tabpanel')).toContainText('Synthetic follow-up note.')
  await page.getByRole('tab', { name: 'Review', exact: true }).press('End')
  await expect(page.getByRole('tab', { name: 'Provenance', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel')).toContainText('synthetic-detector')
  await page.getByRole('button', { name: 'Grayscale', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Grayscale', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.a-image image')).toHaveCSS('filter', /grayscale\(1\)/)
  await expect(page.locator('.a-image .model-box')).toHaveCount(1)
  await page.getByRole('button', { name: 'Reset image display', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Grayscale', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await page.locator('.a-layout-options > summary').click()
  await page.getByRole('checkbox', { name: 'Evidence inspector', exact: true }).uncheck()
  await expect(page.getByRole('tablist', { name: 'Evidence sections' })).toBeHidden()
  await page.getByRole('button', { name: 'Reset layout', exact: true }).click()
  await expect(page.getByRole('tablist', { name: 'Evidence sections' })).toBeVisible()
})

test('unavailable evidence remains an explicit empty preview', async ({ page }) => {
  await page.route('**/api/runs', route => route.fulfill({ status: 503, json: { detail: 'Synthetic outage' } }))
  await page.goto('/design-studio/?design=operations-console')
  await expect(page.locator('.preview-explanation')).toContainText('Local service unavailable')
  await expect(page.locator('.a-result-title')).toHaveText('Awaiting a saved run')
  await expect(page.locator('.a-run')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Zoom in preview', exact: true })).toBeDisabled()
  await page.getByRole('navigation', { name: 'Preview workspace sections' }).getByRole('button', { name: 'Source', exact: true }).click()
  await expect(page.locator('.a-source-context')).toContainText('No selected source')
  await expect(page.locator('.advanced-station')).not.toContainText('No detections reported')
})
