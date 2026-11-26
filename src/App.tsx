import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AuthProvider, RequireAuth, RoleGate } from './lib/auth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Leads from './pages/Leads'
import Patients from './pages/Patients'
import Doctors from './pages/Doctors'
import Schedule from './pages/Schedule'
import Reviews from './pages/Reviews'
import Channels from './pages/Channels'
import Settings from './pages/Settings'
import Audit from './pages/Audit'
import Reminders from './pages/Reminders'
import PublicSite from './pages/PublicSite'

const STAFF = ['owner', 'admin'] as const

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route path="site" element={<PublicSite />} />

        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route
            path="leads"
            element={
              <RoleGate roles={[...STAFF]}>
                <Leads />
              </RoleGate>
            }
          />
          <Route path="patients" element={<Patients />} />
          <Route path="doctors" element={<Doctors />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="reviews" element={<Reviews />} />
          <Route
            path="channels"
            element={
              <RoleGate roles={[...STAFF]}>
                <Channels />
              </RoleGate>
            }
          />
          <Route
            path="audit"
            element={
              <RoleGate roles={[...STAFF]}>
                <Audit />
              </RoleGate>
            }
          />
          <Route
            path="reminders"
            element={
              <RoleGate roles={[...STAFF]}>
                <Reminders />
              </RoleGate>
            }
          />
          <Route
            path="settings"
            element={
              <RoleGate roles={[...STAFF]}>
                <Settings />
              </RoleGate>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
