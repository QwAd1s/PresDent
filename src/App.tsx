import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import Dashboard from './pages/Dashboard'
import Leads from './pages/Leads'
import Patients from './pages/Patients'
import Doctors from './pages/Doctors'
import Schedule from './pages/Schedule'
import Reviews from './pages/Reviews'
import Channels from './pages/Channels'
import Settings from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="leads" element={<Leads />} />
        <Route path="patients" element={<Patients />} />
        <Route path="doctors" element={<Doctors />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="reviews" element={<Reviews />} />
        <Route path="channels" element={<Channels />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
