import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { User, UserRole } from '../../shared/types'
import { changePasswordRequest, loginRequest, logoutRequest, meRequest, subscribe } from './api'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  changePassword: (current: string, next: string) => Promise<{ ok: boolean; error?: string }>
  can: (...roles: UserRole[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    void meRequest().then((current) => {
      if (!alive) return
      setUser(current)
      setLoading(false)
    })

    // сессия истекла или её отозвали — мягко выкидываем на вход
    const unsubscribe = subscribe((type) => {
      if (type === 'auth:expired') setUser(null)
    })

    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginRequest(email, password)
    if (result.ok && result.user) setUser(result.user)
    return { ok: result.ok, error: result.error }
  }, [])

  const logout = useCallback(async () => {
    await logoutRequest()
    setUser(null)
  }, [])

  const changePassword = useCallback(async (current: string, next: string) => {
    return changePasswordRequest(current, next)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      logout,
      changePassword,
      can: (...roles: UserRole[]) => Boolean(user && roles.includes(user.role)),
    }),
    [user, loading, login, logout, changePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="auth-splash">
        <span className="auth-splash-mark">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3.2c-2.2 0-3.1 1-5.1 1C5 4.2 3.4 5.9 3.4 8.6c0 3.4 1.7 6 2.6 8.7.5 1.6.9 3.5 2.2 3.5 1.1 0 1.2-1.7 1.5-3.6.2-1.4.6-2.6 2.3-2.6s2.1 1.2 2.3 2.6c.3 1.9.4 3.6 1.5 3.6 1.3 0 1.7-1.9 2.2-3.5.9-2.7 2.6-5.3 2.6-8.7 0-2.7-1.6-4.4-3.5-4.4-2 0-2.9-1-5.1-1z"
              fill="currentColor"
            />
          </svg>
        </span>
        <div className="auth-splash-text">Проверяем сессию…</div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

/** Скрывает разделы, недоступные роли: врача не пускает в заявки и настройки. */
export function RoleGate({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return null
  if (!roles.includes(user.role)) return <Navigate to={user.role === 'doctor' ? '/schedule' : '/'} replace />
  return <>{children}</>
}
