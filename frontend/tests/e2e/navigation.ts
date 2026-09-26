import type { Page } from '@playwright/test'

/** Native app links share one navigation; smaller screens disclose it with Menu. */
export async function workspaceLink(page: Page, name: string) {
  const link = page.getByRole('navigation', { name: 'Workspace sections', includeHidden: true })
    .getByRole('link', { name, exact: true, includeHidden: true })
  if (!await link.isVisible()) await page.getByRole('button', { name: 'Menu', exact: true }).click()
  return link
}

export async function navigate(page: Page, name: string) {
  await (await workspaceLink(page, name)).click()
}
