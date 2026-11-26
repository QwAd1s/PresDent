import { useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import type { Stats } from '../../shared/types'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { connectRealtime, disconnectRealtime, getReviews, getStats, isDemoMode, subscribe } from '../lib/api'

export interface LayoutContext {
  stats: Stats | null
  refreshStats: () => void
}

export function Layout() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [unanswered, setUnanswered] = useState(0)
  const [demoMode, setDemoMode] = useState(isDemoMode())

  const refreshStats = useCallback(() => {
    void getStats().then((payload) => {
      setStats(payload)
      setDemoMode(isDemoMode())
    })
  }, [])

  useEffect(() => {
    let alive = true

    const refresh = async () => {
      const [statsPayload, reviews] = await Promise.all([getStats(), getReviews()])
      if (!alive) return
      setStats(statsPayload)
      setUnanswered(reviews.unanswered)
      setDemoMode(isDemoMode())
    }

    void refresh()
    connectRealtime()

    const unsubscribe = subscribe((type) => {
      if (type === 'demo') setDemoMode(true)
      if (type === 'lead:new' || type === 'lead:update' || type === 'lead:message') void refresh()
    })

    return () => {
      alive = false
      unsubscribe()
      disconnectRealtime()
    }
  }, [])

  return (
    <div className="app">
      <Sidebar newLeads={stats?.newLeads ?? 0} unansweredReviews={unanswered} />
      <div className="main">
        <Topbar demoMode={demoMode} newLeads={stats?.newLeads ?? 0} />
        <main className="content">
          <Outlet context={{ stats, refreshStats } satisfies LayoutContext} />
        </main>
      </div>
    </div>
  )
}
