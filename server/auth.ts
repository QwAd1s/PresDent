import { randomBytes } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import type { SessionRecord, StoredUser, User, UserRole } from '../shared/types'
import { getDb, saveDb } from './store'
import { verifyPassword } from './password'

export const SESSION_COOKIE = 'president_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const IS_PROD = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User
      sessionId?: string
    }
  }
}

/** Отдаём наружу пользователя без хеша пароля. */
export function publicUser(user: StoredUser): User {
  const result: User = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active !== false,
    createdAt: user.createdAt,
  }
  if (user.doctorId) result.doctorId = user.doctorId
  if (user.lastLoginAt) result.lastLoginAt = user.lastLoginAt
  return result
}

// ─── Cookies ────────────────────────────────────────────────────────────────

export function parseCookies(header?: string): Record<string, string> {
  if (!header) return {}
  return header.split(';').reduce<Record<string, string>>((acc, chunk) => {
    const index = chunk.indexOf('=')
    if (index < 0) return acc
    const key = chunk.slice(0, index).trim()
    const value = chunk.slice(index + 1).trim()
    if (key) acc[key] = decodeURIComponent(value)
    return acc
  }, {})
}

function cookieAttributes(maxAgeSec: number): string {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`]
  if (IS_PROD) parts.push('Secure')
  return parts.join('; ')
}

export const sessionCookieHeader = (sessionId: string) =>
  `${SESSION_COOKIE}=${sessionId}; ${cookieAttributes(Math.floor(SESSION_TTL_MS / 1000))}`

export const clearCookieHeader = () => `${SESSION_COOKIE}=; ${cookieAttributes(0)}`

// ─── Сессии ─────────────────────────────────────────────────────────────────

export function pruneSessions(): void {
  const db = getDb()
  const now = Date.now()
  const alive = db.sessions.filter((session) => new Date(session.expiresAt).getTime() > now)
  if (alive.length !== db.sessions.length) {
    db.sessions = alive
    saveDb()
  }
}

export function createSession(user: StoredUser, userAgent?: string): SessionRecord {
  const db = getDb()
  pruneSessions()

  const session: SessionRecord = {
    id: randomBytes(32).toString('base64url'),
    userId: user.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    userAgent: userAgent?.slice(0, 160),
  }

  db.sessions.push(session)
  user.lastLoginAt = session.createdAt
  saveDb()
  return session
}

export function findSession(sessionId: string): { session: SessionRecord; user: StoredUser } | null {
  const db = getDb()
  const session = db.sessions.find((item) => item.id === sessionId)
  if (!session) return null
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    db.sessions = db.sessions.filter((item) => item.id !== sessionId)
    saveDb()
    return null
  }
  const user = db.users.find((item) => item.id === session.userId)
  if (!user) return null
  return { session, user }
}

export function destroySession(sessionId: string): void {
  const db = getDb()
  db.sessions = db.sessions.filter((item) => item.id !== sessionId)
  saveDb()
}

export function destroyUserSessions(userId: string, exceptId?: string): void {
  const db = getDb()
  db.sessions = db.sessions.filter(
    (session) => session.userId !== userId || session.id === exceptId,
  )
  saveDb()
}

// ─── Защита попыток входа ───────────────────────────────────────────────────

const WINDOW_MS = 10 * 60_000
const MAX_FAILURES = 6
const failures = new Map<string, { count: number; resetAt: number }>()

export function loginBlocked(key: string): boolean {
  const entry = failures.get(key)
  if (!entry) return false
  if (entry.resetAt < Date.now()) {
    failures.delete(key)
    return false
  }
  return entry.count >= MAX_FAILURES
}

export function noteLoginFailure(key: string): void {
  const entry = failures.get(key)
  if (!entry || entry.resetAt < Date.now()) {
    failures.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS })
    return
  }
  entry.count += 1
}

export function clearLoginFailures(key: string): void {
  failures.delete(key)
}

// ─── Middleware ─────────────────────────────────────────────────────────────

const PUBLIC_PATHS = [/^\/health$/, /^\/auth\/login$/, /^\/public\//, /^\/webhooks\//]

/** Пропускает только запросы с активной сессией; вебхуки и вход — открыты. */
export function authGate(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'OPTIONS' || PUBLIC_PATHS.some((pattern) => pattern.test(req.path))) {
    next()
    return
  }

  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (token) {
    const found = findSession(token)
    if (found) {
      req.user = publicUser(found.user)
      req.sessionId = found.session.id
      next()
      return
    }
  }

  res.status(401).json({ error: 'Требуется вход в систему' })
}

/** Ограничение по ролям: allow('owner', 'admin'). */
export function allow(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Требуется вход в систему' })
      return
    }
    if (roles.length && !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Недостаточно прав для этого действия' })
      return
    }
    next()
  }
}

export { verifyPassword }
