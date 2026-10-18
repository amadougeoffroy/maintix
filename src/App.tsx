import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { runtime, useData } from './store'
import { ClientShell, OfficeMore, OfficeShell, OperatorShell, TechShell } from './components/Shells'
import OperatorConsole from './pages/operator/OperatorConsole'
import Signup from './pages/Signup'
import Suspended from './pages/Suspended'
import { FeedbackHost } from './components/FeedbackHost'
import Login from './pages/Login'
import Landing from './pages/Landing'
import BillingReturn from './pages/BillingReturn'
import Auth from './pages/Auth'
import Setup from './pages/Setup'
import Report from './pages/Report'
import ElevatorSheet from './pages/ElevatorSheet'
import Day from './pages/tech/Day'
import Scan from './pages/tech/Scan'
import Visit from './pages/tech/Visit'
import Urgences from './pages/tech/Urgences'
import Profile from './pages/tech/Profile'
import Dashboard from './pages/office/Dashboard'
import Planning from './pages/office/Planning'
import Parc from './pages/office/Parc'
import Defects from './pages/office/Defects'
import Quotes from './pages/office/Quotes'
import Contracts from './pages/office/Contracts'
import OnCall from './pages/office/OnCall'
import QRPrint from './pages/office/QRPrint'
import Settings from './pages/office/Settings'
import Clients from './pages/office/Clients'
import Import from './pages/office/Import'
import Dossier from './pages/office/Dossier'
import Invoices from './pages/office/Invoices'
import InvoiceDetail from './pages/office/InvoiceDetail'
import Audit from './pages/office/Audit'
import Search from './pages/office/Search'
import ClientDashboard from './pages/office/ClientDashboard'
import Portal from './pages/client/Portal'
import Signal from './pages/client/Signal'
import Status from './pages/client/Status'

export default function App() {
  const { session } = useData()
  const { pathname } = useLocation()
  const suspended = session.orgStatus === 'suspended' && (session.role || session.clientId)
  const inPlatform = !!session.operator && session.orgKind === 'platform'
  const home = inPlatform ? '/operator' : session.role === 'tech' ? '/tech' : session.role === 'bureau' ? '/office' : session.clientId ? '/client' : null
  return (
    <>
    <FeedbackHost />
    {suspended && !pathname.startsWith('/operator') && !pathname.startsWith('/billing') ? <Suspended /> : (
    <Routes>
      <Route path="/" element={home ? <Navigate to={home} replace /> : runtime.server ? <Landing /> : <Login />} />
      <Route path="/login" element={home ? <Navigate to={home} replace /> : <Login />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/billing/return" element={<BillingReturn />} />
      <Route path="/operator" element={session.operator ? <OperatorShell /> : <Navigate to="/" replace />}>
        <Route index element={<OperatorConsole />} />
      </Route>
      <Route path="/signal/:id" element={<Signal />} />
      <Route path="/status/:id" element={<Status />} />
      <Route path="/report/:id" element={<Report />} />

      <Route path="/tech" element={session.role === 'tech' ? <TechShell /> : <Navigate to="/" replace />}>
        <Route index element={<Day />} />
        <Route path="scan" element={<Scan />} />
        <Route path="urgences" element={<Urgences />} />
        <Route path="profil" element={<Profile />} />
        <Route path="job/:id" element={<Visit />} />
        <Route path="elevator/:id" element={<ElevatorSheet mode="tech" />} />
      </Route>

      <Route path="/office" element={session.role === 'bureau' && !inPlatform ? <OfficeShell /> : <Navigate to="/" replace />}>
        <Route index element={<Dashboard />} />
        <Route path="planning" element={<Planning />} />
        <Route path="parc" element={<Parc />} />
        <Route path="elevator/:id" element={<ElevatorSheet mode="office" />} />
        <Route path="defects" element={<Defects />} />
        <Route path="quotes" element={<Quotes />} />
        <Route path="audit" element={<Audit />} />
        <Route path="search" element={<Search />} />
        <Route path="clients/:id" element={<ClientDashboard />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/:id" element={<InvoiceDetail />} />
        <Route path="contracts" element={<Contracts />} />
        <Route path="oncall" element={<OnCall />} />
        <Route path="qr" element={<QRPrint />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/:tab" element={<Settings />} />
        <Route path="more" element={<OfficeMore />} />
        <Route path="clients" element={<Clients />} />
        <Route path="import" element={<Import />} />
        <Route path="dossier/:id" element={<Dossier />} />
      </Route>

      <Route path="/client" element={session.clientId ? <ClientShell /> : <Navigate to="/" replace />}>
        <Route index element={<Portal />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    )}
    </>
  )
}
