export type DashboardPage = 'dashboard' | 'setup' | 'inspect' | 'session' | 'source'

const pageHashes: Record<DashboardPage, string> = {
  dashboard: '#dashboard',
  setup: '#main-menu',
  inspect: '#workspace',
  session: '#session',
  source: '#source',
}

export const pageTitles: Record<DashboardPage, string> = {
  dashboard: 'Dashboard',
  setup: 'Workspace setup',
  inspect: 'Inspect',
  session: 'Session',
  source: 'Source',
}

export function pageHref(page: DashboardPage): string {
  return pageHashes[page]
}

export function readPage(hash: string): DashboardPage {
  return (Object.keys(pageHashes) as DashboardPage[]).find(page => pageHashes[page] === hash) ?? 'dashboard'
}
