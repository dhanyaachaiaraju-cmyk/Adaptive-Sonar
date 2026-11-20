import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { isEnvConfigured, missingEnvVars } from './lib/env'
import AppLayout from './components/AppLayout'
import AssistantPage from './pages/AssistantPage'
import ConfigError from './components/ConfigError'
import ProtectedRoute from './components/ProtectedRoute'
import CustomersPage from './pages/CustomersPage'
import DashboardPage from './pages/DashboardPage'
import InvoiceDetailPage from './pages/InvoiceDetailPage'
import InvoiceFormPage from './pages/InvoiceFormPage'
import InvoicesPage from './pages/InvoicesPage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import PaymentsPage from './pages/PaymentsPage'
import PayInvoicePage from './pages/PayInvoicePage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  if (!isEnvConfigured) return <ConfigError missing={missingEnvVars} />

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/pay/:token" element={<PayInvoicePage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="assistant" element={<AssistantPage />} />
              <Route path="assistant/:conversationId" element={<AssistantPage />} />
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="invoices/new" element={<InvoiceFormPage />} />
              <Route path="invoices/:invoiceId" element={<InvoiceDetailPage />} />
              <Route path="invoices/:invoiceId/edit" element={<InvoiceFormPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
