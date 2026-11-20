import { useRoute } from './app/router'
import { AppShell } from './components/layout/AppShell'
import { ToastProvider } from './components/ui/ToastProvider'
import { PageRenderer } from './pages/PageRenderer'

export default function App() {
  const route = useRoute()

  return (
    <ToastProvider>
      <AppShell route={route}>
        <PageRenderer route={route} />
      </AppShell>
    </ToastProvider>
  )
}
