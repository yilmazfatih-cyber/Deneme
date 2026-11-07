import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { homePath, useAuth } from './auth'
import { Layout } from './components/Layout'
import { Loading } from './components/Feedback'
import { LoginPage } from './pages/Login'
import { SignupPage } from './pages/Signup'
import { NotFoundPage } from './pages/NotFound'
import { DashboardPage } from './pages/operator/Dashboard'
import { EntitiesPage } from './pages/operator/Entities'
import { EntityDetailPage } from './pages/operator/EntityDetail'
import { NumbersPage } from './pages/operator/Numbers'
import { BrandingReviewPage } from './pages/operator/BrandingReview'
import { ReputationPage } from './pages/operator/Reputation'
import { ReputationDetailPage } from './pages/operator/ReputationDetail'
import { DisputesPage } from './pages/shared/Disputes'
import { DisputeDetailPage } from './pages/shared/DisputeDetail'
import { CertificatesPage } from './pages/operator/Certificates'
import { LookupPage } from './pages/operator/Lookup'
import { ApiKeysPage } from './pages/shared/ApiKeys'
import { UsersPage } from './pages/operator/Users'
import { WebhooksPage } from './pages/shared/Webhooks'
import { OutboxPage } from './pages/operator/Outbox'
import { AuditPage } from './pages/operator/Audit'
import { CompanyPage } from './pages/enterprise/Company'
import { MyNumbersPage } from './pages/enterprise/MyNumbers'
import { MyBrandingPage } from './pages/enterprise/MyBranding'
import { MyReputationPage } from './pages/enterprise/MyReputation'
import { MyCertificatesPage } from './pages/enterprise/MyCertificates'

function Guard({ area, children }: { area: 'operator' | 'enterprise'; children: ReactNode }) {
  const { loading, user, isOperator } = useAuth()
  const location = useLocation()
  if (loading) return <Loading text="Oturum kontrol ediliyor…" />
  if (!user) return <Navigate to="/giris" replace state={{ from: location.pathname }} />
  if ((area === 'operator') !== isOperator) return <Navigate to={homePath(user)} replace />
  return <>{children}</>
}

function Home() {
  const { loading, user } = useAuth()
  if (loading) return <Loading text="Oturum kontrol ediliyor…" />
  return <Navigate to={homePath(user)} replace />
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/giris" element={<LoginPage />} />
      <Route path="/kayit" element={<SignupPage />} />
      <Route
        path="/operator"
        element={
          <Guard area="operator">
            <Layout />
          </Guard>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="dogrulama" element={<EntitiesPage />} />
        <Route path="dogrulama/:id" element={<EntityDetailPage />} />
        <Route path="numaralar" element={<NumbersPage />} />
        <Route path="marka" element={<BrandingReviewPage />} />
        <Route path="itibar" element={<ReputationPage />} />
        <Route path="itibar/:tn" element={<ReputationDetailPage />} />
        <Route path="itirazlar" element={<DisputesPage mode="admin" />} />
        <Route path="itirazlar/:id" element={<DisputeDetailPage mode="admin" />} />
        <Route path="sertifikalar" element={<CertificatesPage />} />
        <Route path="sorgula" element={<LookupPage />} />
        <Route path="api-anahtarlari" element={<ApiKeysPage mode="admin" />} />
        <Route path="kullanicilar" element={<UsersPage />} />
        <Route path="webhooklar" element={<WebhooksPage mode="admin" />} />
        <Route path="e-posta" element={<OutboxPage />} />
        <Route path="denetim" element={<AuditPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route
        path="/kurum"
        element={
          <Guard area="enterprise">
            <Layout />
          </Guard>
        }
      >
        <Route index element={<CompanyPage />} />
        <Route path="numaralar" element={<MyNumbersPage />} />
        <Route path="marka" element={<MyBrandingPage />} />
        <Route path="itibar" element={<MyReputationPage />} />
        <Route path="itirazlar" element={<DisputesPage mode="enterprise" />} />
        <Route path="itirazlar/:id" element={<DisputeDetailPage mode="enterprise" />} />
        <Route path="sertifikalar" element={<MyCertificatesPage />} />
        <Route path="api-anahtarlari" element={<ApiKeysPage mode="enterprise" />} />
        <Route path="webhooklar" element={<WebhooksPage mode="enterprise" />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
