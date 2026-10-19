import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, ShieldCheck, Search as SearchIcon, Building2, History, Receipt, CalendarDays, Download, Euro, FileText, LayoutDashboard, Menu, PhoneCall, QrCode, ScanLine, Settings, Siren, TriangleAlert, User, Users, type LucideIcon } from 'lucide-react'
import { Logo } from '../brand/Logo'
import { byId, useData } from '../store'
import { feedback } from '../feedback'
import { leaveToConsole, signOut } from '../session'
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
/** Bandeau du mode opérateur : on agit dans une entreprise cliente ; un clic ramène à la console. */
/** Jours restants avant la date (AAAA-MM-JJ), en jours calendaires locaux ; négatif si dépassée. */
export function daysUntil(date: string, now = new Date()): number {
  const [y, m, d] = date.split('-').map(Number)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000)
}
export const RENEWAL_WARNING_DAYS = 7

/** Bande rouge sur toutes les pages : l'abonnement (ou l'essai) se termine dans 7 jours ou moins. */
function RenewalBanner({ canRenew }: { canRenew: boolean }) {
  const s = useData()
  const nav = useNavigate()
  const end = s.session.planEndsOn
  if (!end || s.session.orgKind === 'platform' || s.session.orgStatus === 'suspended') return null
  const days = daysUntil(end)
  if (days > RENEWAL_WARNING_DAYS || days < 0) return null
  const what = s.session.planName === 'essai' ? 'votre période d’essai' : 'votre abonnement'
  const when = days === 0 ? 'se termine aujourd’hui' : days === 1 ? 'se termine demain' : `se termine dans ${days} jours`
  return (
    <div className="renew-banner" role="alert">
      <p className="banner-text"><TriangleAlert size={18} aria-hidden="true" /><strong>{what.charAt(0).toUpperCase() + what.slice(1)} {when}.</strong> Renouvelez-le avant cette date pour ne pas perdre l’accès.</p>
      {canRenew
        ? <button type="button" className="btn sm" onClick={() => nav('/office/settings/abonnement')}>Renouveler maintenant</button>
        : <span className="small">Contactez l’administrateur de votre entreprise.</span>}
    </div>
  )
}

function useLeaveConsole() {
  const nav = useNavigate()
  return async () => { const r = await leaveToConsole(); if (r.ok) nav('/operator'); else feedback.toast(r.error, 'error') }
}
function OperatorBanner() {
  const s = useData()
  const leave = useLeaveConsole()
  if (!s.session.impersonating) return null
  return (
    <div className="op-banner" role="region" aria-label="Mode opérateur">
      <p className="banner-text"><ShieldCheck size={18} aria-hidden="true" />Mode opérateur : vous êtes dans <strong>{s.session.orgName}</strong></p>
      <button type="button" className="btn sm" onClick={leave}>← Retour à la console</button>
    </div>
  )
}
const SkipLink = () => <button type="button" className="skip" onClick={() => document.getElementById('main')?.focus()}>Aller au contenu</button>

export function TechShell() {
  const s = useData()
  const nav = useNavigate()
  const me = byId(s.techs, s.session.techId)
  return (
    <div className="app">
      <SkipLink />
      <RenewalBanner canRenew={false} />
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

type NavLinkDef = readonly [string, LucideIcon, string, boolean]
interface NavGroup { key: string; label: string; links: readonly NavLinkDef[] }

/** Navigation du bureau, regroupée par domaine (les groupes se replient, l'état est mémorisé). */
const OFFICE_GROUPS: readonly NavGroup[] = [
  { key: 'pilotage', label: 'Pilotage', links: [
    ['/office', LayoutDashboard, 'Tableau de bord', true],
    ['/office/planning', CalendarDays, 'Planning', false],
    ['/office/oncall', PhoneCall, 'Astreinte', false],
    ['/office/search', SearchIcon, 'Recherche', false],
  ] },
  { key: 'parc', label: 'Parc et clients', links: [
    ['/office/parc', Building2, 'Parc', false],
    ['/office/clients', Users, 'Clients & sites', false],
    ['/office/defects', TriangleAlert, 'Défauts', false],
    ['/office/qr', QrCode, 'QR codes', false],
    ['/office/import', Download, 'Importer le parc', false],
  ] },
  { key: 'commercial', label: 'Commercial', links: [
    ['/office/contracts', FileText, 'Contrats', false],
    ['/office/quotes', Euro, 'Devis', false],
    ['/office/invoices', Receipt, 'Factures', false],
  ] },
  { key: 'admin', label: 'Administration', links: [
    ['/office/audit', History, 'Journal', false],
    ['/office/settings', Settings, 'Réglages', false],
  ] },
]
const BOTTOM_TABS = ['/office', '/office/planning', '/office/parc', '/office/defects']

const NAV_KEY = 'maintix-nav-collapsed'
const readCollapsed = (): string[] => { try { return JSON.parse(localStorage.getItem(NAV_KEY) ?? '[]') } catch { return [] } }

/** Un groupe de liens, repliable ; le groupe de la page active reste toujours ouvert. */
function SidebarGroup({ group }: { group: NavGroup }) {
  const { pathname } = useLocation()
  const active = group.links.some(([to, , , end]) => (end ? pathname === to : pathname === to || pathname.startsWith(to + '/')))
  const [collapsed, setCollapsed] = useState(() => readCollapsed().includes(group.key))
  const open = active || !collapsed
  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try { const all = new Set(readCollapsed()); if (next) all.add(group.key); else all.delete(group.key); localStorage.setItem(NAV_KEY, JSON.stringify([...all])) } catch { /* mémorisation indisponible */ }
  }
  return (
    <div className="nav-group">
      <button type="button" className="nav-group-head" aria-expanded={open} aria-controls={`nav-${group.key}`} onClick={toggle}>
        <span>{group.label}</span><ChevronDown size={16} aria-hidden="true" className={open ? 'open' : ''} />
      </button>
      {open && (
        <div id={`nav-${group.key}`} className="nav-group-links">
          {group.links.map(([to, Icon, label, end]) => <NavLink key={to} to={to} end={end} className={tab}><Icon size={20} />{label}</NavLink>)}
        </div>
      )}
    </div>
  )
}

export function OfficeShell() {
  const nav = useNavigate()
  const s = useData()
  const leave = useLeaveConsole()
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
        <nav aria-label="Sections" className="nav-groups">{OFFICE_GROUPS.map((g) => <SidebarGroup key={g.key} group={g} />)}</nav>
        {s.session.impersonating && <button className="btn sm" style={{ marginTop: 'auto' }} onClick={leave}><ShieldCheck size={16} aria-hidden="true" /> Retour à la console</button>}
        <button className="btn sm ghost" style={s.session.impersonating ? undefined : { marginTop: 'auto' }} onClick={async () => { if (await signOut()) nav('/') }}>Quitter</button>
      </aside>
      <div className="app">
        <OperatorBanner />
        <RenewalBanner canRenew />
        <header className="topbar">
          <p className="brandline"><Logo variant="dark" height={22} /><span className="who"><span className="who-label">Bureau</span>{s.session.orgName ? <span className="org-chip">{s.session.orgName}</span> : null}</span></p>
          <NavLink to="/office/search" className="btn sm ghost" aria-label="Rechercher"><SearchIcon size={18} /></NavLink>
          <SyncBadge />
          <button className="btn sm ghost" onClick={async () => { if (await signOut()) nav('/') }}>Quitter</button>
        </header>
        <OfflineBanner />
        {!s.session.impersonating && <WelcomeTour kind="admin" />}
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
  const leave = useLeaveConsole()
  return (
    <div className="stack-lg">
      <div><h1>Plus</h1>{s.session.orgName && <p className="org-line">{s.session.orgName}</p>}</div>
      {s.session.impersonating && <button type="button" className="card link row" onClick={leave}><ShieldCheck size={20} /> Retour à la console opérateur</button>}
      {OFFICE_GROUPS.map((g) => ({ ...g, links: g.links.filter(([to]) => !BOTTOM_TABS.includes(to)) })).filter((g) => g.links.length > 0).map((g) => (
        <section key={g.key} className="stack">
          <h2 className="more-head">{g.label}</h2>
          {g.links.map(([to, Icon, label]) => <NavLink key={to} to={to} className="card link row"><Icon size={20} /> {label}</NavLink>)}
        </section>
      ))}
    </div>
  )
}

export function OperatorShell() {
  const s = useData()
  const nav = useNavigate()
  return (
    <div className="app">
      <SkipLink />
      <header className="topbar">
        <p className="brandline"><Logo variant="dark" height={22} /><span className="who">Console opérateur</span></p>
        <button className="btn sm ghost" onClick={async () => { if (await signOut()) nav('/') }}>Quitter</button>
      </header>
      <OfflineBanner />
      <Main className="content wide" />
      <span className="sr-only">{s.session.fullName}</span>
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
