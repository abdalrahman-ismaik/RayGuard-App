import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { Cable, ChevronDown, History, LayoutDashboard, PanelLeftClose, PanelLeftOpen, ScanLine, SlidersHorizontal, X } from 'lucide-react'
import { pageHref, pageTitles, type DashboardPage } from '../pages'
import '../dashboard-navigation.css'

interface Props {
  page: DashboardPage
  compact: boolean
  onCompact: () => void
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, page: DashboardPage) => void
}

const groups = [
  { label: 'Workspace', links: [
    { page: 'dashboard', Icon: LayoutDashboard },
    { page: 'inspect', Icon: ScanLine },
    { page: 'setup', Icon: SlidersHorizontal },
  ] },
  { label: 'Records', links: [{ page: 'session', Icon: History }] },
  { label: 'System', links: [{ page: 'source', Icon: Cable }] },
] as const

export function DashboardNavigation({ page, compact, onCompact, onNavigate }: Props) {
  const [open, setOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const navigation = useRef<HTMLElement>(null)
  const contentId = useId()
  const compactLabel = compact ? 'Expand navigation' : 'Collapse navigation'

  useEffect(() => { setOpen(false) }, [page])
  useEffect(() => {
    const breakpoint = window.matchMedia('(max-width: 900px)')
    const close = () => setOpen(false)
    breakpoint.addEventListener('change', close)
    return () => breakpoint.removeEventListener('change', close)
  }, [])
  useEffect(() => {
    if (!open) return
    if (window.matchMedia('(max-width: 900px)').matches) {
      const current = navigation.current?.querySelector<HTMLAnchorElement>('[aria-current="page"]')
      ;(current ?? navigation.current?.querySelector<HTMLAnchorElement>('a'))?.focus()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape' || event.isComposing) return
      event.preventDefault()
      setOpen(false)
      menuButton.current?.focus()
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [open])

  const navigate = (event: MouseEvent<HTMLAnchorElement>, destination: DashboardPage) => {
    onNavigate(event, destination)
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      // The route owner moves focus to the destination after rendering.
      setOpen(false)
    }
  }

  return <aside className={`dashboard-sidebar${open ? ' is-menu-open' : ''}`}>
    <div className="dashboard-brand-row">
      <a className="dashboard-brand" href={pageHref('dashboard')} aria-label="RayGuard dashboard" title={compact ? 'RayGuard dashboard' : undefined}
        onClick={event => navigate(event, 'dashboard')}><ScanLine size={25} strokeWidth={1.7} aria-hidden="true" /><span>RayGuard</span></a>
      <button className="dashboard-menu-toggle" type="button" ref={menuButton} aria-expanded={open} aria-controls={contentId} onClick={() => setOpen(value => !value)}>
        {open ? 'Close menu' : 'Menu'}{open ? <X size={17} aria-hidden="true" /> : <ChevronDown size={17} aria-hidden="true" />}
      </button>
    </div>
    <div className="dashboard-nav-content" id={contentId}>
      <nav ref={navigation} aria-label="Workspace sections">
        {groups.map(group => <div className="dashboard-nav-group" key={group.label}>
          <p className="dashboard-nav-caption">{group.label}</p>
          <ul>{group.links.map(({ page: destination, Icon }) => <li key={destination}>
            <a className="dashboard-nav-link" href={pageHref(destination)} aria-label={pageTitles[destination]} title={compact ? pageTitles[destination] : undefined}
              aria-current={page === destination ? 'page' : undefined} onClick={event => navigate(event, destination)}>
              <Icon size={20} strokeWidth={1.65} aria-hidden="true" /><span className="dashboard-nav-label">{pageTitles[destination]}</span>
            </a>
          </li>)}</ul>
        </div>)}
      </nav>
      <div className="dashboard-nav-footer">
        <p>Local research workspace</p>
        <button type="button" className="dashboard-compact-toggle" aria-label={compactLabel} title={compactLabel} onClick={onCompact}>
          {compact ? <PanelLeftOpen size={19} aria-hidden="true" /> : <PanelLeftClose size={19} aria-hidden="true" />}<span>Collapse navigation</span>
        </button>
      </div>
    </div>
  </aside>
}
