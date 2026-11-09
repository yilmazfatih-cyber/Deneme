import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout, PortalLayout } from './components/Layout.tsx'
import { Spinner } from './components/ui.tsx'
import { SiteProvider, useAuth } from './context.tsx'
import { Login } from './pages/Login.tsx'
import {
  PaymentResult,
  PortalAnnouncements,
  PortalAssistant,
  PortalHome,
  PortalMeetings,
  PortalPay,
  PortalPrivacy,
  PortalRequest,
  PortalRequests,
  PortalStatement,
  TestPayment,
} from './pages/portal/Portal.tsx'
import { Import, Settings, Vendors } from './pages/staff/Admin.tsx'
import { Approvals } from './pages/staff/Approvals.tsx'
import { BankImport } from './pages/staff/BankImport.tsx'
import { BudgetEditor } from './pages/staff/Budget.tsx'
import { Dashboard } from './pages/staff/Dashboard.tsx'
import { Finance } from './pages/staff/Finance.tsx'
import { Announcements, Compliance, Documents, MeetingDetail, Meetings } from './pages/staff/Governance.tsx'
import { Inbox } from './pages/staff/Inbox.tsx'
import { TicketDetail, Tickets } from './pages/staff/Tickets.tsx'
import { People, UnitDetail, Units } from './pages/staff/Units.tsx'

export function App() {
  const { me, loading } = useAuth()
  if (loading) return <Spinner />
  if (!me) return <Login />
  if (me.user.role === 'sakin') {
    return (
      <Routes>
        <Route path="/odeme/test/:oid" element={<TestPayment />} />
        <Route path="/odeme/sonuc/:oid" element={<PaymentResult />} />
        <Route path="/portal" element={<PortalLayout />}>
          <Route index element={<PortalHome />} />
          <Route path="hesap/:unitId" element={<PortalStatement />} />
          <Route path="odeme/:unitId" element={<PortalPay />} />
          <Route path="talepler" element={<PortalRequests />} />
          <Route path="talepler/:id" element={<PortalRequest />} />
          <Route path="asistan" element={<PortalAssistant />} />
          <Route path="duyurular" element={<PortalAnnouncements />} />
          <Route path="toplantilar" element={<PortalMeetings />} />
          <Route path="gizlilik" element={<PortalPrivacy />} />
        </Route>
        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Routes>
    )
  }
  return (
    <SiteProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="gelen-kutusu" element={<Inbox />} />
          <Route path="gelen-kutusu/:id" element={<Inbox />} />
          <Route path="onaylar" element={<Approvals />} />
          <Route path="talepler" element={<Tickets />} />
          <Route path="talepler/:id" element={<TicketDetail />} />
          <Route path="finans" element={<Finance />} />
          <Route path="finans/butce/:id" element={<BudgetEditor />} />
          <Route path="finans/banka/:id" element={<BankImport />} />
          <Route path="daireler" element={<Units />} />
          <Route path="daireler/:id" element={<UnitDetail />} />
          <Route path="kisiler" element={<People />} />
          <Route path="duyurular" element={<Announcements />} />
          <Route path="genel-kurul" element={<Meetings />} />
          <Route path="genel-kurul/:id" element={<MeetingDetail />} />
          <Route path="kontroller" element={<Compliance />} />
          <Route path="belgeler" element={<Documents />} />
          <Route path="tedarikciler" element={<Vendors />} />
          <Route path="ayarlar" element={<Settings />} />
          <Route path="ice-aktar" element={<Import />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SiteProvider>
  )
}
