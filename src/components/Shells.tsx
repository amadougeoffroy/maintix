import { useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Search as SearchIcon, Building2, History, Receipt, CalendarDays, Download, Euro, FileText, LayoutDashboard, Menu, PhoneCall, QrCode, ScanLine, Settings, Siren, TriangleAlert, User, Users, type LucideIcon } from 'lucide-react'
import { Logo } from '../brand/Logo'
import { byId, useData } from '../store'
import { signOut } from '../session'
import { SyncBadge } from './SyncBadge'
import { OfflineBanner } from './ui'
import { WelcomeTour } from './WelcomeTour'

const tab = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '')

/** Zone de contenu principale : reçoit le focus à chaque changement d'écran (lecteurs d'écran, clavier). */
function Main({ className }: { className: string }) {
  const ref = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const last = useRef(pathname) // le focus ne bouge que si l'écran change réellement (pas au montage, ni en StrictMode)
  useEffect(() => {
    if (last.current === pathname) return
    last.current = pathname
    ref.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [pathname])
  return <main id="main" ref={ref} tabIndex={-1} className={className}><Outlet /></main>
}
const SkipLink = () => <button type="button" className="skip" onClick={() => document.getElementById('main')?.focus()}>Aller au contenu</button>

export function TechShell() {
  const s = useData()
  const nav = useNavigate()
  const me = byId(s.techs, s.session.techId)
  return (
    <div className="app">
      <SkipLink />
      <header className="topbar">
        <p className="brandline"><Logo variant="dark" height={22} /><span className="who">{me?.name ?? s.session.fullName ?? 'Technicien'}{s.session.orgName ? <span className="org-chip">{s.session.orgName}</span> : null}</span></p>
        <SyncBadge />
        <button className="btn sm ghost" onClick={async () => { if (await signOut()) nav('/') }}>Quitter</button>
      </header>
      <OfflineBanner />
      <WelcomeTour kind="tech" />
      <Main className="content" />
      <nav className="tabbar" aria-label="Navigation technicien">
        <NavLink to="/tech" end className={tab}><CalendarDays size={24} /><span>Ma journée</span></NavLink>
        <NavLink to="/tech/scan" className={tab}><ScanLine size={24} /><span>Scanner</span></NavLink>
        <NavLink to="/tech/urgences" className={tab}><Siren size={24} /><span>Urgences</span></NavLink>
        <NavLink to="/tech/profil" className={tab}><User size={24} /><span>Profil</span></NavLink>
      </nav>
    </div>
  )
}

const OFFICE_LINKS: readonly (readonly [string, LucideIcon, string, boolean])[] = [
  ['/office', LayoutDashboard, 'Tableau de bord', true],
  ['/office/planning', CalendarDays, 'Planning', false],
  ['/office/parc', Building2, 'Parc', false],
  ['/office/search', SearchIcon, 'Recherche', false],
  ['/office/clients', Users, 'Clients & sites', false],
  ['/office/import', Download, 'Importer le parc', false],
  ['/office/defects', TriangleAlert, 'Défauts', false],
  ['/office/quotes', Euro, 'Devis', false],
  ['/office/invoices', Receipt, 'Factures', false],
  ['/office/contracts', FileText, 'Contrats', false],
  ['/office/oncall', PhoneCall, 'Astreinte', false],
  ['/office/qr', QrCode, 'QR codes', false],
  ['/office/audit', History, 'Journal', false],
  ['/office/settings', Settings, 'Réglages', false],
] as const

export function OfficeShell() {
  const nav = useNavigate()
  const s = useData()
  // Ctrl/⌘ + K : recherche globale
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); nav('/office/search') } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [nav])
  return (
    <div className="app office">
      <SkipLink />
      <aside className="sidebar" aria-label="Navigation bureau">
        <div style={{ padding: '6px 12px 16px' }}><Logo height={26} />{s.session.orgName && <div className="org-side" title={s.session.orgName}>{s.session.orgName}</div>}</div>
        {OFFICE_LINKS.map(([to, Icon, label, end]) => (
          <NavLink key={to} to={to} end={end} className={tab}><Icon size={20} />{label}</NavLink>
        ))}
        <button className="btn sm ghost" style={{ marginTop: 'auto' }} onClick={async () => { if (await signOut()) nav('/') }}>Quitter</button>
      </aside>
      <div className="app">
        <header className="topbar">
          <p className="brandline"><Logo variant="dark" height={22} /><span className="who"><span className="who-label">Bureau</span>{s.session.orgName ? <span className="org-chip">{s.session.orgName}</span> : null}</span></p>
          <NavLink to="/office/search" className="btn sm ghost" aria-label="Rechercher"><SearchIcon size={18} /></NavLink>
          <SyncBadge />
          <button className="btn sm ghost" onClick={async () => { if (await signOut()) nav('/') }}>Quitter</button>
        </header>
        <OfflineBanner />
        <WelcomeTour kind="admin" />
        <Main className="content wide" />
        <nav className="tabbar" aria-label="Navigation bureau mobile">
          <NavLink to="/office" end className={tab}><LayoutDashboard size={24} /><span>Accueil</span></NavLink>
          <NavLink to="/office/planning" className={tab}><CalendarDays size={24} /><span>Planning</span></NavLink>
          <NavLink to="/office/parc" className={tab}><Building2 size={24} /><span>Parc</span></NavLink>
          <NavLink to="/office/defects" className={tab}><TriangleAlert size={24} /><span>Défauts</span></NavLink>
          <NavLink to="/office/more" className={tab}><Menu size={24} /><span>Plus</span></NavLink>
        </nav>
      </div>
    </div>
  )
}

export function OfficeMore() {
  const s = useData()
  return (
    <div className="stack">
      <div><h1>Plus</h1>{s.session.orgName && <p className="org-line">{s.session.orgName}</p>}</div>
      {OFFICE_LINKS.filter(([to]) => !['/office', '/office/planning', '/office/parc', '/office/defects'].includes(to)).map(([to, Icon, label]) => (
        <NavLink key={to} to={to} className="card link row"><Icon size={20} /> {label}</NavLink>
      ))}
    </div>
  )
}

export function ClientShell() {
  const s = useData()
  const nav = useNavigate()
  const c = byId(s.clients, s.session.clientId)
  return (
    <div className="app">
      <SkipLink />
      <header className="topbar">
        <p className="brandline"><Logo variant="dark" height={22} /><span className="who">{c?.name ?? 'Portail client'}</span></p>
        <SyncBadge />
        <button className="btn sm ghost" onClick={async () => { if (await signOut()) nav('/') }}>Quitter</button>
      </header>
      <Main className="content" />
    </div>
  )
}
